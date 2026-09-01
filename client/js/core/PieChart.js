const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Gráfico de rosca (donut) simples em SVG puro, com legenda ao lado.
 * Equivalente do gráfico de pizza desenhado à mão em `tk.Canvas` na tela de
 * Resumo do app original -- aqui é SVG em vez de pixels desenhados na
 * unha, então fica nítido em qualquer tamanho de tela e redimensiona sozinho.
 *
 * Técnica usada: cada fatia é um `<circle>` com `stroke-dasharray` cobrindo
 * só uma parte do contorno (o resto fica transparente) -- um jeito comum e
 * leve de fazer gráfico de rosca em SVG, sem depender de biblioteca externa.
 */
export class PieChart {
  /** @param {HTMLElement} container */
  constructor(container, { size = 148, strokeWidth = 22 } = {}) {
    this.container = container;
    this.size = size;
    this.strokeWidth = strokeWidth;
  }

  /** @param {Array<{label: string, value: number, color: string}>} slices */
  render(slices) {
    const total = slices.reduce((soma, s) => soma + s.value, 0);
    this.container.replaceChildren();

    const wrap = document.createElement("div");
    wrap.className = "pie-chart";

    if (total === 0) {
      const vazio = document.createElement("p");
      vazio.className = "text-muted";
      vazio.textContent = "Cadastre clientes para ver este gráfico.";
      wrap.appendChild(vazio);
      this.container.appendChild(wrap);
      return;
    }

    wrap.appendChild(this._buildSvg(slices, total));
    wrap.appendChild(this._buildLegend(slices, total));
    this.container.appendChild(wrap);
  }

  _buildSvg(slices, total) {
    const { size, strokeWidth } = this;
    const r = (size - strokeWidth) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * r;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);

    // Trilha de fundo (mostra o círculo completo antes de desenhar as fatias por cima).
    const track = document.createElementNS(SVG_NS, "circle");
    track.setAttribute("cx", cx);
    track.setAttribute("cy", cy);
    track.setAttribute("r", r);
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "var(--cor-borda)");
    track.setAttribute("stroke-width", strokeWidth);
    svg.appendChild(track);

    // Gira o grupo -90° para a primeira fatia começar no topo (12h) em vez
    // de à direita (3h, posição padrão em que o SVG desenha um círculo).
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("transform", `rotate(-90 ${cx} ${cy})`);

    let acumulado = 0;
    for (const slice of slices) {
      if (slice.value <= 0) continue;
      const fatia = (slice.value / total) * circumference;
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", r);
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", slice.color);
      circle.setAttribute("stroke-width", strokeWidth);
      circle.setAttribute("stroke-dasharray", `${fatia} ${circumference - fatia}`);
      circle.setAttribute("stroke-dashoffset", String(-acumulado));
      circle.setAttribute("stroke-linecap", slices.length > 1 ? "butt" : "round");
      group.appendChild(circle);
      acumulado += fatia;
    }
    svg.appendChild(group);

    // Número total no centro da rosca.
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", cx);
    label.setAttribute("y", cy + 6);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "22");
    label.setAttribute("font-weight", "800");
    label.setAttribute("fill", "var(--cor-texto)");
    label.textContent = String(total);
    svg.appendChild(label);

    return svg;
  }

  _buildLegend(slices, total) {
    const legend = document.createElement("div");
    legend.className = "pie-chart__legend";
    for (const slice of slices) {
      const pct = Math.round((slice.value / total) * 100);
      const item = document.createElement("div");
      item.className = "pie-chart__legend-item";
      item.innerHTML = `<span class="pie-chart__dot" style="background:${slice.color}"></span>`;
      const text = document.createElement("span");
      text.textContent = `${slice.label} — ${slice.value} (${pct}%)`;
      item.appendChild(text);
      legend.appendChild(item);
    }
    return legend;
  }
}
