/*
 * Migração 1: sistemas e clientes saem das listas em texto e do vínculo por
 * nome para tabelas de ligação e ids (ver src/database/migracoes.js).
 *
 * É a mudança que mexe no dado de produção, e erra em silêncio: um sistema
 * que cai no lugar errado ou um atendimento que perde o cliente não quebra
 * tela nenhuma -- só faz o relatório da aba Sistemas mentir. Por isso o banco
 * de partida aqui imita o de produção de verdade: grafias sujas, sistemas que
 * saíram do catálogo, versão legada em texto e atendimento de cliente excluído.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const Sqlite3 = require("better-sqlite3");

const { Database } = require("../src/database/Database");

/** Um gestao.db na versão 0, com o esquema antigo e dados como os de produção. */
function bancoLegado() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-migr-"));
  const arquivo = path.join(tmpDir, "gestao.db");
  const conn = new Sqlite3(arquivo);
  conn.exec(`
    CREATE TABLE atualizacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente TEXT NOT NULL, sistema TEXT, versao TEXT,
      responsavel TEXT, data TEXT, motivo TEXT, versoes_sistemas TEXT);
    CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT NOT NULL, cidade TEXT, sistemas TEXT);
    CREATE TABLE sistemas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE);
    CREATE TABLE agendamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, tarefa TEXT NOT NULL, cliente TEXT, responsavel TEXT, data TEXT, status TEXT);

    INSERT INTO sistemas (nome) VALUES ('B_Vendas'), ('B_NFe'), ('B_Importa');

    INSERT INTO clientes (id, codigo, nome, cidade, sistemas) VALUES
      (1, 'C1', 'Mercado Central', 'Marília', 'B_Vendas, B_NFe'),
      (2, 'C2', 'Padaria Sol', 'Lins', 'B_Vendas, B_Replicador'),
      (3, 'C3', 'Loja Sem Sistema', '', '');

    INSERT INTO atualizacoes (id, cliente, sistema, versao, responsavel, data, motivo, versoes_sistemas) VALUES
      (1, 'Mercado Central', 'B_Vendas', '09/09/2026', 'Camila', '10/09/2026', '', NULL),
      (2, 'Mercado Central', 'B_Vendas, B_NFE', '22/09/2026', 'Camila', '23/09/2026', '', NULL),
      (3, 'padaria sol ', 'NFCe, CTe', '', 'Marcos', '05/09/2026', '', NULL),
      (4, 'Cliente Excluído', 'DFE', '1.0', 'Marcos', '01/08/2026', '', NULL),
      (5, 'Mercado Central', 'B_DFe, B_Rat', '', 'Marcos', '02/08/2026', '', NULL),
      (6, 'Mercado Central', 'B_NFe, B_Vendas', 'B_NFe: 02/09/2026; B_Vendas: 09/09/2026', 'Camila', '24/09/2026', '',
         '{"B_NFe":"02/09/2026","B_Vendas":"09/09/2026"}');

    INSERT INTO agendamentos (tarefa, cliente, responsavel, data, status) VALUES
      ('Visitar', 'MERCADO CENTRAL', 'Camila', '30/09/2026', 'A Fazer'),
      ('Ligar', 'Ninguém Cadastrado', 'Camila', '30/09/2026', 'A Fazer');
  `);
  conn.close();
  return { tmpDir, arquivo };
}

function abrir() {
  const { tmpDir, arquivo } = bancoLegado();
  const db = new Database(arquivo);
  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, tmpDir, arquivo, cleanup };
}

const sistemasDo = (db, id) =>
  db.conn
    .prepare("SELECT s.nome, s.ativo, x.versao FROM atualizacao_sistemas x JOIN sistemas s ON s.id = x.sistema_id WHERE x.atualizacao_id = ? ORDER BY x.ordem")
    .all(id);

test("Migração 1 - esquema", async (t) => {
  const env = abrir();
  try {
    await t.test("o banco passa para a versão 1", () => {
      assert.equal(env.db.conn.pragma("user_version", { simple: true }), 1);
    });

    await t.test("as listas em texto e o JSON de versões deixam de existir", () => {
      const colunas = (tabela) => env.db.conn.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
      assert.ok(!colunas("atualizacoes").includes("sistema"));
      assert.ok(!colunas("atualizacoes").includes("versoes_sistemas"));
      assert.ok(!colunas("clientes").includes("sistemas"));
    });

    await t.test("guarda uma cópia do banco de ANTES da migração, íntegra", () => {
      const backups = env.db.listBackups();
      assert.ok(backups.length >= 1);
      const copia = new Sqlite3(path.join(env.tmpDir, "backups", backups[backups.length - 1].arquivo), { readonly: true });
      try {
        assert.equal(copia.pragma("user_version", { simple: true }), 0, "a cópia é do estado antigo");
      } finally {
        copia.close();
      }
      assert.ok(backups.some((b) => b.integro === true));
    });
  } finally {
    env.cleanup();
  }
});

