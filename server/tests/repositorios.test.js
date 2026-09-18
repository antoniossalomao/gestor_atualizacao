/*
 * Testes dos repositorios -- a unica camada que escreve SQL.
 *
 * O foco esta em tres coisas que o SQLite faz "certo" do jeito errado se
 * ninguem cuidar, e que falham em silencio:
 *
 *  - **ordenacao por data.** As datas sao guardadas como TEXTO "dd/mm/aaaa".
 *    Ordenar esse texto diretamente poe 01/12/2025 antes de 02/01/2026 -- a
 *    tela fica com as linhas na ordem errada e ninguem estranha, porque as
 *    datas "parecem" ordenadas. Por isso existe DATE_SORT_EXPR, que reescreve
 *    para "aaaammdd" dentro da consulta.
 *  - **o filtro de periodo em JS tem que casar com esse mesmo formato.** Sao
 *    duas implementacoes da mesma conversao, uma em SQL e outra em JavaScript
 *    (`paraOrdenavel`); se divergirem, o filtro recorta errado.
 *  - **`total` conta sem o limite de pagina.** Se contasse com o limite, a
 *    barra de paginacao diria que ha uma pagina so, sempre.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Database } = require("../src/database/Database");

function ambiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-repo-"));
  const db = new Database(path.join(tmpDir, "gestao.db"));
  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, cleanup };
}

function inserir(db, campos) {
  db.atualizacoes.insert({
    cliente: "",
    sistema: "",
    versao: "",
    responsavel: "",
    data: "",
    motivo: "",
    maquinas: "",
    obs: "",
    ...campos,
  });
}

test("AtualizacaoRepository - ordenação por data", async (t) => {
  const env = ambiente();
  try {
    // Escolhidas de propósito: em ordem de TEXTO, "01/12/2025" vem antes de
    // "02/01/2026", que vem antes de "15/03/2026" -- ou seja, a ordem textual
    // e a cronológica discordam em todos os pares.
    inserir(env.db, { cliente: "B", data: "02/01/2026" });
    inserir(env.db, { cliente: "A", data: "01/12/2025" });
    inserir(env.db, { cliente: "C", data: "15/03/2026" });

    await t.test("o padrão é cronológico decrescente, não alfabético", () => {
      const { rows } = env.db.atualizacoes.list();
      assert.deepEqual(rows.map((r) => r.cliente), ["C", "B", "A"]);
    });

    await t.test("ordenar por data crescente também é cronológico", () => {
      const { rows } = env.db.atualizacoes.list("", "Todos", { sortBy: "data", sortDir: "asc" });
      assert.deepEqual(rows.map((r) => r.cliente), ["A", "B", "C"]);
    });

    await t.test("registro sem data não some da lista", () => {
      // Quase metade do histórico importado de planilha não tem data. Sumir
      // da listagem seria perder o registro do atendimento na prática.
      inserir(env.db, { cliente: "SemData", data: "" });
      const { rows, total } = env.db.atualizacoes.list();
      assert.equal(total, 4);
      assert.ok(rows.some((r) => r.cliente === "SemData"));
    });
  } finally {
    env.cleanup();
  }
});

test("AtualizacaoRepository - filtro por período", async (t) => {
  const env = ambiente();
  try {
    inserir(env.db, { cliente: "Antes", data: "01/01/2026" });
    inserir(env.db, { cliente: "Meio", data: "15/06/2026" });
    inserir(env.db, { cliente: "Depois", data: "31/12/2026" });

    await t.test("'desde' inclui a própria data", () => {
      const { rows } = env.db.atualizacoes.list("", "Todos", { desde: "15/06/2026" });
      assert.deepEqual(rows.map((r) => r.cliente).sort(), ["Depois", "Meio"]);
    });

    await t.test("'até' inclui a própria data", () => {
      const { rows } = env.db.atualizacoes.list("", "Todos", { ate: "15/06/2026" });
      assert.deepEqual(rows.map((r) => r.cliente).sort(), ["Antes", "Meio"]);
    });

    await t.test("os dois juntos recortam a faixa", () => {
      const { rows } = env.db.atualizacoes.list("", "Todos", { desde: "01/02/2026", ate: "01/12/2026" });
      assert.deepEqual(rows.map((r) => r.cliente), ["Meio"]);
    });

    await t.test("o recorte é CRONOLÓGICO, não alfabético", () => {
      // Se a comparação fosse de texto, "01/01/2026" >= "15/06/2026" seria
      // falso pelo motivo errado, e a faixa pegaria o conjunto errado assim
      // que as datas cruzassem a virada de ano.
      const { rows } = env.db.atualizacoes.list("", "Todos", { desde: "01/12/2025", ate: "01/01/2026" });
      assert.deepEqual(rows.map((r) => r.cliente), ["Antes"]);
    });

    await t.test("data meio digitada é ignorada, não vira recorte silencioso", () => {
      // Enquanto a pessoa digita "15/06/", o campo passa incompleto pelo
      // caminho. Tratar isso como filtro faria a lista esvaziar sozinha no
      // meio da digitação, sem explicação.
      for (const parcial of ["15/06/", "15/", "1", "junho", "2026-06-15"]) {
        const { total } = env.db.atualizacoes.list("", "Todos", { desde: parcial });
        assert.equal(total, 3, `"${parcial}" não deveria filtrar nada`);
      }
    });
  } finally {
    env.cleanup();
  }
});

test("AtualizacaoRepository - busca e filtro por responsável", async (t) => {
  const env = ambiente();
  try {
    inserir(env.db, { cliente: "Mercado Central", sistema: "B_Vendas", responsavel: "Camila", motivo: "erro fiscal" });
    inserir(env.db, { cliente: "Padaria", sistema: "B_NFe", responsavel: "CAMILA", motivo: "rotina" });
    inserir(env.db, { cliente: "Açougue", sistema: "B_Vendas", responsavel: "Marcos", motivo: "" });

    await t.test("a busca livre cobre cliente, sistema, responsável e motivo", () => {
      assert.equal(env.db.atualizacoes.list("Mercado").total, 1);
      assert.equal(env.db.atualizacoes.list("B_Vendas").total, 2);
      assert.equal(env.db.atualizacoes.list("Marcos").total, 1);
      assert.equal(env.db.atualizacoes.list("fiscal").total, 1);
    });

    await t.test("a busca ignora maiúsculas", () => {
      assert.equal(env.db.atualizacoes.list("mercado").total, 1);
      assert.equal(env.db.atualizacoes.list("MERCADO").total, 1);
    });

    await t.test("filtrar por responsável agrupa as variações de grafia", () => {
      // O filtro da tela oferece nomes já normalizados; escolher "Camila" ali
      // precisa achar também quem foi salvo como "CAMILA" antes da
      // normalização existir.
      assert.equal(env.db.atualizacoes.list("", "Camila").total, 2);
      assert.equal(env.db.atualizacoes.list("", "camila").total, 2);
    });

    await t.test("'Todos' não filtra nada", () => {
      assert.equal(env.db.atualizacoes.list("", "Todos").total, 3);
    });

    await t.test("a lista de responsáveis distintos agrupa e ordena", () => {
      const nomes = env.db.atualizacoes.distinctResponsaveis();
      assert.deepEqual(nomes, ["Camila", "Marcos"], "uma entrada por pessoa, em ordem");
    });
  } finally {
    env.cleanup();
  }
});

test("AtualizacaoRepository - paginação", async (t) => {
  const env = ambiente();
  try {
    for (let i = 1; i <= 25; i += 1) {
      inserir(env.db, { cliente: `Cliente ${String(i).padStart(2, "0")}`, data: "01/01/2026" });
    }

    await t.test("'total' conta TODOS, não só a página", () => {
      // É com este número que a tela decide quantas páginas existem. Contando
      // com o limite, a paginação diria "página 1 de 1" sempre.
      const r = env.db.atualizacoes.list("", "Todos", { page: 1, pageSize: 10 });
      assert.equal(r.rows.length, 10);
      assert.equal(r.total, 25);
    });

    await t.test("páginas seguintes trazem registros diferentes", () => {
      const p1 = env.db.atualizacoes.list("", "Todos", { page: 1, pageSize: 10 });
      const p2 = env.db.atualizacoes.list("", "Todos", { page: 2, pageSize: 10 });
      const ids1 = new Set(p1.rows.map((r) => r.id));
      assert.ok(p2.rows.every((r) => !ids1.has(r.id)), "nenhum registro repetido entre páginas");
    });

    await t.test("a última página vem incompleta, não vazia", () => {
      const p3 = env.db.atualizacoes.list("", "Todos", { page: 3, pageSize: 10 });
      assert.equal(p3.rows.length, 5);
    });

    await t.test("página além do fim devolve lista vazia, não erro", () => {
      const p99 = env.db.atualizacoes.list("", "Todos", { page: 99, pageSize: 10 });
      assert.deepEqual(p99.rows, []);
      assert.equal(p99.total, 25, "mas o total continua certo");
    });

    await t.test("o total respeita o filtro aplicado", () => {
      const r = env.db.atualizacoes.list("Cliente 01", "Todos", { page: 1, pageSize: 10 });
      assert.equal(r.total, 1);
    });
  } finally {
    env.cleanup();
  }
});

test("AtualizacaoRepository - ordenação por coluna", async (t) => {
  const env = ambiente();
  try {
    inserir(env.db, { cliente: "zebra", sistema: "B_NFe", data: "01/01/2026" });
    inserir(env.db, { cliente: "Alface", sistema: "B_Vendas", data: "02/01/2026" });
    inserir(env.db, { cliente: "maçã", sistema: "B_Sped", data: "03/01/2026" });

    await t.test("ordenar por cliente ignora maiúsculas", () => {
      // Sem COLLATE NOCASE, o SQLite põe todas as maiúsculas antes de todas as
      // minúsculas: "Alface", "maçã", "zebra" viraria "Alface", "zebra",
      // "maçã" -- que parece aleatório para quem olha.
      const { rows } = env.db.atualizacoes.list("", "Todos", { sortBy: "cliente", sortDir: "asc" });
      assert.deepEqual(rows.map((r) => r.cliente), ["Alface", "maçã", "zebra"]);
    });

    await t.test("ordenar por coluna desconhecida cai no padrão, sem erro", () => {
      // Já testado em shared.test.js pelo lado do sortHelper; aqui é o efeito
      // de ponta a ponta: a consulta roda e devolve a ordem padrão.
      const { rows } = env.db.atualizacoes.list("", "Todos", { sortBy: "coluna_que_nao_existe", sortDir: "asc" });
      assert.equal(rows.length, 3);
      assert.deepEqual(rows.map((r) => r.cliente), ["maçã", "Alface", "zebra"], "cronológico decrescente");
    });

    await t.test("tentativa de injeção por sortBy não roda SQL", () => {
      assert.doesNotThrow(() =>
        env.db.atualizacoes.list("", "Todos", { sortBy: "cliente; DROP TABLE atualizacoes--", sortDir: "asc" })
      );
      assert.equal(env.db.atualizacoes.list().total, 3, "a tabela continua lá");
    });
  } finally {
    env.cleanup();
  }
});
