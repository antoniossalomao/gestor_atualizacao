import { normalizarBusca } from "../utils/busca.js";
import { filtrarSugestoes, destacarTrecho } from "../utils/sugestoes.js";
import { fatorZoom } from "./elemento.js";

export { filtrarSugestoes, destacarTrecho };

const MAX_SUGESTOES = 30;
const MARGEM_VIEWPORT = 10;
const ALTURA_MAX_LISTA = 220;

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
 * Liga um `<input>` a uma lista de sugestões que aparece ao digitar.
 *
 * Diferente de um `<select>`, o usuário pode digitar um nome que ainda não
 * existe na lista (o campo continua sendo texto livre) -- a lista é uma
 * sugestão para agilizar, nunca uma trava.
 *
 * Comportamento:
 *
 *  - **só abre a partir de 1 caractere.** Focar o campo despejaria a lista
 *    inteira de clientes (cortada em 50): com centenas de cadastros, um menu
 *    enorme que não ajuda a escolher nada;
 *  - **ignora acentos e caixa**, destacando exatamente os caracteres originais;
 *  - **prioriza quem começa com o que foi digitado** -- digitar "san" deve
 *    trazer "Santos" antes de "Comercial Santana";
 *  - **usa a camada superior do navegador (`popover="manual"`) quando
 *    disponível**, evitando corte por scroll ou sobreposição por outros campos;
 *  - **rola até o item ativo** ao navegar com as setas;
 *  - tem `destroy()`, e implementa o padrão ARIA de combobox.
 */
export class CampoComSugestoes {
  /** @param {HTMLInputElement} input @param {{values?: string[], minChars?: number}} options */
  constructor(input, { values = [], minChars = 1 } = {}) {
    this.input = input;
    this.values = values;
    this.minChars = minChars;
    this.filtered = [];
    this.activeIndex = -1;
    this._rafPos = null;
    this._janelaLigada = false;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "autocomplete";
    input.parentNode.insertBefore(this.wrapper, input);
    this.wrapper.appendChild(input);

    this.list = document.createElement("div");
    this.list.className = "autocomplete__list";
    this.list.setAttribute("role", "listbox");
    this.list.id = `ac-${Math.random().toString(36).slice(2, 8)}`;
    this._usaPopover =
      typeof this.list.showPopover === "function" && typeof this.list.hidePopover === "function";
    if (this._usaPopover) this.list.setAttribute("popover", "manual");
    this.wrapper.appendChild(this.list);

    input.setAttribute("autocomplete", "off");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", this.list.id);

    this._onInputBound = () => this._aoDigitar();
    this._onKeydownBound = (e) => this._aoTeclar(e);
    this._onFocusoutBound = (e) => {
      if (e.relatedTarget instanceof Node && !this.wrapper.contains(e.relatedTarget)) {
        this._close();
      }
    };
    this._onListMousedownBound = (e) => e.preventDefault();
    this._onFormResetBound = () => this._close();
    this._onViewportChangeBound = (e) => {
      if (!this.aberta || e?.target === this.list) return;
      if (this._rafPos != null) return;
      this._rafPos = requestAnimationFrame(() => {
        this._rafPos = null;
        this._posicionar();
      });
    };

    input.addEventListener("input", this._onInputBound);
    input.addEventListener("focus", this._onInputBound);
    // Capture-phase para fechar a lista antes de handlers do formulário (como Esc para limpar).
    input.addEventListener("keydown", this._onKeydownBound, true);
    this.wrapper.addEventListener("focusout", this._onFocusoutBound);
    this.list.addEventListener("mousedown", this._onListMousedownBound);
    this.form = input.form;
    this.form?.addEventListener("reset", this._onFormResetBound);
    this.form?.addEventListener("submit", this._onFormResetBound);

    instancias.add(this);
    garantirListenerGlobal();
  }

  /** Atualiza a lista completa de sugestões (ex.: depois de cadastrar um cliente novo). */
  definirValores(values) {
    this.values = values || [];
  }

