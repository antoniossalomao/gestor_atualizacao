const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { BancoDeDados } = require("../src/database/BancoDeDados");
const { AuthService } = require("../src/services/AuthService");
const { BackupService } = require("../src/services/BackupService");
const { VersaoService } = require("../src/services/VersaoService");
const { HistoricoService } = require("../src/services/HistoricoService");
const { exigirPapel } = require("../src/middlewares/exigirPapel");

function criarAmbienteTeste() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-test-"));
  const dbPath = path.join(tmpDir, "gestao.db");
  const db = new BancoDeDados(dbPath);
  const historico = new HistoricoService(db);
  const auth = new AuthService(db, historico);
  const backups = new BackupService(db, historico);
  const versoes = new VersaoService(db, historico);

  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  return { tmpDir, dbPath, db, historico, auth, backups, versoes, cleanup };
}

test("RBAC - Middleware exigirPapel", async (t) => {
  await t.test("rejeita requisições sem autenticação com 401", () => {
    const mw = exigirPapel("admin");
    let status = null;
    const req = { session: null };
    const res = {
      status: (code) => {
        status = code;
        return { json: () => {} };
      },
    };
    let nextChamado = false;
    mw(req, res, () => {
      nextChamado = true;
    });

    assert.equal(status, 401);
    assert.equal(nextChamado, false);
  });

  await t.test("rejeita papel 'consulta' em rota de operador/admin com 403", () => {
    const mw = exigirPapel("operador", "admin");
    let status = null;
    const req = { session: { user: { id: 1, usuario: "visitante", role: "consulta" } } };
    const res = {
      status: (code) => {
        status = code;
        return { json: () => {} };
      },
    };
    let nextChamado = false;
    mw(req, res, () => {
      nextChamado = true;
    });

    assert.equal(status, 403);
    assert.equal(nextChamado, false);
  });

  await t.test("rejeita papel 'operador' em rota restrita a 'admin' com 403", () => {
    const mw = exigirPapel("admin");
    let status = null;
    const req = { session: { user: { id: 2, usuario: "operador1", role: "operador" } } };
    const res = {
      status: (code) => {
        status = code;
        return { json: () => {} };
      },
    };
    let nextChamado = false;
    mw(req, res, () => {
      nextChamado = true;
    });

    assert.equal(status, 403);
    assert.equal(nextChamado, false);
  });

  await t.test("libera 'operador' (e conta legada 'user') em rotas permitidas", () => {
    const mw = exigirPapel("operador", "admin");
    let next1 = false;
    let next2 = false;

    mw({ session: { user: { role: "operador" } } }, {}, () => {
      next1 = true;
    });
    mw({ session: { user: { role: "user" } } }, {}, () => {
      next2 = true;
    });

    assert.equal(next1, true);
    assert.equal(next2, true);
  });

  await t.test("libera 'admin' em qualquer rota", () => {
    const mw = exigirPapel("admin");
    let next = false;
    mw({ session: { user: { role: "admin" } } }, {}, () => {
      next = true;
    });
    assert.equal(next, true);
  });
});

test("Segurança de Usuários - AuthService", async (t) => {
  const env = criarAmbienteTeste();
  t.after(() => env.cleanup());

  const admin = env.auth.configurarAdmin({ nome: "Admin Chefe", usuario: "adminchefe", senha: "senhaValida123" });
  assert.equal(admin.role, "admin");

  await t.test("não-administrador não pode criar novas contas", () => {
    const operador = env.auth.criarUsuario(
      { nome: "Operador 1", usuario: "op1", senha: "senhaOperador123", role: "operador" },
      admin
    );

    assert.throws(
      () => {
        env.auth.criarUsuario({ nome: "Novo", usuario: "novo", senha: "senhaNova123" }, operador);
      },
      /Apenas administradores podem criar novos usuários/
    );
  });

  await t.test("administrador pode criar conta 'consulta', 'operador' e 'admin'", () => {
    const consulta = env.auth.criarUsuario(
      { nome: "Leitor", usuario: "leitor", senha: "senhaLeitor123", role: "consulta" },
      admin
    );
    assert.equal(consulta.role, "consulta");

    const outroOp = env.auth.criarUsuario(
      { nome: "Op 2", usuario: "op2", senha: "senhaOp2_123", role: "operador" },
      admin
    );
    assert.equal(outroOp.role, "operador");
  });

  await t.test("não permite rebaixar ou excluir o único administrador", () => {
    assert.throws(
      () => {
        env.auth.alterarUsuario(admin.id, { role: "operador" }, admin);
      },
      /Não é possível rebaixar o único administrador ativo/
    );

    assert.throws(
      () => {
        env.auth.excluirUsuario(admin.id, admin);
      },
      /Você não pode excluir a própria conta/
    );
  });
});

