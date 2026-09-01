import { escapeHtml } from "./html.js";

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
    for (const bar of bars) {
      const pct = Math.round((bar.total / max) * 100);
      const row = document.createElement("div");
      row.className = "bar-chart__row";
      row.innerHTML = `
        <span class="bar-chart__label" title="${escapeHtml(bar.label)}">${escapeHtml(bar.label)}</span>
        <span class="bar-chart__track">
          <span class="bar-chart__fill" style="width:${pct}%; background:${bar.color || this.color}"></span>
        </span>
        <span class="bar-chart__value">${bar.total}</span>
      `;
      wrap.appendChild(row);
    }
    this.container.appendChild(wrap);
  }
}
