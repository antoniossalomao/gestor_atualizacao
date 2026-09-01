/**
 * Notificações para serviços externos -- hoje só um webhook do Discord,
 * avisando o canal sempre que uma atualização nova é registrada. Usa o
 * `fetch` global do Node (disponível desde o Node 18, sem dependência
 * nova). Se `webhookUrl` não estiver configurada, todo método aqui vira
 * um no-op silencioso -- a integração é opcional.
 */
class NotificationService {
  /** @param {{discordWebhookUrl?: string}} config */
  constructor(config) {
    this.webhookUrl = config.discordWebhookUrl || "";
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
