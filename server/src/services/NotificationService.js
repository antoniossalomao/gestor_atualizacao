/**
 * Notificações para serviços externos -- hoje só um webhook do Discord,
 * avisando o canal sempre que uma atualização nova é registrada. Usa o
 * `fetch` global do Node (disponível desde o Node 18, sem dependência
 * nova). Se `webhookUrl` não estiver configurada, todo método aqui vira
 * um no-op silencioso -- a integração é opcional.
 */
class NotificationService {
  /**
   * @param {{discordWebhookUrl?: string, webhookUrl?: () => string}} config
   *   `webhookUrl` (função) é o caminho de produção: o webhook é uma regra da
   *   equipe, editada na tela Administração, e precisa valer no próximo aviso
   *   sem reiniciar -- então é lido a cada envio, não guardado na construção.
   *   `discordWebhookUrl` (texto fixo) continua aceito para os testes.
   */
  constructor(config) {
    this._webhookUrl = typeof config.webhookUrl === "function" ? config.webhookUrl : () => config.discordWebhookUrl || "";
  }

  get webhookUrl() {
    return this._webhookUrl() || "";
  }

  /**
   * Manda uma mensagem de teste para o webhook informado (ou o configurado),
   * para o administrador conferir o canal ANTES de depender dele. Diferente
   * dos avisos normais, este devolve o resultado em vez de engolir a falha:
   * é justamente a falha que se quer ver.
   * @param {string} [url]
   * @returns {Promise<{ok: boolean, detalhe: string}>}
   */
  async testar(url) {
    const destino = url || this.webhookUrl;
    if (!destino) return { ok: false, detalhe: "Nenhum webhook configurado." };
    try {
      const res = await fetch(destino, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "✅ Teste do Gestor de Atualizações: os avisos vão chegar neste canal." }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return { ok: true, detalhe: "Mensagem entregue. Confira o canal do Discord." };
      return { ok: false, detalhe: `O Discord recusou a mensagem (HTTP ${res.status}). Confira se o webhook não foi apagado.` };
    } catch (err) {
      return { ok: false, detalhe: `Não foi possível falar com o Discord: ${err.message}` };
    }
  }

  /**
   * Avisa o Discord sobre uma atualização recém-cadastrada. Nunca lança --
   * uma falha de rede ou o Discord fora do ar não pode derrubar o cadastro
   * da atualização (chamado sem `await` por quem usa este método).
   * @param {{cliente:string, sistema?:string, versao?:string, responsavel?:string}} atualizacao
   */
  async notifyAtualizacao({ cliente, sistema, versao, responsavel }) {
    if (!this.webhookUrl) return;
    const partes = [`**${cliente}**`, "foi atualizado"];
    if (sistema) partes.push(`— ${sistema}`);
    if (versao) partes.push(`v${versao}`);
    if (responsavel) partes.push(`(por ${responsavel})`);
    await this._post(`📦 ${partes.join(" ")}`);
  }

  /**
   * Avisa o Discord quando um agente C# entra ou sai de um estado ruim
   * (offline / erro / pendências) -- ver AlertaAgenteService, que decide QUANDO chamar
   * isso (só na transição, não a cada verificação).
   * @param {{empresa:string, situacao:"offline"|"erro"|string, detalhe?:string}} info
   */
  async notifyAgenteSituacao({ empresa, situacao, detalhe }) {
    if (!this.webhookUrl) return;
    let texto;
    if (situacao === "offline") {
      texto = `🔴 **${empresa}** — agente sem contato há mais de 24h (offline).`;
    } else if (situacao === "erro") {
      texto = `🟠 **${empresa}** — agente reportou erro na última atualização${detalhe ? `: ${detalhe}` : "."}`;
    } else if (situacao === "pendencias") {
      texto = `🟡 **${empresa}** — atualização concluída com scripts pendentes${detalhe ? `: ${detalhe}` : "."}`;
    } else if (situacao === "aguardando_autorizacao_demorada") {
      texto = `🟡 **${empresa}** — atualização baixada há mais de 24h esperando autorização (Fase 2) e ainda não foi liberada.`;
    } else {
      texto = `✅ **${empresa}** — agente normalizou (situação atual: ${situacao}).`;
    }
    await this._post(texto);
  }

  async _post(content) {
    try {
      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn(`Falha ao notificar Discord: HTTP ${res.status}`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Falha ao notificar Discord:", err.message);
    }
  }
}

module.exports = { NotificationService };
