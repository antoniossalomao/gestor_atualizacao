/**
 * Gera APRESENTACAO_EXECUTIVA_ATUALIZACAO_ERP.pdf a partir de APRESENTACAO_EXECUTIVA_ATUALIZACAO_ERP.md.
 * Utiliza o Microsoft Edge / Google Chrome em modo headless para produzir um PDF de alta qualidade.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");
const { marked } = require("marked");

const AQUI = __dirname;
const ENTRADA = path.join(AQUI, "APRESENTACAO_EXECUTIVA_ATUALIZACAO_ERP.md");
const SAIDA = path.join(AQUI, "APRESENTACAO_EXECUTIVA_ATUALIZACAO_ERP.pdf");

const NAVEGADORES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];

const ESTILO = `
  @page {
    size: A4;
    margin: 20mm 18mm 18mm 18mm;
  }

  :root {
    --tinta: #141b24;
    --tinta-fraca: #4a5568;
    --regua: #e2e8f0;
    --destaque: #0969da;
    --destaque-escuro: #034996;
    --fundo-destaque: #f0f7ff;
    --fundo-codigo: #f8fafc;
    --verde: #166534;
    --verde-bg: #f0fdf4;
    --amarelo: #854d0e;
    --amarelo-bg: #fefce8;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    color: var(--tinta);
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif;
    font-size: 10pt;
    line-height: 1.55;
  }

  /* Capa Executiva */
  .capa {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 235mm;
    page-break-after: always;
    border-top: 5px solid var(--destaque);
    padding: 25mm 5mm 15mm;
  }
  .capa-tag {
    display: inline-block;
    color: var(--destaque);
    font-size: 11pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 8mm;
  }
  .capa h1 {
    margin: 0 0 5mm;
    font-size: 26pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.2;
    border: 0;
    padding: 0;
  }
  .capa h2 {
    margin: 0 0 8mm;
    font-size: 14pt;
    font-weight: 600;
    color: var(--tinta-fraca);
    border: 0;
    padding: 0;
    page-break-before: avoid;
  }
  .capa-resumo {
    margin: 8mm 0 15mm;
    padding: 6mm 8mm;
    background: var(--fundo-destaque);
    border-left: 4px solid var(--destaque);
    border-radius: 4px;
    font-size: 10.5pt;
    line-height: 1.6;
    color: #1e3a5f;
  }
  .capa-meta {
    margin-top: auto;
    padding-top: 10mm;
    border-top: 1px solid var(--regua);
    display: flex;
    justify-content: space-between;
    font-size: 9.5pt;
    color: var(--tinta-fraca);
  }

  /* Quebras de Seção em Nova Página */
  h2 {
    page-break-before: always;
    font-size: 16pt;
    font-weight: 700;
    color: #0f172a;
    padding-bottom: 3mm;
    border-bottom: 2px solid var(--regua);
    margin: 0 0 5mm;
  }

  .capa + h2 {
    page-break-before: avoid;
  }

  h1, h2, h3, h4 {
    page-break-after: avoid;
    line-height: 1.25;
  }

  h3 {
    font-size: 12pt;
    font-weight: 600;
    color: var(--destaque-escuro);
    margin: 5mm 0 2.5mm;
  }

  h4 {
    font-size: 10.5pt;
    font-weight: 600;
    color: var(--tinta-fraca);
    margin: 4mm 0 2mm;
  }

  p, ul, ol {
    margin: 0 0 3.5mm;
  }

  li {
    margin-bottom: 1.5mm;
  }

  strong {
    font-weight: 600;
    color: #0f172a;
  }

  blockquote {
    margin: 4mm 0;
    padding: 3mm 5mm;
    border-left: 3px solid var(--destaque);
    background: var(--fundo-destaque);
    color: #1e3a5f;
    font-size: 9.5pt;
    border-radius: 0 4px 4px 0;
  }
  blockquote p:last-child { margin-bottom: 0; }

  /* Tabelas Executivas */
  table {
    width: 100%;
    margin: 4mm 0 6mm;
    border-collapse: collapse;
    font-size: 9pt;
  }
  th, td {
    padding: 2.5mm 3mm;
    border: 1px solid var(--regua);
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #f1f5f9;
    color: #0f172a;
    font-weight: 600;
  }
  tr:nth-child(even) td {
    background: #fafafa;
  }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }

  /* Diagramas e Caixas */
  pre {
    margin: 4mm 0;
    padding: 4mm;
    background: #0f172a;
    color: #f8fafc;
    border-radius: 6px;
    font-family: Consolas, "Cascadia Mono", monospace;
    font-size: 8pt;
    line-height: 1.45;
    white-space: pre-wrap;
    page-break-inside: avoid;
  }

  code {
    padding: 0.4mm 1.5mm;
    border-radius: 3px;
    background: #e2e8f0;
    font-family: Consolas, monospace;
    font-size: 8.5pt;
    color: #0f172a;
  }

  pre code {
    padding: 0;
    background: transparent;
    color: inherit;
  }

  hr {
    margin: 6mm 0;
    border: 0;
    border-top: 1px solid var(--regua);
  }
`;

function acharNavegador() {
  const achado = NAVEGADORES.find((caminho) => fs.existsSync(caminho));
  if (!achado) {
    throw new Error(
      "Não foi possível encontrar o Edge ou Chrome nos caminhos padrão do Windows."
    );
  }
  return achado;
}

function main() {
  if (!fs.existsSync(ENTRADA)) {
    throw new Error(`Arquivo não encontrado: ${ENTRADA}`);
  }

  const rawMarkdown = fs.readFileSync(ENTRADA, "utf8");
  const dataHoje = new Date().toLocaleDateString("pt-BR", { dateStyle: "long" });

  // Cria capa limpa
  const capaHtml = `
    <div class="capa">
      <span class="capa-tag">Bredas Sistemas · Tecnologia & Inovação</span>
      <h1>Automação da Atualização de ERP</h1>
      <h2>Apresentação Executiva, Técnica e de Status Operacional</h2>
      
      <div class="capa-resumo">
        <strong>Objetivo Estratégico:</strong><br/>
        Eliminar o processo manual e repetitivo de atualização de servidores via AnyDesk, reduzindo custos operacionais, mitigando riscos humanos de corrupção de banco e permitindo escalar a carteira de clientes com monitoramento em tempo real.
      </div>

      <div class="capa-meta">
        <div><strong>Responsável:</strong> Antonio Salomão</div>
        <div><strong>Data:</strong> ${dataHoje}</div>
        <div><strong>Versão:</strong> 2.0 (Consolidada)</div>
      </div>
    </div>
  `;

  // Remove o título h1 do markdown para não duplicar com a capa
  const markdownSemCapa = rawMarkdown.replace(/^#\s+[^\n]+\n+###\s+[^\n]+\n+/m, "");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Apresentação: Automação da Atualização de ERP — Bredas Sistemas</title>
  <style>${ESTILO}</style>
</head>
<body>
  ${capaHtml}
  ${marked.parse(markdownSemCapa)}
</body>
</html>`;

  const temporario = path.join(os.tmpdir(), `apresentacao-executiva-${Date.now()}.html`);
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
  console.log(`PDF da apresentação gerado com sucesso: ${path.relative(process.cwd(), SAIDA)} (${kb} KB)`);
}

main();
