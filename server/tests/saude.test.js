/*
 * Diagnóstico do servidor (services/SaudeService.js): a tela Administração >
 * Diagnóstico. Um número errado aqui não quebra nada -- só faz a equipe confiar
 * num painel que mente, como o dos pacotes que ficou em "0 bytes" para sempre.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { BancoDeDados } = require("../src/database/BancoDeDados");
const { ArmazemDeSessaoSqlite } = require("../src/database/ArmazemDeSessaoSqlite");
const { HistoricoService } = require("../src/services/HistoricoService");
const { VersaoService } = require("../src/services/VersaoService");
const { ConfiguracaoSistemaService } = require("../src/services/ConfiguracaoSistemaService");
const { SaudeService } = require("../src/services/SaudeService");

function criarAmbiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-saude-"));
  const dbPath = path.join(tmpDir, "gestao.db");
  const db = new BancoDeDados(dbPath);
  const versoes = new VersaoService(db, new HistoricoService(db));
  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { tmpDir, dbPath, db, versoes, cleanup };
}

test("Saúde Operacional do Sistema - SaudeService", async (t) => {
  const env = criarAmbiente();
  const saude = new SaudeService({
    db: env.db,
    backups: { list: () => [{ arquivo: "backup-test.sqlite", data: "2026-09-18T10:00:00.000Z" }] },
    versoes: { painel: () => ({ agentes: [] }), pastaDosPacotes: path.join(env.tmpDir, "packages") },
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

    await t.test("o VersaoService REAL expõe pastaDosPacotes", () => {
      // Regressão: o SaudeService sempre leu `this.versoes.pastaDosPacotes`, mas a
      // classe VersaoService não tinha essa propriedade. Como
      // `fs.existsSync(undefined)` devolve false em vez de lançar, o painel de
      // Saúde reportava "0 pacotes, 0 bytes" para sempre, em silêncio.
      //
      // O teste acima não pegava porque o objeto `versoes` dali é um DUBLÊ, e o
      // dublê declarava `pastaDosPacotes` -- ou seja, o teste afirmava uma interface
      // que o objeto real não implementava. Por isso esta asserção é contra a
      // CLASSE DE VERDADE, e não contra o dublê.
      assert.equal(typeof env.versoes.pastaDosPacotes, "string");
      assert.equal(path.basename(env.versoes.pastaDosPacotes), "packages");
      assert.equal(path.dirname(env.versoes.pastaDosPacotes), path.dirname(env.dbPath));
    });

    await t.test("conta e mede os pacotes de verdade que existem em disco", () => {
      const comReal = new SaudeService({
        db: env.db,
        backups: { list: () => [] },
        versoes: env.versoes,
      });

      // Sem a pasta, o diagnóstico não quebra: reporta zero.
      assert.equal(comReal.obterDiagnostico().pacotes.total, 0);

      fs.mkdirSync(env.versoes.pastaDosPacotes, { recursive: true });
      fs.writeFileSync(path.join(env.versoes.pastaDosPacotes, "a.zip"), "12345");
      fs.writeFileSync(path.join(env.versoes.pastaDosPacotes, "b.zip"), "123");

      const diag = comReal.obterDiagnostico();
      assert.equal(diag.pacotes.total, 2, "deveria enxergar os dois pacotes gravados");
      assert.equal(diag.pacotes.tamanhoBytes, 8, "e somar o tamanho real dos dois");
    });
  } finally {
    env.cleanup();
  }
});

test("BancoDeDados - as perguntas de saúde ficam dentro de database/", async (t) => {
  const env = criarAmbiente();
  try {
    await t.test("verificarIntegridade devolve \"ok\" num banco íntegro", () => {
      assert.equal(env.db.verificarIntegridade(), "ok");
    });
    await t.test("modoDeGravacao é WAL: é o que o backup e o checkpoint pressupõem", () => {
      assert.equal(env.db.modoDeGravacao(), "wal");
    });
    await t.test("versaoEsquema e contarRegistros refletem o banco aberto", () => {
      assert.equal(env.db.versaoEsquema(), 7);
      const sisId = env.db.conn.prepare("SELECT id FROM sistemas LIMIT 1").get().id;
      env.db.conn.prepare("INSERT INTO clientes (nome) VALUES (?)").run("Mercado Teste");
      env.db.conn.prepare("INSERT INTO atualizacoes (cliente, data) VALUES (?, ?)").run("Mercado Teste", "19/11/2026");
      env.db.conn.prepare("INSERT INTO agendamentos (tarefa, status, arquivado_em) VALUES (?, ?, ?)").run("Ativa", "A Fazer", null);
      env.db.conn.prepare("INSERT INTO agendamentos (tarefa, status, arquivado_em) VALUES (?, ?, ?)").run("Arquivada", "Concluído", "2026-10-01T00:00:00Z");
      env.db.conn.prepare("INSERT INTO campanhas (titulo, sistema_id, versao_alvo, criada_em, encerrada_em) VALUES (?, ?, ?, ?, ?)").run("Camp Ativa", sisId, "1.0", "2026-11-01T00:00:00Z", null);
      env.db.conn.prepare("INSERT INTO campanhas (titulo, sistema_id, versao_alvo, criada_em, encerrada_em) VALUES (?, ?, ?, ?, ?)").run("Camp Encerrada", sisId, "1.0", "2026-10-01T00:00:00Z", "2026-10-15T00:00:00Z");
      env.db.conn.prepare("INSERT INTO usuarios (nome, usuario, senha_hash, criado_em, role) VALUES (?, ?, ?, ?, ?)").run("Admin", "admin", "hash", "2026-11-01T00:00:00Z", "admin");

      assert.deepEqual(env.db.contarRegistros(), {
        clientes: 1,
        atualizacoes: 1,
        agendamentosAtivos: 1,
        campanhasAtivas: 1,
        usuarios: 1,
      });
    });
  } finally {
    env.cleanup();
  }
});

test("SaudeService - métricas detalhadas sem vazar segredos", () => {
  const env = criarAmbiente();
  const store = new ArmazemDeSessaoSqlite({ filePath: path.join(env.tmpDir, "sessions.sqlite") });
  const cfg = new ConfiguracaoSistemaService(env.db, new HistoricoService(env.db));
  const webhookSecreto = "https://discord.com/api/webhooks/123456/segredo-muito-sensivel";
  env.db.configuracoesSistema.gravarVarias([
    ["discord_webhook_url", webhookSecreto],
    ["atualizador_habilitado", "false"],
    ["backups_manter", "5"],
  ]);

  try {
    store.set("sessao-valida", { user: { id: 1 }, cookie: { maxAge: 60000 } }, () => {});
    store.conn.prepare("INSERT INTO sessoes (sid, dados, expira_em) VALUES (?, ?, ?)").run("sessao-expirada", "{}", Date.now() - 1000);

    const saude = new SaudeService({
      db: env.db,
      backups: {
        list: () => [
          { arquivo: "gestao_2.db", data: "2026-11-19T10:00:00.000Z", integro: true, tamanhoBytes: 2048 },
          { arquivo: "gestao_1.db", data: "2026-11-18T10:00:00.000Z", integro: false, tamanhoBytes: 1024 },
        ],
      },
      versoes: env.versoes,
      configuracaoSistema: cfg,
      transporte: { https: true, proxy: true, host: "127.0.0.1" },
    });
    saude.definirArmazemDeSessao(store);

    const diag = saude.obterDiagnostico();
    assert.equal(typeof diag.banco.verificacaoMs, "number");
    assert.equal(diag.banco.versaoEsquema, 7);
    assert.equal(typeof diag.banco.walBytes, "number");
    assert.ok(diag.banco.sessoesBytes > 0);
    assert.equal(diag.servidor.sessoesAtivas, 1);
    assert.equal(typeof diag.servidor.memoriaRssMB, "number");
    assert.match(diag.servidor.iniciadoEm, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(diag.servidor.transporte, { https: true, proxy: true, soLocal: true });
    assert.equal(diag.backups.retencao, 5);
    assert.equal(diag.backups.tamanhoTotalBytes, 3072);
    assert.equal(diag.backups.ultimoIntegro, true);
    assert.equal(diag.backups.corrompidos, 1);
    assert.deepEqual(diag.integracoes, { discordConfigurado: true, atualizadorHabilitado: false });
    assert.ok(!JSON.stringify(diag).includes(webhookSecreto), "webhook nunca deve aparecer na resposta de /saude");
    assert.ok(!JSON.stringify(diag).includes(env.tmpDir), "caminho absoluto no disco nunca deve vazar");
  } finally {
    store.close();
    env.cleanup();
  }
});
