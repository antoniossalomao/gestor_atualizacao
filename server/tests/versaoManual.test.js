/*
 * Versão informada à mão na atualização (campo "Versão" da grade).
 * Antes a versão era sempre a oficial, automática, e o campo ficava travado.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { BancoDeDados } = require("../src/database/BancoDeDados");
const { HistoricoService } = require("../src/services/HistoricoService");
const { AtualizacaoService } = require("../src/services/AtualizacaoService");
const { ClienteService } = require("../src/services/ClienteService");

const USUARIO = { id: 1, nome: "Teste" };

function ambiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-vm-"));
  const db = new BancoDeDados(path.join(tmpDir, "gestao.db"));
  const historico = new HistoricoService(db);
  const service = new AtualizacaoService(db, historico, null);
  const clientes = new ClienteService(db, historico);
  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, service, clientes, cleanup };
}

const ultimo = (db) => db.conn.prepare("SELECT * FROM atualizacoes ORDER BY id DESC LIMIT 1").get();
const base = { cliente: "Cliente Teste", data: "10/09/2026", responsavel: "Ana", motivo: "", maquinas: "", obs: "" };

test("versão manual - criar", async (t) => {
  const env = ambiente();
  try {
    const oficial = env.db.sistemas.resolver("B_Vendas");
    const esperada = oficial?.ultima_versao || "";
    env.clientes.salvarVersaoSistema("B_Vendas", "01/09/2026", USUARIO, esperada);

    await t.test("campo em branco usa a versão oficial", () => {
      const dados = env.service.create({ ...base, sistema: "B_Vendas", versao: "" }, USUARIO);
      assert.equal(dados.versao, "01/09/2026");
    });

    await t.test("texto digitado vale no lugar da oficial", () => {
      const dados = env.service.create({ ...base, sistema: "B_Vendas", versao: "10.2.1" }, USUARIO);
      assert.equal(dados.versao, "10.2.1");
      assert.equal(ultimo(env.db).versao, "10.2.1");
    });

    await t.test("texto simples vale para todos os sistemas", () => {
      const dados = env.service.create({ ...base, sistema: "B_Vendas, B_NFe", versao: "7.0" }, USUARIO);
      assert.equal(dados.versao, "7.0");
      assert.deepEqual(JSON.parse(dados.versoes_sistemas), { B_Vendas: "7.0", B_NFe: "7.0" });
    });

    await t.test("formato 'Sistema: versão; Sistema: versão' define uma por sistema", () => {
      const dados = env.service.create({ ...base, sistema: "B_Vendas, B_NFe", versao: "B_Vendas: 1.2; B_NFe: 3.4" }, USUARIO);
      assert.deepEqual(JSON.parse(dados.versoes_sistemas), { B_Vendas: "1.2", B_NFe: "3.4" });
    });

    await t.test("recusa versão acima de 100 caracteres", () => {
      assert.throws(() => env.service.create({ ...base, sistema: "B_Vendas", versao: "x".repeat(101) }, USUARIO), /100 caracteres/);
    });
  } finally {
    env.cleanup();
  }
});

test("versão manual - editar", async (t) => {
  const env = ambiente();
  try {
    env.clientes.salvarVersaoSistema("B_Vendas", "01/09/2026", USUARIO, env.db.sistemas.resolver("B_Vendas")?.ultima_versao || "");
    env.service.create({ ...base, sistema: "B_Vendas", versao: "" }, USUARIO);
    const id = ultimo(env.db).id;
    const gravado = () => env.db.conn.prepare("SELECT versao, revisao FROM atualizacoes WHERE id = ?").get(id);

    await t.test("reenviar a versão como estava não a altera", () => {
      env.service.update(id, { ...base, sistema: "B_Vendas", versao: gravado().versao, obs: "só a obs" }, USUARIO);
      assert.equal(gravado().versao, "01/09/2026");
    });

    await t.test("mudar o campo troca a versão registrada", () => {
      env.service.update(id, { ...base, sistema: "B_Vendas", versao: "9.9.9" }, USUARIO);
      assert.equal(gravado().versao, "9.9.9");
    });
  } finally {
    env.cleanup();
  }
});

