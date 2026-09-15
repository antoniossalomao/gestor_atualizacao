const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Gráfico de linha em SVG puro, para série única ao longo do tempo (ex.:
 * atualizações por mês). Ocupava o lugar de um BarChart (barras horizontais)
 * antes -- bom para comparar categorias, ruim para ler evolução no tempo,
 * porque não existe um eixo esquerda->direita representando o tempo. Linha
 * resolve isso: a tendência (sobe/desce/estável) aparece de relance.
 *
 * Mesma técnica do PieChart: coordenadas num viewBox fixo, `width: 100%` no
 * CSS faz o SVG escalar com o card. Cores em `style` (não `setAttribute`)
 * porque só `style` resolve `var(--token)` -- PieChart usa hex literal via
 * tokenHex() por desenhar com `setAttribute`; aqui não precisa desse passo.
 */
let proximoId = 0;

export class LineChart {
  /** @param {HTMLElement} container */
  constructor(container, { unidade = "" } = {}) {
    this.container = container;
    this.unidade = unidade;
    this.viewW = 640;
    this.viewH = 240;
    this.padL = 42;
    this.padR = 16;
    this.padT = 24;
    this.padB = 28;
    // Sufixo único pro id do gradiente -- sem isto, duas instâncias na mesma
    // página (ou dois `render()` seguidos) colidiriam no mesmo id de <defs>.
    this.id = `linechart-${proximoId++}`;
  }

