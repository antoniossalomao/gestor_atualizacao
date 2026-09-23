import { html } from "../../utils/html.js";
import { cabecalhoSecao } from "../../templates/secao.js";
import { linhaRegraNumero, rodapeFormulario } from "../../templates/administracao.js";
import { descreverChaveAgentes } from "../../domain/administracao.js";
import { FormularioRegras } from "./FormularioRegras.js";

/**
 * Aba Atualizador: o liga/desliga do agente automático e o que os agentes
 * precisam para falar com este servidor.
 *
 * Juntou duas telas antigas que tratavam do mesmo assunto em lugares
 * diferentes ("Atualizador" e "Configuração da API"). A chave dos agentes
 * continua no .env -- é segredo de infraestrutura, e trocá-la exige mexer em
 * cada cliente --, então aqui ela só aparece como situação ("configurada,
 * termina em …9f3c"). A tela antiga mandava a chave inteira para o navegador.
 */
export class AtualizadorAdmin extends FormularioRegras {
  nomes = ["atualizadorHabilitado", "publicUrl", "alertaAgentesIntervaloMinutos"];

  desenhar({ valores, definicoes, chaveAgentes }) {
    const chave = descreverChaveAgentes(chaveAgentes);
    const tomChave = { ok: "success", alerta: "warning", perigo: "danger" }[chave.tom];
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Atualizador",
        descricao: "O agente que instala as versões sozinho em cada cliente. Ainda em pré-piloto.",
      })}
      <form class="card secao-card admin-form" data-role="form" novalidate>
        <div class="cfg-group">
          <div class="cfg-group__labels">
            <span class="cfg-group__title" id="regra-atualizador-rotulo">Atualizador</span>
            <span class="cfg-group__help">
              Desligado, as telas Distribuição e Versões somem para todos, os agentes recebem recusa e o alerta de
              agente parado não roda.
            </span>
          </div>
          <div class="segmented" role="radiogroup" aria-labelledby="regra-atualizador-rotulo">
            <label class="cfg-group__option"><input type="radio" name="regra-atualizador" value="sim" data-regra="atualizadorHabilitado" /><span>Ligado</span></label>
            <label class="cfg-group__option"><input type="radio" name="regra-atualizador" value="nao" data-regra="atualizadorHabilitado" /><span>Desligado</span></label>
          </div>
        </div>

        <div class="cfg-group cfg-group--largo">
          <div class="cfg-group__labels">
            <label class="cfg-group__title" for="regra-public-url">Endereço deste servidor para os agentes</label>
            <span class="cfg-group__help">
              Entra nos links de download dos pacotes. Vazio: vale o endereço pelo qual o pacote foi enviado.
            </span>
          </div>
          <input type="url" class="input" id="regra-public-url" data-regra="publicUrl" placeholder="http://192.168.0.10:3000"
                 autocomplete="off" spellcheck="false" />
        </div>

        ${linhaRegraNumero({
          nome: "alertaAgentesIntervaloMinutos",
          titulo: "Conferir os agentes a cada",
          ajuda: "Quanto tempo entre uma checagem e outra para avisar no Discord de agente parado ou com erro.",
          unidade: "minutos",
          valor: valores.alertaAgentesIntervaloMinutos,
          min: definicoes.alertaAgentesIntervaloMinutos.min,
          max: definicoes.alertaAgentesIntervaloMinutos.max,
        })}

        <div class="cfg-group">
          <div class="cfg-group__labels">
            <span class="cfg-group__title">Chave dos agentes</span>
            <span class="cfg-group__help">
              Definida em <code>AGENT_API_TOKEN</code>, no arquivo .env do servidor. Para trocar, siga o passo a passo
              "Rotacionar o token dos agentes" em docs/OPERACAO.md.
            </span>
          </div>
          <span class="badge badge--${tomChave} admin-chave">${chave.texto}</span>
        </div>

        ${rodapeFormulario()}
      </form>`;
  }

  /**
   * Ligar ou desligar muda quais telas existem, e a navegação é montada uma
   * vez por sessão (ver App.recarregarApp) -- sem recarregar, as abas de
   * Distribuição e Versões continuariam no menu de quem acabou de desligar.
   */
  aposSalvar(mudou) {
    if (mudou.includes("atualizadorHabilitado")) this.ctx?.recarregarApp?.();
  }
}
