import { ApiError } from "../api/ApiClient.js";
import { Modal } from "../core/Modal.js";
import { toast } from "../core/Toast.js";
import { icon } from "../core/icons.js";
import { copyToClipboard } from "../core/html.js";
import { marcarOcupado } from "../core/guard.js";

/**
 * Painel "Configuração da API" -- URL pública, chave compartilhada com o
 * agente C# de cada cliente, webhook do Discord e os dois intervalos
 * ajustáveis (checagem de agentes offline, arquivamento de agendamentos).
 *
 * Até aqui, as cinco coisas abaixo só existiam no arquivo `.env` do
 * servidor: quem precisasse trocar a chave da API, por exemplo, precisava de
 * acesso à máquina que hospeda o Gestor e de um editor de texto. Esta tela
 * lê e grava o mesmo arquivo, mas pelo navegador -- e com validação, em vez
 * de confiar que ninguém vai digitar um "=" a mais.
 *
 * Só administradores (mesma restrição de "Remover acesso" em Usuários -- ver
 * AuthService.deleteUser): o campo mais sensível daqui é um segredo
 * compartilhado com TODOS os agentes instalados nos clientes, não uma
 * preferência de uma conta.
 *
 * O que esta tela NÃO faz -- e é o ponto que mais importa explicar na hora
 * de usar -- é aplicar a mudança na hora. O servidor Node só lê o `.env` no
 * arranque (ver server.js); salvar aqui grava o arquivo, mas o processo
 * continua rodando com os valores antigos até reiniciar. Por isso todo
 * salvamento termina com o aviso de reinício, em vez de fingir que já valeu.
 */
export class ConfiguracaoApiPanel {
  /** @param {import('../api/ApiClient').ApiClient} api */
  constructor(api) {
    this.api = api;
    this.tokenVisivel = false;
  }

