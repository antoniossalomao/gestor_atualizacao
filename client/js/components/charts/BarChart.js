import { escapeHtml, escapeAttr } from "../../utils/html.js";

/**
 * Gráfico de barras horizontais simples, em HTML/CSS puro (sem SVG) -- cada
 * linha é um rótulo + uma barra proporcional ao maior valor da lista + o
 * número. Melhor que um PieChart quando há muitas categorias (ex.:
 * contagem por sistema): fatias demais numa rosca ficam ilegíveis, barras
 * continuam fáceis de comparar mesmo com uma lista mais longa.
 */
export class BarChart {
  /** @param {HTMLElement} container */
  constructor(container, { color = "var(--cor-accent)" } = {}) {
    this.container = container;
    this.color = color;
  }

  /** @param {Array<{label: string, total: number, color?: string}>} bars */
  render(bars) {
    this.container.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className = "bar-chart";

    if (bars.length === 0) {
      const vazio = document.createElement("p");
      vazio.className = "text-muted";
      vazio.textContent = "Nenhum dado para mostrar.";
      wrap.appendChild(vazio);
      this.container.appendChild(wrap);
      return;
    }

    const max = Math.max(1, ...bars.map((b) => b.total));
    const total = Math.max(1, bars.reduce((soma, b) => soma + b.total, 0));
    const fills = [];
    for (const bar of bars) {
      const pct = Math.round((bar.total / max) * 100);
      const row = document.createElement("div");
      row.className = "bar-chart__row";
      row.tabIndex = 0;
      row.dataset.tooltip = `${bar.label}: ${bar.total} (${Math.round((bar.total / total) * 100)}% do total)`;
      row.innerHTML = `
        <span class="bar-chart__label" title="${escapeAttr(bar.label)}">${escapeHtml(bar.label)}</span>
        <span class="bar-chart__track">
          <span class="bar-chart__fill" style="width:0%; background:${bar.color || this.color}"></span>
        </span>
        <span class="bar-chart__value">${bar.total}</span>
      `;
      wrap.appendChild(row);
      fills.push({ el: row.querySelector(".bar-chart__fill"), pct });
    }
    this.container.appendChild(wrap);

    // A barra nasce em 0% e só ganha a largura real no quadro seguinte. O CSS
    // já declara `transition: width` em `.bar-chart__fill` há tempos, mas ela
    // nunca disparava: `render()` recria os elementos do zero a cada chamada
    // (troca de aba, revalidação em segundo plano), então a largura final já
    // chegava pronta no primeiro estilo computado -- sem um "antes" para
    // comparar, não existe transição. Dois `requestAnimationFrame`, não um: o
    // primeiro garante que o navegador pintou o 0% antes do segundo mudar
    // para o valor real; só um costuma colapsar as duas mudanças no mesmo
    // quadro e a barra volta a "nascer cheia".
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const { el, pct } of fills) el.style.width = `${pct}%`;
      });
    });
  }
}