  _aoDigitar() {
    const typed = normalizarBusca(this.input.value).trim();
    if (typed.length < this.minChars) {
      this._close();
      return;
    }
    this.filtered = filtrarSugestoes(this.values, this.input.value, MAX_SUGESTOES);
    this.activeIndex = -1;
    this._render(this.input.value);
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
      item.innerHTML = destacarTrecho(value, termo);
      // "mousedown" (não "click"): dispara ANTES do input perder o foco, senão
      // o clique fecharia a lista antes de registrar em qual item foi.
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this._select(value);
      });
      this.list.appendChild(item);
    });
    this.list.classList.add("is-open");
    if (this._usaPopover && !this.list.matches(":popover-open")) {
      try {
        this.list.showPopover();
      } catch {
        /* elemento ainda fora do DOM: cai no fluxo normal */
      }
    }
    this.input.setAttribute("aria-expanded", "true");
    this._ligarEventosJanela();
    this._posicionar();
    this._marcarAtivo();
  }

  _posicionar() {
    if (!this.aberta || !this.input.isConnected) {
      this._close();
      return;
    }
    const rect = this.input.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      this._close();
      return;
    }
    const scrollPai = this.input.closest(".drawer-body");
    if (scrollPai) {
      const pai = scrollPai.getBoundingClientRect();
      if (rect.bottom < pai.top + 4 || rect.top > pai.bottom - 4) {
        this._close();
        return;
      }
    }

    const z = fatorZoom(this.list);
    const alturaNatural = Math.min(ALTURA_MAX_LISTA, this.list.scrollHeight || ALTURA_MAX_LISTA);
    const espacoAbaixo = Math.max(0, (window.innerHeight - rect.bottom) / z - MARGEM_VIEWPORT);
    const espacoAcima = Math.max(0, rect.top / z - MARGEM_VIEWPORT);
    const virarAcima = espacoAbaixo < Math.min(alturaNatural, 140) && espacoAcima > espacoAbaixo;
    this.list.classList.toggle("is-flipped", virarAcima);

    if (this._usaPopover && this.list.matches(":popover-open")) {
      const maxH = Math.max(84, Math.min(ALTURA_MAX_LISTA, virarAcima ? espacoAcima : espacoAbaixo));
      const largura = rect.width / z;
      const left = Math.max(MARGEM_VIEWPORT, Math.min(rect.left / z, window.innerWidth / z - largura - MARGEM_VIEWPORT));
      this.list.style.left = `${left}px`;
      this.list.style.width = `${largura}px`;
      this.list.style.maxHeight = `${maxH}px`;
      if (virarAcima) {
        this.list.style.top = "auto";
        this.list.style.bottom = `${(window.innerHeight - rect.top) / z + 4}px`;
      } else {
        this.list.style.bottom = "auto";
        this.list.style.top = `${rect.bottom / z + 4}px`;
      }
    }
  }

  _ligarEventosJanela() {
    if (this._janelaLigada) return;
    this._janelaLigada = true;
    window.addEventListener("scroll", this._onViewportChangeBound, true);
    window.addEventListener("resize", this._onViewportChangeBound);
  }

  _desligarEventosJanela() {
    if (this._rafPos != null) {
      cancelAnimationFrame(this._rafPos);
      this._rafPos = null;
    }
    if (!this._janelaLigada) return;
    this._janelaLigada = false;
    window.removeEventListener("scroll", this._onViewportChangeBound, true);
    window.removeEventListener("resize", this._onViewportChangeBound);
  }

  _select(value) {
    this.input.value = value;
    this._close();
    this.input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  _close() {
    this._desligarEventosJanela();
    this.list.classList.remove("is-open", "is-flipped");
    this.list.style.top = "";
    this.list.style.bottom = "";
    this.list.style.left = "";
    this.list.style.width = "";
    this.list.style.maxHeight = "";
    if (this._usaPopover && this.list.matches?.(":popover-open")) {
      try {
        this.list.hidePopover();
      } catch {
        /* ignore */
      }
    }
    this.list.replaceChildren();
    this.activeIndex = -1;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
  }

  get aberta() {
    return this.list.classList.contains("is-open");
  }

  /**
   * Move o destaque entre dois itens sem redesenhar a lista.
   *
   * Antes as setas chamavam `_render(termo)`, que joga fora e recria até trinta
   * `<div>` (cada um com o `<mark>` do trecho destacado e um listener próprio)
   * só para trocar uma classe de lugar. Percorrer as sugestões de cliente com o
   * teclado -- o caminho mais rápido de preencher o campo -- era exatamente o
   * que fazia a lista cintilar.
   */
  _marcarAtivo() {
    [...this.list.children].forEach((el, i) => {
      const ativo = i === this.activeIndex;
      el.classList.toggle("is-active", ativo);
      el.setAttribute("aria-selected", String(ativo));
    });
    if (this.activeIndex >= 0) {
      this.input.setAttribute("aria-activedescendant", `${this.list.id}-${this.activeIndex}`);
      this.list.children[this.activeIndex]?.scrollIntoView({ block: "nearest" });
    } else {
      this.input.removeAttribute("aria-activedescendant");
    }
  }

  _aoTeclar(e) {
    if (!this.aberta) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.activeIndex = (this.activeIndex + 1) % this.filtered.length;
      this._marcarAtivo();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.activeIndex = (this.activeIndex - 1 + this.filtered.length) % this.filtered.length;
      this._marcarAtivo();
    } else if (e.key === "Enter" && this.activeIndex >= 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this._select(this.filtered[this.activeIndex]);
    } else if (e.key === "Escape") {
      // `stopImmediatePropagation` para o Escape que fecha a lista não chegar ao
      // listener do formulário no mesmo `<input>` e limpar tudo junto.
      e.preventDefault();
      e.stopImmediatePropagation();
      this._close();
    } else if (e.key === "Tab") {
      this._close();
    }
  }

  destroy() {
    this._close();
    this.input.removeEventListener("input", this._onInputBound);
    this.input.removeEventListener("focus", this._onInputBound);
    this.input.removeEventListener("keydown", this._onKeydownBound, true);
    this.wrapper.removeEventListener("focusout", this._onFocusoutBound);
    this.list.removeEventListener("mousedown", this._onListMousedownBound);
    this.form?.removeEventListener("reset", this._onFormResetBound);
    this.form?.removeEventListener("submit", this._onFormResetBound);
    instancias.delete(this);
  }
}