  async open() {
    const { box, close } = Modal.abrirCaixa({ largura: 560 });
    this.box = box;
    this.close = close;

    box.innerHTML = `
      <h3 class="modal-box__title" id="cfg-api-titulo">Configuração da API</h3>
      <p class="modal-box__message">
        O que os agentes do Atualizador (instalados em cada cliente) usam para falar com este servidor.
        Vale para a equipe inteira, não só para a sua conta.
      </p>

      <p class="field__aviso" data-role="reinicio-aviso" hidden>
        ${icon("alerta")} Salvo no arquivo, mas ainda não aplicado -- reinicie o servidor para valer.
      </p>

      <form data-role="form">
        <div class="field">
          <label class="field__label" for="cfg-api-token">Chave da API (AGENT_API_TOKEN)</label>
          <input type="password" class="input" id="cfg-api-token" data-field="agentApiToken"
                 autocomplete="off" spellcheck="false" required />
          <p class="field__help">
            Precisa ser idêntica ao <code>ATUALIZADOR_API_TOKEN</code> configurado no serviço Windows de cada
            cliente. Trocar aqui sem atualizar lá também faz os agentes pararem de se autenticar.
          </p>
          <div class="form-actions">
            <button type="button" class="btn btn--small btn--ghost" data-action="revelar-token">
              ${icon("olho")} Mostrar
            </button>
            <button type="button" class="btn btn--small btn--ghost" data-action="copiar-token">
              ${icon("copiar")} Copiar
            </button>
            <button type="button" class="btn btn--small" data-action="gerar-token">
              ${icon("atualizar")} Gerar nova chave
            </button>
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="cfg-api-url">URL pública (PUBLIC_URL)</label>
          <input type="text" class="input" id="cfg-api-url" data-field="publicUrl"
                 placeholder="http://192.168.0.85:3000" autocomplete="off" required />
          <p class="field__help">Endereço pelo qual os agentes enxergam este servidor -- entra nos links de download dos pacotes.</p>
        </div>

        <div class="field">
          <label class="field__label" for="cfg-api-webhook">Webhook do Discord (opcional)</label>
          <input type="text" class="input" id="cfg-api-webhook" data-field="discordWebhookUrl"
                 placeholder="https://discord.com/api/webhooks/..." autocomplete="off" />
          <p class="field__help">Deixe vazio para não avisar o Discord. Configurações do Canal → Integrações → Webhooks.</p>
        </div>

        <div class="form-grid form-grid--2">
          <div class="field">
            <label class="field__label" for="cfg-api-intervalo">Checar agentes a cada (minutos)</label>
            <input type="number" class="input" id="cfg-api-intervalo" data-field="alertaAgentesIntervaloMinutos"
                   min="1" max="1440" step="1" required />
          </div>
          <div class="field">
            <label class="field__label" for="cfg-api-arquivar">Arquivar tarefa concluída após (dias)</label>
            <input type="number" class="input" id="cfg-api-arquivar" data-field="agendamentoArquivarDias"
                   min="1" max="365" step="1" required />
          </div>
        </div>

        <div class="modal-box__actions">
          <button type="button" class="btn" data-action="close">Fechar</button>
          <button type="submit" class="btn btn--accent" data-action="salvar">Salvar</button>
        </div>
      </form>
    `;
    box.setAttribute("aria-labelledby", "cfg-api-titulo");

    this.form = box.querySelector('[data-role="form"]');
    this.avisoReinicio = box.querySelector('[data-role="reinicio-aviso"]');
    this.tokenInput = box.querySelector('[data-field="agentApiToken"]');
    this.fields = {
      agentApiToken: this.tokenInput,
      publicUrl: box.querySelector('[data-field="publicUrl"]'),
      discordWebhookUrl: box.querySelector('[data-field="discordWebhookUrl"]'),
      alertaAgentesIntervaloMinutos: box.querySelector('[data-field="alertaAgentesIntervaloMinutos"]'),
      agendamentoArquivarDias: box.querySelector('[data-field="agendamentoArquivarDias"]'),
    };

    box.querySelector('[data-action="close"]').addEventListener("click", () => close());
    box.querySelector('[data-action="revelar-token"]').addEventListener("click", () => this._alternarRevelarToken());
    box.querySelector('[data-action="copiar-token"]').addEventListener("click", () => this._copiarToken());
    box.querySelector('[data-action="gerar-token"]').addEventListener("click", (e) => this._gerarToken(e.currentTarget));
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this._salvar();
    });

    await this._carregar();
  }

  async _carregar() {
    let config;
    try {
      config = await this.api.get("/configuracao-api");
    } catch (err) {
      this.close();
      Modal.alert("Erro", errorMessage(err), "error");
      return;
    }
    this.fields.agentApiToken.value = config.agentApiToken;
    this.fields.publicUrl.value = config.publicUrl;
    this.fields.discordWebhookUrl.value = config.discordWebhookUrl;
    this.fields.alertaAgentesIntervaloMinutos.value = String(config.alertaAgentesIntervaloMinutos);
    this.fields.agendamentoArquivarDias.value = String(config.agendamentoArquivarDias);
    this.avisoReinicio.hidden = !config.reinicioNecessario;
  }

  _alternarRevelarToken() {
    this.tokenVisivel = !this.tokenVisivel;
    this.tokenInput.type = this.tokenVisivel ? "text" : "password";
    const botao = this.box.querySelector('[data-action="revelar-token"]');
    botao.innerHTML = this.tokenVisivel ? `${icon("olho")} Ocultar` : `${icon("olho")} Mostrar`;
  }

  async _copiarToken() {
    const ok = await copyToClipboard(this.tokenInput.value);
    toast[ok ? "success" : "error"](ok ? "Chave copiada." : "Não foi possível copiar.");
  }

  /**
   * Só preenche o campo -- não salva sozinho. Gerar e sair sem clicar em
   * "Salvar" não deveria deixar a chave antiga valendo no arquivo mas
   * sumida da tela, então o botão de salvar continua sendo o único jeito de
   * uma chave nova pegar.
   */
  async _gerarToken(botao) {
    const liberar = marcarOcupado(botao);
    try {
      const { token } = await this.api.post("/configuracao-api/gerar-token");
      this.tokenInput.value = token;
      if (!this.tokenVisivel) this._alternarRevelarToken();
      toast.info('Nova chave gerada. Clique em "Salvar" para aplicá-la.');
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  async _salvar() {
    const dados = {
      agentApiToken: this.fields.agentApiToken.value.trim(),
      publicUrl: this.fields.publicUrl.value.trim(),
      discordWebhookUrl: this.fields.discordWebhookUrl.value.trim(),
      alertaAgentesIntervaloMinutos: Number(this.fields.alertaAgentesIntervaloMinutos.value),
      agendamentoArquivarDias: Number(this.fields.agendamentoArquivarDias.value),
    };

    const botao = this.box.querySelector('[data-action="salvar"]');
    const liberar = marcarOcupado(botao);
    try {
      const config = await this.api.put("/configuracao-api", dados);
      this.avisoReinicio.hidden = false;
      toast.success("Configuração salva. Reinicie o servidor para aplicar.");
      // O backend devolve os valores como ele os gravou (URL sem barra
      // final, por exemplo) -- reaplicar na tela evita mostrar algo
      // diferente do que está de fato no arquivo agora.
      this.fields.publicUrl.value = config.publicUrl;
      this.fields.discordWebhookUrl.value = config.discordWebhookUrl;
    } catch (err) {
      Modal.alert("Validação", errorMessage(err), "warning");
    } finally {
      liberar();
    }
  }
}

function errorMessage(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
