/** Situações do painel (ver VersaoService.derivarSituacao) que valem alerta. */
const SITUACOES_RUINS = new Set(["offline", "erro", "pendencias", "aguardando_autorizacao_demorada"]);

/**
 * Verifica periodicamente a situação de cada agente C# (mesmo cálculo do
 * painel da aba Distribuição) e avisa o Discord quando um agente ENTRA em
 * "offline", "erro", "pendencias" ou autorização demorada -- sem isso,
 * ninguém sabe que um cliente parou de atualizar a não ser que alguém abra
 * a tela e olhe.
 *
 * Só avisa na transição (ver VersaoRepository.situacaoAlertada): um agente
 * que já está offline há uma semana não gera um aviso novo a cada ciclo,
 * só quando o problema começou -- e um aviso de "normalizou" quando ele
 * volta, pra fechar o ciclo.
 */
class AlertaAgenteService {
  /**
   * @param {import('../database/Database').Database} db
   * @param {import('./VersaoService').VersaoService} versaoService
   * @param {import('./NotificationService').NotificationService} notifications
   */
  constructor(db, versaoService, notifications) {
    this.db = db;
    this.versaoService = versaoService;
    this.notifications = notifications;
    this.timer = null;
  }

  /** Roda uma verificação agora. Nunca lança -- uma falha aqui não pode derrubar o servidor. */
  async verificar() {
    try {
      const { agentes } = this.versaoService.painel();
      for (const agente of agentes) {
        const estadoAnterior = this.db.versoes.situacaoAlertada(agente.cnpj);
        const atual = agente.situacao;

        if (SITUACOES_RUINS.has(atual)) {
          if (atual !== estadoAnterior) {
            await this.notifications.notifyAgenteSituacao({
              empresa: agente.empresa,
              situacao: atual,
              detalhe: agente.ultimoDetalhe,
            });
            this.db.versoes.marcarSituacaoAlertada(agente.cnpj, atual);
          }
          // atual === estadoAnterior: mesmo problema de antes, nao repete aviso.
        } else if (estadoAnterior) {
          // Estava em alerta e saiu dele (nao precisa ter chegado a "ok" --
          // sair de offline/erro pra "pendente"/"desatualizado" ja e' o
          // suficiente pra avisar que o agente voltou a se comunicar).
          await this.notifications.notifyAgenteSituacao({ empresa: agente.empresa, situacao: atual });
          this.db.versoes.limparSituacaoAlertada(agente.cnpj);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Falha ao verificar alertas de agentes:", err);
    }
  }

  /** Liga a verificação periódica. No-op se não houver webhook configurado -- nada pra avisar. */
  start(intervaloMs) {
    if (!this.notifications.webhookUrl || this.timer) return;
    this.verificar();
    this.timer = setInterval(() => this.verificar(), intervaloMs);
    // "unref": esse timer sozinho nao deve impedir o processo de encerrar
    // (ex.: durante os testes, que nao chamam stop() explicitamente).
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { AlertaAgenteService };
