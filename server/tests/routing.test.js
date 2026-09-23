/*
 * Testes do roteamento HTTP de ponta a ponta: sobe um Server de verdade numa
 * porta efemera, com banco descartavel, e confere o que cada tipo de caminho
 * responde. Complementa security.test.js, que testa as regras em memoria --
 * aqui o que esta sob teste e' a MONTAGEM do Express em si (ordem de API x
 * estatico x fallback de SPA), que nenhum teste de unidade alcanca.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Server } = require("../src/Server");

/** Sobe o servidor na porta 0 (o SO escolhe uma livre) e devolve a base URL. */
async function subirServidor() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-routing-"));
  const server = new Server({
    port: 0,
    dbPath: path.join(tmpDir, "gestao.db"),
    sessionSecret: "segredo-de-teste",
    sessionSecure: false,
    agentApiToken: "token-de-teste",
  });
  await server.start();
  const { port } = server.httpServer.address();

  const encerrar = async () => {
    await server.stop().catch(() => {});
    try {
      server.db.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  return { base: `http://127.0.0.1:${port}`, encerrar };
}

test("Roteamento HTTP - montagem do Express", async (t) => {
  const { base, encerrar } = await subirServidor();
  t.after(encerrar);

  await t.test("a raiz devolve o index.html do front-end", async () => {
    const r = await fetch(`${base}/`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/html/);
    assert.match(await r.text(), /<div id="app">/);
  });

  await t.test("uma rota do front-end (sem extensao) cai no index.html", async () => {
    // O front-end nao tem framework de roteamento no servidor: "/clientes" nao
    // e' um arquivo, e' uma tela que o JS decide mostrar. Tem que devolver a
    // mesma pagina, senao recarregar o navegador em qualquer aba da 404.
    const r = await fetch(`${base}/clientes`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/html/);
  });

  await t.test("um modulo JS que existe e' servido como JavaScript", async () => {
    const r = await fetch(`${base}/js/app/App.js`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /javascript/);
  });

  await t.test("um caminho de ARQUIVO que nao existe da 404, nao o index.html", async () => {
    // Regressao: antes, qualquer caminho fora de /api caia no fallback do SPA,
    // entao um asset movido de pasta ("/js/core/App.js" apos a reorganizacao)
    // respondia 200 com HTML no lugar do modulo -- e o erro so aparecia no
    // console do navegador, como um enigmatico "expected a JavaScript module
    // script but the server responded with a MIME type of text/html".
    for (const caminho of ["/js/core/App.js", "/css/nao-existe.css", "/assets/fantasma.png"]) {
      const r = await fetch(`${base}${caminho}`);
      assert.equal(r.status, 404, `${caminho} deveria dar 404`);
      assert.doesNotMatch(r.headers.get("content-type") || "", /text\/html/, `${caminho} nao pode devolver HTML`);
    }
  });

  await t.test("uma rota de API inexistente nunca devolve o index.html", async () => {
    // Sem sessao, o requireAuth montado sobre TODA a subarvore /api (ver
    // routes/index.js) responde 401 antes de qualquer 404 -- de proposito:
    // um anonimo nao descobre, pelo codigo de status, quais rotas existem.
    // O que importa testar aqui e' o que NAO pode acontecer: cair no
    // fallback do SPA e devolver HTML com status 200.
    const anonimo = await fetch(`${base}/api/rota-que-nao-existe`);
    assert.equal(anonimo.status, 401);
    assert.match(anonimo.headers.get("content-type") || "", /json/);
  });

  await t.test("logado, uma rota de API inexistente responde 404 em JSON", async () => {
    // Este e' o unico jeito de alcancar o ramo de API do notFoundHandler:
    // enquanto nao ha sessao, o requireAuth responde 401 primeiro (testado
    // acima). Cria o primeiro admin (rota de setup, que so funciona com o
    // banco vazio -- e o banco deste teste e' novo), reaproveita o cookie
    // de sessao e so entao pede uma rota que nao existe.
    const setup = await fetch(`${base}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nome: "Admin Teste", usuario: "admin.teste", senha: "senha-de-teste-123" }),
    });
    assert.equal(setup.status, 201, "o setup do primeiro admin deveria funcionar num banco novo");
    const cookie = setup.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    assert.ok(cookie.includes("gestor.sid"), "o setup deveria devolver o cookie de sessao");

    const r = await fetch(`${base}/api/rota-que-nao-existe`, { headers: { cookie } });
    assert.equal(r.status, 404);
    assert.match(r.headers.get("content-type") || "", /json/);
    assert.equal((await r.json()).error, "Rota de API não encontrada.");
  });

  await t.test("a API exige sessao: sem login, 401", async () => {
    const r = await fetch(`${base}/api/clientes`);
    assert.equal(r.status, 401);
  });

  await t.test("a rota de agente exige o token compartilhado", async () => {
    // As rotas do Worker C# ficam sob /api/update (ver routes/index.js) e sao
    // protegidas por token de agente, nao por sessao de navegador.
    const semToken = await fetch(`${base}/api/update/status/C001`);
    assert.equal(semToken.status, 401);
    assert.equal((await semToken.json()).error, "Agente não autenticado.");

    const comTokenErrado = await fetch(`${base}/api/update/status/C001`, {
      headers: { "x-agent-token": "token-errado" },
    });
    assert.equal(comTokenErrado.status, 401);
  });

  await t.test("arquivos de desenvolvimento do client nao sao servidos", async () => {
    // client/package.json e client/tests/ existem para "npm test", nao para o
    // navegador. Ficam dentro da pasta servida por express.static, entao sem um
    // bloqueio explicito seriam baixaveis por qualquer um que abrisse o painel.
    for (const caminho of ["/package.json", "/tests/agenteStatus.test.mjs", "/tests"]) {
      const r = await fetch(`${base}${caminho}`);
      assert.equal(r.status, 404, `${caminho} nao deveria ser servido`);
      assert.doesNotMatch(
        r.headers.get("content-type") || "",
        /html|json/,
        `${caminho} nao pode devolver o index.html nem o proprio JSON`
      );
    }
  });

  await t.test("os cabecalhos de seguranca do helmet estao ativos", async () => {
    const r = await fetch(`${base}/`);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("x-powered-by"), null, "x-powered-by nao deve vazar o Express");
    const csp = r.headers.get("content-security-policy");
    assert.match(csp, /script-src 'self'/, "script-src precisa continuar sem 'unsafe-inline'");
    assert.doesNotMatch(csp, /upgrade-insecure-requests/, "quebraria o acesso por IP na rede local");
  });
});