test("Blindagem de Backups - BackupService", async (t) => {
  const env = criarAmbienteTeste();
  t.after(() => env.cleanup());

  const admin = env.auth.configurarAdmin({ nome: "Admin", usuario: "admin", senha: "senhaSegura123" });
  const operador = env.auth.criarUsuario({ nome: "Operador", usuario: "operador", senha: "senhaOp123" }, admin, "operador");

  // Cria um arquivo de backup falso na pasta de backups do banco temporário
  const dirBackups = path.join(path.dirname(env.dbPath), "backups");
  fs.mkdirSync(dirBackups, { recursive: true });
  const nomeBkp = `gestao_20260918_100000.db`;
  const caminhoBkp = path.join(dirBackups, nomeBkp);
  fs.copyFileSync(env.dbPath, caminhoBkp);

  let sessaoLimpada = false;
  const mockSessionStore = {
    clearAll: () => {
      sessaoLimpada = true;
    },
  };
  env.backups.definirArmazemDeSessao(mockSessionStore);

  await t.test("operador não tem autorização para restaurar backup", () => {
    assert.throws(
      () => {
        env.backups.restore(nomeBkp, operador, { senha: "senhaOp123", confirmacao: "RESTAURAR" });
      },
      /Apenas administradores podem restaurar backups/
    );
  });

  await t.test("restauração falha se a confirmação não for exatamente 'RESTAURAR'", () => {
    assert.throws(
      () => {
        env.backups.restore(nomeBkp, admin, { senha: "senhaSegura123", confirmacao: "sim" });
      },
      /Confirmação inválida/
    );
  });

  await t.test("restauração falha se a senha do administrador estiver errada", () => {
    assert.throws(
      () => {
        env.backups.restore(nomeBkp, admin, { senha: "senhaErrada", confirmacao: "RESTAURAR" });
      },
      /Senha de administrador incorreta/
    );
  });

  await t.test("restauração é bem sucedida com senha e confirmação corretas e invalida sessões", () => {
    env.backups.restore(nomeBkp, admin, { senha: "senhaSegura123", confirmacao: "RESTAURAR" });
    assert.equal(sessaoLimpada, true);
  });
});

test("Controle de Versões e Stream de Upload - VersaoService", async (t) => {
  const env = criarAmbienteTeste();
  t.after(() => env.cleanup());

  const admin = env.auth.configurarAdmin({ nome: "Admin", usuario: "admin", senha: "senhaSegura123" });
  const operador = env.auth.criarUsuario({ nome: "Operador", usuario: "operador", senha: "senhaOp123" }, admin, "operador");

  // Cria um arquivo de pacote temporário
  const pacotePath = path.join(env.tmpDir, "pacote-teste.zip");
  fs.writeFileSync(pacotePath, "conteudo-binario-do-pacote-para-teste");

  let versaoCriada;

  await t.test("cria versão calculando SHA-256 via stream assíncrono", async () => {
    versaoCriada = await env.versoes.create(
      {
        sistema: "B_VENDAS",
        versao: "2026.09.18",
        observacoes: "Correção de segurança",
      },
      operador,
      {
        filename: "pacote-teste.zip",
        path: pacotePath,
        size: fs.statSync(pacotePath).size,
      },
      "http://localhost:3000"
    );

    assert.equal(versaoCriada.sistema, "B_VENDAS");
    assert.equal(versaoCriada.versao, "2026.09.18");
    assert.equal(versaoCriada.status, "rascunho");
    assert.ok(versaoCriada.pacotes[0].sha256.length === 64, "SHA-256 gerado deve ter 64 caracteres hex");
  });

  await t.test("operador não pode publicar versão", () => {
    assert.throws(
      () => {
        env.versoes.publish(versaoCriada.id, operador);
      },
      /Apenas administradores podem publicar versões/
    );
  });

  await t.test("operador não pode excluir versão", () => {
    assert.throws(
      () => {
        env.versoes.remove(versaoCriada.id, operador);
      },
      /Apenas administradores podem excluir versões/
    );
  });

  await t.test("admin publica com sucesso em transação atômica quando arquivo existe", () => {
    // Garante que o arquivo exista no destino do download
    const pastaDosPacotes = path.join(env.tmpDir, "packages");
    fs.mkdirSync(pastaDosPacotes, { recursive: true });
    const targetPath = path.join(pastaDosPacotes, "pacote-teste.zip");
    fs.copyFileSync(pacotePath, targetPath);

    try {
      const res = env.versoes.publish(versaoCriada.id, admin);
      assert.equal(res.versao.status, "publicada");
    } finally {
      try {
        fs.unlinkSync(targetPath);
      } catch {}
    }
  });
});

