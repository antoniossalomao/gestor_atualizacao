/*
 * Leitura segura de page/pageSize/sortDir da query string (controllers/paginacao.js).
 * É uma defesa de segurança que ficava sem teste nenhum: parece trivial, nunca
 * muda de comportamento visível quando quebra, e vira brecha em silêncio
 * (`?pageSize=999999999` montando uma resposta gigante de propósito).
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { parsePaginacao } = require("../src/controllers/paginacao");

test("paginacao - parsePaginacao", async (t) => {
  await t.test("sem query nenhuma, usa os padrões", () => {
    assert.deepEqual(parsePaginacao({}), { page: 1, pageSize: 50, sortBy: undefined, sortDir: "desc" });
  });

  await t.test("limita pageSize: é uma defesa, não um arredondamento", () => {
    // Sem o teto, "?pageSize=999999999" faria o servidor montar uma resposta
    // gigante de propósito -- negação de serviço com uma linha na barra de
    // endereço, por qualquer pessoa logada.
    assert.equal(parsePaginacao({ pageSize: "999999999" }).pageSize, 200);
    assert.equal(parsePaginacao({ pageSize: "201" }).pageSize, 200);
    assert.equal(parsePaginacao({ pageSize: "200" }).pageSize, 200);
  });

  await t.test("valor sem sentido não vira NaN nem número negativo", () => {
    // parseInt("abc") é NaN, e NaN escapando para o LIMIT do SQL quebraria a
    // consulta; página negativa viraria OFFSET negativo.
    assert.equal(parsePaginacao({ page: "abc" }).page, 1);
    assert.equal(parsePaginacao({ page: "-5" }).page, 1);
    assert.equal(parsePaginacao({ page: "0" }).page, 1);
    assert.equal(parsePaginacao({ pageSize: "abc" }).pageSize, 50);
    assert.equal(parsePaginacao({ pageSize: "-10" }).pageSize, 1);
  });

  await t.test("sortDir só pode ser asc ou desc", () => {
    assert.equal(parsePaginacao({ sortDir: "asc" }).sortDir, "asc");
    assert.equal(parsePaginacao({ sortDir: "desc" }).sortDir, "desc");
    assert.equal(parsePaginacao({ sortDir: "ASC" }).sortDir, "desc", "só o literal minúsculo conta");
    assert.equal(parsePaginacao({ sortDir: "; DROP TABLE clientes--" }).sortDir, "desc");
  });

  await t.test("sortBy passa cru (quem filtra é o sortHelper)", () => {
    assert.equal(parsePaginacao({ sortBy: "nome" }).sortBy, "nome");
    assert.equal(parsePaginacao({ sortBy: 123 }).sortBy, undefined, "não-string é descartado");
  });
});
