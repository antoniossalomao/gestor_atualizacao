/*
 * Configurações > Conta: o próprio nome e as sessões abertas.
 *
 * Tudo aqui sobe um Server de verdade e fala HTTP com cookies de verdade,
 * porque as regras que importam só existem na montagem inteira:
 *
 *  - **a ordem das rotas.** "/usuarios/me" divide o prefixo com
 *    "/usuarios/:id", que é só de administrador. Registradas na ordem errada,
 *    um operador trocando o próprio nome levaria 403 -- e o teste de unidade
 *    do serviço continuaria passando;
 *  - **qual sessão é "esta".** Só o Express sabe o `req.sessionID`, e é ele
 *    que impede alguém de encerrar a sessão em que está sentado;
 *  - **o sid não vaza.** A lista existe para quem desconfia de acesso
 *    indevido. Se ela devolvesse o sid, entregaria o que dá acesso.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Server } = require("../src/Server");

const SENHA = "senha-de-teste-123";
const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";

async function subirServidor() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-conta-"));
  const server = new Server({
    port: 0,
    dbPath: path.join(tmpDir, "gestao.db"),
    sessionSecret: "segredo-de-teste",
    sessionSecure: false,
    agentApiToken: "token-de-teste",
  });
  await server.start();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;

  /** @param {string} caminho @param {{metodo?: string, corpo?: unknown, cookie?: string, agente?: string}} [opcoes] */
  const pedir = async (caminho, { metodo = "GET", corpo, cookie, agente } = {}) => {
    const r = await fetch(`${base}/api${caminho}`, {
      method: metodo,
      headers: {
        ...(corpo !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...(agente ? { "user-agent": agente } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    const texto = await r.text();
    return { status: r.status, corpo: texto ? JSON.parse(texto) : null, cookie: cookieDe(r) };
  };

  const encerrar = async () => {
    await server.stop().catch(() => {});
    try {
      server.db.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };
  return { pedir, encerrar };
}

function cookieDe(resposta) {
  return resposta.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

test("Minha conta - nome e sessões abertas", async (t) => {
  const { pedir, encerrar } = await subirServidor();
  t.after(encerrar);

  const setup = await pedir("/auth/setup", { metodo: "POST", corpo: { nome: "Admin", usuario: "admin", senha: SENHA } });
  const admin = setup.cookie;
  await pedir("/usuarios", {
    metodo: "POST",
    cookie: admin,
    corpo: { nome: "Bia Operadora", usuario: "bia", senha: SENHA, role: "operador" },
  });
  // Cada login conta no limitador de tentativas (10 por usuário a cada 10
  // minutos), inclusive os que dão certo -- por isso a sessão "do PC" é uma
  // só, reaproveitada, e só se abre sessão nova quando o teste precisa dela.
  const entrar = async (agente) =>
    (await pedir("/auth/login", { metodo: "POST", agente, corpo: { usuario: "bia", senha: SENHA } })).cookie;
  const bia = await entrar(CHROME_WINDOWS);

  await t.test("qualquer papel lê o próprio perfil, com as datas do banco", async () => {
    const r = await pedir("/usuarios/me", { cookie: bia });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.usuario, "bia");
    assert.equal(r.corpo.role, "operador");
    assert.ok(r.corpo.criado_em, "membro desde");
    assert.ok(r.corpo.ultimo_login, "último acesso");
    assert.equal(r.corpo.senha_hash, undefined);
  });

  await t.test("um operador troca o próprio nome (a rota não cai no /usuarios/:id de admin)", async () => {
    const r = await pedir("/usuarios/me", { metodo: "PUT", cookie: bia, corpo: { nome: "  Bianca   Ferreira " } });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.nome, "Bianca Ferreira", "espaços sobrando são limpos");
    // A sessão guarda uma cópia do nome: sem atualizá-la, o cabeçalho só
    // mostraria o nome novo depois de sair e entrar de novo.
    const status = await pedir("/auth/status", { cookie: bia });
    assert.equal(status.corpo.user.nome, "Bianca Ferreira");
  });

  await t.test("nome vazio ou comprido demais é recusado", async () => {
    assert.equal((await pedir("/usuarios/me", { metodo: "PUT", cookie: bia, corpo: { nome: "   " } })).status, 400);
    assert.equal((await pedir("/usuarios/me", { metodo: "PUT", cookie: bia, corpo: { nome: "x".repeat(81) } })).status, 400);
  });

  await t.test("trocar o nome não mexe no papel", async () => {
    const r = await pedir("/usuarios/me", { metodo: "PUT", cookie: bia, corpo: { nome: "Bianca F.", role: "admin" } });
    assert.equal(r.corpo.role, "operador");
  });

  await t.test("a troca de nome fica no Histórico", async () => {
    const r = await pedir("/historico?busca=alterado%20para", { cookie: admin });
    const linhas = r.corpo.rows || [];
    assert.ok(linhas.some((l) => /Bianca Ferreira/.test(l.descricao)), JSON.stringify(linhas.map((l) => l.descricao)));
  });

  await t.test("a lista de sessões marca a atual, diz o aparelho e não revela o sid", async () => {
    const noNotebook = await entrar(FIREFOX_LINUX);
    const r = await pedir("/usuarios/me/sessoes", { cookie: bia });
    assert.equal(r.status, 200);
    assert.ok(r.corpo.length >= 2);
    assert.equal(r.corpo[0].atual, true, "a sessão de quem pergunta vem primeiro");
    assert.equal(r.corpo.filter((s) => s.atual).length, 1);
    assert.equal(r.corpo[0].agente, CHROME_WINDOWS);
    assert.ok(r.corpo.some((s) => s.agente === FIREFOX_LINUX));
    assert.ok(r.corpo.every((s) => s.desde && s.ultimoUso), "entrou em / último uso");

    const sidDoCookie = decodeURIComponent(noNotebook.split("gestor.sid=")[1]).replace(/^s:/, "").split(".")[0];
    assert.ok(sidDoCookie.length > 10);
    assert.ok(!JSON.stringify(r.corpo).includes(sidDoCookie), "o sid não pode aparecer na resposta");
  });

  await t.test("a lista é só da própria conta", async () => {
    const r = await pedir("/usuarios/me/sessoes", { cookie: admin });
    assert.ok(r.corpo.every((s) => s.agente !== FIREFOX_LINUX));
  });

  await t.test("encerrar uma sessão derruba só ela", async () => {
    const noNotebook = await entrar(FIREFOX_LINUX);
    const doNotebook = (await pedir("/usuarios/me/sessoes", { cookie: noNotebook })).corpo.find((s) => s.atual);
    const r = await pedir(`/usuarios/me/sessoes/${doNotebook.id}`, { metodo: "DELETE", cookie: bia });
    assert.equal(r.status, 204);
    assert.equal((await pedir("/clientes", { cookie: noNotebook })).status, 401, "o notebook caiu");
    assert.equal((await pedir("/clientes", { cookie: bia })).status, 200, "o PC continua");
  });

  await t.test("a sessão em uso não se encerra por aqui (é o Sair da conta)", async () => {
    const atual = (await pedir("/usuarios/me/sessoes", { cookie: bia })).corpo.find((s) => s.atual);
    const r = await pedir(`/usuarios/me/sessoes/${atual.id}`, { metodo: "DELETE", cookie: bia });
    assert.equal(r.status, 400);
    assert.match(r.corpo.error, /Sair da conta/);
    assert.equal((await pedir("/clientes", { cookie: bia })).status, 200);
  });

  await t.test("não dá para encerrar a sessão de outra pessoa", async () => {
    const doAdmin = (await pedir("/usuarios/me/sessoes", { cookie: admin })).corpo.find((s) => s.atual);
    const r = await pedir(`/usuarios/me/sessoes/${doAdmin.id}`, { metodo: "DELETE", cookie: bia });
    assert.equal(r.status, 400);
    assert.equal((await pedir("/clientes", { cookie: admin })).status, 200);
  });

  await t.test("encerrar todas as outras mantém só a atual", async () => {
    const outra1 = await entrar(FIREFOX_LINUX);
    const outra2 = await entrar(FIREFOX_LINUX);
    const r = await pedir("/usuarios/me/sessoes", { metodo: "DELETE", cookie: bia });
    assert.equal(r.status, 200);
    assert.ok(r.corpo.encerradas >= 2);
    assert.equal((await pedir("/clientes", { cookie: outra1 })).status, 401);
    assert.equal((await pedir("/clientes", { cookie: outra2 })).status, 401);
    const restantes = (await pedir("/usuarios/me/sessoes", { cookie: bia })).corpo;
    assert.equal(restantes.length, 1);
    assert.equal(restantes[0].atual, true);
    assert.equal((await pedir("/clientes", { cookie: admin })).status, 200, "a conta de outra pessoa não é afetada");
  });

  await t.test("sem login, nada disso responde", async () => {
    assert.equal((await pedir("/usuarios/me")).status, 401);
    assert.equal((await pedir("/usuarios/me/sessoes")).status, 401);
  });
});
