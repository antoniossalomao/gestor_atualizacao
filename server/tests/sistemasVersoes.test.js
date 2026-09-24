const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Server } = require("../src/Server");

const SENHA = "senha-de-teste-123";
const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";

async function subirServidor() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-conta-"));
  const server = new Server({
    port: 0,
    dbPath: path.join(tmpDir, "gestao.db"),
    sessionSecret: "segredo-de-teste",
    sessionSecure: false,
    agentApiToken: "token-de-teste",
  });
  await server.start();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;

  /** @param {string} caminho @param {{metodo?: string, corpo?: unknown, cookie?: string, agente?: string}} [opcoes] */
  const pedir = async (caminho, { metodo = "GET", corpo, cookie, agente } = {}) => {
    const r = await fetch(`${base}/api${caminho}`, {
      method: metodo,
      headers: {
        ...(corpo !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...(agente ? { "user-agent": agente } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    const texto = await r.text();
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

test("Versões dos sistemas - gravação HTTP e permissões", async (t) => {
  const { pedir, encerrar } = await subirServidor();
  t.after(encerrar);
  const setup = await pedir("/auth/setup", { metodo: "POST", corpo: { nome: "Admin", usuario: "admin", senha: SENHA } });
  const cookie = setup.cookie;
  assert.equal((await pedir("/sistemas/versoes")).status, 401);
  assert.equal((await pedir("/sistemas/B_Vendas/versao", { metodo: "PUT", cookie, corpo: { data: "09/09/2026" } })).status, 200);
  const lista = await pedir("/sistemas/versoes", { cookie });
  assert.equal(lista.corpo.find((s) => s.nome === "B_Vendas").data, "09/09/2026");
  assert.equal((await pedir("/sistemas/B_Vendas/versao", { metodo: "PUT", cookie, corpo: { data: "31/02/2026" } })).status, 400);
  await pedir("/usuarios", { metodo: "POST", cookie, corpo: { nome: "Consulta", usuario: "consulta", senha: SENHA, role: "consulta" } });
  const login = await pedir("/auth/login", { metodo: "POST", corpo: { usuario: "consulta", senha: SENHA } });
  assert.equal((await pedir("/sistemas/versoes", { cookie: login.cookie })).status, 200);
  assert.equal((await pedir("/sistemas/B_Vendas/versao", { metodo: "PUT", cookie: login.cookie, corpo: { data: "22/09/2026" } })).status, 403);
});
