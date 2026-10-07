/*
 * Leitura segura de page/pageSize/sortDir da query string (controllers/paginacao.js).
 * É uma defesa de segurança que ficava sem teste nenhum: parece trivial, nunca
 * muda de comportamento visível quando quebra, e vira brecha em silêncio
 * (`?pageSize=999999999` montando uma resposta gigante de propósito).
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { lerPaginacao } = require("../src/controllers/paginacao");

test("paginacao - lerPaginacao", async (t) => {
  await t.test("página enorme mantém o offset dentro da faixa segura do SQLite", () => {
    for (const page of ["9".repeat(400), String(Number.MAX_SAFE_INTEGER), "9007199254740992"]) {
      const p = lerPaginacao({ page, pageSize: "200" });
      assert.ok(Number.isSafeInteger((p.page - 1) * p.pageSize));
      assert.ok(p.page >= 1);
    }
  });
  await t.test("sem query nenhuma, usa os padrões", () => {
    assert.deepEqual(lerPaginacao({}), { page: 1, pageSize: 50, sortBy: undefined, sortDir: "desc" });
  });

  await t.test("limita pageSize: é uma defesa, não um arredondamento", () => {
    // Sem o teto, "?pageSize=999999999" faria o servidor montar uma resposta
    // gigante de propósito -- negação de serviço com uma linha na barra de
    // endereço, por qualquer pessoa logada.
    assert.equal(lerPaginacao({ pageSize: "999999999" }).pageSize, 200);
    assert.equal(lerPaginacao({ pageSize: "201" }).pageSize, 200);
    assert.equal(lerPaginacao({ pageSize: "200" }).pageSize, 200);
  });

  await t.test("valor sem sentido não vira NaN nem número negativo", () => {
    // parseInt("abc") é NaN, e NaN escapando para o LIMIT do SQL quebraria a
    // consulta; página negativa viraria OFFSET negativo.
    assert.equal(lerPaginacao({ page: "abc" }).page, 1);
    assert.equal(lerPaginacao({ page: "-5" }).page, 1);
    assert.equal(lerPaginacao({ page: "0" }).page, 1);
    assert.equal(lerPaginacao({ pageSize: "abc" }).pageSize, 50);
    assert.equal(lerPaginacao({ pageSize: "-10" }).pageSize, 1);
  });

  await t.test("sortDir só pode ser asc ou desc", () => {
    assert.equal(lerPaginacao({ sortDir: "asc" }).sortDir, "asc");
    assert.equal(lerPaginacao({ sortDir: "desc" }).sortDir, "desc");
    assert.equal(lerPaginacao({ sortDir: "ASC" }).sortDir, "desc", "só o literal minúsculo conta");
    assert.equal(lerPaginacao({ sortDir: "; DROP TABLE clientes--" }).sortDir, "desc");
  });

  await t.test("sortBy passa cru (quem filtra é o sortHelper)", () => {
    assert.equal(lerPaginacao({ sortBy: "nome" }).sortBy, "nome");
    assert.equal(lerPaginacao({ sortBy: 123 }).sortBy, undefined, "não-string é descartado");
  });
});
