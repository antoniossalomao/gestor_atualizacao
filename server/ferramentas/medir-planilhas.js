/**
 * Mede tempo e memória da importação e da exportação de planilhas (ver
 * "Lentidão" em docs/OPERACAO.md). Os números que ele imprime são os que justificam os
 * limites de config/limitesPlanilha.js -- rode de novo antes de mexer neles.
 *
 *   node server/ferramentas/medir-planilhas.js
 *
 * Banco e planilhas SINTÉTICOS numa pasta temporária (368 clientes, textos do
 * tamanho dos reais); nada encosta em instalação real. Cada cenário roda num
 * processo próprio, para o pico de memória de um não contaminar o do outro.
 *
 * Mede o serviço, não o HTTP: o que o HTTP acrescenta é o arquivo inteiro na
 * memória do multer (o tamanho do .xlsx, impresso junto) e a resposta.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const ExcelJS = require("exceljs");
const { BancoDeDados } = require("../src/database/BancoDeDados");
const { HistoricoService } = require("../src/services/HistoricoService");
const { AtualizacaoService } = require("../src/services/AtualizacaoService");

const USUARIO = { id: 1, nome: "Medição" };
const CLIENTES = 368; // o cadastro real em 29/09/2026
const RESPONSAVEIS = ["Bia", "Carlos", "Daniela", "Eduardo", "Fernanda", "Gustavo"];
const SISTEMAS = ["B_Vendas", "B_NFe", "B_Estoque", "B_Vendas, B_NFe"];
const OBS = "Atualizado remotamente, conferido com o cliente por telefone.";

/** Uma planilha de importação com `n` linhas válidas. */
async function planilha(n, arquivo) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Atualizações");
  ws.addRow(["Cliente", "Sistema", "Versão", "Quem Atualizou", "Data", "Motivo", "Máquinas", "Obs"]);
  for (let i = 0; i < n; i++) {
    const dia = String((i % 28) + 1).padStart(2, "0");
    const mes = String((Math.floor(i / 28) % 12) + 1).padStart(2, "0");
    const ano = 2020 + (Math.floor(i / 336) % 7);
    ws.addRow([`Cliente ${i % CLIENTES}`, SISTEMAS[i % SISTEMAS.length], "", RESPONSAVEIS[i % RESPONSAVEIS.length], `${dia}/${mes}/${ano}`, "Rotina", String(1 + (i % 4)), `${OBS} #${i}`]);
  }
  await wb.xlsx.writeFile(arquivo);
}

function abrir(dir) {
  const db = new BancoDeDados(path.join(dir, "gestao.db"));
  const servico = new AtualizacaoService(db, new HistoricoService(db), { avisarAtualizacao: async () => {} });
  return { db, servico };
}

/** Roda uma operação e devolve tempo e pico de memória ACIMA do início. */
async function medir(fn) {
  global.gc?.();
  const base = process.memoryUsage().rss;
  const inicio = performance.now();
  const resultado = await fn();
  const ms = performance.now() - inicio;
  // maxRSS é o pico do processo inteiro (em KB); menos o que já estava em uso.
  const picoMb = Math.max(0, process.resourceUsage().maxRSS * 1024 - base) / 1024 / 1024;
  return { ms: Math.round(ms), picoMb: Math.round(picoMb), resultado };
}

