const SVG_NS = "http://www.w3.org/2000/svg";
let proximoId = 0;

/** Doze meses de atendimentos; pontos reais unidos por retas, sem picos artificiais. */
export class LineChart {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.container = container;
    this.id = `linechart-${proximoId++}`;
    this.pontos = [];
    this.maxRotulos = 0;
    this.renderWidth = 0;
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => {
        const largura = this._larguraGrafico();
        if (this.pontos.length && largura !== this.renderWidth) this.render(this.pontos);
      });
      this.observer.observe(container);
    }
  }

  _larguraGrafico() {
    const estilo = getComputedStyle(this.container);
    const padding = parseFloat(estilo.paddingLeft) + parseFloat(estilo.paddingRight);
    return Math.max(280, Math.round((this.container.clientWidth || 640) - padding));
  }

  _maxRotulos(largura) {
    return largura < 340 ? 3 : largura < 520 ? 4 : 6;
  }

  /** @param {Array<{label: string, total: number, parcial?: boolean}>} pontos */
  render(pontos) {
    this.pontos = pontos;
    const W = this._larguraGrafico();
    this.renderWidth = W;
    this.maxRotulos = this._maxRotulos(W);
    this.container.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className = "line-chart";
    this.container.appendChild(wrap);
    if (!pontos.length) {
      const vazio = document.createElement("p");
      vazio.className = "text-muted";
      vazio.textContent = "Nenhum dado para mostrar.";
      wrap.appendChild(vazio);
      return;
    }

    const H = 220, L = 37, R = 18, T = 23, B = 32;
    const plotW = W - L - R, plotH = H - T - B;
    const maximo = Math.max(0, ...pontos.map((p) => p.total));
    const teto = niceMax(maximo * 1.12);
    const xAt = (i) => pontos.length > 1 ? L + i * plotW / (pontos.length - 1) : L + plotW / 2;
    const yAt = (v) => T + plotH - v * plotH / teto;
    const coords = pontos.map((p, i) => ({ x: xAt(i), y: yAt(p.total) }));
    const base = yAt(0);

    const svg = elemento("svg", { viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "Tendência mensal de atendimentos" });
    const defs = elemento("defs");
    const gradiente = elemento("linearGradient", { id: `${this.id}-area`, x1: "0", y1: "0", x2: "0", y2: "1" });
    gradiente.append(elemento("stop", { offset: "0%", class: "line-chart__area-topo" }), elemento("stop", { offset: "100%", class: "line-chart__area-base" }));
    defs.appendChild(gradiente);
    svg.appendChild(defs);

    const ticks = maximo === 0 ? [0, 1] : [...new Set([0, Math.round(teto / 2), teto])];
    for (const tick of ticks) {
      const y = yAt(tick);
      svg.appendChild(elemento("line", { x1: L, x2: W - R, y1: y, y2: y, class: "line-chart__grade" }));
      const rotulo = elemento("text", { x: L - 8, y: y + 3, "text-anchor": "end", class: "line-chart__eixo" });
      rotulo.textContent = String(tick);
      svg.appendChild(rotulo);
    }

    const caminho = coords.map((p, i) => `${i ? "L" : "M"} ${p.x},${p.y}`).join(" ");
    svg.appendChild(elemento("path", { d: `M ${coords[0].x},${base} ${caminho.replace(/^M/, "L")} L ${coords.at(-1).x},${base} Z`, fill: `url(#${this.id}-area)`, class: "line-chart__area" }));
    svg.appendChild(elemento("path", { d: caminho, class: "line-chart__linha" }));

    const crosshair = elemento("line", { y1: T, y2: base, class: "line-chart__crosshair" });
    svg.appendChild(crosshair);
    const destaque = elemento("circle", { r: 5, class: "line-chart__ponto line-chart__ponto--destaque" });
    svg.appendChild(destaque);

    const tooltip = document.createElement("div");
    tooltip.className = "line-chart__tooltip";
    tooltip.setAttribute("aria-live", "polite");
    const valor = document.createElement("strong");
    const mes = document.createElement("span");
    tooltip.append(valor, mes);

    const mostrar = (i) => {
      const ponto = pontos[i], { x, y } = coords[i];
      crosshair.setAttribute("x1", String(x));
      crosshair.setAttribute("x2", String(x));
      crosshair.classList.add("is-visivel");
      destaque.setAttribute("cx", String(x));
      destaque.setAttribute("cy", String(y));
      destaque.classList.add("is-visivel");
      valor.textContent = `${ponto.total} ${ponto.total === 1 ? "atendimento" : "atendimentos"}`;
      mes.textContent = `${ponto.label}${ponto.parcial ? " · mês em andamento" : ""}`;
      tooltip.classList.add("is-visivel");
    };
    const esconder = () => {
      crosshair.classList.remove("is-visivel");
      destaque.classList.remove("is-visivel");
      tooltip.classList.remove("is-visivel");
    };

    const focaveis = [];
    pontos.forEach((p, i) => {
      const { x, y } = coords[i];
      const ponto = elemento("circle", {
        cx: x, cy: y, r: i === pontos.length - 1 ? 5 : 3.5,
        class: i === pontos.length - 1 ? "line-chart__ponto line-chart__ponto--fim" : "line-chart__ponto",
        tabindex: "0", role: "button", "aria-label": `${p.label}: ${p.total} ${p.total === 1 ? "atendimento" : "atendimentos"}${p.parcial ? ", mês em andamento" : ""}`,
      });
      ponto.addEventListener("focus", () => mostrar(i));
      ponto.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          focaveis[Math.max(0, Math.min(focaveis.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))].focus();
        }
        if (e.key === "Escape") esconder();
      });
      focaveis.push(ponto);
      svg.appendChild(ponto);
    });

    for (const i of indicesRotulo(pontos.length, this.maxRotulos)) {
      const rotulo = elemento("text", { x: xAt(i), y: H - 5, "text-anchor": i === 0 ? "start" : i === pontos.length - 1 ? "end" : "middle", class: "line-chart__eixo" });
      rotulo.textContent = pontos[i].label;
      svg.appendChild(rotulo);
    }

    svg.addEventListener("pointermove", (e) => {
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * W;
      const i = Math.round((x - L) / plotW * (pontos.length - 1));
      mostrar(Math.max(0, Math.min(pontos.length - 1, i)));
    });
    svg.addEventListener("pointerdown", (e) => {
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * W;
      mostrar(Math.max(0, Math.min(pontos.length - 1, Math.round((x - L) / plotW * (pontos.length - 1)))));
    });
    svg.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") esconder(); });
    svg.addEventListener("focusout", (e) => { if (!svg.contains(e.relatedTarget)) esconder(); });
    wrap.append(svg, tooltip);

    const detalhes = document.createElement("details");
    detalhes.className = "line-chart__dados";
    const resumo = document.createElement("summary");
    resumo.textContent = `Ver valores dos ${pontos.length} meses`;
    const lista = document.createElement("ol");
    pontos.forEach((p) => {
      const item = document.createElement("li");
      item.textContent = `${p.label}: ${p.total} ${p.total === 1 ? "atendimento" : "atendimentos"}${p.parcial ? " (mês em andamento)" : ""}`;
      lista.appendChild(item);
    });
    detalhes.append(resumo, lista);
    wrap.appendChild(detalhes);
  }

  destroy() { this.observer?.disconnect(); }
}

function elemento(nome, atributos = {}) {
  const el = document.createElementNS(SVG_NS, nome);
  for (const [chave, valor] of Object.entries(atributos)) el.setAttribute(chave, String(valor));
  return el;
}

function indicesRotulo(n, limite) {
  if (n <= limite) return Array.from({ length: n }, (_, i) => i);
  return [...new Set(Array.from({ length: limite }, (_, i) => Math.round(i * (n - 1) / (limite - 1))))];
}

function niceMax(valor) {
  if (valor <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(valor));
  const residual = valor / magnitude;
  return (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
}
