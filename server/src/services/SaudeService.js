const fs = require("fs");
const path = require("path");

/**
 * Serviço de diagnóstico operacional e saúde do sistema.
 * Reúne informações de banco de dados, arquivos, backups e runtime do servidor.
 */
class SaudeService {
  /**
   * @param {{
   *   db: import('../database/Database').Database,
   *   backups: import('./BackupService').BackupService,
   *   versoes: import('./VersaoService').VersaoService,
   * }} options
   */
  constructor({ db, backups, versoes }) {
    this.db = db;
    this.backups = backups;
    this.versoes = versoes;
  }

  obterDiagnostico() {
    let integridade = "ok";
    try {
      const conn = this.db.conn || this.db;
      const res = conn.pragma("integrity_check");
      integridade = res[0]?.integrity_check || "ok";
    } catch {
      integridade = "erro_ao_verificar";
    }

    let journalMode = "wal";
    try {
      const conn = this.db.conn || this.db;
      const res = conn.pragma("journal_mode");
      journalMode = res[0]?.journal_mode || "wal";
    } catch {
      journalMode = "desconhecido";
    }

    let dbSizeBytes = 0;
    try {
      if (fs.existsSync(this.db.path)) {
        dbSizeBytes = fs.statSync(this.db.path).size;
      }
    } catch {
      dbSizeBytes = 0;
    }

    let listaBackups = [];
    try {
      listaBackups = this.backups.list();
    } catch {
      listaBackups = [];
    }

    const painelAgentes = this.versoes.painel();
    const agentes = painelAgentes.agentes || [];
    const agentesStats = {
      total: agentes.length,
      ok: agentes.filter((a) => a.situacao === "ok").length,
      offline: agentes.filter((a) => a.situacao === "offline").length,
      erro: agentes.filter((a) => a.situacao === "erro" || a.situacao === "aguardando_autorizacao_demorada").length,
      pendencias: agentes.filter((a) => a.situacao === "pendencias").length,
    };

    let totalPacotes = 0;
    let tamanhoPacotesBytes = 0;
    try {
      const pkgDir = this.versoes.packagesDir;
      if (fs.existsSync(pkgDir)) {
        const files = fs.readdirSync(pkgDir);
        totalPacotes = files.length;
        for (const file of files) {
          try {
            tamanhoPacotesBytes += fs.statSync(path.join(pkgDir, file)).size;
          } catch {
            // ignora arquivo inacessível
          }
        }
      }
    } catch {
      // ignora
    }

    const mem = process.memoryUsage();

    return {
      statusGeral: integridade === "ok" && agentesStats.erro === 0 ? "saudavel" : "atencao",
      banco: {
        caminho: path.basename(this.db.path),
        tamanhoBytes: dbSizeBytes,
        integridade,
        journalMode,
      },
      servidor: {
        versao: "2.1.0",
        node: process.version,
        plataforma: `${process.platform} (${process.arch})`,
        uptimeSegundos: Math.round(process.uptime()),
        memoriaHeapUsadaMB: Math.round(mem.heapUsed / 1024 / 1024),
        memoriaHeapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      },
      backups: {
        total: listaBackups.length,
        ultimo: listaBackups[0]?.data || null,
        arquivoMaisRecente: listaBackups[0]?.arquivo || null,
      },
      pacotes: {
        total: totalPacotes,
        tamanhoBytes: tamanhoPacotesBytes,
      },
      agentes: agentesStats,
    };
  }
}

module.exports = { SaudeService };