  /** @param {Array<{label: string, total: number}>} pontos */
  render(pontos) {
    this.container.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className = "line-chart";

    if (pontos.length === 0) {
      const vazio = document.createElement("p");
      vazio.className = "text-muted";
      vazio.textContent = "Nenhum dado para mostrar.";
      wrap.appendChild(vazio);
      this.container.appendChild(wrap);
      return;
    }

    const { padL, padR, padT, padB, viewW, viewH } = this;
    const plotW = viewW - padL - padR;
    const plotH = viewH - padT - padB;
    const n = pontos.length;
    const valorMax = niceMax(Math.max(0, ...pontos.map((p) => p.total)));

    const xAt = (i) => (n > 1 ? padL + (i / (n - 1)) * plotW : padL + plotW / 2);
    const yAt = (v) => padT + plotH - (valorMax > 0 ? (v / valorMax) * plotH : 0);

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${viewW} ${viewH}`);
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `Tendência ao longo do tempo. ${pontos.map((p) => `${p.label}: ${p.total}`).join(". ")}`
    );

    // Área com gradiente (forte perto da linha, sumindo perto da base) em vez
    // de um véu chapado -- um accent dessaturado (ex.: "Grafite" no painel de
    // Aparência) ainda dá pra ver, porque a força vem do degradê, não só do
    // tom da cor.
    const defs = document.createElementNS(SVG_NS, "defs");
    const gradId = `${this.id}-area`;
    const gradiente = document.createElementNS(SVG_NS, "linearGradient");
    gradiente.setAttribute("id", gradId);
    gradiente.setAttribute("x1", "0");
    gradiente.setAttribute("y1", "0");
    gradiente.setAttribute("x2", "0");
    gradiente.setAttribute("y2", "1");
    const stopTopo = document.createElementNS(SVG_NS, "stop");
    stopTopo.setAttribute("offset", "0%");
    stopTopo.setAttribute("class", "line-chart__area-topo");
    const stopBase = document.createElementNS(SVG_NS, "stop");
    stopBase.setAttribute("offset", "100%");
    stopBase.setAttribute("class", "line-chart__area-base");
    gradiente.appendChild(stopTopo);
    gradiente.appendChild(stopBase);
    defs.appendChild(gradiente);
    svg.appendChild(defs);

    // -- grade horizontal (0 / metade / topo), recessiva, atrás de tudo --
    for (const tick of [0, valorMax / 2, valorMax]) {
      const y = yAt(tick);
      const linha = document.createElementNS(SVG_NS, "line");
      linha.setAttribute("x1", String(padL));
      linha.setAttribute("x2", String(viewW - padR));
      linha.setAttribute("y1", String(y));
      linha.setAttribute("y2", String(y));
      linha.setAttribute("class", "line-chart__grade");
      svg.appendChild(linha);

      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", String(padL - 8));
      label.setAttribute("y", String(y + 3));
      label.setAttribute("text-anchor", "end");
      label.setAttribute("class", "line-chart__eixo");
      label.textContent = String(Math.round(tick));
      svg.appendChild(label);
    }

    const coords = pontos.map((p, i) => ({ x: xAt(i), y: yAt(p.total) }));
    const bezier = curvaBezier(coords);

    // -- área sob a linha, com o gradiente definido acima --
    const area = document.createElementNS(SVG_NS, "path");
    const base = yAt(0);
    area.setAttribute("d", `M ${coords[0].x},${base} L ${coords[0].x},${coords[0].y}${bezier} L ${coords[n - 1].x},${base} Z`);
    area.setAttribute("fill", `url(#${gradId})`);
    area.setAttribute("class", "line-chart__area");
    svg.appendChild(area);

    // -- a linha, suavizada (Catmull-Rom -> Bézier) -- reta ponto-a-ponto lia "picotado"; a curva lê como tendência, não planilha --
    const linhaPath = document.createElementNS(SVG_NS, "path");
    linhaPath.setAttribute("d", `M ${coords[0].x},${coords[0].y}${bezier}`);
    linhaPath.setAttribute("class", "line-chart__linha");
    svg.appendChild(linhaPath);

    // -- um ponto discreto em cada mês; o último ganha destaque + o valor ao lado (ver marks-and-anatomy: "linhas -> valor no fim") --
    for (let i = 0; i < n; i++) {
      const { x: cx, y: cy } = coords[i];
      if (i === n - 1) {
        // Halo atrás do ponto final -- dois círculos concêntricos e fracos,
        // não um <filter> de blur: mais barato e sem surpresa de recorte de
        // região do filtro perto da borda do viewBox.
        for (const [r, classe] of [[14, "line-chart__halo line-chart__halo--externo"], [9, "line-chart__halo line-chart__halo--interno"]]) {
          const halo = document.createElementNS(SVG_NS, "circle");
          halo.setAttribute("cx", String(cx));
          halo.setAttribute("cy", String(cy));
          halo.setAttribute("r", String(r));
          halo.setAttribute("class", classe);
          svg.appendChild(halo);
        }
      }
      const ponto = document.createElementNS(SVG_NS, "circle");
      ponto.setAttribute("cx", String(cx));
      ponto.setAttribute("cy", String(cy));
      ponto.setAttribute("r", i === n - 1 ? "5" : "3");
      ponto.setAttribute("class", i === n - 1 ? "line-chart__ponto line-chart__ponto--fim" : "line-chart__ponto");
      svg.appendChild(ponto);
    }

    const valorFim = document.createElementNS(SVG_NS, "text");
    valorFim.setAttribute("x", String(xAt(n - 1) - 10));
    valorFim.setAttribute("y", String(yAt(pontos[n - 1].total) - 10));
    valorFim.setAttribute("text-anchor", "end");
    valorFim.setAttribute("class", "line-chart__valor-fim");
    valorFim.textContent = String(pontos[n - 1].total);
    svg.appendChild(valorFim);

    // -- rótulos do eixo X; com muitos meses, mostra só alguns, distribuídos
    // por posição (não por "um sim um não") -- "pular de 2 em 2 e sempre
    // forçar o último" deixava os dois últimos rótulos colados quando
    // (n-1) caía num índice ímpar (ex.: 12 meses, ago/set grudados e
    // jul sumindo sem mostrar nada no lugar). Espalhados por posição, o
    // último gruda no penúltimo só se REALMENTE estiverem perto. --
    for (const i of indicesRotulo(n)) {
      const texto = document.createElementNS(SVG_NS, "text");
      texto.setAttribute("x", String(xAt(i)));
      texto.setAttribute("y", String(viewH - 6));
      texto.setAttribute("text-anchor", "middle");
      texto.setAttribute("class", "line-chart__eixo");
      texto.textContent = pontos[i].label;
      svg.appendChild(texto);
    }

    // -- camada de interação: crosshair + ponto de destaque + tooltip --
    const crosshair = document.createElementNS(SVG_NS, "line");
    crosshair.setAttribute("y1", String(padT));
    crosshair.setAttribute("y2", String(viewH - padB));
    crosshair.setAttribute("class", "line-chart__crosshair");
    svg.appendChild(crosshair);

    // O raio (0 -> 5, com transição) é definido em CSS, não aqui -- é o que
    // faz o ponto "crescer" ao aparecer em vez de só surgir pronto.
    const hoverPonto = document.createElementNS(SVG_NS, "circle");
    hoverPonto.setAttribute("class", "line-chart__ponto line-chart__ponto--hover");
    svg.appendChild(hoverPonto);

    const tooltip = document.createElement("div");
    tooltip.className = "line-chart__tooltip";
    tooltip.innerHTML = `<strong data-role="tt-valor"></strong><span data-role="tt-label"></span>`;
    const ttValor = tooltip.querySelector('[data-role="tt-valor"]');
    const ttLabel = tooltip.querySelector('[data-role="tt-label"]');

    const mostrarIndice = (i) => {
      const p = pontos[i];
      const cx = xAt(i);
      crosshair.setAttribute("x1", String(cx));
      crosshair.setAttribute("x2", String(cx));
      crosshair.classList.add("is-visivel");
      hoverPonto.setAttribute("cx", String(cx));
      hoverPonto.setAttribute("cy", String(yAt(p.total)));
      hoverPonto.classList.add("is-visivel");
      ttValor.textContent = String(p.total);
      ttLabel.textContent = p.label;
      tooltip.style.left = `${(cx / viewW) * 100}%`;
      tooltip.style.top = `${(yAt(p.total) / viewH) * 100}%`;
      tooltip.classList.add("is-visivel");
    };
    const esconder = () => {
      crosshair.classList.remove("is-visivel");
      hoverPonto.classList.remove("is-visivel");
      tooltip.classList.remove("is-visivel");
    };
    const aoMover = (e) => {
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const fracao = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const xView = fracao * viewW;
      const i = Math.min(n - 1, Math.max(0, Math.round(((xView - padL) / plotW) * (n - 1))));
      mostrarIndice(i);
    };
    svg.addEventListener("pointermove", aoMover);
    svg.addEventListener("pointerdown", aoMover);
    svg.addEventListener("pointerleave", esconder);

    wrap.appendChild(svg);
    wrap.appendChild(tooltip);
    this.container.appendChild(wrap);
  }
}

/**
 * Sequência de comandos "C" (Catmull-Rom convertido pra Bézier cúbica, tensão
 * 1/6 -- a conversão padrão) ligando cada ponto ao seguinte, SEM o "M"
 * inicial (quem chama já sabe onde a linha começa). Usa os vizinhos de cada
 * ponto pra escolher a curvatura, então a linha passa exatamente por cima de
 * cada valor real -- não é uma aproximação, só deixa de fazer cotovelo entre
 * dois segmentos retos.
 */
function curvaBezier(coords) {
  let d = "";
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] || coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/**
 * Quais índices ganham rótulo no eixo X, no máximo 6, sempre incluindo o
 * primeiro e o último -- distribuídos por POSIÇÃO (passo fixo em índice, não
 * "um a cada N"), então o espaçamento entre rótulos escolhidos fica parelho
 * mesmo quando (n-1) não é múltiplo do passo.
 */
function indicesRotulo(n) {
  const maximo = 6;
  if (n <= maximo) return Array.from({ length: n }, (_, i) => i);
  const passo = (n - 1) / (maximo - 1);
  return [...new Set(Array.from({ length: maximo }, (_, k) => Math.round(k * passo)))];
}

/** Menor número "redondo" (1/2/5/10 x uma potência de dez) que cobre `valor`. */
function niceMax(valor) {
  if (valor <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(valor)));
  const residual = valor / magnitude;
  const passo = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return passo * magnitude;
}
