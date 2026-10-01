/*
 * Proteção CSRF (ADR-0011, middlewares/protecaoCsrf.js).
 *
 * O que erra em silêncio se quebrar, e por isso tem teste:
 * - uma escrita com cookie e sem token passar (a proteção não protege nada);
 * - uma escrita recusada gravar mesmo assim, inclusive upload (a recusa tem
 *   que vir antes do controller e do multer);
 * - quem não tem sessão receber "token inválido" em vez do 401 que leva ao
 *   login, ou o agente C# (sem cookie) passar a ser recusado;
 * - as sessões abertas antes da atualização ficarem sem token para sempre.
 *
 * Aqui o "navegador" é o próprio teste: guarda o cookie e o token que o
 * servidor devolveu e decide quando mandá-los.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const ExcelJS = require("exceljs");

const { Server } = require("../src/Server");

const SENHA = "senha-de-teste-123";

async function subirServidor() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-csrf-"));
  const server = new Server({
    port: 0,
    host: "127.0.0.1",
    dbPath: path.join(tmpDir, "gestao.db"),
    sessionSecret: "segredo-de-teste",
    sessionSecure: false,
    agentApiToken: "token-de-teste",
  });
  await server.start();
  const base = `http://127.0.0.1:${server.httpServer.address().port}/api`;
  const encerrar = async () => {
    await server.stop().catch(() => {});
    try {
      server.db.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };
  return { server, base, encerrar };
}

/** Uma planilha mínima de importação, com uma linha válida. */
async function planilha() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Atualizações");
  ws.addRow(["Cliente", "Sistema", "Versão", "Quem Atualizou", "Data", "Motivo", "Máquinas", "Obs"]);
  ws.addRow(["Mercado", "B_NFe", "", "", "10/08/2026", "", "", ""]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("Proteção CSRF", async (t) => {
  const { server, base, encerrar } = await subirServidor();
  t.after(encerrar);

  /**
   * @param {string} caminho
   * @param {{metodo?: string, corpo?: unknown, form?: FormData, cookie?: string, token?: string, cabecalhos?: Record<string, string>}} [opcoes]
   */
  const pedir = async (caminho, { metodo = "GET", corpo, form, cookie, token, cabecalhos = {} } = {}) => {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: {
        ...(corpo !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...(token ? { "x-csrf-token": token } : {}),
        ...cabecalhos,
      },
      body: form ?? (corpo !== undefined ? JSON.stringify(corpo) : undefined),
    });
    const texto = await r.text();
    let json = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      /* corpo não-JSON */
    }
    return {
      status: r.status,
      corpo: json,
      token: r.headers.get("x-csrf-token"),
      cookie: r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "),
    };
  };

  const setup = await pedir("/auth/setup", { metodo: "POST", corpo: { nome: "Admin", usuario: "admin", senha: SENHA } });
  assert.equal(setup.status, 201);
  const admin = { cookie: setup.cookie, token: setup.token };
  const clientes = () => server.db.clientes.count();

  await t.test("login e configuração inicial já entregam o token, sem precisar de outra chamada", () => {
    assert.ok(admin.cookie.includes("gestor.sid"));
    assert.ok(admin.token && admin.token.length >= 40, "token aleatório de 32 bytes");
  });

  await t.test("toda resposta da API com sessão traz o mesmo token; sem sessão, nenhum", async () => {
    assert.equal((await pedir("/auth/status", { cookie: admin.cookie })).token, admin.token);
    assert.equal((await pedir("/clientes", { cookie: admin.cookie })).token, admin.token);
    assert.equal((await pedir("/auth/status")).token, null);
  });

  await t.test("escrita com sessão e sem token é recusada e não grava", async () => {
    const antes = clientes();
    const r = await pedir("/clientes", { metodo: "POST", cookie: admin.cookie, corpo: { nome: "Sem Token" } });
    assert.equal(r.status, 403);
    assert.equal(r.corpo.codigo, "csrf", "o ApiPainel distingue esta recusa de uma falta de permissão por aqui");
    assert.match(r.corpo.error, /Recarregue a página/);
    assert.equal(clientes(), antes);
  });

  await t.test("token errado é recusado do mesmo jeito", async () => {
    const antes = clientes();
    for (const token of ["x", admin.token.slice(0, -1) + (admin.token.endsWith("A") ? "B" : "A")]) {
      const r = await pedir("/clientes", { metodo: "POST", cookie: admin.cookie, token, corpo: { nome: "Token Errado" } });
      assert.equal(r.status, 403, token);
    }
    assert.equal(clientes(), antes);
  });

  let idCliente;
  await t.test("com o token certo, a escrita passa", async () => {
    const r = await pedir("/clientes", { metodo: "POST", cookie: admin.cookie, token: admin.token, corpo: { nome: "Mercado" } });
    assert.equal(r.status, 201);
    idCliente = r.corpo.id;
    assert.ok(idCliente);
  });

  await t.test("PUT, PATCH e DELETE também exigem o token", async () => {
    const put = await pedir(`/clientes/${idCliente}`, { metodo: "PUT", cookie: admin.cookie, corpo: { nome: "Outro Nome" } });
    assert.equal(put.status, 403);
    const del = await pedir(`/clientes/${idCliente}`, { metodo: "DELETE", cookie: admin.cookie });
    assert.equal(del.status, 403);
    const patch = await pedir("/sistemas/1/classificacao", { metodo: "PATCH", cookie: admin.cookie, corpo: {} });
    assert.equal(patch.status, 403);
    assert.equal(server.db.clientes.getById(idCliente)?.nome, "Mercado", "nada mudou");
  });

  await t.test("upload (multipart) sem token é recusado antes de ser lido; com token, importa", async () => {
    const arquivo = await planilha();
    const enviar = (token) => {
      const form = new FormData();
      form.append("arquivo", new Blob([arquivo]), "atualizacoes.xlsx");
      return pedir("/atualizacoes/import", { metodo: "POST", cookie: admin.cookie, token, form });
    };
    const recusado = await enviar(undefined);
    assert.equal(recusado.status, 403);
    assert.equal(recusado.corpo.codigo, "csrf");
    assert.equal(server.db.atualizacoes.count(), 0);

    const aceito = await enviar(admin.token);
    assert.equal(aceito.status, 200);
    assert.equal(aceito.corpo.inserted, 1);
  });

  await t.test("sem sessão, a resposta continua sendo 401 (leva ao login), não recusa de token", async () => {
    const semCookie = await pedir("/clientes", { metodo: "POST", corpo: { nome: "Anônimo" } });
    assert.equal(semCookie.status, 401);
    const cookieInventado = await pedir("/clientes", { metodo: "POST", cookie: "gestor.sid=s%3Ainventado.assinatura", corpo: { nome: "X" } });
    assert.equal(cookieInventado.status, 401);
  });

  await t.test("o agente C# (token de agente, sem cookie) não é afetado", async () => {
    const r = await pedir("/update/log", { metodo: "POST", cabecalhos: { "x-agent-token": "token-de-teste" }, corpo: {} });
    // Com o Atualizador desligado (padrão), quem responde é a trava dele --
    // o que importa aqui é não ser a recusa de CSRF.
    assert.notEqual(r.corpo?.codigo, "csrf");
  });

  await t.test("entrar de novo com a sessão aberta (outra aba na tela de login) funciona sem token, e o token muda", async () => {
    const r = await pedir("/auth/login", { metodo: "POST", cookie: admin.cookie, corpo: { usuario: "admin", senha: SENHA } });
    assert.equal(r.status, 200);
    assert.ok(r.token);
    assert.notEqual(r.token, admin.token, "sessão nova, token novo");
    // O token velho não vale na sessão nova: é o caso que o ApiPainel resolve
    // buscando o atual e repetindo o pedido.
    const velho = await pedir("/clientes", { metodo: "POST", cookie: r.cookie, token: admin.token, corpo: { nome: "Token Velho" } });
    assert.equal(velho.status, 403);
    const novo = await pedir("/clientes", { metodo: "POST", cookie: r.cookie, token: r.token, corpo: { nome: "Token Novo" } });
    assert.equal(novo.status, 201);
    admin.cookie = r.cookie;
    admin.token = r.token;
  });

  await t.test("sessão aberta antes desta proteção ganha token na primeira chamada", async () => {
    // Simula a sessão gravada pela versão anterior: sem o campo "csrf".
    const sid = decodeURIComponent(admin.cookie.split("=")[1]).slice(2).split(".")[0];
    const dados = await new Promise((ok, erro) => server.sessionStore.get(sid, (e, d) => (e ? erro(e) : ok(d))));
    delete dados.csrf;
    await new Promise((ok, erro) => server.sessionStore.set(sid, dados, (e) => (e ? erro(e) : ok())));

    const escrita = await pedir("/clientes", { metodo: "POST", cookie: admin.cookie, token: admin.token, corpo: { nome: "Antiga" } });
    assert.equal(escrita.status, 403, "o token de antes não vale mais");
    const status = await pedir("/auth/status", { cookie: admin.cookie });
    assert.ok(status.token);
    assert.notEqual(status.token, admin.token);
    assert.equal((await pedir("/auth/status", { cookie: admin.cookie })).token, status.token, "e fica guardado na sessão");
    const depois = await pedir("/clientes", { metodo: "POST", cookie: admin.cookie, token: status.token, corpo: { nome: "Antiga" } });
    assert.equal(depois.status, 201);
    admin.token = status.token;
  });

  await t.test("sair também exige o token; depois de sair, o cookie antigo só recebe 401", async () => {
    assert.equal((await pedir("/auth/logout", { metodo: "POST", cookie: admin.cookie })).status, 403);
    assert.equal((await pedir("/auth/logout", { metodo: "POST", cookie: admin.cookie, token: admin.token })).status, 204);
    const depois = await pedir("/clientes", { metodo: "POST", cookie: admin.cookie, token: admin.token, corpo: { nome: "Fantasma" } });
    assert.equal(depois.status, 401);
  });
});
