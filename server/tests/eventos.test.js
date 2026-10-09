const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { EventosService } = require("../src/services/EventosService");
const { EventosController } = require("../src/controllers/EventosController");

/** Cria um mock de Response HTTP do Express para SSE. */
function criarMockResponse() {
  const res = new EventEmitter();
  res.headers = {};
  res.writes = [];
  res.ended = false;
  res.setHeader = (nome, valor) => {
    res.headers[nome.toLowerCase()] = valor;
  };
  res.write = (chunk) => {
    res.writes.push(String(chunk));
    return true;
  };
  res.end = () => {
    res.ended = true;
    res.emit("close");
  };
  res.flushHeaders = () => {};
  return res;
}

test("EventosService - ciclo de conexões e transmissões SSE", async (t) => {
  await t.test("registra conexão e remove no fechamento", () => {
    const service = new EventosService();
    const res = criarMockResponse();

    service.conectar(res);
    assert.equal(service.totalConectados(), 1);

    res.emit("close");
    assert.equal(service.totalConectados(), 0);
  });

  await t.test("transmite eventos com formato SSE padronizado", () => {
    const service = new EventosService();
    const res1 = criarMockResponse();
    const res2 = criarMockResponse();

    service.conectar(res1);
    service.conectar(res2);

    service.emitir("agente:log", { cnpj: "12.345.678/0001-90", status: "ERRO" });

    const esperado = `event: agente:log\ndata: {"cnpj":"12.345.678/0001-90","status":"ERRO"}\n\n`;
    assert.equal(res1.writes.length, 1);
    assert.equal(res1.writes[0], esperado);
    assert.equal(res2.writes.length, 1);
    assert.equal(res2.writes[0], esperado);
  });

  await t.test("envia ping SSE de keep-alive", () => {
    const service = new EventosService();
    const res = criarMockResponse();

    service.conectar(res);
    service.ping();

    assert.equal(res.writes.length, 1);
    assert.equal(res.writes[0], ": ping\n\n");
  });

  await t.test("trata conexões quebradas na escrita sem lançar erro", () => {
    const service = new EventosService();
    const res = criarMockResponse();
    res.write = () => {
      throw new Error("Broken pipe / ECONNRESET");
    };

    service.conectar(res);
    assert.equal(service.totalConectados(), 1);

    // Não deve lançar exceção e deve remover o cliente com falha
    assert.doesNotThrow(() => {
      service.emitir("teste", { ok: true });
    });
    assert.equal(service.totalConectados(), 0);
  });

  await t.test("parar encerra todas as conexões abertas", () => {
    const service = new EventosService();
    const res = criarMockResponse();

    service.conectar(res);
    service.iniciar();
    assert.equal(service.totalConectados(), 1);

    service.parar();
    assert.equal(res.ended, true);
    assert.equal(service.totalConectados(), 0);
  });
});

test("EventosController - cabeçalhos e evento de boas-vindas", async (t) => {
  await t.test("configura cabeçalhos SSE e emite 'conectado'", () => {
    const service = new EventosService();
    const controller = new EventosController(service);
    const res = criarMockResponse();

    controller.stream({}, res);

    assert.equal(res.headers["content-type"], "text/event-stream");
    assert.equal(res.headers["cache-control"], "no-cache, no-transform");
    assert.equal(res.headers["connection"], "keep-alive");
    assert.equal(res.headers["x-accel-buffering"], "no");

    assert.equal(res.writes.length, 1);
    assert.match(res.writes[0], /^event: conectado\ndata: \{"status":"ok"/);
    assert.equal(service.totalConectados(), 1);

    res.emit("close");
    assert.equal(service.totalConectados(), 0);
  });
});

