/*
 * Ordenação segura por coluna (database/ordenacao.js): `?sortBy=` só escolhe
 * entre chaves de uma lista fixa, nunca vira texto de SQL. Foi aqui que
 * estava o `?sortBy=constructor` que derrubava qualquer listagem paginada.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { montarOrdenacao } = require("../src/database/ordenacao");

test("ordenacao - montarOrdenacao", async (t) => {
  const mapa = { nome: "c.nome COLLATE NOCASE", data: "a.data_iso", cidade: "c.cidade" };
  const padrao = "a.id DESC";

  await t.test("chave conhecida vira a expressão SQL do mapa", () => {
    assert.equal(montarOrdenacao(mapa, "nome", "asc", padrao), "c.nome COLLATE NOCASE ASC, id DESC");
    assert.equal(montarOrdenacao(mapa, "data", "desc", padrao), "a.data_iso DESC, id DESC");
  });

  await t.test("chave desconhecida cai no padrão, nunca no SQL", () => {
    // O ponto central: o que vem da URL só vira SQL se for EXATAMENTE uma
    // chave do mapa. Qualquer outra coisa é descartada inteira.
    assert.equal(montarOrdenacao(mapa, "coluna_inexistente", "asc", padrao), padrao);
    assert.equal(montarOrdenacao(mapa, undefined, "asc", padrao), padrao);
    assert.equal(montarOrdenacao(mapa, "", "asc", padrao), padrao);
  });

  await t.test("tentativa de injeção por sortBy não sobrevive", () => {
    for (const ataque of [
      "nome; DROP TABLE clientes--",
      "1) UNION SELECT senha_hash FROM usuarios--",
      "nome COLLATE NOCASE",
      "__proto__",
      "constructor",
    ]) {
      assert.equal(montarOrdenacao(mapa, ataque, "asc", padrao), padrao, `"${ataque}" não pode virar SQL`);
    }
  });

  await t.test("sortDir só produz os dois literais fixos", () => {
    // Mesmo com uma chave VÁLIDA, a direção é escolhida entre dois literais no
    // código -- nunca concatenada a partir do que veio da URL.
    const r = montarOrdenacao(mapa, "nome", "ASC; DROP TABLE clientes--", padrao);
    assert.equal(r, "c.nome COLLATE NOCASE DESC, id DESC");
    assert.doesNotMatch(r, /DROP/);
  });

  await t.test("herança de Object não é confundida com chave do mapa", () => {
    // `mapa[sortBy]` num objeto literal alcança "toString", "valueOf" etc.
    // Eles são funções, não string, mas se um dia alguém trocar a checagem
    // "if (!expr)" por algo mais frouxo, isto avisa.
    assert.equal(montarOrdenacao(mapa, "toString", "asc", padrao), padrao);
    assert.equal(montarOrdenacao(mapa, "hasOwnProperty", "asc", padrao), padrao);
  });
});
