import { prefs } from "../app/prefs.js";
import { html } from "../utils/html.js";
import { iconHtml } from "../utils/icons.js";

/**
 * Uma tela dividida em abas sublinhadas -- a Administração e as
 * Configurações.
 *
 * Nasceu dentro da AdministracaoView e saiu de lá quando as Configurações
 * deixaram de ser um modal e viraram tela: as duas precisam exatamente das
 * mesmas coisas (abas com semântica de tablist, setas entre elas, cada aba
 * montada só na primeira vez que é aberta, a última aba lembrada na sessão),
 * e duas cópias desse código acabariam com duas aparências diferentes na
 * primeira correção feita só numa delas.
 *
 * Quem usa decide o que vai DENTRO de cada aba (`criar`); aqui é só a
 * moldura. As abas são sublinhadas, e não botões, para não competir com o
 * menu lateral, que já é a navegação principal do app.
 */
export class TelaComAbas {
  /**
   * @param {HTMLElement} container
   * @param {{
   *   abas: Array<{key: string, rotulo: string, icone: Parameters<typeof iconHtml>[0]}>,
   *   rotulo: string,
   *   idBase: string,
   *   chavePrefs: string,
   *   criar: (key: string, painel: HTMLElement) => {refresh?: () => any, destroy?: () => void},
   *   aoMostrar?: (key: string) => void,
   *   extra?: import("../utils/html.js").HtmlSeguro,
   * }} opcoes
   *   `extra` vai no fim da barra de abas, à direita (a busca das
   *   Configurações). `aoMostrar` avisa a troca de aba depois que ela aconteceu.
   */
  constructor(container, { abas, rotulo, idBase, chavePrefs, criar, aoMostrar, extra }) {
    this.container = container;
    this.abas = abas;
    this.idBase = idBase;
    this.chavePrefs = chavePrefs;
    this.criar = criar;
    this.aoMostrar = aoMostrar || (() => {});
    /** @type {Map<string, {painel: HTMLElement, instancia: any}>} */
    this.secoes = new Map();
    const salva = prefs.get(chavePrefs, abas[0].key);
    this.aba = abas.some((a) => a.key === salva) ? salva : abas[0].key;

    container.innerHTML = html`
      <div class="tela-abas">
        <div class="tela-abas__barra">
          <nav class="tela-abas__lista" role="tablist" aria-label="${rotulo}">
            ${abas.map(
              (a) => html`
                <button type="button" class="tela-abas__aba" role="tab" id="${idBase}-aba-${a.key}" data-aba="${a.key}"
                        aria-controls="${idBase}-painel-${a.key}" aria-selected="false" tabindex="-1">
                  ${iconHtml(a.icone)}<span>${a.rotulo}</span><span class="tela-abas__contador" data-role="contador" hidden></span>
                </button>`
            )}
          </nav>
          ${extra && html`<div class="tela-abas__extra">${extra}</div>`}
        </div>
        <div class="tela-abas__paineis" data-role="paineis"></div>
      </div>`;
    this.raiz = /** @type {HTMLElement} */ (container.querySelector(".tela-abas"));
    this.nav = /** @type {HTMLElement} */ (container.querySelector(".tela-abas__lista"));
    this.paineis = /** @type {HTMLElement} */ (container.querySelector('[data-role="paineis"]'));

    this.nav.addEventListener("click", (e) => {
      const botao = /** @type {HTMLElement} */ (e.target).closest("[data-aba]");
      if (botao instanceof HTMLElement) this.mostrar(botao.dataset.aba);
    });
    // Setas entre as abas, como no menu lateral (padrão ARIA de tablist).
    this.nav.addEventListener("keydown", (e) => {
      const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!passo) return;
      e.preventDefault();
      const i = this.abas.findIndex((a) => a.key === this.aba);
      const proxima = this.abas[(i + passo + this.abas.length) % this.abas.length].key;
      this.mostrar(proxima);
      /** @type {HTMLElement|null} */ (this.nav.querySelector(`[data-aba="${proxima}"]`))?.focus();
    });
  }

  /** Aba que a próxima `mostrar()` sem argumento vai abrir -- para `aplicarParams`. */
  escolher(key) {
    if (this.abas.some((a) => a.key === key)) this.aba = key;
  }

  /** @param {string} [key] sem argumento, reabre a aba atual (é o `refresh` da tela) */
  async mostrar(key = this.aba) {
    if (!this.abas.some((a) => a.key === key)) return;
    this.aba = key;
    prefs.set(this.chavePrefs, key);

    for (const botao of this.nav.querySelectorAll("[data-aba]")) {
      const ativa = /** @type {HTMLElement} */ (botao).dataset.aba === key;
      botao.classList.toggle("is-active", ativa);
      botao.setAttribute("aria-selected", String(ativa));
      /** @type {HTMLElement} */ (botao).tabIndex = ativa ? 0 : -1;
      if (ativa) this._trazerParaVista(/** @type {HTMLElement} */ (botao));
    }

    let secao = this.secoes.get(key);
    if (!secao) {
      const painel = document.createElement("section");
      painel.className = "tela-abas__painel view";
      painel.id = `${this.idBase}-painel-${key}`;
      painel.setAttribute("role", "tabpanel");
      painel.setAttribute("aria-labelledby", `${this.idBase}-aba-${key}`);
      this.paineis.appendChild(painel);
      secao = { painel, instancia: this.criar(key, painel) };
      this.secoes.set(key, secao);
    }
    // `display`, e não `hidden`: é por ele que as views medem se estão
    // visíveis (ver View.visivel) -- inclusive a do Histórico, que é uma View
    // completa morando dentro da Administração.
    for (const [k, { painel }] of this.secoes) painel.style.display = k === key ? "flex" : "none";

    this.aoMostrar(key);
    await secao.instancia?.refresh?.();
  }

  /**
   * Num celular a fileira de abas rola na horizontal, e a aba ativa pode
   * estar fora da parte visível (quem chega por um link ou pela busca não
   * tocou nela). Rola só a fileira -- `scrollIntoView` rolaria a página
   * inteira junto.
   * @param {HTMLElement} botao
   */
  _trazerParaVista(botao) {
    const aba = botao.getBoundingClientRect();
    const fileira = this.nav.getBoundingClientRect();
    if (aba.left < fileira.left || aba.right > fileira.right) this.nav.scrollLeft += aba.left - fileira.left - 16;
  }

  /** A instância montada numa aba, ou `undefined` se ela ainda não foi aberta. */
  instancia(key) {
    return this.secoes.get(key)?.instancia;
  }

  /**
   * O numerozinho ao lado do nome da aba (nas Configurações, quantos ajustes
   * dela estão fora do padrão). Zero esconde.
   * @param {string} key @param {number} n @param {string} [titulo]
   */
  contador(key, n, titulo = "") {
    const el = /** @type {HTMLElement|null} */ (this.nav.querySelector(`[data-aba="${key}"] [data-role="contador"]`));
    if (!el) return;
    el.textContent = String(n);
    el.hidden = n === 0;
    el.title = titulo;
  }

  destroy() {
    for (const { instancia } of this.secoes.values()) instancia?.destroy?.();
  }
}
