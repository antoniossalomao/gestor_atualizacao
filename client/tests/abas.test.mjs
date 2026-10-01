/*
 * Nomes antigos de abas (domain/abas.js). O que erra em silêncio: um alias
 * apontando para uma aba que não existe mais -- a tela abre na primeira aba e
 * o link parece só "não ter funcionado".
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALIASES_CONFIGURACOES, ALIASES_ADMINISTRACAO, abaAtual } from "../js/domain/abas.js";

const JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "js");

// Leitura do código-fonte, e não import: as views precisam de um documento.
function chaves(arquivo, inicio, fim) {
  const fonte = fs.readFileSync(path.join(JS, arquivo), "utf8");
  const a = fonte.indexOf(inicio);
  const bloco = fonte.slice(a, fonte.indexOf(fim, a + inicio.length));
  return new Set([...bloco.matchAll(/\bkey: "([^"]+)"/g)].map((m) => m[1]));
}

test("Aliases de abas", async (t) => {
  const configuracoes = chaves("views/configuracoes/ajustes.js", "const abas = [", "\n  ];");
  const administracao = chaves("views/AdministracaoView.js", "const ABAS = [", "\n];");

  await t.test("as listas de abas foram achadas no código", () => {
    assert.ok(configuracoes.size >= 6, [...configuracoes].join(","));
    assert.ok(administracao.size >= 7, [...administracao].join(","));
  });

  await t.test("todo alias aponta para uma aba que existe", () => {
    for (const [nome, aba] of Object.entries(ALIASES_CONFIGURACOES)) assert.ok(configuracoes.has(aba), `configurações: ${nome} -> ${aba}`);
    for (const [nome, aba] of Object.entries(ALIASES_ADMINISTRACAO)) assert.ok(administracao.has(aba), `administração: ${nome} -> ${aba}`);
  });

  await t.test("toda aba de hoje é ela mesma", () => {
    for (const aba of configuracoes) assert.equal(abaAtual(ALIASES_CONFIGURACOES, aba), aba);
    for (const aba of administracao) assert.equal(abaAtual(ALIASES_ADMINISTRACAO, aba), aba);
  });

  await t.test("nomes antigos chegam à aba nova; desconhecido passa como veio", () => {
    assert.equal(abaAtual(ALIASES_CONFIGURACOES, "tabelas"), "trabalho");
    assert.equal(abaAtual(ALIASES_ADMINISTRACAO, "saude"), "diagnostico");
    assert.equal(abaAtual(ALIASES_ADMINISTRACAO, "xyz"), "xyz");
    // Nome de propriedade de objeto não é aba.
    assert.equal(abaAtual(ALIASES_CONFIGURACOES, "toString"), "toString");
  });
});
