const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Gráfico de rosca (donut) em SVG puro, com o total no miolo e uma legenda
 * que também é tabela. Equivalente do gráfico de pizza desenhado à mão em
 * `tk.Canvas` na tela de Resumo do app original -- aqui é SVG em vez de pixels
 * desenhados na unha, então fica nítido em qualquer tela e redimensiona
 * sozinho.
 *
 * Técnica usada: cada fatia é um `<circle>` com `stroke-dasharray` cobrindo
 * só uma parte do contorno (o resto fica transparente) -- um jeito comum e
 * leve de fazer gráfico de rosca em SVG, sem depender de biblioteca externa.
 *
 * O que mudou em relação à primeira versão, e por quê:
 *
 *  - **empilha em vez de ficar lado a lado.** A rosca era um bloco de 148px
 *    com a legenda à direita, dentro de um card que ocupava a largura inteira
 *    da tela: sobravam uns 900px de card vazio à direita de um gráfico
 *    pequeno. O card mudou de lugar (ver ResumoView) e passou a ser uma
 *    coluna estreita; a rosca agora cresce até a largura que tiver e a
 *    legenda desce para baixo dela, que é o arranjo certo para coluna.
 *  - **a legenda ganhou número e porcentagem alinhados à direita**, em vez de
 *    uma frase corrida ("Em dia — 186 (50%)"). Duas categorias com os valores
 *    na mesma coluna se comparam de relance; dentro de uma frase, não.
 *  - **`viewBox` sem `width`/`height` fixos.** Era o que prendia a rosca em
 *    148px independentemente do espaço disponível.
 */
export class PieChart {
  /**
   * @param {HTMLElement} container
   * @param {{tamanhoMax?: number, espessura?: number, unidade?: string}} [opts]
   *   `unidade` é a palavrinha embaixo do total no miolo ("clientes"). Sem
   *   ela o número central é só um número grande -- e um número grande sem
   *   substantivo é a coisa mais fácil de ler errado num painel.
   */
  constructor(container, { tamanhoMax = 190, espessura = 22, unidade = "" } = {}) {
    this.container = container;
    this.tamanhoMax = tamanhoMax;
    this.espessura = espessura;
    this.unidade = unidade;
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
    const lado = 200; // só a unidade do sistema de coordenadas; o CSS dá o tamanho real
    const espessura = this.espessura;
    const r = (lado - espessura) / 2;
    const centro = lado / 2;
    const circunferencia = 2 * Math.PI * r;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${lado} ${lado}`);
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      // A rosca desenhada é invisível para quem usa leitor de tela, e a legenda
      // abaixo é uma lista de itens soltos. Esta frase é o gráfico dito em voz
      // alta, de uma vez.
      `Total de ${total}. ` +
        slices
          .filter((s) => s.value > 0)
          .map((s) => `${s.label}: ${s.value}, ${Math.round((s.value / total) * 100)}%`)
          .join(". ")
    );
    svg.style.maxWidth = `${this.tamanhoMax}px`;

    // Trilha de fundo (mostra o círculo completo antes de desenhar as fatias por cima).
    const track = document.createElementNS(SVG_NS, "circle");
    track.setAttribute("cx", centro);
    track.setAttribute("cy", centro);
    track.setAttribute("r", r);
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "var(--cor-borda)");
    track.setAttribute("stroke-width", espessura);
    svg.appendChild(track);

    // Gira o grupo -90° para a primeira fatia começar no topo (12h) em vez
    // de à direita (3h, posição padrão em que o SVG desenha um círculo).
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("transform", `rotate(-90 ${centro} ${centro})`);

    const visiveis = slices.filter((s) => s.value > 0);
    let acumulado = 0;
    for (const slice of visiveis) {
      const fatia = (slice.value / total) * circunferencia;
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", centro);
      circle.setAttribute("cy", centro);
      circle.setAttribute("r", r);
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", slice.color);
      circle.setAttribute("stroke-width", espessura);
      circle.setAttribute("stroke-dasharray", `${fatia} ${circunferencia - fatia}`);
      circle.setAttribute("stroke-dashoffset", String(-acumulado));
      circle.setAttribute("stroke-linecap", visiveis.length > 1 ? "butt" : "round");
      group.appendChild(circle);
      acumulado += fatia;
    }
    svg.appendChild(group);

    // Total no miolo. `aria-hidden` porque o número já está na frase acima --
    // sem isso o leitor de tela leria "373" solto logo depois de tê-lo dito
    // dentro da descrição inteira.
    const numero = document.createElementNS(SVG_NS, "text");
    numero.setAttribute("x", centro);
    numero.setAttribute("y", this.unidade ? centro : centro + 11);
    numero.setAttribute("text-anchor", "middle");
    numero.setAttribute("class", "pie-chart__total");
    numero.setAttribute("aria-hidden", "true");
    numero.textContent = String(total);
    svg.appendChild(numero);

    if (this.unidade) {
      const unidade = document.createElementNS(SVG_NS, "text");
      unidade.setAttribute("x", centro);
      unidade.setAttribute("y", centro + 22);
      unidade.setAttribute("text-anchor", "middle");
      unidade.setAttribute("class", "pie-chart__unidade");
      unidade.setAttribute("aria-hidden", "true");
      unidade.textContent = this.unidade;
      svg.appendChild(unidade);
    }

    return svg;
  }

  _buildLegend(slices, total) {
    const legend = document.createElement("div");
    legend.className = "pie-chart__legend";
    legend.setAttribute("aria-hidden", "true"); // já dito pelo aria-label do SVG

    for (const slice of slices) {
      const pct = Math.round((slice.value / total) * 100);
      const item = document.createElement("div");
      item.className = "pie-chart__legend-item";
      item.innerHTML = `
        <span class="pie-chart__dot"></span>
        <span class="pie-chart__nome"></span>
        <span class="pie-chart__valor"><strong></strong><small></small></span>
      `;
      item.querySelector(".pie-chart__dot").style.background = slice.color;
      item.querySelector(".pie-chart__nome").textContent = slice.label;
      item.querySelector(".pie-chart__valor strong").textContent = String(slice.value);
      item.querySelector(".pie-chart__valor small").textContent = `${pct}%`;
      legend.appendChild(item);
    }
    return legend;
  }
}
