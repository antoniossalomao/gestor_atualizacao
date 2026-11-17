/*
 * Busca e destaque de sugestões de cliente (CampoComSugestoes e tabelas):
 * acentos, caixa, ordem de prefixo, múltiplas palavras e escape HTML.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { filtrarSugestoes, destacarTrecho } from "../js/utils/sugestoes.js";

test("utils/sugestoes - filtrarSugestoes", async (t) => {
  const clientes = [
    "Comercial Santana",
    "AÇOUGUE DELIRA",
    "João & Filhos Ltda",
    "Padaria São José",
    "Agro Indústria Therezinha",
    "Santos Mercado",
  ];

  await t.test("prioriza quem começa com o termo antes de quem contém", () => {
    assert.deepEqual(filtrarSugestoes(clientes, "san"), ["Santos Mercado", "Comercial Santana"]);
  });

  await t.test("ignora acentos e cedilha ao filtrar clientes", () => {
    assert.deepEqual(filtrarSugestoes(clientes, "acougue"), ["AÇOUGUE DELIRA"]);
    assert.deepEqual(filtrarSugestoes(clientes, "joao"), ["João & Filhos Ltda"]);
    assert.deepEqual(filtrarSugestoes(clientes, "sao jose"), ["Padaria São José"]);
  });

  await t.test("busca por múltiplas palavras fora de sequência exata", () => {
    assert.deepEqual(filtrarSugestoes(clientes, "agro therezinha"), ["Agro Indústria Therezinha"]);
  });

  await t.test("termo vazio ou só espaços devolve lista vazia", () => {
    assert.deepEqual(filtrarSugestoes(clientes, ""), []);
    assert.deepEqual(filtrarSugestoes(clientes, "   "), []);
  });

  await t.test("respeita o limite de sugestões", () => {
    const muitos = Array.from({ length: 50 }, (_, i) => `Cliente ${i + 1}`);
    assert.equal(filtrarSugestoes(muitos, "cliente", 30).length, 30);
  });
});

test("utils/sugestoes - destacarTrecho", async (t) => {
  await t.test("preserva acentos e caixa originais dentro do <mark>", () => {
    assert.equal(destacarTrecho("AÇOUGUE DELIRA", "acougue"), "<mark>AÇOUGUE</mark> DELIRA");
    assert.equal(destacarTrecho("Padaria São José", "sao jose"), "Padaria <mark>São José</mark>");
  });

  await t.test("destaca palavras individuais quando a busca tem múltiplos termos não contíguos", () => {
    assert.equal(
      destacarTrecho("Agro Indústria Therezinha", "agro therezinha"),
      "<mark>Agro</mark> Indústria <mark>Therezinha</mark>"
    );
  });

  await t.test("escapa HTML nos valores para impedir injeção", () => {
    assert.equal(
      destacarTrecho('<img src=x> João & Cia', "joao"),
      "&lt;img src=x&gt; <mark>João</mark> &amp; Cia"
    );
  });
});
