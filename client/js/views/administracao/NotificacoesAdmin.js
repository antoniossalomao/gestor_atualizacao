import { toast } from "../../components/Toast.js";
import { html } from "../../utils/html.js";
import { iconHtml } from "../../utils/icons.js";
import { marcarOcupado } from "../../utils/guard.js";
import { cabecalhoSecao } from "../../templates/secao.js";
import { rodapeFormulario } from "../../templates/administracao.js";
import { FormularioRegras, mensagem } from "./FormularioRegras.js";

/**
 * Aba Notificações: o canal do Discord que recebe os avisos da equipe.
 *
 * Ganhou o botão "Enviar teste". Antes, a única forma de saber se o webhook
 * estava certo era cadastrar uma atualização de verdade e ir olhar o canal --
 * e um webhook errado não dava erro em lugar nenhum (o aviso falha em
 * silêncio, de propósito, para não travar o cadastro).
 */
export class NotificacoesAdmin extends FormularioRegras {
  nomes = ["discordWebhookUrl"];

  desenhar() {
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Notificações",
        descricao: "Para onde o Gestor manda os avisos que a equipe precisa ver sem estar com o sistema aberto.",
      })}
      <form class="card secao-card admin-form" data-role="form" novalidate>
        <div class="cfg-group cfg-group--largo">
          <div class="cfg-group__labels">
            <label class="cfg-group__title" for="regra-webhook">Webhook do Discord</label>
            <span class="cfg-group__help">
              No Discord: Configurações do canal → Integrações → Webhooks → Novo webhook → Copiar URL.
              Deixe vazio para não mandar nada.
            </span>
          </div>
          <div class="admin-campo-acao">
            <input type="url" class="input" id="regra-webhook" data-regra="discordWebhookUrl"
                   placeholder="https://discord.com/api/webhooks/…" autocomplete="off" spellcheck="false" />
            <button type="button" class="btn" data-action="testar">${iconHtml("sino")} Enviar teste</button>
          </div>
        </div>
        <div class="admin-nota">
          <strong>O que chega no canal</strong>
          <ul>
            <li>Cada atualização nova cadastrada (a importação de planilha não avisa, para não inundar o canal).</li>
            <li>Com o Atualizador ligado: agente que fica sem contato, dá erro ou volta ao normal.</li>
          </ul>
        </div>
        ${rodapeFormulario()}
      </form>`;

    this.container.querySelector('[data-action="testar"]').addEventListener("click", (e) => this._testar(e.currentTarget));
  }

  /** Testa o que está no campo -- inclusive antes de salvar, que é quando mais serve. */
  async _testar(botao) {
    const url = this.form.querySelector('[data-regra="discordWebhookUrl"]').value.trim();
    const liberar = marcarOcupado(botao);
    try {
      const r = await this.api.post("/configuracao-sistema/testar-discord", url ? { url } : {});
      if (r.ok) toast.success(r.detalhe);
      else toast.error(r.detalhe);
    } catch (err) {
      toast.error(mensagem(err));
    } finally {
      liberar();
    }
  }
}
