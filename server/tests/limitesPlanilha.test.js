/*
 * Capacidade da importação e da exportação (config/limitesPlanilha.js).
 *
 * O que erra em silêncio se quebrar:
 * - o limite deixar de ser checado e uma planilha grande derrubar o servidor
 *   de todo mundo (medido: 50 mil linhas custavam 1,75 GB);
 * - a recusa gravar parte do lote;
 * - a exportação acima do limite montar tudo na memória antes de recusar;
 * - célula com texto formatado entrar como "[object Object]";
 * - upload grande demais ou de formato errado responder "Erro interno".
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const zlib = require("node:zlib");
const ExcelJS = require("exceljs");

const { BancoDeDados } = require("../src/database/BancoDeDados");
const { Servidor } = require("../src/Servidor");
const { HistoricoService } = require("../src/services/HistoricoService");
const { AtualizacaoService } = require("../src/services/AtualizacaoService");
const { contarLinhasXlsx } = require("../src/services/contarLinhasXlsx");
const { LIMITE_LINHAS_IMPORTACAO, LIMITE_LINHAS_EXPORTACAO } = require("../src/config/limitesPlanilha");

const USUARIO = { id: 1, nome: "Teste" };
const CABECALHO = ["Cliente", "Sistema", "Versão", "Quem Atualizou", "Data", "Motivo", "Máquinas", "Obs"];

async function planilha(linhas) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Atualizações");
  for (const l of linhas) ws.addRow(l);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** `n` linhas válidas, cada uma com data diferente (nenhuma duplicada). */
function linhasValidas(n) {
  return Array.from({ length: n }, (_, i) => {
    const dia = String((i % 28) + 1).padStart(2, "0");
    const mes = String((Math.floor(i / 28) % 12) + 1).padStart(2, "0");
    return ["Mercado Central", "B_NFe", "", "Bia", `${dia}/${mes}/${2000 + Math.floor(i / 336)}`, "Rotina", "", ""];
  });
}

function ambiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-limites-"));
  const db = new BancoDeDados(path.join(tmpDir, "gestao.db"));
  const servico = new AtualizacaoService(db, new HistoricoService(db), { avisarAtualizacao: async () => {} });
  db.clientes.insert("", "Mercado Central", "Araxá", [db.sistemas.resolver("B_NFe").id], "");
  const cleanup = () => {
    db.conn.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };
  return { db, servico, cleanup };
}

test("contarLinhasXlsx - conta sem montar a planilha", async (t) => {
  await t.test("conta as linhas de todas as abas", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("A").addRows([CABECALHO, ...linhasValidas(30)]);
    wb.addWorksheet("B").addRows(linhasValidas(12));
    assert.equal(contarLinhasXlsx(Buffer.from(await wb.xlsx.writeBuffer())), 31 + 12);
  });

  await t.test("o que não é zip devolve null (quem dá a mensagem é o leitor de planilha)", () => {
    assert.equal(contarLinhasXlsx(Buffer.from("isto não é uma planilha")), null);
    assert.equal(contarLinhasXlsx(Buffer.alloc(0)), null);
  });

  await t.test("aba que se expande além do teto (zip-bomba) conta como infinita", async () => {
    // Uma aba de 2 MB de texto repetido compacta para poucos KB.
    const xml = Buffer.from(`<worksheet><sheetData>${"<row><c/></row>".repeat(140000)}</sheetData></worksheet>`);
    const compactado = zlib.deflateRawSync(xml);
    const zip = zipComUmaEntrada("xl/worksheets/sheet1.xml", compactado);
    assert.equal(contarLinhasXlsx(zip, { tetoBytesPorAba: 1024 * 1024 }), Infinity);
    assert.equal(contarLinhasXlsx(zip), 140000, "com o teto padrão, conta normalmente");
  });
});

test("Importação - limite de linhas", async (t) => {
  const env = ambiente();
  t.after(env.cleanup);

  await t.test(`${LIMITE_LINHAS_IMPORTACAO + 1} linhas: prévia e importação recusam com mensagem clara, sem gravar nada`, async () => {
    const buffer = await planilha([CABECALHO, ...linhasValidas(LIMITE_LINHAS_IMPORTACAO + 1)]);
    const esperado = /mais de 5\.000 linhas.*Divida o arquivo.*Nada foi gravado/s;
    await assert.rejects(env.servico.previaImportacao(buffer), esperado);
    await assert.rejects(env.servico.importarXlsx(buffer, USUARIO), esperado);
    assert.equal(env.db.atualizacoes.count(), 0);
  });

  await t.test(`exatamente ${LIMITE_LINHAS_IMPORTACAO} linhas: entra tudo`, async () => {
    const r = await env.servico.importarXlsx(await planilha([CABECALHO, ...linhasValidas(LIMITE_LINHAS_IMPORTACAO)]), USUARIO);
    assert.equal(r.inserted, LIMITE_LINHAS_IMPORTACAO);
    assert.equal(env.db.atualizacoes.count(), LIMITE_LINHAS_IMPORTACAO);
  });
});

