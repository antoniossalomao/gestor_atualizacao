import { ApiError } from "../../api/ApiClient.js";
import { View } from "../../app/View.js";
import { Modal } from "../../components/Modal.js";
import { toast } from "../../components/Toast.js";
import { marcarOcupado } from "../../utils/guard.js";
import { alteracoesRegras } from "../../domain/administracao.js";

/**
 * Base das abas que editam regras da equipe (Regras, Notificações,
 * Atualizador): carregar, perceber o que mudou, salvar só a diferença,
 * desfazer.
 *
 * Diferente das preferências pessoais (que valem no clique), aqui há botão
 * "Salvar": a regra vale para a equipe inteira, na hora, e fica registrada no
 * Histórico -- é uma decisão, não um ajuste de gosto, e merece um momento
 * explícito de confirmação. O botão só acende quando algo mudou de fato.
 *
 * A subclasse define `nomes` (as regras que o formulário edita), monta a
 * marcação em `desenhar(completa)` com um `<form data-role="form">` que tenha
 * um campo `[data-regra="<nome>"]` por regra e o `rodapeFormulario()`, e pode
 * sobrescrever `lerCampo`/`escreverCampo` para campos que não são `<input>`.
 */
export class FormularioRegras extends View {
  /** @type {string[]} */
  nomes = [];

  constructor(container, api, ctx) {
    super(container, api, ctx);
    /** Guardado inteiro: o Atualizador precisa de `ctx.recarregarApp`. */
    this.ctx = ctx;
  }

  async refresh() {
    // Sair para outra aba e voltar não pode jogar fora o que foi digitado e
    // ainda não salvo -- é o mesmo cuidado que as gavetas de formulário têm.
    if (this.form?.classList.contains("is-sujo")) return;
    try {
      this.completa = await this.api.get("/configuracao-sistema/completa");
    } catch (err) {
      if (err?.cancelled) return;
      toast.error(mensagem(err));
      return;
    }
    this.desenhar(this.completa);
    this._ligarFormulario();
    this._preencher(this.completa.valores);
  }

  /** @abstract @param {any} completa */
  desenhar(completa) {}

  /** @param {HTMLElement} campo */
  lerCampo(campo) {
    if (campo instanceof HTMLInputElement && campo.type === "radio") {
      return this.form.querySelector(`[data-regra="${campo.dataset.regra}"]:checked`)?.value === "sim";
    }
    return /** @type {HTMLInputElement} */ (campo).value;
  }

  /** @param {HTMLElement} campo @param {unknown} valor */
  escreverCampo(campo, valor) {
    if (campo instanceof HTMLInputElement && campo.type === "radio") {
      campo.checked = (campo.value === "sim") === Boolean(valor);
      return;
    }
    /** @type {HTMLInputElement} */ (campo).value = valor == null ? "" : String(valor);
  }

  /** Chamado depois de salvar -- o Atualizador usa para recarregar o app. */
  aposSalvar(mudou) {}

  // ==========================================================================

  _ligarFormulario() {
    this.form = this.container.querySelector('[data-role="form"]');
    this.estado = this.form.querySelector('[data-role="estado"]');
    this.botaoSalvar = this.form.querySelector('[data-action="salvar"]');
    this.botaoDesfazer = this.form.querySelector('[data-action="desfazer"]');
    this.form.addEventListener("input", () => this._atualizarEstado());
    this.form.addEventListener("change", () => this._atualizarEstado());
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this._salvar();
    });
    this.botaoDesfazer.addEventListener("click", () => this._preencher(this.completa.valores));
  }

  _preencher(valores) {
    for (const nome of this.nomes) {
      for (const campo of this.form.querySelectorAll(`[data-regra="${nome}"]`)) this.escreverCampo(campo, valores[nome]);
    }
    this._atualizarEstado();
  }

  _valoresDoFormulario() {
    /** @type {Record<string, unknown>} */
    const valores = {};
    for (const nome of this.nomes) {
      const campo = this.form.querySelector(`[data-regra="${nome}"]`);
      if (campo) valores[nome] = this.lerCampo(/** @type {HTMLElement} */ (campo));
    }
    return valores;
  }

  _alteracoes() {
    return alteracoesRegras(this.completa.valores, this._valoresDoFormulario(), this.completa.definicoes, this.nomes);
  }

  _atualizarEstado() {
    const qtd = Object.keys(this._alteracoes()).length;
    this.botaoSalvar.disabled = qtd === 0;
    this.botaoDesfazer.disabled = qtd === 0;
    this.estado.textContent = qtd === 0 ? "" : qtd === 1 ? "1 alteração não salva" : `${qtd} alterações não salvas`;
    this.form.classList.toggle("is-sujo", qtd > 0);
  }

  async _salvar() {
    const mudou = this._alteracoes();
    if (Object.keys(mudou).length === 0) return;
    const liberar = marcarOcupado(this.botaoSalvar);
    try {
      this.completa = await this.api.put("/configuracao-sistema", mudou);
      this._preencher(this.completa.valores);
      toast.success("Salvo. Vale para a equipe inteira a partir de agora.");
      this.aposSalvar(Object.keys(mudou));
    } catch (err) {
      Modal.alert("Não foi possível salvar", mensagem(err), "warning");
    } finally {
      liberar();
      this._atualizarEstado();
    }
  }
}

export function mensagem(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
