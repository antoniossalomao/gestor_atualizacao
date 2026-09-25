import { toast } from "../../components/Toast.js";
import { html } from "../../utils/html.js";
import { iconHtml } from "../../utils/icons.js";
import { marcarOcupado } from "../../utils/guard.js";
import { cabecalhoSecao, tituloCartao } from "../../templates/secao.js";
import { linhaRegraNumero, rodapeFormulario } from "../../templates/administracao.js";
import { descreverChaveAgentes } from "../../domain/administracao.js";
import { FormularioRegras, mensagem } from "./FormularioRegras.js";

/**
 * Seção Integrações da Administração:
 * Alertas externos (Discord), conectividade e liga/desliga do Atualizador.
 */
export class IntegracoesAdmin extends FormularioRegras {
  nomes = ["discordWebhookUrl", "atualizadorHabilitado", "publicUrl", "alertaAgentesIntervaloMinutos"];

  desenhar({ valores, definicoes, chaveAgentes }) {
    const chave = descreverChaveAgentes(chaveAgentes);
    const tomChave = { ok: "success", alerta: "warning", perigo: "danger" }[chave.tom] || "info";

    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Integrações e alertas",
        descricao: "Comunicação com canais externos e conectividade dos agentes automáticos.",
      })}
      <form class="card secao-card admin-form" data-role="form" novalidate>
        ${tituloCartao({
          titulo: "Alertas externos (Discord)",
          descricao: "Notificações enviadas ao canal da equipe sobre eventos críticos do sistema.",
        })}
        <div class="cfg-group cfg-group--largo">
          <div class="cfg-group__labels">
            <label class="cfg-group__title" for="regra-webhook">Webhook do Discord</label>
            <span class="cfg-group__help">
              No Discord: Configurações do canal → Integrações → Webhooks → Novo webhook → Copiar URL.
              Deixe vazio para desativar os alertas externos.
            </span>
          </div>
          <div class="admin-campo-acao">
            <input type="url" class="input" id="regra-webhook" data-regra="discordWebhookUrl"
                   placeholder="https://discord.com/api/webhooks/…" autocomplete="off" spellcheck="false" />
            <button type="button" class="btn" data-action="testar-discord">${iconHtml("sino")} Enviar teste</button>
          </div>
        </div>

        <div class="admin-nota">
          <strong>O que é enviado ao canal</strong>
          <ul>
            <li>Cada nova atualização de cliente registrada (importações de planilha não notificam).</li>
            <li>Com o Atualizador ligado: agentes que ficam sem contato ou reportam incidentes.</li>
          </ul>
        </div>

        ${tituloCartao({
          titulo: "Atualizador automático e agentes",
          descricao: "Instalação remota de versões nos clientes e monitoramento de conectividade.",
        })}
        <div class="cfg-group">
          <div class="cfg-group__labels">
            <span class="cfg-group__title" id="regra-atualizador-rotulo">Atualizador automático</span>
            <span class="cfg-group__help">
              Desligado, as abas Distribuição e Versões ficam ocultas, agentes recebem recusa e alertas de inatividade são suspensos.
            </span>
          </div>
          <div class="segmented" role="radiogroup" aria-labelledby="regra-atualizador-rotulo">
            <label class="cfg-group__option"><input type="radio" name="regra-atualizador" value="sim" data-regra="atualizadorHabilitado" /><span>Ligado</span></label>
            <label class="cfg-group__option"><input type="radio" name="regra-atualizador" value="nao" data-regra="atualizadorHabilitado" /><span>Desligado</span></label>
          </div>
        </div>

        <div class="cfg-group cfg-group--largo">
          <div class="cfg-group__labels">
            <label class="cfg-group__title" for="regra-public-url">Endereço público deste servidor</label>
            <span class="cfg-group__help">
              URL utilizada pelos agentes para baixar os pacotes de versão. Vazio: utiliza o endereço da requisição de envio.
            </span>
          </div>
          <input type="url" class="input" id="regra-public-url" data-regra="publicUrl" placeholder="http://192.168.0.10:3000"
                 autocomplete="off" spellcheck="false" />
        </div>

        ${linhaRegraNumero({
          nome: "alertaAgentesIntervaloMinutos",
          titulo: "Conferir agentes a cada",
          ajuda: "Intervalo entre verificações para avisar no Discord sobre agentes parados ou com falha.",
          unidade: "minutos",
          valor: valores.alertaAgentesIntervaloMinutos,
          min: definicoes.alertaAgentesIntervaloMinutos?.min ?? 5,
          max: definicoes.alertaAgentesIntervaloMinutos?.max ?? 1440,
        })}

        <div class="cfg-group">
          <div class="cfg-group__labels">
            <span class="cfg-group__title">Chave dos agentes</span>
            <span class="cfg-group__help">
              Definida em <code>AGENT_API_TOKEN</code> no arquivo .env do servidor. Segredo de infraestrutura mascarado para segurança.
            </span>
          </div>
          <span class="badge badge--${tomChave} admin-chave">${chave.texto}</span>
        </div>

        ${rodapeFormulario()}
      </form>`;

    this.container.querySelector('[data-action="testar-discord"]')?.addEventListener("click", (e) => {
      this._testarDiscord(e.currentTarget);
    });
  }

  async _testarDiscord(botao) {
    const url = this.form.querySelector('[data-regra="discordWebhookUrl"]')?.value?.trim();
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

  aposSalvar(mudou) {
    if (mudou.includes("atualizadorHabilitado")) {
      this.ctx?.recarregarApp?.();
    }
  }
}
