/*
 * Transporte seguro (ADR-0010). Duas partes:
 * - lerTransporte: as combinações de SESSION_SECURE/TRUST_PROXY que antes
 *   falhavam em silêncio ("ninguém consegue entrar", cookie por HTTP) agora
 *   recusam a subida, e HTTP puro nunca escuta na rede;
 * - o Server de verdade com HTTPS ligado: nada passa por HTTP, o cookie sai
 *   "Secure" pelo proxy, e só com HTTPS vão HSTS e upgrade-insecure-requests.
 *
 * O "proxy" aqui é o próprio teste mandando X-Forwarded-Proto, como o Caddy
 * faz. Que ninguém além do proxy alcance a porta do Node (e possa forjar o
 * cabeçalho) é garantia do docker-compose.yml, não do código -- fora do
 * alcance destes testes.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Servidor } = require("../src/Servidor");
const { lerTransporte } = require("../src/config/transporte");

test("lerTransporte - combinações do .env", async (t) => {
  await t.test("sem nada definido: HTTP puro escutando só na própria máquina", () => {
    const { config, problemas } = lerTransporte({});
    assert.deepEqual(config, { sessionSecure: false, trustProxy: false, host: "127.0.0.1" });
    assert.deepEqual(problemas, []);
  });

  await t.test("HOST no .env não expõe o HTTP puro na rede (somente HTTPS na rede)", () => {
    assert.equal(lerTransporte({ HOST: "0.0.0.0" }).config.host, "127.0.0.1");
  });

  await t.test("SESSION_SECURE=true sem TRUST_PROXY recusa a subida", () => {
    const { problemas } = lerTransporte({ SESSION_SECURE: "true" });
    assert.equal(problemas.length, 1);
    assert.match(problemas[0], /TRUST_PROXY/);
  });

  await t.test("SESSION_SECURE=true com proxy sobe e escuta em todas as interfaces (o proxy no Docker precisa)", () => {
    const { config, problemas } = lerTransporte({ SESSION_SECURE: "true", TRUST_PROXY: "true" });
    assert.deepEqual(problemas, []);
    assert.deepEqual(config, { sessionSecure: true, trustProxy: true, host: undefined });
  });

  await t.test("valor fora de true/false recusa, em vez de virar false calado", () => {
    for (const valor of ["1", "sim", "yes", "ture"]) {
      const secure = lerTransporte({ SESSION_SECURE: valor, TRUST_PROXY: "true" }).problemas;
      assert.equal(secure.length, 1, valor);
      assert.match(secure[0], /SESSION_SECURE/);
      const trust = lerTransporte({ TRUST_PROXY: valor }).problemas;
      assert.equal(trust.length, 1, valor);
      assert.match(trust[0], /TRUST_PROXY/);
    }
  });

  await t.test("maiúsculas e espaços em volta são aceitos", () => {
    const { config, problemas } = lerTransporte({ SESSION_SECURE: " TRUE ", TRUST_PROXY: "True" });
    assert.deepEqual(problemas, []);
    assert.equal(config.sessionSecure, true);
    assert.equal(config.trustProxy, true);
  });

  await t.test("TRUST_PROXY inválido com SESSION_SECURE=true dá um problema só, o do valor", () => {
    const { problemas } = lerTransporte({ SESSION_SECURE: "true", TRUST_PROXY: "sim" });
    assert.equal(problemas.length, 1);
    assert.match(problemas[0], /"sim"/);
  });
});

/** @param {{sessionSecure: boolean, trustProxy?: boolean}} opcoes */
async function subirServidor({ sessionSecure, trustProxy }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-transporte-"));
  const server = new Servidor({
    port: 0,
    host: "127.0.0.1",
    dbPath: path.join(tmpDir, "gestao.db"),
    sessionSecret: "segredo-de-teste",
    sessionSecure,
    trustProxy,
    agentApiToken: "token-de-teste",
  });
  await server.start();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const encerrar = async () => {
    await server.stop().catch(() => {});
    try {
      server.db.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };
  return { base, encerrar };
}

const PELO_PROXY = { "x-forwarded-proto": "https" };
const ADMIN = { nome: "Admin", usuario: "admin", senha: "senha-bem-longa-123" };

test("Servidor com HTTPS ligado (SESSION_SECURE=true)", async (t) => {
  const { base, encerrar } = await subirServidor({ sessionSecure: true, trustProxy: true });
  t.after(encerrar);

  await t.test("login direto por HTTP é recusado e não cria conta nem sessão", async () => {
    const r = await fetch(`${base}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ADMIN),
    });
    assert.equal(r.status, 403);
    assert.match((await r.json()).error, /HTTPS/);
    assert.deepEqual(r.headers.getSetCookie(), []);

    const status = await (await fetch(`${base}/api/auth/status`, { headers: PELO_PROXY })).json();
    assert.equal(status.precisaConfigurar, true, "a conta não pode ter sido criada");
  });

  await t.test("a tela também não é servida por HTTP", async () => {
    const r = await fetch(`${base}/`);
    assert.equal(r.status, 403);
    assert.match(r.headers.get("content-type"), /text\/plain/);
  });

  await t.test("o healthcheck do Docker continua respondendo por HTTP", async () => {
    const r = await fetch(`${base}/api/auth/status`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).user, null);
  });

  await t.test("pelo proxy HTTPS o login funciona e o cookie sai Secure", async () => {
    const r = await fetch(`${base}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json", ...PELO_PROXY },
      body: JSON.stringify(ADMIN),
    });
    assert.equal(r.status, 201);
    const [cookie] = r.headers.getSetCookie();
    assert.match(cookie, /^gestor\.sid=/);
    assert.match(cookie, /;\s*Secure/i);
    assert.match(cookie, /;\s*HttpOnly/i);

    const status = await (
      await fetch(`${base}/api/auth/status`, { headers: { ...PELO_PROXY, cookie: cookie.split(";")[0] } })
    ).json();
    assert.equal(status.user?.usuario, "admin");
  });

  await t.test("com HTTPS vão HSTS e upgrade-insecure-requests", async () => {
    const r = await fetch(`${base}/`, { headers: PELO_PROXY });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("strict-transport-security") || "", /max-age=\d+/);
    assert.match(r.headers.get("content-security-policy") || "", /upgrade-insecure-requests/);
  });
});

test("Servidor em HTTP puro (SESSION_SECURE=false) continua como antes", async (t) => {
  const { base, encerrar } = await subirServidor({ sessionSecure: false });
  t.after(encerrar);

  await t.test("atende por HTTP, sem HSTS nem upgrade-insecure-requests", async () => {
    const r = await fetch(`${base}/`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("strict-transport-security"), null);
    assert.doesNotMatch(r.headers.get("content-security-policy") || "", /upgrade-insecure-requests/);
  });

  await t.test("o cookie de login não é marcado Secure", async () => {
    const r = await fetch(`${base}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ADMIN),
    });
    assert.equal(r.status, 201);
    const [cookie] = r.headers.getSetCookie();
    assert.doesNotMatch(cookie, /;\s*Secure/i);
  });
});
