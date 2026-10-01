/*
 * Testes do token CSRF no ApiPainel (ADR-0011; o servidor está
 * em server/src/middlewares/protecaoCsrf.js e tem os testes dele).
 *
 * O que erra em silêncio se quebrar:
 *  - a escrita sair sem o token → toda alteração vira 403 depois de entrar;
 *  - o token ir junto num GET → nada quebra, mas espalha o token à toa;
 *  - a recusa por token velho (a pessoa entrou de novo em outra aba) não ser
 *    repetida → "Recarregue a página" num clique que deveria ter funcionado;
 *  - repetir para sempre, ou repetir um 403 de PERMISSÃO.
 *
 * `fetch` e `XMLHttpRequest` são trocados por versões de teste que registram
 * o que receberam e respondem o que cada teste manda.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ApiPainel, ErroApi } from "../js/api/ApiPainel.js";

/** Resposta falsa com cabeçalhos, no formato que `fetch` devolveria. */
function resposta(status, corpo, token) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("X-CSRF-Token", token);
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers });
}

const RECUSA_CSRF = { error: "Recarregue a página (F5).", codigo: "csrf" };

/**
 * Troca o `fetch` global por um que responde na ordem da lista e guarda
 * método, caminho e token de cada pedido.
 */
function simularFetch(respostas) {
  const pedidos = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opcoes = {}) => {
    pedidos.push({ url, metodo: opcoes.method || "GET", token: opcoes.headers?.["X-CSRF-Token"] ?? null });
    const proxima = respostas.shift();
    if (!proxima) throw new Error(`pedido inesperado: ${url}`);
    return proxima();
  };
  return { pedidos, restaurar: () => (globalThis.fetch = original) };
}

test("ApiPainel - token CSRF nos pedidos com fetch", async (t) => {
  await t.test("guarda o token da resposta e o manda nas escritas, não nas leituras", async () => {
    const { pedidos, restaurar } = simularFetch([
      () => resposta(200, { user: { id: 1 } }, "tok-1"),
      () => resposta(200, []),
      () => resposta(201, { id: 9 }),
      () => resposta(200, {}),
      () => resposta(200, {}),
      () => resposta(204),
    ]);
    try {
      const api = new ApiPainel();
      await api.post("/auth/login", { usuario: "a", senha: "b" });
      await api.get("/clientes");
      await api.post("/clientes", { nome: "X" });
      await api.put("/clientes/9", { nome: "Y" });
      await api.patch("/agendamentos/1/done");
      await api.delete("/clientes/9");
      assert.deepEqual(
        pedidos.map((p) => [p.metodo, p.token]),
        [
          ["POST", null], // antes do login ainda não há token
          ["GET", null],
          ["POST", "tok-1"],
          ["PUT", "tok-1"],
          ["PATCH", "tok-1"],
          ["DELETE", "tok-1"],
        ]
      );
    } finally {
      restaurar();
    }
  });

  await t.test("recusa por token velho: busca o atual em /auth/status e repete uma vez", async () => {
    const { pedidos, restaurar } = simularFetch([
      () => resposta(200, {}, "velho"),
      () => resposta(403, RECUSA_CSRF),
      () => resposta(200, { user: { id: 1 } }, "novo"),
      () => resposta(201, { id: 5 }, "novo"),
    ]);
    try {
      const api = new ApiPainel();
      await api.get("/auth/status");
      const criado = await api.post("/clientes", { nome: "X" });
      assert.deepEqual(criado, { id: 5 });
      assert.deepEqual(
        pedidos.map((p) => [p.metodo, p.url, p.token]),
        [
          ["GET", "/api/auth/status", null],
          ["POST", "/api/clientes", "velho"],
          ["GET", "/api/auth/status", null],
          ["POST", "/api/clientes", "novo"],
        ]
      );
    } finally {
      restaurar();
    }
  });

  await t.test("repete só uma vez: se a segunda também for recusada, o erro chega a quem chamou", async () => {
    const { pedidos, restaurar } = simularFetch([
      () => resposta(403, RECUSA_CSRF),
      () => resposta(200, { user: null }),
      () => resposta(403, RECUSA_CSRF),
    ]);
    try {
      const api = new ApiPainel();
      await assert.rejects(api.post("/clientes", { nome: "X" }), (erro) => {
        assert.ok(erro instanceof ErroApi);
        assert.equal(erro.status, 403);
        assert.equal(erro.codigo, "csrf");
        assert.match(erro.message, /Recarregue/);
        return true;
      });
      assert.equal(pedidos.length, 3);
    } finally {
      restaurar();
    }
  });

  await t.test("403 de permissão não é repetido", async () => {
    const { pedidos, restaurar } = simularFetch([() => resposta(403, { error: "Sem permissão." })]);
    try {
      const api = new ApiPainel();
      await assert.rejects(api.delete("/clientes/1"), (erro) => erro.status === 403 && erro.codigo === undefined);
      assert.equal(pedidos.length, 1);
    } finally {
      restaurar();
    }
  });

  await t.test("o download de arquivo também atualiza o token guardado", async () => {
    const { pedidos, restaurar } = simularFetch([
      () => resposta(200, {}, "do-download"),
      () => resposta(201, {}),
    ]);
    try {
      const api = new ApiPainel();
      await api.getFile("/atualizacoes/export");
      await api.post("/clientes", {});
      assert.equal(pedidos[1].token, "do-download");
    } finally {
      restaurar();
    }
  });
});

