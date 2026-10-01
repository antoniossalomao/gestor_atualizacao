/*
 * Importação de planilha (AtualizacaoService.previaImportacao / importXlsx).
 *
 * Erra em silêncio de várias formas, e cada teste abaixo é uma delas:
 *  - a prévia gravar alguma coisa (nem que seja um sistema novo no catálogo);
 *  - uma data fora do formato entrar e bagunçar ordenação e situação;
 *  - importar o mesmo arquivo duas vezes duplicar o histórico;
 *  - uma falha no meio deixar metade do lote dentro;
 *  - a planilha receber a versão oficial de HOJE numa atualização antiga.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const ExcelJS = require("exceljs");

const { BancoDeDados } = require("../src/database/BancoDeDados");
const { Servidor } = require("../src/Servidor");
const { HistoricoService } = require("../src/services/HistoricoService");
const { AtualizacaoService } = require("../src/services/AtualizacaoService");

const USUARIO = { id: 1, nome: "Teste" };

async function planilha(linhas) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Atualizações");
  for (const l of linhas) ws.addRow(l);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function ambiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-import-"));
  const db = new BancoDeDados(path.join(tmpDir, "gestao.db"));
  const servico = new AtualizacaoService(db, new HistoricoService(db), { notifyAtualizacao: async () => {} });
  db.clientes.insert("", "Mercado Central", "Araxá", [db.sistemas.resolver("B_NFe").id], "");
  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, servico, cleanup };
}

const CABECALHO = ["Cliente", "Sistema", "Versão", "Quem Atualizou", "Data", "Motivo", "Máquinas", "Obs"];

test("Importação - prévia e aplicação", async (t) => {
  const env = ambiente();
  try {
    const arquivo = await planilha([
      CABECALHO,
      ["Mercado Central", "B_NFe", "", "Antonio", "10/08/2026", "", "2", ""],
      ["Cliente Novo", "Sistema Estranho", "", "Antonio", "11/08/2026", "", "", ""],
      ["Loja Data Ruim", "B_NFe", "", "Antonio", "2026-08-12", "", "", ""],
      ["", "B_NFe", "", "Antonio", "12/08/2026", "", "", ""],
      ["Mercado Central", "b_nfe", "", "Antonio", "10/08/2026", "", "", ""],
    ]);

    await t.test("a prévia classifica cada linha e não grava nada", async () => {
      const sistemasAntes = env.db.sistemas.todos().length;
      const p = await env.servico.previaImportacao(arquivo);
      assert.deepEqual([p.total, p.validas, p.comErro, p.duplicadas, p.clientesSemCadastro], [5, 3, 2, 1, 1]);
      const porLinha = Object.fromEntries(p.ocorrencias.map((o) => [o.linha, o]));
      assert.equal(porLinha[4].erro.tipo, "data");
      assert.equal(porLinha[5].erro.tipo, "cliente");
      assert.deepEqual(porLinha[3].avisos.map((a) => a.tipo).sort(), ["cliente", "sistema"]);
      assert.equal(porLinha[6].avisos[0].tipo, "duplicidade", "a mesma linha, com outra grafia do sistema, é repetida");
      assert.equal(env.db.atualizacoes.count(), 0);
      assert.equal(env.db.sistemas.todos().length, sistemasAntes, "nem sistema novo no catálogo");
    });

    await t.test("aplicar importa só as válidas, pula a duplicada, e registra no Histórico", async () => {
      const r = await env.servico.importXlsx(arquivo, USUARIO, { pularDuplicadas: true });
      assert.equal(r.inserted, 2);
      assert.equal(r.ignoradas, 3);
      assert.deepEqual(r.naoCadastrados, ["Cliente Novo"]);
      assert.equal(env.db.atualizacoes.count(), 2);
      const historico = env.db.historico.list({}).rows[0];
      assert.match(historico.descricao, /2 registro\(s\) importado\(s\), 3 ignorado\(s\)/);
    });

    await t.test("reimportar o mesmo arquivo não duplica", async () => {
      const p = await env.servico.previaImportacao(arquivo);
      assert.equal(p.duplicadas, 3);
      const r = await env.servico.importXlsx(arquivo, USUARIO, { pularDuplicadas: true });
      assert.equal(r.inserted, 0);
      assert.equal(env.db.atualizacoes.count(), 2);
    });

    await t.test("sem pular duplicadas, elas entram (escolha explícita)", async () => {
      const r = await env.servico.importXlsx(arquivo, USUARIO, { pularDuplicadas: false });
      assert.equal(r.inserted, 3);
    });
  } finally {
    env.cleanup();
  }
});

test("Importação - não aplica a versão oficial de hoje a atualização antiga", async () => {
  const env = ambiente();
  try {
    env.db.sistemas.salvarVersao("B_NFe", "01/08/2026");
    await env.servico.importXlsx(await planilha([CABECALHO, ["Mercado Central", "B_NFe", "", "Antonio", "10/08/2026", "", "", ""]]), USUARIO);
    const id = env.db.conn.prepare("SELECT MAX(id) AS id FROM atualizacoes").get().id;
    assert.deepEqual(env.db.atualizacoes.sistemasDe(id).map((s) => s.versao ?? null), [null]);
    assert.equal(env.db.conn.prepare("SELECT versoes_por_sistema FROM atualizacoes WHERE id = ?").get(id).versoes_por_sistema, 0);
  } finally {
    env.cleanup();
  }
});

test("Importação - uma falha no meio não deixa metade do lote gravada", async () => {
  const env = ambiente();
  try {
    const arquivo = await planilha([CABECALHO, ...Array.from({ length: 5 }, (_, i) => [`Cliente ${i}`, "B_NFe", "", "", "10/08/2026", "", "", ""])]);
    const original = env.db.atualizacoes.insert.bind(env.db.atualizacoes);
    let chamadas = 0;
    env.db.atualizacoes.insert = (...args) => {
      chamadas += 1;
      if (chamadas === 3) throw new Error("disco cheio");
      return original(...args);
    };
    await assert.rejects(env.servico.importXlsx(arquivo, USUARIO), /disco cheio/);
    assert.equal(env.db.atualizacoes.count(), 0);
  } finally {
    env.cleanup();
  }
});

test("Importação - erros de arquivo e de coluna", async (t) => {
  const env = ambiente();
  try {
    await t.test("arquivo que não é planilha", async () => {
      await assert.rejects(env.servico.previaImportacao(Buffer.from("não sou xlsx")), /Não foi possível abrir/);
    });
    await t.test("planilha sem linhas", async () => {
      await assert.rejects(env.servico.previaImportacao(await planilha([CABECALHO])), /nenhuma linha preenchida abaixo do cabeçalho/);
    });
    await t.test("cabeçalho reconhecido, mas sem a coluna Cliente", async () => {
      await assert.rejects(env.servico.previaImportacao(await planilha([["Sistema", "Data"], ["B_NFe", "10/08/2026"]])), /coluna "Cliente"/);
    });
    await t.test("colunas desconhecidas são listadas", async () => {
      const p = await env.servico.previaImportacao(await planilha([["Cliente", "Data", "Telefone"], ["Mercado Central", "10/08/2026", "123"]]));
      assert.deepEqual(p.colunasIgnoradas, ["Telefone"]);
      assert.equal(p.validas, 1);
    });
    await t.test("sem cabeçalho, vale a ordem fixa -- e a PRIMEIRA linha já é dado", async () => {
      // Antes a leitura começava sempre na linha 2: a primeira atualização de
      // uma planilha sem cabeçalho sumia, e os dados dele apareciam como
      // "colunas ignoradas".
      const p = await env.servico.previaImportacao(await planilha([
        ["Mercado Central", "B_NFe", "", "", "10/08/2026"],
        ["Mercado Central", "B_NFe", "", "", "11/08/2026"],
      ]));
      assert.equal(p.semCabecalho, true);
      assert.equal(p.total, 2);
      assert.equal(p.validas, 2);
      assert.deepEqual(p.colunasIgnoradas, []);
      const uma = await env.servico.previaImportacao(await planilha([["Mercado Central", "B_NFe", "", "", "10/08/2026"]]));
      assert.equal(uma.validas, 1, "planilha de uma linha só não é 'vazia'");
    });
  } finally {
    env.cleanup();
  }
});

test("Importação - permissões da prévia e da importação", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-import-http-"));
  const server = new Servidor({ port: 0, dbPath: path.join(tmpDir, "gestao.db"), sessionSecret: "x", sessionSecure: false, agentApiToken: "t" });
  await server.start();
  const base = `http://127.0.0.1:${server.httpServer.address().port}/api`;
  t.after(async () => {
    await server.stop().catch(() => {});
    try { server.db.close(); } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  // O navegador guarda o token CSRF que vem com cada sessão e o devolve nas
  // escritas (ver middlewares/protecaoCsrf.js); aqui, por cookie.
  const tokens = new Map();
  const json = async (caminho, corpo, cookie) => {
    const r = await fetch(`${base}${caminho}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie, "x-csrf-token": tokens.get(cookie) ?? "" } : {}) }, body: JSON.stringify(corpo) });
    const novoCookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    if (r.headers.get("x-csrf-token")) tokens.set(novoCookie || cookie, r.headers.get("x-csrf-token"));
    return { r, cookie: novoCookie };
  };
  const SENHA = "senha-de-teste-123";
  const admin = (await json("/auth/setup", { nome: "Admin", usuario: "admin", senha: SENHA })).cookie;
  await json("/usuarios", { nome: "Consulta", usuario: "consulta", senha: SENHA, role: "consulta" }, admin);
  const consulta = (await json("/auth/login", { usuario: "consulta", senha: SENHA })).cookie;
  const arquivo = await planilha([CABECALHO, ["Mercado", "B_NFe", "", "", "10/08/2026", "", "", ""]]);
  const enviar = async (caminho, cookie, extra = {}) => {
    const form = new FormData();
    form.append("arquivo", new Blob([arquivo]), "atualizacoes.xlsx");
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    const r = await fetch(`${base}${caminho}`, { method: "POST", headers: { cookie, "x-csrf-token": tokens.get(cookie) ?? "" }, body: form });
    return { status: r.status, corpo: await r.json().catch(() => null) };
  };

  await t.test("consulta não confere nem importa", async () => {
    assert.equal((await enviar("/atualizacoes/import/previa", consulta)).status, 403);
    assert.equal((await enviar("/atualizacoes/import", consulta)).status, 403);
  });
  await t.test("prévia não grava; importar grava e respeita pularDuplicadas", async () => {
    const previa = await enviar("/atualizacoes/import/previa", admin);
    assert.equal(previa.status, 200);
    assert.equal(previa.corpo.validas, 1);
    assert.equal(server.db.atualizacoes.count(), 0);
    assert.equal((await enviar("/atualizacoes/import", admin, { pularDuplicadas: "1" })).corpo.inserted, 1);
    assert.equal((await enviar("/atualizacoes/import", admin, { pularDuplicadas: "1" })).corpo.inserted, 0);
  });
});

test("Importação - duplicidade reconhece o sistema pelo catálogo e ignora a ordem", async () => {
  const env = ambiente();
  try {
    await env.servico.importXlsx(await planilha([CABECALHO, ["Mercado Central", "B_Vendas, B_NFe", "", "", "10/08/2026", "", "", ""]]), USUARIO);
    // "Vendas" é o B_Vendas do catálogo, e "NFe, Vendas" é o mesmo par em
    // outra ordem: as duas linhas repetem o que já foi gravado.
    const p = await env.servico.previaImportacao(await planilha([
      CABECALHO,
      ["mercado central", "NFe, Vendas", "", "", "10/08/2026", "", "", ""],
      ["Mercado Central", "B_Vendas", "", "", "10/08/2026", "", "", ""],
    ]));
    assert.equal(p.duplicadas, 1, "só a primeira repete (a segunda tem outro conjunto de sistemas)");
    assert.equal(p.ocorrencias.find((o) => o.linha === 2).avisos.at(-1).tipo, "duplicidade");
  } finally {
    env.cleanup();
  }
});

test("Importação - nada importado não vira registro de criação na Auditoria", async () => {
  const env = ambiente();
  try {
    const antes = env.db.historico.list({}).total;
    const r = await env.servico.importXlsx(await planilha([CABECALHO, ["Loja", "B_NFe", "", "", "2026-08-10", "", "", ""]]), USUARIO);
    assert.equal(r.inserted, 0);
    assert.equal(env.db.historico.list({}).total, antes);
  } finally {
    env.cleanup();
  }
});
