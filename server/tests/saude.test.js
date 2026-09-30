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

const { Database } = require("../src/database/Database");
const { HistoricoService } = require("../src/services/HistoricoService");
const { VersaoService } = require("../src/services/VersaoService");
const { SaudeService } = require("../src/services/SaudeService");

function criarAmbiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-saude-"));
  const dbPath = path.join(tmpDir, "gestao.db");
  const db = new Database(dbPath);
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

test("Database - as perguntas de saúde ficam dentro de database/", async (t) => {
  const env = criarAmbiente();
  try {
    await t.test("verificarIntegridade devolve \"ok\" num banco íntegro", () => {
      assert.equal(env.db.verificarIntegridade(), "ok");
    });
    await t.test("modoDeGravacao é WAL: é o que o backup e o checkpoint pressupõem", () => {
      assert.equal(env.db.modoDeGravacao(), "wal");
    });
  } finally {
    env.cleanup();
  }
});
