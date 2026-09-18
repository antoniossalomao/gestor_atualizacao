const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Database } = require("../src/database/Database");
const { AuthService } = require("../src/services/AuthService");
const { BackupService } = require("../src/services/BackupService");
const { VersaoService } = require("../src/services/VersaoService");
const { HistoricoService } = require("../src/services/HistoricoService");
const { requireRole } = require("../src/middlewares/requireRole");

function criarAmbienteTeste() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-test-"));
  const dbPath = path.join(tmpDir, "gestao.db");
  const db = new Database(dbPath);
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

test("RBAC - Middleware requireRole", async (t) => {
  await t.test("rejeita requisições sem autenticação com 401", () => {
    const mw = requireRole("admin");
    let status = null;
    let json = null;
    const req = { session: null };
    const res = {
      status: (code) => {
        status = code;
        return { json: (data) => (json = data) };
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
    const mw = requireRole("operador", "admin");
    let status = null;
    let json = null;
    const req = { session: { user: { id: 1, usuario: "visitante", role: "consulta" } } };
    const res = {
      status: (code) => {
        status = code;
        return { json: (data) => (json = data) };
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
    const mw = requireRole("admin");
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
    const mw = requireRole("operador", "admin");
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
    const mw = requireRole("admin");
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

  const admin = env.auth.setupAdmin({ nome: "Admin Chefe", usuario: "adminchefe", senha: "senhaValida123" });
  assert.equal(admin.role, "admin");

  await t.test("não-administrador não pode criar novas contas", () => {
    const operador = env.auth.createUser(
      { nome: "Operador 1", usuario: "op1", senha: "senhaOperador123", role: "operador" },
      admin
    );

    assert.throws(
      () => {
        env.auth.createUser({ nome: "Novo", usuario: "novo", senha: "senhaNova123" }, operador);
      },
      /Apenas administradores podem criar novos usuários/
    );
  });

  await t.test("administrador pode criar conta 'consulta', 'operador' e 'admin'", () => {
    const consulta = env.auth.createUser(
      { nome: "Leitor", usuario: "leitor", senha: "senhaLeitor123", role: "consulta" },
      admin
    );
    assert.equal(consulta.role, "consulta");

    const outroOp = env.auth.createUser(
      { nome: "Op 2", usuario: "op2", senha: "senhaOp2_123", role: "operador" },
      admin
    );
    assert.equal(outroOp.role, "operador");
  });

  await t.test("não permite rebaixar ou excluir o único administrador", () => {
    assert.throws(
      () => {
        env.auth.updateUser(admin.id, { role: "operador" }, admin);
      },
      /Não é possível rebaixar o único administrador ativo/
    );

    assert.throws(
      () => {
        env.auth.deleteUser(admin.id, admin);
      },
      /Você não pode excluir a própria conta/
    );
  });
});

test("Blindagem de Backups - BackupService", async (t) => {
  const env = criarAmbienteTeste();
  t.after(() => env.cleanup());

  const admin = env.auth.setupAdmin({ nome: "Admin", usuario: "admin", senha: "senhaSegura123" });
  const operador = env.auth.createUser({ nome: "Operador", usuario: "operador", senha: "senhaOp123" }, admin, "operador");

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
  env.backups.setSessionStore(mockSessionStore);

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

  const admin = env.auth.setupAdmin({ nome: "Admin", usuario: "admin", senha: "senhaSegura123" });
  const operador = env.auth.createUser({ nome: "Operador", usuario: "operador", senha: "senhaOp123" }, admin, "operador");

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
    const packagesDir = path.join(env.tmpDir, "packages");
    fs.mkdirSync(packagesDir, { recursive: true });
    const targetPath = path.join(packagesDir, "pacote-teste.zip");
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

test("Saúde Operacional do Sistema - SaudeService", async (t) => {
  const { SaudeService } = require("../src/services/SaudeService");
  const env = criarAmbienteTeste();
  const saude = new SaudeService({
    db: env.db,
    backups: { list: () => [{ arquivo: "backup-test.sqlite", data: "2026-09-18T10:00:00.000Z" }] },
    versoes: { painel: () => ({ agentes: [] }), packagesDir: path.join(env.tmpDir, "packages") },
  });

  try {
    await t.test("devolve diagnóstico completo com integridade do banco e métricas de processo", () => {
      const diag = saude.obterDiagnostico();
      assert.equal(diag.statusGeral, "saudavel");
      assert.equal(diag.banco.integridade, "ok");
      assert.equal(typeof diag.servidor.uptimeSegundos, "number");
      assert.equal(diag.backups.total, 1);
      assert.equal(typeof diag.agentes.total, "number");
    });

    await t.test("o VersaoService REAL expõe packagesDir", () => {
      // Regressão: o SaudeService sempre leu `this.versoes.packagesDir`, mas a
      // classe VersaoService não tinha essa propriedade. Como
      // `fs.existsSync(undefined)` devolve false em vez de lançar, o painel de
      // Saúde reportava "0 pacotes, 0 bytes" para sempre, em silêncio.
      //
      // O teste acima não pegava porque o objeto `versoes` dali é um DUBLÊ, e o
      // dublê declarava `packagesDir` -- ou seja, o teste afirmava uma interface
      // que o objeto real não implementava. Por isso esta asserção é contra a
      // CLASSE DE VERDADE, e não contra o dublê.
      assert.equal(typeof env.versoes.packagesDir, "string");
      assert.equal(path.basename(env.versoes.packagesDir), "packages");
      assert.equal(path.dirname(env.versoes.packagesDir), path.dirname(env.dbPath));
    });

    await t.test("conta e mede os pacotes de verdade que existem em disco", () => {
      const comReal = new SaudeService({
        db: env.db,
        backups: { list: () => [] },
        versoes: env.versoes,
      });

      // Sem a pasta, o diagnóstico não quebra: reporta zero.
      assert.equal(comReal.obterDiagnostico().pacotes.total, 0);

      fs.mkdirSync(env.versoes.packagesDir, { recursive: true });
      fs.writeFileSync(path.join(env.versoes.packagesDir, "a.zip"), "12345");
      fs.writeFileSync(path.join(env.versoes.packagesDir, "b.zip"), "123");

      const diag = comReal.obterDiagnostico();
      assert.equal(diag.pacotes.total, 2, "deveria enxergar os dois pacotes gravados");
      assert.equal(diag.pacotes.tamanhoBytes, 8, "e somar o tamanho real dos dois");
    });
  } finally {
    env.cleanup();
  }
});

