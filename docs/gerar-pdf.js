/**
 * Gera DOCUMENTACAO_CONSOLIDADA.pdf a partir do .md ao lado.
 *
 *   cd web/docs && npm install && npm run pdf
 *
 * Por que este script existe: o PDF anterior foi gerado em 09/09/2026 por um
 * script que depois foi apagado (ver secao 6 do proprio documento). Sem
 * gerador, o PDF virou uma foto que ninguem conseguia atualizar -- e em dois
 * dias ja contradizia o .md em silencio, que e exatamente o problema que a
 * secao 6 descreve sobre documentos derivados sem dono. Um PDF sem gerador e
 * uma divergencia esperando acontecer.
 *
 * Nao ha dependencia de Puppeteer/Playwright: o Edge (ou o Chrome) que ja
 * existe em qualquer Windows imprime PDF sozinho pela linha de comando. Uma
 * dependencia de ~300 MB para converter um arquivo de texto seria desproporcional.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
// pathToFileURL em vez de montar "file:///" na mao: no Windows o caminho vem
// com barras invertidas, e escapa-las direito e um detalhe facil de errar.
const { pathToFileURL } = require("url");
const { marked } = require("marked");

const AQUI = __dirname;
const ENTRADA = path.join(AQUI, "DOCUMENTACAO_CONSOLIDADA.md");
const SAIDA = path.join(AQUI, "DOCUMENTACAO_CONSOLIDADA.pdf");

// Ordem de preferencia. O primeiro que existir ganha -- os dois sao Chromium
// e aceitam exatamente as mesmas opcoes de impressao.
const NAVEGADORES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];

/**
 * O CSS existe para a folha, nao para a tela: o que ele resolve e o que quebra
 * mal quando um documento longo vira paginas -- titulo orfao no pe da pagina,
 * linha de tabela partida no meio, bloco de codigo cortado ao meio.
 */
const ESTILO = `
  @page { size: A4; margin: 18mm 15mm 16mm; }

  :root {
    --tinta: #1a1f24;
    --tinta-fraca: #5b6671;
    --regua: #d8dee4;
    --destaque: #0b5d7a;
    --fundo-codigo: #f4f6f8;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    color: var(--tinta);
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
  }

  /* Capa: uma pagina so, para o documento nao comecar no meio de um assunto. */
  .capa {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 240mm;
    page-break-after: always;
    border-top: 3px solid var(--destaque);
    padding-top: 12mm;
  }
  .capa h1 { margin: 0 0 6mm; font-size: 26pt; line-height: 1.2; border: 0; padding: 0; }
  .capa p { margin: 0 0 2mm; color: var(--tinta-fraca); font-size: 11pt; }
  .capa .gerado { margin-top: 10mm; font-size: 9.5pt; }

  /* Cada secao "##" comeca em pagina nova -- sao sete no documento inteiro,
     entao isso organiza sem desperdicar papel. */
  h2 { page-break-before: always; }
  .capa + h1 { page-break-before: avoid; }

  h1, h2, h3, h4 {
    page-break-after: avoid;   /* titulo nunca fica sozinho no pe da pagina */
    line-height: 1.25;
    margin: 7mm 0 3mm;
  }
  h1 { font-size: 19pt; padding-bottom: 2mm; border-bottom: 2px solid var(--regua); }
  h2 { font-size: 15.5pt; color: var(--destaque); padding-bottom: 1.5mm; border-bottom: 1px solid var(--regua); }
  h3 { font-size: 12.5pt; }
  h4 { font-size: 11pt; color: var(--tinta-fraca); }

  p, ul, ol { margin: 0 0 3mm; }
  li { margin-bottom: 1mm; }
  li > ul, li > ol { margin-top: 1mm; }

  a { color: var(--destaque); text-decoration: none; }

  strong { font-weight: 600; }

  code {
    padding: 0.5mm 1.2mm;
    border-radius: 2px;
    background: var(--fundo-codigo);
    font-family: Consolas, "Cascadia Mono", monospace;
    font-size: 9pt;
  }

  pre {
    margin: 0 0 4mm;
    padding: 3mm;
    overflow: visible;
    border: 1px solid var(--regua);
    border-radius: 3px;
    background: var(--fundo-codigo);
    page-break-inside: avoid;
    white-space: pre-wrap;      /* linha longa quebra em vez de sair da folha */
    word-break: break-word;
  }
  pre code { padding: 0; background: none; font-size: 8.5pt; line-height: 1.45; }

  table {
    width: 100%;
    margin: 0 0 4mm;
    border-collapse: collapse;
    font-size: 9pt;
  }
  th, td {
    padding: 1.8mm 2.2mm;
    border: 1px solid var(--regua);
    text-align: left;
    vertical-align: top;
  }
  th { background: var(--fundo-codigo); font-weight: 600; }
  tr { page-break-inside: avoid; }   /* linha nao parte no meio entre paginas */
  thead { display: table-header-group; }  /* cabecalho repete em tabela longa */

  blockquote {
    margin: 0 0 4mm;
    padding: 2mm 4mm;
    border-left: 3px solid var(--destaque);
    background: var(--fundo-codigo);
    color: var(--tinta-fraca);
  }
  blockquote p:last-child { margin-bottom: 0; }

  hr { margin: 6mm 0; border: 0; border-top: 1px solid var(--regua); }

  img { max-width: 100%; }
`;

function acharNavegador() {
  const achado = NAVEGADORES.find((caminho) => fs.existsSync(caminho));
  if (!achado) {
    throw new Error(
      "Nao achei o Edge nem o Chrome nos caminhos padrao do Windows.\n" +
        "Instale um dos dois, ou acrescente o caminho do seu em NAVEGADORES, no topo deste arquivo."
    );
  }
  return achado;
}

function main() {
  const markdown = fs.readFileSync(ENTRADA, "utf8");
  const gerado = new Date().toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" });

  // O documento ja abre com um "# titulo" proprio; a capa entra antes dele.
  const capa = `
    <div class="capa">
      <h1>Gestor de Atualizações</h1>
      <p>Documentação Consolidada</p>
      <p>Painel web + Atualizador Inteligente de ERP</p>
      <p class="gerado">
        Gerado em ${gerado}<br />
        a partir de <code>docs/DOCUMENTACAO_CONSOLIDADA.md</code>
      </p>
    </div>`;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Gestor de Atualizações — Documentação Consolidada</title>
<style>${ESTILO}</style>
</head>
<body>
${capa}
${marked.parse(markdown)}
</body>
</html>`;

  // O HTML intermediario e temporario de proposito: quem versiona e o .md, e
  // um .html ao lado dele seria um terceiro arquivo dizendo a mesma coisa --
  // mais uma copia para divergir.
  const temporario = path.join(os.tmpdir(), `doc-consolidada-${Date.now()}.html`);
  fs.writeFileSync(temporario, html, "utf8");

  try {
    execFileSync(
      acharNavegador(),
      [
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        `--print-to-pdf=${SAIDA}`,
        pathToFileURL(temporario).href,
      ],
      { stdio: "pipe", timeout: 120000 }
    );
  } finally {
    fs.rmSync(temporario, { force: true });
  }

  const kb = Math.round(fs.statSync(SAIDA).size / 1024);
  console.log(`PDF gerado: ${path.relative(process.cwd(), SAIDA)} (${kb} KB)`);
}

main();