test("Migração 1 - sistemas", async (t) => {
  const env = abrir();
  try {
    await t.test("grafias diferentes caem no sistema do catálogo", () => {
      assert.deepEqual(sistemasDo(env.db, 2).map((s) => s.nome), ["B_Vendas", "B_NFe"], "B_NFE é o B_NFe");
    });

    await t.test("sistema fora do catálogo vira INATIVO, e não some do histórico", () => {
      const [nfce, cte] = sistemasDo(env.db, 3);
      assert.deepEqual([nfce.nome, nfce.ativo], ["B_NFCe", 0], "NFCe é o apelido conhecido de B_NFCe");
      assert.deepEqual([cte.nome, cte.ativo], ["CTe", 0]);
      assert.ok(!env.db.sistemas.list().includes("CTe"), "não aparece no catálogo das telas");
    });

    await t.test("duas grafias do mesmo sistema inativo viram UM sistema só", () => {
      const dfe = sistemasDo(env.db, 4)[0];
      const outro = sistemasDo(env.db, 5)[0];
      assert.equal(dfe.nome, outro.nome, "DFE e B_DFe");
      const iguais = env.db.conn.prepare("SELECT COUNT(*) AS n FROM sistemas WHERE lower(nome) IN ('dfe', 'b_dfe')").get().n;
      assert.equal(iguais, 1);
    });

    await t.test("a ordem em que os sistemas foram digitados é mantida", () => {
      assert.equal(env.db.atualizacoes.find(6).sistema, "B_NFe, B_Vendas");
    });

    await t.test("os sistemas do cadastro do cliente viram linhas de cliente_sistemas", () => {
      assert.equal(env.db.clientes.getById(1).sistemas, "B_Vendas, B_NFe");
      assert.equal(env.db.clientes.getById(2).sistemas, "B_Vendas, B_Replicador");
      assert.equal(env.db.clientes.getById(3).sistemas, "");
    });
  } finally {
    env.cleanup();
  }
});

test("Migração 1 - versões", async (t) => {
  const env = abrir();
  try {
    await t.test("legado com UM sistema: a versão digitada passa a ser a daquele sistema", () => {
      assert.deepEqual(sistemasDo(env.db, 1).map((s) => s.versao), ["09/09/2026"]);
      assert.equal(env.db.atualizacoes.find(1).versoes_sistemas, null, "continua marcado como legado");
    });

    await t.test("legado com VÁRIOS sistemas: a versão é ambígua e fica sem dono", () => {
      assert.deepEqual(sistemasDo(env.db, 2).map((s) => s.versao), [null, null]);
      assert.equal(env.db.atualizacoes.find(2).versao, "22/09/2026", "o texto original não se perde");
    });

    await t.test("versões por sistema (o JSON antigo) viram linhas, cada uma no seu sistema", () => {
      assert.deepEqual(sistemasDo(env.db, 6).map((s) => [s.nome, s.versao]), [["B_NFe", "02/09/2026"], ["B_Vendas", "09/09/2026"]]);
      assert.deepEqual(JSON.parse(env.db.atualizacoes.find(6).versoes_sistemas), { B_NFe: "02/09/2026", B_Vendas: "09/09/2026" });
    });
  } finally {
    env.cleanup();
  }
});

test("Migração 1 - vínculo com o cliente", async (t) => {
  const env = abrir();
  try {
    const clienteDe = (tabela, id) => env.db.conn.prepare(`SELECT cliente, cliente_id FROM ${tabela} WHERE id = ?`).get(id);

    await t.test("pelo nome exato", () => {
      assert.deepEqual(clienteDe("atualizacoes", 1), { cliente: "Mercado Central", cliente_id: 1 });
    });

    await t.test("ignorando caixa e espaço, e o nome passa a ser o do cadastro", () => {
      assert.deepEqual(clienteDe("atualizacoes", 3), { cliente: "Padaria Sol", cliente_id: 2 });
      assert.deepEqual(clienteDe("agendamentos", 1), { cliente: "Mercado Central", cliente_id: 1 });
    });

    await t.test("cliente que não existe mais fica sem vínculo, com o nome como estava", () => {
      assert.deepEqual(clienteDe("atualizacoes", 4), { cliente: "Cliente Excluído", cliente_id: null });
      assert.deepEqual(clienteDe("agendamentos", 2), { cliente: "Ninguém Cadastrado", cliente_id: null });
    });

    await t.test("renomear o cliente acompanha nos registros ligados a ele", () => {
      env.db.clientes.update(1, "C1", "Mercado Central Novo", "Marília", [], "");
      assert.equal(clienteDe("atualizacoes", 1).cliente, "Mercado Central Novo");
      assert.equal(clienteDe("agendamentos", 1).cliente, "Mercado Central Novo");
    });

    await t.test("cadastrar um cliente com o nome de atendimentos sem vínculo adota esses atendimentos", () => {
      const id = env.db.clientes.insert("C9", "cliente excluído", "", [], "");
      assert.deepEqual(clienteDe("atualizacoes", 4), { cliente: "cliente excluído", cliente_id: id });
    });

    await t.test("excluir o cliente não apaga o histórico: o vínculo cai e o nome fica", () => {
      env.db.clientes.delete(2);
      assert.deepEqual(clienteDe("atualizacoes", 3), { cliente: "Padaria Sol", cliente_id: null });
      assert.equal(sistemasDo(env.db, 3).length, 2, "os sistemas do atendimento continuam");
    });
  } finally {
    env.cleanup();
  }
});

test("Migração 1 - roda uma vez só", () => {
  const { tmpDir, arquivo } = bancoLegado();
  try {
    const primeira = new Database(arquivo);
    const linhas = primeira.conn.prepare("SELECT COUNT(*) AS n FROM atualizacao_sistemas").get().n;
    primeira.conn.close();

    const segunda = new Database(arquivo);
    try {
      assert.equal(segunda.conn.pragma("user_version", { simple: true }), 1);
      assert.equal(segunda.conn.prepare("SELECT COUNT(*) AS n FROM atualizacao_sistemas").get().n, linhas, "nada duplicado ao reabrir");
      const colunas = segunda.conn.prepare("PRAGMA table_info(atualizacoes)").all().map((c) => c.name);
      assert.ok(!colunas.includes("versoes_sistemas"), "o esquema legado não recria a coluna removida");
    } finally {
      segunda.conn.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
