const test = require("node:test");
const assert = require("node:assert/strict");
const { ArmazemDeSessaoSqlite } = require("../src/database/ArmazemDeSessaoSqlite");

test("resposta atrasada não recria a sessão encerrada por outro pedido", () => {
  const store = new ArmazemDeSessaoSqlite({ filePath: ":memory:" });
  try {
    const dados = { user: { id: 1 }, cookie: { maxAge: 10000 } };
    store.set("uma", dados);
    store.set("outra", dados);
    store.touch("uma", dados);
    assert.equal(store.listarPorUsuario(1).length, 2);
    store.limparPorUsuario(1);
    store.touch("uma", dados);
    assert.deepEqual(store.listarPorUsuario(1), []);
    store.set("nova", dados);
    store.clearAll();
    store.touch("nova", dados);
    assert.deepEqual(store.listarPorUsuario(1), []);
  } finally { store.close(); }
});
