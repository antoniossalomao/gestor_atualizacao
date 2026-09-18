/*
 * Testes das pecas de src/shared/ -- as que MAIS DE UMA camada usa.
 *
 * Duas delas (buildOrderBy e parsePaginacao) sao defesas de seguranca que
 * ficavam sem teste nenhum: sao o tipo de codigo que parece trivial, nunca
 * muda de comportamento visivel quando quebra, e vira brecha em silencio.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { dataValida, parseData, horaValida } = require("../src/shared/validation");
const { parsePaginacao } = require("../src/shared/pagination");
const { buildOrderBy } = require("../src/shared/sortHelper");

test("shared/validation - datas", async (t) => {
  await t.test("aceita vazio: nem toda data é conhecida na hora de gravar", () => {
    assert.equal(dataValida(""), true);
    assert.equal(dataValida(null), true);
    assert.equal(dataValida(undefined), true);
  });

  await t.test("aceita dd/mm/aaaa de verdade", () => {
    assert.equal(dataValida("01/01/2026"), true);
    assert.equal(dataValida("31/12/1999"), true);
    assert.equal(dataValida("29/02/2024"), true, "2024 é bissexto");
  });

  await t.test("rejeita data que o Date 'conserta' sozinho", () => {
    // Este é o caso que motiva a checagem campo a campo: `new Date(2026, 1, 31)`
    // não dá erro -- vira 03/03/2026. Sem comparar de volta com o que foi
    // digitado, "31/02/2026" entraria no banco como data válida e a ordenação
    // cronológica passaria a mentir, sem nenhum sintoma visível.
    assert.equal(dataValida("31/02/2026"), false);
    assert.equal(dataValida("29/02/2026"), false, "2026 não é bissexto");
    assert.equal(dataValida("31/04/2026"), false, "abril tem 30 dias");
    assert.equal(dataValida("32/01/2026"), false);
    assert.equal(dataValida("01/13/2026"), false);
  });

  await t.test("rejeita formato diferente de dd/mm/aaaa", () => {
    for (const ruim of ["2026-01-01", "1/1/2026", "01/01/26", "01-01-2026", "ontem", "01/01/2026 10:00"]) {
      assert.equal(dataValida(ruim), false, `"${ruim}" não deveria passar`);
    }
  });

  await t.test("parseData devolve Date correto, ou null", () => {
    const d = parseData("15/03/2026");
    assert.ok(d instanceof Date);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 2, "março é mês 2 (base zero)");
    assert.equal(d.getDate(), 15);

    assert.equal(parseData(""), null);
    assert.equal(parseData("31/02/2026"), null, "data inválida não vira Date torto");
  });
});

test("shared/validation - horas", async (t) => {
  await t.test("aceita vazio: nem toda tarefa tem hora marcada", () => {
    assert.equal(horaValida(""), true);
    assert.equal(horaValida(null), true);
  });

  await t.test("aceita HH:MM em 24h", () => {
    for (const boa of ["00:00", "09:30", "13:45", "23:59"]) {
      assert.equal(horaValida(boa), true, `"${boa}" deveria passar`);
    }
  });

  await t.test("rejeita hora impossível ou mal formatada", () => {
    for (const ruim of ["24:00", "23:60", "9:30", "09:5", "0930", "09:30:00", "meio-dia"]) {
      assert.equal(horaValida(ruim), false, `"${ruim}" não deveria passar`);
    }
  });
});

test("shared/pagination - parsePaginacao", async (t) => {
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

test("shared/sortHelper - buildOrderBy", async (t) => {
  const mapa = { nome: "c.nome COLLATE NOCASE", data: "a.data_iso", cidade: "c.cidade" };
  const padrao = "a.id DESC";

  await t.test("chave conhecida vira a expressão SQL do mapa", () => {
    assert.equal(buildOrderBy(mapa, "nome", "asc", padrao), "c.nome COLLATE NOCASE ASC, id DESC");
    assert.equal(buildOrderBy(mapa, "data", "desc", padrao), "a.data_iso DESC, id DESC");
  });

  await t.test("chave desconhecida cai no padrão, nunca no SQL", () => {
    // O ponto central: o que vem da URL só vira SQL se for EXATAMENTE uma
    // chave do mapa. Qualquer outra coisa é descartada inteira.
    assert.equal(buildOrderBy(mapa, "coluna_inexistente", "asc", padrao), padrao);
    assert.equal(buildOrderBy(mapa, undefined, "asc", padrao), padrao);
    assert.equal(buildOrderBy(mapa, "", "asc", padrao), padrao);
  });

  await t.test("tentativa de injeção por sortBy não sobrevive", () => {
    for (const ataque of [
      "nome; DROP TABLE clientes--",
      "1) UNION SELECT senha_hash FROM usuarios--",
      "nome COLLATE NOCASE",
      "__proto__",
      "constructor",
    ]) {
      assert.equal(buildOrderBy(mapa, ataque, "asc", padrao), padrao, `"${ataque}" não pode virar SQL`);
    }
  });

  await t.test("sortDir só produz os dois literais fixos", () => {
    // Mesmo com uma chave VÁLIDA, a direção é escolhida entre dois literais no
    // código -- nunca concatenada a partir do que veio da URL.
    const r = buildOrderBy(mapa, "nome", "ASC; DROP TABLE clientes--", padrao);
    assert.equal(r, "c.nome COLLATE NOCASE DESC, id DESC");
    assert.doesNotMatch(r, /DROP/);
  });

  await t.test("herança de Object não é confundida com chave do mapa", () => {
    // `mapa[sortBy]` num objeto literal alcança "toString", "valueOf" etc.
    // Eles são funções, não string, mas se um dia alguém trocar a checagem
    // "if (!expr)" por algo mais frouxo, isto avisa.
    assert.equal(buildOrderBy(mapa, "toString", "asc", padrao), padrao);
    assert.equal(buildOrderBy(mapa, "hasOwnProperty", "asc", padrao), padrao);
  });
});
