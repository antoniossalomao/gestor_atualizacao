import { escapeHtml } from "./html.js";

const MAX_SUGESTOES = 30;

/**
 * Registro global de todas as listas abertas.
 *
 * Antes, CADA instância registrava um `document.addEventListener("click")`
 * próprio para fechar ao clicar fora, e nenhuma removia. São quatro campos de
 * autocomplete no app, recriados a cada re-login: os listeners iam se
 * acumulando em cima de instâncias que já não existiam mais. Agora existe um
 * único listener no documento, criado na primeira instância, que fecha todas.
 */
const instancias = new Set();
let listenerGlobal = null;

function garantirListenerGlobal() {
  if (listenerGlobal) return;
  listenerGlobal = (e) => {
    for (const inst of instancias) {
      if (!inst.wrapper.contains(e.target)) inst._close();
    }
  };
  document.addEventListener("click", listenerGlobal);
}

/**
 * Liga um `<input>` a uma lista de sugestões que aparece ao digitar --
 * equivalente de `AutocompleteCombobox` no app Tkinter original.
 *
 * Diferente de um `<select>`, o usuário pode digitar um nome que ainda não
 * existe na lista (o campo continua sendo texto livre) -- a lista é uma
 * sugestão para agilizar, nunca uma trava.
 *
 * Mudanças em relação à primeira versão:
 *
 *  - **só abre a partir de 1 caractere.** Antes, focar o campo despejava a
 *    lista inteira de clientes (cortada em 50). Com centenas de cadastros, era
 *    um menu enorme que não ajudava a escolher nada;
 *  - **destaca o trecho que casou**, para ficar claro POR QUE cada sugestão
 *    está ali;
 *  - **prioriza quem começa com o que foi digitado** -- digitar "san" deve
 *    trazer "Santos" antes de "Comercial Santana";
 *  - **rola até o item ativo** ao navegar com as setas;
 *  - tem `destroy()`, e implementa o padrão ARIA de combobox.
 */
export class Autocomplete {
  /** @param {HTMLInputElement} input @param {{values?: string[], minChars?: number}} options */
  constructor(input, { values = [], minChars = 1 } = {}) {
    this.input = input;
    this.values = values;
    this.minChars = minChars;
    this.filtered = [];
    this.activeIndex = -1;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "autocomplete";
    input.parentNode.insertBefore(this.wrapper, input);
    this.wrapper.appendChild(input);

    this.list = document.createElement("div");
    this.list.className = "autocomplete__list";
    this.list.setAttribute("role", "listbox");
    this.list.id = `ac-${Math.random().toString(36).slice(2, 8)}`;
    this.wrapper.appendChild(this.list);

    input.setAttribute("autocomplete", "off");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", this.list.id);

    this._onInputBound = () => this._onInput();
    this._onKeydownBound = (e) => this._onKeydown(e);
    input.addEventListener("input", this._onInputBound);
    input.addEventListener("focus", this._onInputBound);
    input.addEventListener("keydown", this._onKeydownBound);

    instancias.add(this);
    garantirListenerGlobal();
  }

  /** Atualiza a lista completa de sugestões (ex.: depois de cadastrar um cliente novo). */
  setValues(values) {
    this.values = values || [];
  }

  _onInput() {
    const typed = this.input.value.trim().toLowerCase();
    if (typed.length < this.minChars) {
      this._close();
      return;
    }
    // Duas listas em vez de um filtro só: quem COMEÇA com o termo vem antes de
    // quem apenas contém. É a ordem que a pessoa espera ao digitar as
    // primeiras letras de um nome.
    const comeca = [];
    const contem = [];
    for (const v of this.values) {
      const alvo = v.toLowerCase();
      if (alvo.startsWith(typed)) comeca.push(v);
      else if (alvo.includes(typed)) contem.push(v);
    }
    this.filtered = [...comeca, ...contem].slice(0, MAX_SUGESTOES);
    this.activeIndex = -1;
    this._render(typed);
  }

  _render(termo) {
    this.list.replaceChildren();
    if (this.filtered.length === 0) {
      this._close();
      return;
    }
    this.filtered.forEach((value, idx) => {
      const item = document.createElement("div");
      item.className = "autocomplete__item" + (idx === this.activeIndex ? " is-active" : "");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(idx === this.activeIndex));
      item.id = `${this.list.id}-${idx}`;
      item.innerHTML = destacar(value, termo);
      // "mousedown" (não "click"): dispara ANTES do input perder o foco, senão
      // o clique fecharia a lista antes de registrar em qual item foi.
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this._select(value);
      });
      this.list.appendChild(item);
    });
    this.list.classList.add("is-open");
    this.input.setAttribute("aria-expanded", "true");
    if (this.activeIndex >= 0) {
      this.input.setAttribute("aria-activedescendant", `${this.list.id}-${this.activeIndex}`);
      this.list.children[this.activeIndex]?.scrollIntoView({ block: "nearest" });
    } else {
      this.input.removeAttribute("aria-activedescendant");
    }
  }

  _select(value) {
    this.input.value = value;
    this._close();
    this.input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  _close() {
    this.list.classList.remove("is-open");
    this.list.replaceChildren();
    this.activeIndex = -1;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
  }

  get aberta() {
    return this.list.classList.contains("is-open");
  }

  _onKeydown(e) {
    if (!this.aberta) return;
    const termo = this.input.value.trim().toLowerCase();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.activeIndex = (this.activeIndex + 1) % this.filtered.length;
      this._render(termo);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.activeIndex = (this.activeIndex - 1 + this.filtered.length) % this.filtered.length;
      this._render(termo);
    } else if (e.key === "Enter" && this.activeIndex >= 0) {
      e.preventDefault();
      e.stopPropagation();
      this._select(this.filtered[this.activeIndex]);
    } else if (e.key === "Escape") {
      // `stopPropagation` para o Escape que fecha a lista não chegar ao
      // formulário e limpar tudo junto -- são duas intenções bem diferentes.
      e.stopPropagation();
      this._close();
    } else if (e.key === "Tab") {
      this._close();
    }
  }

  destroy() {
    this.input.removeEventListener("input", this._onInputBound);
    this.input.removeEventListener("focus", this._onInputBound);
    this.input.removeEventListener("keydown", this._onKeydownBound);
    instancias.delete(this);
  }
}

/** Envolve em `<mark>` o trecho do valor que casou com o termo digitado. */
function destacar(valor, termo) {
  const pos = valor.toLowerCase().indexOf(termo);
  if (pos < 0 || !termo) return escapeHtml(valor);
  return (
    escapeHtml(valor.slice(0, pos)) +
    `<mark>${escapeHtml(valor.slice(pos, pos + termo.length))}</mark>` +
    escapeHtml(valor.slice(pos + termo.length))
  );
}
