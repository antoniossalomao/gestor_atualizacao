import { html } from "../utils/html.js";

/**
 * Índice lateral ("Nesta página") reutilizável para abas de Configurações e Administração.
 * Espelha o padrão visual de Sobre e ajuda: lista âncoras das seções visíveis,
 * acompanha a rolagem via IntersectionObserver e leva o foco junto ao clicar.
 */
export class IndicePagina {
  /**
   * @param {HTMLElement} raiz elemento onde o painel e o índice vivem
   * @param {{
   *   escopo?: HTMLElement,
   *   navDestino?: HTMLElement|null,
   *   prefixoId?: string,
   *   extras?: Array<{alvo: HTMLElement|string, titulo: string}>,
   * }} [opcoes]
   */
  constructor(raiz, { escopo = raiz, navDestino = null, prefixoId = "indice", extras = [] } = {}) {
    this.raiz = raiz;
    this.escopo = escopo;
    this.navDestino = navDestino;
    this.prefixoId = prefixoId;
    this.extras = extras;
    this._assinatura = "";
    /** @type {IntersectionObserver|null} */
    this._obsVisibilidade = null;
    /** @type {MutationObserver|null} */
    this._obsDom = null;

    this.nav = document.createElement("nav");
    this.nav.className = "sobre__indice";
    this.nav.setAttribute("aria-label", "Nesta página");
    this.nav.hidden = true;
    (this.navDestino || this.raiz).appendChild(this.nav);

    this.nav.addEventListener("click", (e) => {
      const btn = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-indice-alvo]"));
      if (!(btn instanceof HTMLElement)) return;
      this._irPara(btn.dataset.indiceAlvo);
    });

    if (typeof MutationObserver === "function") {
      this._obsDom = new MutationObserver((muts) => {
        if (muts.every((m) => m.target === this.nav || this.nav.contains(/** @type {Node} */ (m.target)))) return;
        this.sincronizar();
      });
      this._obsDom.observe(this.escopo, { childList: true, subtree: true });
    }

    this.sincronizar();
  }

  /** Relê as seções atuais e atualiza links + observador se mudaram. */
  sincronizar() {
    if (this.raiz.querySelector(".sobre")) {
      this.nav.hidden = true;
      return;
    }

    if (!this.nav.isConnected) {
      (this.navDestino || this.raiz).appendChild(this.nav);
      this._assinatura = "";
    }

    const secoes = this._coletarSecoes();
    const assinatura = secoes.map((s) => `${s.id}:${s.titulo}`).join("|");
    if (assinatura === this._assinatura) return;
    this._assinatura = assinatura;

    this._obsVisibilidade?.disconnect();
    this._obsVisibilidade = null;

    if (secoes.length === 0) {
      this.nav.hidden = true;
      this.nav.replaceChildren();
      return;
    }

    this.nav.hidden = false;
    this.nav.innerHTML = html`
      <span class="sobre__indice-titulo">Nesta página</span>
      <ul>
        ${secoes.map(
          (s, i) => html`<li><button type="button"${i === 0 ? html` class="is-atual"` : ""} data-indice-alvo="${s.id}">${s.titulo}</button></li>`
        )}
      </ul>`.toString();

    if (typeof IntersectionObserver !== "function") return;
    const links = new Map([...this.nav.querySelectorAll("[data-indice-alvo]")].map((el) => [/** @type {HTMLElement} */ (el).dataset.indiceAlvo, el]));
    const visiveis = new Set();

    this._obsVisibilidade = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          const id = entrada.target.id;
          if (entrada.isIntersecting) visiveis.add(id);
          else visiveis.delete(id);
        }
        const atual = secoes.find((s) => visiveis.has(s.id))?.id;
        if (!atual) return;
        for (const [id, btn] of links) btn.classList.toggle("is-atual", id === atual);
      },
      { rootMargin: "-80px 0px -55% 0px" }
    );

    for (const { el } of secoes) this._obsVisibilidade.observe(el);
  }

  _coletarSecoes() {
    const base = this.raiz.id || this.prefixoId;
    const achados = [];
    const vistos = new Set();

    const candidatos = [
      ...this.escopo.querySelectorAll("[data-indice-titulo], section.card.secao-card, form.card.secao-card, aside.card.secao-card, section.admin-saude__bloco"),
    ];

    for (const el of candidatos) {
      if (!(el instanceof HTMLElement) || el.hidden || el.closest("[hidden], .sobre__indice, .cfg-resultados")) continue;
      const titulo = this._extrairTitulo(el);
      if (!titulo || vistos.has(el)) continue;
      vistos.add(el);
      const id = el.id || `${base}-sec-${achados.length + 1}`;
      el.id = id;
      el.classList.add("indice-secao");
      achados.push({ id, titulo, el });
    }

    for (const extra of this.extras) {
      const el = typeof extra.alvo === "string" ? this.raiz.querySelector(extra.alvo) : extra.alvo;
      if (!(el instanceof HTMLElement) || vistos.has(el) || el.hidden) continue;
      vistos.add(el);
      const id = el.id || `${base}-sec-${achados.length + 1}`;
      el.id = id;
      el.classList.add("indice-secao");
      achados.push({ id, titulo: extra.titulo, el });
    }

    return achados;
  }

  /** @param {HTMLElement} el */
  _extrairTitulo(el) {
    if (el.dataset.indiceTitulo) return el.dataset.indiceTitulo.trim();
    const h = el.querySelector(".secao-card__titulos > h3, .secao-card__titulos > h2, :scope > header h3, :scope > header h2, h3, h2");
    return h?.textContent?.trim() || "";
  }

  /** @param {string} [id] */
  _irPara(id) {
    if (!id) return;
    const alvo = /** @type {HTMLElement|null} */ (this.raiz.querySelector(`#${CSS.escape(id)}`));
    if (!alvo) return;
    alvo.scrollIntoView({ block: "start", behavior: "smooth" });
    alvo.setAttribute("tabindex", "-1");
    alvo.focus({ preventScroll: true });
    for (const btn of this.nav.querySelectorAll("[data-indice-alvo]")) {
      btn.classList.toggle("is-atual", /** @type {HTMLElement} */ (btn).dataset.indiceAlvo === id);
    }
  }

  destroy() {
    this._obsDom?.disconnect();
    this._obsDom = null;
    this._obsVisibilidade?.disconnect();
    this._obsVisibilidade = null;
    this.nav.remove();
  }
}