test("Importação - célula formatada, fórmula e link viram o texto que a pessoa vê", async () => {
  const env = ambiente();
  try {
    const p = await env.servico.previaImportacao(
      await planilha([
        CABECALHO,
        [{ richText: [{ text: "Mercado " }, { font: { bold: true }, text: "Central" }] }, { text: "B_NFe", hyperlink: "http://x" }, "", "", { formula: '"10/08/2026"', result: "10/08/2026" }, "", "", ""],
      ])
    );
    assert.equal(p.validas, 1, JSON.stringify(p.ocorrencias));
    const r = await env.servico.importarXlsx(
      await planilha([CABECALHO, [{ richText: [{ text: "Mercado " }, { text: "Central" }] }, "B_NFe", "", "", "10/08/2026", "", "", ""]]),
      USUARIO
    );
    assert.equal(r.inserted, 1);
    assert.deepEqual(r.naoCadastrados, [], "o cliente foi reconhecido pelo nome, e não gravado como [object Object]");
  } finally {
    env.cleanup();
  }
});

test("Exportação - limite de linhas e filtros", async (t) => {
  const env = ambiente();
  t.after(env.cleanup);
  const nfe = env.db.sistemas.resolver("B_NFe").id;
  const clienteId = env.db.clientes.resolverNome("Mercado Central").id;
  // Direto pelo repositório: é só o volume que interessa aqui.
  env.db.conn.transaction(() => {
    for (let i = 0; i <= LIMITE_LINHAS_EXPORTACAO; i++) {
      const ano = i < 100 ? 2026 : 2020;
      env.db.atualizacoes.insert(
        { cliente: "Mercado Central", cliente_id: clienteId, versao: "", responsavel: i % 2 ? "Bia" : "Carlos", data: `01/01/${ano}`, motivo: "", maquinas: "", obs: "", versoes_por_sistema: 0 },
        [{ id: nfe, versao: null }]
      );
    }
  })();

  await t.test(`acima de ${LIMITE_LINHAS_EXPORTACAO} linhas: recusa dizendo quantas e como filtrar`, async () => {
    await assert.rejects(env.servico.exportarXlsxEmMemoria(), /10\.001 linhas; o limite é 10\.000.*Filtre por período/s);
  });

  await t.test("com filtro abaixo do limite, exporta exatamente as linhas filtradas, com a aba Resumo", async () => {
    const buffer = await env.servico.exportarXlsxEmMemoria("", "Todos", { desde: "01/01/2026", ate: "31/12/2026" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const dados = wb.getWorksheet("Atualizações");
    assert.equal(dados.actualRowCount - 1, 100, "cabeçalho + as 100 de 2026");
    assert.equal(env.db.atualizacoes.contarFiltrados("", "Todos", { desde: "01/01/2026", ate: "31/12/2026" }), 100);
    const resumo = wb.getWorksheet("Resumo");
    const linhaTotal = resumo.getRows(1, resumo.actualRowCount).find((r) => r.getCell(1).value === "Atualizações");
    assert.equal(linhaTotal.getCell(2).value, 100, "o Resumo conta as mesmas linhas da aba de dados");
  });

  await t.test("período inválido continua recusado na exportação", async () => {
    await assert.rejects(env.servico.exportarXlsxEmMemoria("", "Todos", { desde: "31/02/2026" }), /Período inválido/);
  });
});

test("Upload de planilha - recusas do multer respondem com o motivo, não 'Erro interno'", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-upload-"));
  const server = new Servidor({ port: 0, host: "127.0.0.1", dbPath: path.join(tmpDir, "gestao.db"), sessionSecret: "segredo-de-teste", sessionSecure: false });
  await server.start();
  t.after(async () => {
    await server.stop();
    server.db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}/api`;
  const setup = await fetch(`${base}/auth/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nome: "Admin", usuario: "admin", senha: "senha-de-teste-123" }),
  });
  const cookie = setup.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const token = setup.headers.get("x-csrf-token");
  const enviar = (conteudo, nome) => {
    const form = new FormData();
    form.append("arquivo", new Blob([conteudo]), nome);
    return fetch(`${base}/atualizacoes/import/previa`, { method: "POST", headers: { cookie, "x-csrf-token": token }, body: form });
  };

  await t.test("formato errado: 400 com a mensagem do formato", async () => {
    const r = await enviar("a,b,c", "planilha.csv");
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /Formato inválido/);
  });

  await t.test("arquivo acima de 15 MB: 413 dizendo o tamanho máximo", async () => {
    const r = await enviar(Buffer.alloc(15 * 1024 * 1024 + 1), "grande.xlsx");
    assert.equal(r.status, 413);
    assert.match((await r.json()).error, /tamanho máximo aceito \(15 MB\)/);
  });

  await t.test("planilha acima do limite de linhas pela API: 400 com a mensagem do limite", async () => {
    const r = await enviar(await planilha([CABECALHO, ...linhasValidas(LIMITE_LINHAS_IMPORTACAO + 1)]), "grande.xlsx");
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /mais de 5\.000 linhas/);
  });
});

/** Um .zip mínimo (sem compressão de nomes, método deflate) com uma entrada. */
function zipComUmaEntrada(nome, compactado) {
  const nomeBuf = Buffer.from(nome);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compactado.length, 18);
  local.writeUInt16LE(nomeBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compactado.length, 20);
  central.writeUInt16LE(nomeBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const inicioCentral = local.length + nomeBuf.length + compactado.length;
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(1, 8);
  fim.writeUInt16LE(1, 10);
  fim.writeUInt32LE(central.length + nomeBuf.length, 12);
  fim.writeUInt32LE(inicioCentral, 16);
  return Buffer.concat([local, nomeBuf, compactado, central, nomeBuf, fim]);
}
