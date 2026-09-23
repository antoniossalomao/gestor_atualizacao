/*
 * Trava da migração para a tag `html` (utils/html.js).
 *
 * Conta, por arquivo, os `innerHTML`/`outerHTML`/`insertAdjacentHTML`
 * montados direto com template literal cru -- o formato em que a segurança
 * depende de lembrar do escape. O número de cada arquivo só pode CAIR:
 *  - subiu (ou apareceu arquivo novo): use html`...`;
 *  - caiu: abaixe o teto aqui, para a trava continuar apertada.
 * Quando um arquivo zerar, tire-o da lista.
 *
 * As cinco telas mais usadas (Agendamentos, Atualizações, Clientes, Consulta,
 * Resumo), o sino e a paleta Ctrl+K já foram migrados e estão em zero.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "js");
const CRU = /(?:innerHTML|outerHTML)\s*\+?=\s*`|insertAdjacentHTML\([^,]+,\s*`/g;

/** Teto atual de cada arquivo ainda não migrado. */
const TETO = {
  "views/VersoesView.js": 9,
  "views/ConfiguracoesPanel.js": 8,
  "views/DistribuicaoView.js": 5,
  "app/App.js": 4,
  "views/AcessosModal.js": 3,
  "views/LoginView.js": 2,
  "views/HistoricoView.js": 2,
  "views/AgenteDetalheModal.js": 2,
  "views/SistemasView.js": 1,
  "main.js": 1,
  "components/charts/PieChart.js": 1,
  "components/charts/LineChart.js": 1,
  "components/charts/BarChart.js": 1,
  "components/Pagination.js": 1,
  "components/Modal.js": 1,
  "components/MenuConta.js": 1,
  "components/Drawer.js": 1,
  "components/ConexaoBanner.js": 1,
  "app/Shortcuts.js": 1,
};

function listar(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listar(p) : e.name.endsWith(".js") ? [p] : [];
  });
}

const arquivos = listar(JS).map((abs) => ({
  rel: path.relative(JS, abs).split(path.sep).join("/"),
  fonte: fs.readFileSync(abs, "utf8"),
}));

test("HTML montado sem a tag html só pode diminuir", async (t) => {
  for (const { rel, fonte } of arquivos) {
    const achados = (fonte.match(CRU) || []).length;
    const teto = TETO[rel] ?? 0;
    await t.test(rel, () => {
      assert.ok(achados <= teto, `${rel}: ${achados} innerHTML com template cru (teto ${teto}). Use html\`...\` de utils/html.js.`);
      assert.ok(achados >= teto, `${rel}: caiu para ${achados} -- abaixe o teto em html-seguro.test.mjs para ${achados}.`);
    });
  }
});

test("todo arquivo da lista de tetos ainda existe", () => {
  // Arquivo apagado ou renomeado some da contagem acima sem aviso -- e o teto
  // dele ficaria aqui para sempre, sugerindo uma pendência que não existe.
  const existentes = new Set(arquivos.map((a) => a.rel));
  for (const rel of Object.keys(TETO)) {
    assert.ok(existentes.has(rel), `${rel} está em TETO mas não existe mais -- tire-o da lista.`);
  }
});

test("templates/ e domain/ não tocam no DOM", async (t) => {
  // É o que os deixa rodar no Node (e ser testados). O tsc tem "dom" nas
  // libs e não pegaria um `document` aqui -- por isso a checagem é textual.
  // Exceção herdada, anterior a esta trava: criarDetalhesRetorno monta DOM
  // dentro de domain/. O lugar certo dele é components/ -- quando mudar, tire daqui.
  const EXCECOES = new Set(["domain/agenteReport.js"]);
  for (const { rel, fonte } of arquivos.filter((a) => /^(templates|domain)\//.test(a.rel) && !EXCECOES.has(a.rel))) {
    await t.test(rel, () => {
      const semComentario = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      assert.doesNotMatch(semComentario, /\b(document|window|localStorage|navigator)\b/);
    });
  }
});
