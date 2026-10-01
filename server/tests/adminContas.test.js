/*
 * Administração > Pessoas: o que um administrador faz com a conta de OUTRA
 * pessoa -- redefinir a senha esquecida, desconectá-la de todos os
 * aparelhos, trocar o nome.
 *
 * Servidor de verdade e HTTP de verdade, como em minhaConta.test.js: o que
 * erra em silêncio aqui é permissão (um operador redefinindo a senha de um
 * admin), a sessão antiga continuar valendo depois da senha nova, e a rota
 * "/usuarios/:id/senha" se confundir com "/usuarios/me/senha".
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Servidor } = require("../src/Servidor");

const SENHA = "senha-de-teste-123";
const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";

async function subirServidor() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-admin-contas-"));
  const server = new Servidor({
    port: 0,
    dbPath: path.join(tmpDir, "gestao.db"),
    sessionSecret: "segredo-de-teste",
    sessionSecure: false,
    agentApiToken: "token-de-teste",
  });
  await server.start();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;

  // O navegador guarda o token CSRF que vem com cada sessão e o devolve nas
  // escritas (ver middlewares/protecaoCsrf.js); aqui, por cookie.
  const tokens = new Map();
  /** @param {string} caminho @param {{metodo?: string, corpo?: unknown, cookie?: string, agente?: string}} [opcoes] */
  const pedir = async (caminho, { metodo = "GET", corpo, cookie, agente } = {}) => {
    const r = await fetch(`${base}/api${caminho}`, {
      method: metodo,
      headers: {
        ...(corpo !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie, "x-csrf-token": tokens.get(cookie) ?? "" } : {}),
        ...(agente ? { "user-agent": agente } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    const texto = await r.text();
    if (r.headers.get("x-csrf-token")) tokens.set(cookieDe(r) || cookie, r.headers.get("x-csrf-token"));
    return { status: r.status, corpo: texto ? JSON.parse(texto) : null, cookie: cookieDe(r) };
  };

  const encerrar = async () => {
    await server.stop().catch(() => {});
    try {
      server.db.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };
  return { pedir, encerrar };
}

function cookieDe(resposta) {
  return resposta.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

test("Administração - contas de outras pessoas", async (t) => {
  const { pedir, encerrar } = await subirServidor();
  t.after(encerrar);

  const admin = (await pedir("/auth/setup", { metodo: "POST", corpo: { nome: "Admin", usuario: "admin", senha: SENHA } })).cookie;
  const criar = async (usuario, role) =>
    (await pedir("/usuarios", { metodo: "POST", cookie: admin, corpo: { nome: `Pessoa ${usuario}`, usuario, senha: SENHA, role } })).corpo;
  const maria = await criar("maria", "operador");
  const carla = await criar("carla", "consulta");
  const entrar = async (usuario, senha = SENHA) => pedir("/auth/login", { metodo: "POST", corpo: { usuario, senha } });
  const adminId = (await pedir("/usuarios/me", { cookie: admin })).corpo.id;

  await t.test("a lista diz quantas sessões cada conta tem aberta", async () => {
    const sessaoMaria = (await entrar("maria")).cookie;
    const lista = (await pedir("/usuarios", { cookie: admin })).corpo;
    assert.equal(lista.find((u) => u.usuario === "maria").sessoes, 1);
    assert.equal(lista.find((u) => u.usuario === "carla").sessoes, 0);
    await pedir("/auth/logout", { metodo: "POST", cookie: sessaoMaria });
  });

  await t.test("admin redefine a senha: a nova entra, a velha não, e a sessão aberta cai", async () => {
    const sessaoMaria = (await entrar("maria")).cookie;
    const r = await pedir(`/usuarios/${maria.id}/senha`, { metodo: "PUT", cookie: admin, corpo: { senhaNova: "outra-senha-boa" } });
    assert.equal(r.status, 204, JSON.stringify(r.corpo));
    assert.equal((await pedir("/usuarios/me", { cookie: sessaoMaria })).status, 401, "a sessão de antes da troca não vale mais");
    assert.equal((await entrar("maria")).status, 400, "a senha antiga parou de funcionar");
    assert.equal((await entrar("maria", "outra-senha-boa")).status, 200);
  });

  await t.test("senha curta é recusada", async () => {
    const r = await pedir(`/usuarios/${carla.id}/senha`, { metodo: "PUT", cookie: admin, corpo: { senhaNova: "curta" } });
    assert.equal(r.status, 400);
  });

  await t.test("a própria senha não se redefine por aqui (sem confirmar a atual)", async () => {
    const r = await pedir(`/usuarios/${adminId}/senha`, { metodo: "PUT", cookie: admin, corpo: { senhaNova: "nova-senha-123" } });
    assert.equal(r.status, 400);
    assert.match(r.corpo.error, /Minha conta/);
  });

  await t.test("operador não redefine senha nem encerra sessão de ninguém", async () => {
    const sessaoMaria = (await entrar("maria", "outra-senha-boa")).cookie;
    assert.equal((await pedir(`/usuarios/${carla.id}/senha`, { metodo: "PUT", cookie: sessaoMaria, corpo: { senhaNova: "nova-senha-123" } })).status, 403);
    assert.equal((await pedir(`/usuarios/${adminId}/sessoes`, { metodo: "DELETE", cookie: sessaoMaria })).status, 403);
    // E a rota de "me" continua sendo a da própria pessoa, não a de admin.
    const propria = await pedir("/usuarios/me/senha", { metodo: "PUT", cookie: sessaoMaria, corpo: { senhaAtual: "outra-senha-boa", senhaNova: "minha-senha-nova" } });
    assert.equal(propria.status, 204, JSON.stringify(propria.corpo));
  });

  await t.test("encerrar sessões derruba todas as da pessoa e diz quantas eram", async () => {
    const a = (await entrar("carla")).cookie;
    const b = (await entrar("carla")).cookie;
    const r = await pedir(`/usuarios/${carla.id}/sessoes`, { metodo: "DELETE", cookie: admin });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.encerradas, 2);
    assert.equal((await pedir("/usuarios/me", { cookie: a })).status, 401);
    assert.equal((await pedir("/usuarios/me", { cookie: b })).status, 401);
    // A senha continua a mesma: encerrar não é bloquear.
    assert.equal((await entrar("carla")).status, 200);
  });

  await t.test("admin troca o nome de outra pessoa, com a mesma limpeza do próprio nome", async () => {
    const r = await pedir(`/usuarios/${carla.id}`, { metodo: "PUT", cookie: admin, corpo: { nome: "  Carla   Dias " } });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.nome, "Carla Dias");
    assert.equal(r.corpo.role, "consulta", "trocar o nome não mexe no papel");
    assert.equal((await pedir(`/usuarios/${carla.id}`, { metodo: "PUT", cookie: admin, corpo: { nome: "   " } })).status, 400);
    assert.equal((await pedir(`/usuarios/${carla.id}`, { metodo: "PUT", cookie: admin, corpo: { nome: "x".repeat(81) } })).status, 400);
  });

  await t.test("a Auditoria registra o que mudou de verdade", async () => {
    const linhas = (await pedir("/historico?pageSize=50", { cookie: admin })).corpo.rows.map((l) => l.descricao);
    assert.ok(linhas.some((d) => /Senha de "Pessoa maria" \(@maria\) redefinida/.test(d)), linhas.join("\n"));
    assert.ok(linhas.some((d) => /2 sessões de .*@carla.* encerradas/.test(d)), linhas.join("\n"));
    assert.ok(linhas.some((d) => /nome alterado de "Pessoa carla" para "Carla Dias"/.test(d)), linhas.join("\n"));
    // Rename não é promoção: o registro antigo dizia "atualizado para papel".
    assert.ok(!linhas.some((d) => /Carla Dias.*papel alterado/.test(d)));
  });
});
