const fs = require("fs");
const path = require("path");
const { VERSAO_PAINEL } = require("../config/constantes");

const MB = 1024 * 1024;

/**
 * Roda `ler` e devolve o resultado; se lançar, devolve `padrao`. O diagnóstico
 * existe justamente para funcionar com o sistema doente: um banco ou uma pasta
 * com problema vira um campo "desconhecido" na tela, e não um 500 que esconde
 * todo o resto.
 */
function tentar(ler, padrao) {
  try {
    return ler();
  } catch {
    return padrao;
  }
}

/**
 * Serviço de diagnóstico operacional e saúde do sistema.
 * Reúne informações de banco de dados, arquivos, backups e runtime do servidor.
 */
class SaudeService {
  /**
   * @param {{
   *   db: import("../database/BancoDeDados").BancoDeDados,
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
    const integridade = tentar(() => this.db.verificarIntegridade(), "erro_ao_verificar");
    const agentes = this._contarAgentes();
    const backups = tentar(() => this.backups.list(), []);
    const mem = process.memoryUsage();

    return {
      statusGeral: integridade === "ok" && agentes.erro === 0 ? "saudavel" : "atencao",
      banco: {
        caminho: path.basename(this.db.path),
        tamanhoBytes: tentar(() => (fs.existsSync(this.db.path) ? fs.statSync(this.db.path).size : 0), 0),
        integridade,
        journalMode: tentar(() => this.db.modoDeGravacao(), "desconhecido"),
      },
      servidor: {
        versao: VERSAO_PAINEL,
        node: process.version,
        plataforma: `${process.platform} (${process.arch})`,
        uptimeSegundos: Math.round(process.uptime()),
        memoriaHeapUsadaMB: Math.round(mem.heapUsed / MB),
        memoriaHeapTotalMB: Math.round(mem.heapTotal / MB),
      },
      backups: {
        total: backups.length,
        ultimo: backups[0]?.data || null,
        arquivoMaisRecente: backups[0]?.arquivo || null,
      },
      pacotes: this._medirPacotes(),
      agentes,
    };
  }

  _contarAgentes() {
    const agentes = this.versoes.painel().agentes || [];
    const com = (...situacoes) => agentes.filter((a) => situacoes.includes(a.situacao)).length;
    return {
      total: agentes.length,
      ok: com("ok"),
      offline: com("offline"),
      erro: com("erro", "aguardando_autorizacao_demorada"),
      pendencias: com("pendencias"),
    };
  }

  /** Quantidade e tamanho dos pacotes em disco; um arquivo ilegível só fica de fora da soma. */
  _medirPacotes() {
    const pasta = this.versoes.pastaDosPacotes;
    const arquivos = tentar(() => (fs.existsSync(pasta) ? fs.readdirSync(pasta) : []), []);
    const tamanhoBytes = arquivos.reduce((soma, nome) => soma + tentar(() => fs.statSync(path.join(pasta, nome)).size, 0), 0);
    return { total: arquivos.length, tamanhoBytes };
  }
}

module.exports = { SaudeService };