/** Processo filho: um cenário só. */
async function cenario([tipo, nStr, dir]) {
  const n = Number(nStr);
  if (tipo === "preparar") {
    // Cadastra os clientes e deixa o banco com `n` atualizações (para a exportação).
    const { db, servico } = abrir(dir);
    const vendas = db.sistemas.resolver("B_Vendas").id;
    db.conn.transaction(() => {
      for (let i = 0; i < CLIENTES; i++) db.clientes.insert(`C${i}`, `Cliente ${i}`, "Uberaba", [vendas], "");
    })();
    // Direto pelo repositório: acima do limite, a importação (com razão)
    // recusaria montar o banco de teste.
    const nfe = db.sistemas.resolver("B_NFe").id;
    db.conn.transaction(() => {
      for (let i = 0; i < n; i++) {
        const cliente = `Cliente ${i % CLIENTES}`;
        const dia = String((i % 28) + 1).padStart(2, "0");
        const mes = String((Math.floor(i / 28) % 12) + 1).padStart(2, "0");
        db.atualizacoes.insert(
          { cliente, cliente_id: (i % CLIENTES) + 1, versao: "", responsavel: RESPONSAVEIS[i % RESPONSAVEIS.length], data: `${dia}/${mes}/${2020 + (Math.floor(i / 336) % 7)}`, motivo: "Rotina", maquinas: "2", obs: `${OBS} #${i}`, versoes_por_sistema: 0 },
          i % 2 ? [{ id: vendas, versao: null }] : [{ id: vendas, versao: null }, { id: nfe, versao: null }]
        );
      }
    })();
    void servico;
    db.conn.close();
    return {};
  }
  if (tipo === "planilha") {
    const arquivo = path.join(dir, `import-${n}.xlsx`);
    await planilha(n, arquivo);
    return { kb: Math.round(fs.statSync(arquivo).size / 1024) };
  }
  const { db, servico } = abrir(dir);
  if (tipo === "previa" || tipo === "importar") {
    const buffer = fs.readFileSync(path.join(dir, `import-${n}.xlsx`));
    // Acima do limite, o que se mede é o custo da RECUSA.
    const m = await medir(() =>
      (tipo === "previa" ? servico.previaImportacao(buffer) : servico.importarXlsx(buffer, USUARIO)).catch((e) => ({ recusada: e.message }))
    );
    db.conn.close();
    return { ms: m.ms, picoMb: m.picoMb, recusada: Boolean(m.resultado.recusada) };
  }
  if (tipo === "exportar") {
    const m = await medir(() => servico.exportarXlsxEmMemoria().catch((e) => ({ recusada: e.message })));
    db.conn.close();
    return { ms: m.ms, picoMb: m.picoMb, kb: m.resultado.recusada ? "recusada" : Math.round(m.resultado.byteLength / 1024) };
  }
  throw new Error(`cenário desconhecido: ${tipo}`);
}

/** Processo pai: roda cada cenário num filho e imprime a tabela. */
function rodar(args) {
  const r = spawnSync(process.execPath, ["--expose-gc", __filename, "--cenario", ...args.map(String)], { encoding: "utf8" });
  const ultima = r.stdout.trim().split("\n").at(-1);
  if (r.status !== 0 || !ultima?.startsWith("{")) throw new Error(`${args.join(" ")}: ${r.stderr || r.stdout}`);
  return JSON.parse(ultima);
}

function principal() {
  const tamanhos = (process.env.TAMANHOS || "1000,5000,20000,50000").split(",").map(Number);
  console.log(`Node ${process.version}, ${os.cpus()[0]?.model || "?"}, ${Math.round(os.totalmem() / 1024 ** 3)} GB\n`);
  console.log("Importação (serviço; o HTTP soma o .xlsx inteiro na memória do multer)");
  console.log("linhas | .xlsx KB | prévia ms | prévia pico MB | importar ms | importar pico MB");
  for (const n of tamanhos) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-medir-"));
    try {
      rodar(["preparar", 0, dir]);
      const { kb } = rodar(["planilha", n, dir]);
      const previa = rodar(["previa", n, dir]);
      const imp = rodar(["importar", n, dir]);
      const nota = imp.recusada ? " (recusada: acima do limite)" : "";
      console.log([n, kb, previa.ms, previa.picoMb, imp.ms, imp.picoMb].join(" | ") + nota);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  console.log("\nExportação (histórico inteiro, sem filtro)");
  console.log("linhas no banco | ms | pico MB | .xlsx KB");
  for (const n of tamanhos) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-medir-"));
    try {
      rodar(["preparar", n, dir]);
      const exp = rodar(["exportar", n, dir]);
      console.log([n, exp.ms, exp.picoMb, exp.kb].join(" | "));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

if (process.argv[2] === "--cenario") {
  // As migrações do Database escrevem no console; só a última linha é o resultado.
  cenario(process.argv.slice(3)).then(
    (r) => console.log(JSON.stringify(r)),
    (e) => {
      console.error(e);
      process.exit(1);
    }
  );
} else {
  principal();
}
