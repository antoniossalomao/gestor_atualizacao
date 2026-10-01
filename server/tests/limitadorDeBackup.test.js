/*
 * Limite de pedidos nas rotas de backup (download e restauração).
 *
 * O que erra em silêncio se quebrar: o limitador sair da rota (um laço
 * puxando cópias do banco voltaria a não ter freio) ou a contagem ficar
 * presa ao módulo em vez de ao roteador (um Server novo já nasceria
 * bloqueado pelos pedidos de outro).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Servidor } = require("../src/Servidor");
const { LIMITE_ROTAS_DE_BACKUP } = require("../src/config/constantes");

async function subirServidor() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-limbkp-"));
  const server = new Servidor({
    port: 0,
    host: "127.0.0.1",
    dbPath: path.join(tmpDir, "gestao.db"),
    sessionSecret: "segredo-de-teste",
    sessionSecure: false,
    agentApiToken: "token-de-teste",
  });
  await server.start();
  const base = `http://127.0.0.1:${server.httpServer.address().port}/api`;
  const encerrar = async () => {
    await server.stop().catch(() => {});
    try {
      server.db.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };
  const r = await fetch(`${base}/auth/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nome: "Admin", usuario: "admin", senha: "senha-de-teste-123" }),
  });
  assert.equal(r.status, 201);
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const baixar = async () => {
    const resp = await fetch(`${base}/backups/atual/download`, { headers: { cookie } });
    await resp.arrayBuffer();
    return resp.status;
  };
  return { baixar, encerrar };
}

test("Limite de pedidos nas rotas de backup", async (t) => {
  const primeiro = await subirServidor();
  t.after(primeiro.encerrar);

  await t.test("até o teto, o download passa; o pedido seguinte toma 429", async () => {
    for (let i = 0; i < LIMITE_ROTAS_DE_BACKUP.maxPedidos; i++) {
      assert.equal(await primeiro.baixar(), 200, `pedido ${i + 1}`);
    }
    assert.equal(await primeiro.baixar(), 429);
  });

  await t.test("outro servidor começa com a contagem zerada", async () => {
    const segundo = await subirServidor();
    try {
      assert.equal(await segundo.baixar(), 200);
    } finally {
      await segundo.encerrar();
    }
  });
});
