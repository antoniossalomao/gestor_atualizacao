import { ApiError } from "../api/ApiClient.js";
import { Modal } from "../components/Modal.js";
import { toast } from "../components/Toast.js";
import { marcarOcupado } from "../utils/guard.js";

/**
 * Painel "Atualizador" -- um único interruptor, para toda a equipe, que liga
 * ou desliga as abas Distribuição e Versões, o alerta automático de agente
 * offline no Discord, e as rotas que o agente C# usaria (ver
 * ConfiguracaoSistemaService no servidor).
 *
 * Existe porque o Atualizador (agente local em C#) ainda está em pré-piloto
 * -- ver `atualizador/RISCOS-CONHECIDOS.md` -- e enquanto nenhum agente real
 * está em produção, deixar essas telas e o alerta ligados só produz ruído
 * (alarme falso de "agente offline") e ocupa espaço na navegação.
 *
 * Ao contrário de "Configuração da API" (que grava no `.env` e exige
 * reiniciar o servidor), a mudança aqui vale na hora -- é por isso que ela
 * mora no banco, não em arquivo (ver ConfiguracaoSistemaService). O que NÃO
 * é instantâneo é a navegação de quem já está com o app aberto: por isso o
 * `aoSalvar` recarrega o app inteiro (ver App.recarregarApp), em vez de só
 * fechar o modal.
 */
export class AtualizadorConfigPanel {
  /**
   * @param {import('../api/ApiClient').ApiClient} api
   * @param {() => void} [aoSalvar] chamado depois de salvar com sucesso -- App.js usa para recarregar o app inteiro
   */
  constructor(api, aoSalvar) {
    this.api = api;
    this.aoSalvar = aoSalvar || (() => {});
  }

  async open() {
    const { box, close } = Modal.abrirCaixa({ largura: 480 });
    this.box = box;
    this.close = close;

    box.innerHTML = `
      <h3 class="modal-box__title" id="cfg-atualizador-titulo">Atualizador</h3>
      <p class="modal-box__message">
        Liga ou desliga, para a equipe inteira, as abas <strong>Distribuição</strong> e
        <strong>Versões</strong>, e o alerta automático de agente offline no Discord.
      </p>
      <p class="modal-box__message">
        Enquanto nenhum agente C# está em produção (ver o estado em
        <code>atualizador/RISCOS-CONHECIDOS.md</code>), deixar isso ligado só gera alarme falso e
        ocupa espaço na navegação.
      </p>

      <div data-role="carregando" class="text-muted">Carregando…</div>

      <form data-role="form" hidden>
        <div class="segmented" role="radiogroup" aria-label="Estado do Atualizador" data-role="trilho">
          <label class="cfg-group__option">
            <input type="radio" name="cfg-atualizador" value="ligado" />
            <span>Habilitado</span>
          </label>
          <label class="cfg-group__option">
            <input type="radio" name="cfg-atualizador" value="desligado" />
            <span>Desativado</span>
          </label>
        </div>
        <p class="field__help" data-role="ajuda-estado"></p>

        <div class="modal-box__actions">
          <button type="button" class="btn" data-action="close">Fechar</button>
          <button type="submit" class="btn btn--accent" data-action="salvar">Salvar</button>
        </div>
      </form>
    `;
    box.setAttribute("aria-labelledby", "cfg-atualizador-titulo");

    this.carregando = box.querySelector('[data-role="carregando"]');
    this.form = box.querySelector('[data-role="form"]');
    this.radios = [...box.querySelectorAll('input[name="cfg-atualizador"]')];
    this.ajudaEstado = box.querySelector('[data-role="ajuda-estado"]');

    box.querySelector('[data-action="close"]').addEventListener("click", () => close());
    for (const radio of this.radios) radio.addEventListener("change", () => this._atualizarAjuda());
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this._salvar();
    });

    await this._carregar();
  }

  async _carregar() {
    let config;
    try {
      config = await this.api.get("/configuracao-sistema");
    } catch (err) {
      this.close();
      Modal.alert("Erro", errorMessage(err), "error");
      return;
    }
    const valor = config.atualizadorHabilitado ? "ligado" : "desligado";
    for (const radio of this.radios) radio.checked = radio.value === valor;
    this._atualizarAjuda();
    this.carregando.hidden = true;
    this.form.hidden = false;
    this.radios.find((r) => r.checked)?.focus();
  }

  _atualizarAjuda() {
    const ligado = this.radios.find((r) => r.checked)?.value === "ligado";
    this.ajudaEstado.textContent = ligado
      ? "Distribuição, Versões e o alerta de agentes ficam visíveis para toda a equipe."
      : "Distribuição, Versões e o alerta de agentes ficam escondidos para toda a equipe.";
  }

  async _salvar() {
    const habilitado = this.radios.find((r) => r.checked)?.value === "ligado";
    const botao = this.box.querySelector('[data-action="salvar"]');
    const liberar = marcarOcupado(botao);
    try {
      await this.api.put("/configuracao-sistema", { atualizadorHabilitado: habilitado });
      toast.success(habilitado ? "Atualizador reativado." : "Atualizador desativado.");
      this.close();
      this.aoSalvar();
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }
}

function errorMessage(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
