const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { registrarErrosDeProcesso } = require("../src/middlewares/tratadorDeErros");

function montar() {
  const alvo = new EventEmitter();
  const logs = [];
  const saidas = [];
  let encerrou = 0;
  registrarErrosDeProcesso({
    alvo,
    log: { error: (...a) => logs.push(a) },
    sair: (c) => saidas.push(c),
    aoEncerrar: async () => { encerrou += 1; },
  });
  return { alvo, logs, saidas, encerrou: () => encerrou };
}

test("tratadorDeErros - eventos de processo", async (t) => {
  await t.test("unhandledRejection só registra: não encerra", async () => {
    const env = montar();
    env.alvo.emit("unhandledRejection", new Error("órfã"));
    await new Promise((r) => setImmediate(r));
    assert.equal(env.logs.length, 1);
    assert.deepEqual(env.saidas, []);
    assert.equal(env.encerrou(), 0);
  });

  await t.test("uncaughtException registra, encerra com ordem e sai com 1", async () => {
    const env = montar();
    env.alvo.emit("uncaughtException", new Error("fatal"));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(env.logs.length, 1);
    assert.equal(env.encerrou(), 1);
    assert.deepEqual(env.saidas, [1]);
  });

  await t.test("uncaughtException repetida não encerra duas vezes", async () => {
    const env = montar();
    env.alvo.emit("uncaughtException", new Error("a"));
    env.alvo.emit("uncaughtException", new Error("b"));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(env.encerrou(), 1);
    assert.deepEqual(env.saidas, [1]);
  });
});

