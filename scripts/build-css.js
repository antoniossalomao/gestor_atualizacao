#!/usr/bin/env node
/**
 * Combina e minimiza client/css/theme.css + components.css em UM arquivo
 * (client/css/app.min.css) e aponta o client/index.html para ele.
 *
 * Roda só na build da imagem Docker (ver Dockerfile): em desenvolvimento os
 * dois arquivos continuam separados e legíveis. Sem dependências -- só tira
 * comentários e espaço desnecessário, de forma conservadora (não mexe em
 * espaço ao redor de ":", "+" e "-", que fazem diferença em seletores e em
 * calc()).
 *
 * Uso: node scripts/build-css.js [pastaDoClient]
 */
const fs = require("fs");
const path = require("path");

const CLIENT = path.resolve(process.argv[2] || path.join(__dirname, "..", "client"));
const ORDEM = ["theme.css", "components.css"]; // o tema define as variáveis que o resto usa

/** Minimiza preservando o conteúdo de strings. */
function minimizar(css) {
  const strings = [];
  const protegido = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (s) => `\u0000${strings.push(s) - 1}\u0000`);
  const reduzido = protegido
    .replace(/\s+/g, " ")
    .replace(/\s*([{};,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
  return reduzido.replace(/\u0000(\d+)\u0000/g, (_, i) => strings[Number(i)]);
}

const combinado = ORDEM.map((arq) => fs.readFileSync(path.join(CLIENT, "css", arq), "utf8")).join("\n");
const saida = minimizar(combinado);
const destino = path.join(CLIENT, "css", "app.min.css");
fs.writeFileSync(destino, saida);

const indexPath = path.join(CLIENT, "index.html");
const index = fs.readFileSync(indexPath, "utf8");
const novo = index
  .replace(/[ \t]*<link rel="stylesheet" href="\/css\/theme\.css" \/>\r?\n/, '  <link rel="stylesheet" href="/css/app.min.css" />\n')
  .replace(/[ \t]*<link rel="stylesheet" href="\/css\/components\.css" \/>\r?\n/, "");
if (novo === index) throw new Error("index.html não tem os <link> esperados de theme.css/components.css.");
fs.writeFileSync(indexPath, novo);

const kb = (n) => (n / 1024).toFixed(1);
console.log(`CSS: ${kb(combinado.length)} KB -> ${kb(saida.length)} KB (${path.relative(process.cwd(), destino)})`);

