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

function tamanhoArquivo(caminho) {
  return tentar(() => (fs.existsSync(caminho) ? fs.statSync(caminho).size : 0), 0);
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
   *   configuracaoSistema?: import('./ConfiguracaoSistemaService').ConfiguracaoSistemaService | null,
   *   sessionStore?: import('../database/ArmazemDeSessaoSqlite').ArmazemDeSessaoSqlite | null,
   *   transporte?: { https?: boolean, proxy?: boolean, host?: string | null } | null,
   * }} options
   */
  constructor({ db, backups, versoes, configuracaoSistema = null, sessionStore = null, transporte = null }) {
    this.db = db;
    this.backups = backups;
    this.versoes = versoes;
    this.configuracaoSistema = configuracaoSistema;
    this.sessionStore = sessionStore;
    this.transporte = transporte;
  }

  /** Injeta o store após `_abrirSessao()`, seguindo o padrão de BackupService e AuthService. */
  definirArmazemDeSessao(sessionStore) {
    this.sessionStore = sessionStore;
  }

  obterDiagnostico() {
    const inicioVerificacao = Date.now();
    const integridade = tentar(() => this.db.verificarIntegridade(), "erro_ao_verificar");
    const verificacaoMs = Date.now() - inicioVerificacao;
    const agentes = this._contarAgentes();
    const backups = tentar(() => this.backups.list(), []);
    const mem = process.memoryUsage();
    const uptimeSegundos = Math.round(process.uptime());
    const caminhoSessoes = this.sessionStore?.filePath || path.join(path.dirname(this.db.path), "sessions.sqlite");
    const sessoesBytes = tamanhoArquivo(caminhoSessoes) + tamanhoArquivo(`${caminhoSessoes}-wal`);
    const tamanhoTotalBytes = backups.reduce((soma, b) => soma + (Number(b.tamanhoBytes) || 0), 0);
    const corrompidos = backups.filter((b) => b.integro === false).length;

    return {
      statusGeral: integridade === "ok" && agentes.erro === 0 ? "saudavel" : "atencao",
      banco: {
        caminho: path.basename(this.db.path),
        tamanhoBytes: tamanhoArquivo(this.db.path),
        walBytes: tamanhoArquivo(`${this.db.path}-wal`),
        sessoesBytes,
        integridade,
        verificacaoMs,
        journalMode: tentar(() => this.db.modoDeGravacao(), "desconhecido"),
        versaoEsquema: tentar(() => this.db.versaoEsquema(), null),
        registros: tentar(() => this.db.contarRegistros(), null),
      },
      servidor: {
        versao: VERSAO_PAINEL,
        node: process.version,
        plataforma: `${process.platform} (${process.arch})`,
        uptimeSegundos,
        iniciadoEm: new Date(Date.now() - uptimeSegundos * 1000).toISOString(),
        memoriaRssMB: Math.round(mem.rss / MB),
        memoriaHeapUsadaMB: Math.round(mem.heapUsed / MB),
        memoriaHeapTotalMB: Math.round(mem.heapTotal / MB),
        sessoesAtivas: this.sessionStore ? tentar(() => this.sessionStore.contarAtivas(), null) : null,
        transporte: this.transporte
          ? {
              https: Boolean(this.transporte.https),
              proxy: Boolean(this.transporte.proxy),
              soLocal: this.transporte.host === "127.0.0.1",
            }
          : null,
      },
      backups: {
        total: backups.length,
        ultimo: backups[0]?.data || null,
        arquivoMaisRecente: backups[0]?.arquivo || null,
        ultimoIntegro: backups[0]?.integro ?? null,
        corrompidos,
        tamanhoTotalBytes,
        retencao: this.configuracaoSistema ? tentar(() => this.configuracaoSistema.valor("backupsManter"), null) : null,
      },
      pacotes: this._medirPacotes(),
      agentes,
      integracoes: {
        discordConfigurado: this.configuracaoSistema
          ? Boolean(tentar(() => this.configuracaoSistema.valor("discordWebhookUrl"), ""))
          : null,
        atualizadorHabilitado: this.configuracaoSistema
          ? Boolean(tentar(() => this.configuracaoSistema.atualizadorHabilitado(), false))
          : null,
      },
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
