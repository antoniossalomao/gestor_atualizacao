import { html } from "../../utils/html.js";

/**
 * Gráfico de barras horizontais simples, em HTML/CSS puro (sem SVG) -- cada
 * linha é um rótulo + uma barra proporcional ao maior valor da lista com o
 * número logo no fim dela. Melhor que um PieChart quando há muitas
 * categorias (ex.: contagem por sistema): fatias demais numa rosca ficam
 * ilegíveis, barras continuam fáceis de comparar mesmo com uma lista longa.
 *
 * Cada barra pode trazer uma `variacao` (▲/▼ contra outro período) e, com
 * `aoClicar`, vira um botão de verdade -- o Resumo abre Atualizações já
 * filtrada pelo sistema da barra (A08).
 */
export class GraficoDeBarras {
  /**
   * @param {HTMLElement} container
   * @param {{color?: string, vazio?: string, aoClicar?: (bar: any) => void}} [opcoes]
   */
  constructor(container, { color = "var(--cor-accent)", vazio = "Nenhum dado para mostrar.", aoClicar = null } = {}) {
    this.container = container;
    this.color = color;
    this.vazio = vazio;
    this.aoClicar = aoClicar;
    /** @type {any[]} */
    this.bars = [];
    if (aoClicar) {
      this.container.addEventListener("click", (e) => {
        const linha = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-barra]"));
        if (linha) aoClicar(this.bars[Number(linha.dataset.barra)]);
      });
    }
  }

  /**
   * @param {Array<{label: string, total: number, color?: string, dica?: string,
   *   variacao?: {texto: string, tendencia: string, dica?: string}}>} bars
   */
  render(bars) {
    this.bars = bars;
    if (bars.length === 0) {
      this.container.innerHTML = html`<div class="bar-chart"><p class="bar-chart__vazio">${this.vazio}</p></div>`.toString();
      return;
    }

    const max = Math.max(1, ...bars.map((b) => b.total));
    const total = Math.max(1, bars.reduce((soma, b) => soma + b.total, 0));
    const tag = this.aoClicar ? "button" : "div";
    this.container.innerHTML = html`<div class="bar-chart">${bars.map((bar, i) => {
      const dica = bar.dica || `${bar.label}: ${bar.total} (${Math.round((bar.total / total) * 100)}% do total)`;
      const miolo = html`
        <span class="bar-chart__label" title="${bar.label}">${bar.label}</span>
        <span class="bar-chart__track">
          <span class="bar-chart__fill" data-pct="${Math.round((bar.total / max) * 100)}" style="width:0%; background:${bar.color || this.color}"></span>
          <span class="bar-chart__value">${bar.total}</span>
        </span>
        ${bar.variacao ? html`<span class="bar-chart__variacao is-${bar.variacao.tendencia}" title="${bar.variacao.dica || ""}">${bar.variacao.texto}</span>` : ""}`;
      return tag === "button"
        ? html`<button type="button" class="bar-chart__row bar-chart__row--acao" data-barra="${i}" data-tooltip="${dica}" aria-label="${dica}">${miolo}</button>`
        : html`<div class="bar-chart__row" tabindex="0" data-tooltip="${dica}">${miolo}</div>`;
    })}</div>`.toString();

    // A barra nasce em 0% e só ganha a largura real no quadro seguinte. O CSS
    // já declara `transition: width` em `.bar-chart__fill` há tempos, mas ela
    // nunca disparava: `render()` recria os elementos do zero a cada chamada
    // (troca de aba, revalidação em segundo plano), então a largura final já
    // chegava pronta no primeiro estilo computado -- sem um "antes" para
    // comparar, não existe transição. Dois `requestAnimationFrame`, não um: o
    // primeiro garante que o navegador pintou o 0% antes do segundo mudar
    // para o valor real; só um costuma colapsar as duas mudanças no mesmo
    // quadro e a barra volta a "nascer cheia".
    const fills = /** @type {NodeListOf<HTMLElement>} */ (this.container.querySelectorAll(".bar-chart__fill"));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const el of fills) el.style.width = `${el.dataset.pct}%`;
      });
    });
  }
}
