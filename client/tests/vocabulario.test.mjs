/*
 * Vocabulário da equipe (A14, 30/09/2026): o registro é uma "atualização",
 * e a data que importa é a "última atualização". O termo antigo foi abolido
 * no projeto inteiro -- telas, nomes internos, comentários e documentação --
 * e este teste falha se ele voltar em qualquer lugar.
 *
 * O termo aparece aqui montado em partes para o próprio teste não se
 * reprovar. Não há lista de exceções, de propósito: um arquivo que "precisa"
 * do termo é um arquivo a reescrever.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TERMO = new RegExp(["atend", "iment"].join(""), "i");

const PASTAS = ["client", "server/src", "server/tests", "server/ferramentas", "docs"];
const ARQUIVOS_SOLTOS = ["README.md", "CONTRIBUTING.md", "CHANGELOG.md", "CLAUDE.md", "SECURITY.md"];
const EXTENSOES = new Set([".js", ".mjs", ".css", ".html", ".md", ".json"]);

function listar(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name.startsWith(".")) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listar(p) : EXTENSOES.has(path.extname(e.name)) ? [p] : [];
  });
}

const arquivos = [
  ...PASTAS.flatMap((p) => listar(path.join(RAIZ, p))),
  ...ARQUIVOS_SOLTOS.map((f) => path.join(RAIZ, f)).filter((f) => fs.existsSync(f)),
];

test("o termo antigo não aparece no projeto (use \"atualização\")", () => {
  assert.ok(arquivos.length > 50, `varreu só ${arquivos.length} arquivos: as pastas mudaram de lugar?`);
  const achados = [];
  for (const abs of arquivos) {
    const linhas = fs.readFileSync(abs, "utf8").split("\n");
    linhas.forEach((linha, i) => {
      if (TERMO.test(linha)) achados.push(`${path.relative(RAIZ, abs).split(path.sep).join("/")}:${i + 1}`);
    });
  }
  assert.deepEqual(achados, [], `troque por "atualização" / "última atualização":\n${achados.join("\n")}`);
});