/*
 * SESSION_SECRET assina o cookie de login: com o valor de exemplo (público,
 * está no repositório), qualquer um forja uma sessão de admin. O server.js
 * caía nesse valor sozinho quando a variável faltava -- e ela falta sem
 * ninguém perceber no Docker, quando o server/.env vira uma pasta vazia.
 */
test("SESSION_SECRET - o servidor recusa subir com segredo ausente ou de exemplo", async (t) => {
  const { problemaNoSegredoDeSessao, SEGREDO_DE_EXEMPLO } = require("../src/config/segredoSessao");

  await t.test("recusa ausente, vazio e só espaços", () => {
    for (const valor of [undefined, null, "", "   "]) {
      assert.match(problemaNoSegredoDeSessao(valor), /não está definido/, JSON.stringify(valor));
    }
  });

  await t.test("recusa o valor do .env.example, mesmo com espaço em volta", () => {
    assert.match(problemaNoSegredoDeSessao(SEGREDO_DE_EXEMPLO), /exemplo/);
    assert.match(problemaNoSegredoDeSessao(` ${SEGREDO_DE_EXEMPLO} `), /exemplo/);
  });

  await t.test("a constante bate com o que o .env.example realmente traz", () => {
    // Se alguém trocar o texto de exemplo lá e esquecer daqui, a trava
    // deixaria de reconhecer justamente o valor que todo mundo copia.
    const exemplo = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");
    assert.match(exemplo, new RegExp(`^SESSION_SECRET=${SEGREDO_DE_EXEMPLO}$`, "m"));
  });

  await t.test("aceita um segredo de verdade", () => {
    assert.equal(problemaNoSegredoDeSessao(require("node:crypto").randomBytes(32).toString("hex")), null);
  });

  await t.test("o server.js de verdade encerra com erro, antes de abrir o banco", () => {
    const { spawnSync } = require("node:child_process");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-segredo-"));
    try {
      for (const segredo of ["", SEGREDO_DE_EXEMPLO]) {
        const dbPath = path.join(tmpDir, "gestao.db");
        // SESSION_SECRET vai no ambiente (mesmo vazio): o dotenv não
        // sobrescreve variável que já existe, então um server/.env local com
        // segredo de verdade não interfere no teste.
        const r = spawnSync(process.execPath, ["server.js"], {
          cwd: path.join(__dirname, ".."),
          env: { ...process.env, SESSION_SECRET: segredo, DB_PATH: dbPath, PORT: "0" },
          encoding: "utf8",
          timeout: 15000,
        });
        assert.equal(r.status, 1, `segredo ${JSON.stringify(segredo)}: deveria sair com código 1`);
        assert.match(r.stderr, /NÃO foi iniciado/);
        assert.equal(fs.existsSync(dbPath), false, "não deveria nem ter criado o banco");
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

test("AGENT_API_TOKEN - exigirAgente recusa token ausente ou igual ao valor de exemplo", async (t) => {
  const { exigirAgente, TOKEN_DE_EXEMPLO } = require("../src/middlewares/exigirAgente");

  await t.test("a constante bate com o que o server/.env.example traz", () => {
    const exemplo = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");
    assert.match(exemplo, new RegExp(`^AGENT_API_TOKEN=${TOKEN_DE_EXEMPLO}$`, "m"));
  });

  await t.test("recusa quando o servidor está com o token público de exemplo", () => {
    let status = null;
    let body = null;
    let passou = false;
    const req = {
      app: { locals: { agentApiToken: TOKEN_DE_EXEMPLO } },
      get: (h) => (h.toLowerCase() === "x-agent-token" ? TOKEN_DE_EXEMPLO : undefined),
    };
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(data) {
        body = data;
      },
    };
    exigirAgente(req, res, () => {
      passou = true;
    });
    assert.equal(passou, false);
    assert.equal(status, 401);
    assert.match(body.error, /não autenticado/i);
  });

  await t.test("aceita um token forte diferente do valor de exemplo", () => {
    let passou = false;
    const req = {
      app: { locals: { agentApiToken: "token-forte-aleatorio-0123456789abcdef" } },
      get: (h) => (h.toLowerCase() === "x-agent-token" ? "token-forte-aleatorio-0123456789abcdef" : undefined),
    };
    exigirAgente(req, { status: () => ({ json: () => {} }) }, () => {
      passou = true;
    });
    assert.equal(passou, true);
  });
});

test("AuthService - teto de 128 caracteres na senha", () => {
  const env = criarAmbienteTeste();
  try {
    const { SENHA_MAX_LENGTH } = require("../src/services/AuthService");
    assert.equal(SENHA_MAX_LENGTH, 128);
    const longa = "a".repeat(129);
    assert.throws(
      () => env.auth.configurarAdmin({ nome: "Admin", usuario: "admin", senha: longa }),
      /no máximo 128 caracteres/
    );
    const admin = env.auth.configurarAdmin({ nome: "Admin", usuario: "admin", senha: "senhaValida123" });
    const op = env.auth.criarUsuario({ nome: "Op", usuario: "op", senha: "senhaValida123", role: "operador" }, admin);
    assert.throws(() => env.auth.redefinirSenha(op.id, longa, admin), /no máximo 128 caracteres/);
    assert.throws(() => env.auth.trocarSenha({ ...admin, usuario: "admin" }, "senhaValida123", longa), /no máximo 128 caracteres/);
    assert.throws(() => env.auth.login("admin", longa), /Usuário ou senha inválidos/);
  } finally {
    env.cleanup();
  }
});

test("Rotas HTTP sensíveis - RBAC de acessos, backups, histórico e Cache-Control", async () => {
  const { Servidor } = require("../src/Servidor");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-rbac-http-"));
  const server = new Servidor({
    port: 0,
    host: "127.0.0.1",
    dbPath: path.join(tmpDir, "gestao.db"),
    sessionSecret: "segredo-de-teste",
    sessionSecure: false,
    agentApiToken: "token-de-teste-seguro",
  });
  await server.start();
  const base = `http://127.0.0.1:${server.httpServer.address().port}/api`;

  try {
    const tokens = new Map();
    const pedir = async (caminho, { cookie, metodo = "GET", corpo } = {}) => {
      const r = await fetch(`${base}${caminho}`, {
        method: metodo,
        headers: {
          ...(corpo !== undefined ? { "content-type": "application/json" } : {}),
          ...(cookie ? { cookie, "x-csrf-token": tokens.get(cookie) ?? "" } : {}),
        },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
      const novoCookie = r.headers.get("set-cookie")?.split(";")[0];
      if (r.headers.get("x-csrf-token")) tokens.set(novoCookie || cookie, r.headers.get("x-csrf-token"));
      return r;
    };

    const setup = await pedir("/auth/setup", {
      metodo: "POST",
      corpo: { nome: "Admin", usuario: "admin", senha: "senha-admin-123" },
    });
    assert.equal(setup.status, 201);
    const adminCookie = setup.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

    await pedir("/usuarios", {
      cookie: adminCookie,
      metodo: "POST",
      corpo: { nome: "Operador", usuario: "op", senha: "senha-op-12345", role: "operador" },
    });
    await pedir("/usuarios", {
      cookie: adminCookie,
      metodo: "POST",
      corpo: { nome: "Consulta", usuario: "cons", senha: "senha-cons-1234", role: "consulta" },
    });

    const loginComo = async (usuario, senha) => {
      const r = await pedir("/auth/login", { metodo: "POST", corpo: { usuario, senha } });
      assert.equal(r.status, 200);
      return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    };
    const opCookie = await loginComo("op", "senha-op-12345");
    const consCookie = await loginComo("cons", "senha-cons-1234");

    const cliResp = await pedir("/clientes", {
      cookie: adminCookie,
      metodo: "POST",
      corpo: { nome: "Cliente Teste" },
    });
    assert.equal(cliResp.status, 201);
    const clienteId = (await cliResp.json()).id;

    // Consulta não pode ler acessos remotos, backups nem histórico
    const acCons = await pedir(`/clientes/${clienteId}/acessos`, { cookie: consCookie });
    assert.equal(acCons.status, 403);
    assert.equal(acCons.headers.get("cache-control"), "no-store");
    assert.equal((await pedir("/backups", { cookie: consCookie })).status, 403);
    assert.equal((await pedir("/historico", { cookie: consCookie })).status, 403);

    // Operador lê acessos remotos, mas não lista backups nem histórico
    const acOp = await pedir(`/clientes/${clienteId}/acessos`, { cookie: opCookie });
    assert.equal(acOp.status, 200);
    assert.equal(acOp.headers.get("cache-control"), "no-store");
    assert.equal((await pedir("/backups", { cookie: opCookie })).status, 403);
    assert.equal((await pedir("/historico", { cookie: opCookie })).status, 403);

    // Admin acessa todos
    assert.equal((await pedir(`/clientes/${clienteId}/acessos`, { cookie: adminCookie })).status, 200);
    assert.equal((await pedir("/backups", { cookie: adminCookie })).status, 200);
    assert.equal((await pedir("/historico", { cookie: adminCookie })).status, 200);
  } finally {
    await server.stop().catch(() => {});
    server.db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
