/*
 * Validação de data e de hora (services/validacao.js). Toda gravação passa por
 * aqui; uma data aceita por engano (31/02, 29/02 de ano não bissexto) vira um
 * registro que nenhuma tela sabe ordenar nem filtrar.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { dataValida, parseData, horaValida } = require("../src/services/validacao");

test("validacao - datas", async (t) => {
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

test("validacao - horas", async (t) => {
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
