const test = require("node:test");
const assert = require("node:assert/strict");
const { BaseController } = require("../src/controllers/BaseController");

test("BaseController - handleSync", async (t) => {
  const controller = new BaseController();

  await t.test("devolve json com status padrão para retorno síncrono", () => {
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonBody = data;
      },
    };
    let nextCalled = false;
    controller.handleSync(() => ({ ok: true }), {}, res, () => (nextCalled = true));
    assert.equal(statusCode, 200);
    assert.deepEqual(jsonBody, { ok: true });
    assert.equal(nextCalled, false);
  });

  await t.test("chama res.end() quando retorno síncrono é undefined", () => {
    let statusCode = null;
    let ended = false;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      end() {
        ended = true;
      },
    };
    let nextCalled = false;
    controller.handleSync(() => undefined, {}, res, () => (nextCalled = true), 204);
    assert.equal(statusCode, 204);
    assert.equal(ended, true);
    assert.equal(nextCalled, false);
  });

  await t.test("passa erro síncrono para next()", () => {
    let errorCaught = null;
    controller.handleSync(
      () => {
        throw new Error("Falha esperada");
      },
      {},
      {},
      (err) => (errorCaught = err)
    );
    assert.equal(errorCaught?.message, "Falha esperada");
  });

  await t.test("aguarda promessa resolvida e responde json com status configurado", async () => {
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonBody = data;
      },
    };
    let nextCalled = false;
    await new Promise((resolve) => {
      res.json = (data) => {
        jsonBody = data;
        resolve();
      };
      controller.handleSync(async () => ({ async: true }), {}, res, () => (nextCalled = true), 201);
    });
    assert.equal(statusCode, 201);
    assert.deepEqual(jsonBody, { async: true });
    assert.equal(nextCalled, false);
  });

  await t.test("encaminha rejeição de promessa assíncrona para next()", async () => {
    let errorCaught = null;
    await new Promise((resolve) => {
      controller.handleSync(
        async () => {
          throw new Error("Erro assíncrono");
        },
        {},
        {},
        (err) => {
          errorCaught = err;
          resolve();
        }
      );
    });
    assert.equal(errorCaught?.message, "Erro assíncrono");
  });
});