/**
 * XMLHttpRequest de mentira: responde, no `send`, com a próxima resposta da
 * fila e guarda os cabeçalhos que recebeu.
 */
function simularXhr(respostas) {
  const pedidos = [];
  const original = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = class {
    constructor() {
      this.cabecalhos = {};
      this.ouvintes = {};
      this.upload = { addEventListener() {} };
    }
    open(metodo, url) {
      this.pedido = { metodo, url };
    }
    setRequestHeader(nome, valor) {
      this.cabecalhos[nome] = valor;
    }
    addEventListener(evento, fn) {
      this.ouvintes[evento] = fn;
    }
    getResponseHeader(nome) {
      return nome === "X-CSRF-Token" ? this.tokenResposta ?? null : null;
    }
    send() {
      pedidos.push({ ...this.pedido, token: this.cabecalhos["X-CSRF-Token"] ?? null });
      const [status, corpo, token] = respostas.shift();
      this.status = status;
      this.responseText = corpo === undefined ? "" : JSON.stringify(corpo);
      this.tokenResposta = token;
      queueMicrotask(() => this.ouvintes.load());
    }
  };
  return { pedidos, restaurar: () => (globalThis.XMLHttpRequest = original) };
}

test("ApiPainel - token CSRF no envio de arquivo (XHR)", async (t) => {
  await t.test("manda o token guardado e, se recusado por token velho, renova e reenvia uma vez", async () => {
    const fetchSimulado = simularFetch([
      () => resposta(200, {}, "velho"),
      () => resposta(200, { user: { id: 1 } }, "novo"),
    ]);
    const xhr = simularXhr([
      [403, RECUSA_CSRF],
      [200, { inserted: 1 }, "novo"],
    ]);
    try {
      const api = new ApiPainel();
      await api.get("/auth/status");
      const r = await api.enviarFormulario("/atualizacoes/import", new FormData());
      assert.deepEqual(r, { inserted: 1 });
      assert.deepEqual(
        xhr.pedidos.map((p) => p.token),
        ["velho", "novo"]
      );
      assert.equal(fetchSimulado.pedidos.length, 2, "uma leitura inicial e a renovação");
    } finally {
      xhr.restaurar();
      fetchSimulado.restaurar();
    }
  });
});

test("ApiPainel - painel fora do ar atrás do proxy conta como sem conexão (P03)", async (t) => {
  // O ApiPainel avisa a troca de estado por evento no `document`, que o Node
  // não tem: um de mentira guarda o que foi avisado.
  const avisos = [];
  const documentOriginal = globalThis.document;
  globalThis.document = { dispatchEvent: (e) => avisos.push(e.detail.online) };
  t.after(() => (globalThis.document = documentOriginal));

  await t.test("502/503/504 do Caddy derrubam a conexão; a primeira resposta do painel a devolve", async () => {
    const { restaurar } = simularFetch([
      () => new Response("", { status: 502 }),
      () => new Response("", { status: 503 }),
      () => resposta(200, {}),
    ]);
    try {
      const api = new ApiPainel();
      await assert.rejects(api.get("/resumo"), (erro) => erro.status === 502);
      assert.equal(api.online, false, "com o proxy respondendo no lugar do painel, a faixa de 'sem conexão' tem que aparecer");
      await assert.rejects(api.get("/resumo"));
      await api.get("/resumo");
      assert.equal(api.online, true);
      assert.deepEqual(avisos, [false, true], "um aviso por troca de estado, não por pedido");
    } finally {
      restaurar();
    }
  });

  await t.test("um 500 do próprio painel não é queda de conexão", async () => {
    avisos.length = 0;
    const { restaurar } = simularFetch([() => resposta(500, { error: "Erro interno do servidor." })]);
    try {
      const api = new ApiPainel();
      await assert.rejects(api.get("/resumo"), (erro) => erro.status === 500);
      assert.equal(api.online, true);
      assert.deepEqual(avisos, []);
    } finally {
      restaurar();
    }
  });
});
