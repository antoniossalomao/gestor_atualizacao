import { icon } from "../utils/icons.js";
import { escapeHtml } from "../utils/html.js";

const MAX_RESULTADOS = 12;

/** Igual ao SAIDA_MS do Modal: acompanha `--dur-rapida`, com folga de um quadro. */
const SAIDA_MS = 140;

/**
 * Paleta de comandos (Ctrl+K / Cmd+K): um campo único que encontra qualquer
 * aba, qualquer ação global e qualquer CLIENTE cadastrado, sem tirar a mão do
 * teclado.
 *
 * O motivo de existir: o app tem nove abas e as ações principais estão
 * espalhadas entre a barra lateral, o cabeçalho e o rodapé de cada tabela.
 * Chegar em "Consultar Cliente > digitar nome > clicar no resultado" custava
 * quatro interações e exigia saber de cabeça em qual aba a coisa mora. Com a
 * paleta, é `Ctrl+K` + as primeiras letras.
 *
 * A busca é por subsequência ("cli sis" acha "Clientes / Sistemas"), com
 * pontuação: casamento no início do nome vale mais que no meio, e itens usados
 * recentemente sobem. É o mesmo comportamento de VS Code/Spotlight, que é o
 * que as pessoas já esperam de um campo assim.
 */
export class CommandPalette {
  /**
   * @param {() => Array<Comando>} comandosBase telas e ações -- disponíveis na
   *   hora, sem rede, para a paleta nunca abrir vazia enquanto a lista de
   *   clientes ainda está sendo buscada.
   * @param {() => Promise<Array<Comando>>} carregarExtras clientes cadastrados
   *   (depende da API); são acrescentados quando chegam.
   * @typedef {{id: string, titulo: string, subtitulo?: string, grupo: string, icone?: string, executar: () => void}} Comando
   */
  constructor(comandosBase, carregarExtras = async () => []) {
    this.comandosBase = comandosBase;
    this.carregarExtras = carregarExtras;
    this.aberta = false;
    this.comandos = [];
    this.filtrados = [];
    this.indiceAtivo = 0;
    /** ids executados recentemente, do mais recente para o mais antigo */
    this.recentes = [];
  }

  /** Liga o atalho global. Devolve a função que desliga (para o `destroy` do App). */
  ligarAtalho() {
    const handler = (e) => {
      const combo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
      if (!combo) return;
      e.preventDefault();
      this.aberta ? this._fechar() : this.abrir();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }

  async abrir() {
    if (this.aberta) return;
    this.aberta = true;
    this._focoAnterior = document.activeElement;

    this.overlay = document.createElement("div");
    this.overlay.className = "cmdk-overlay";
    this.overlay.innerHTML = `
      <div class="cmdk" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
        <div class="cmdk__field">
          ${icon("busca")}
          <input type="text" class="cmdk__input" role="combobox" aria-expanded="true" aria-controls="cmdk-lista"
                 aria-autocomplete="list" placeholder="Buscar telas, ações e clientes..." autocomplete="off" />
          <kbd class="cmdk__esc">Esc</kbd>
        </div>
        <div class="cmdk__list" id="cmdk-lista" role="listbox"></div>
        <div class="cmdk__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>Ctrl</kbd>+<kbd>K</kbd> fechar</span>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);
    document.body.classList.add("has-modal");

    this.input = this.overlay.querySelector(".cmdk__input");
    this.lista = this.overlay.querySelector(".cmdk__list");

    this.input.addEventListener("input", () => this._filtrar());
    this.input.addEventListener("keydown", (e) => this._teclado(e));
    this.overlay.addEventListener("mousedown", (e) => {
      if (e.target === this.overlay) this._fechar();
    });

    this.input.focus();
    // Telas e ações aparecem na hora; os clientes entram quando a API
    // responder. Assim a paleta nunca abre vazia esperando a rede -- e quem
    // já sabe o que quer ("Ctrl+K, cli, Enter") não espera nada.
    this.comandos = this.comandosBase();
    this._filtrar();

    const extras = await this.carregarExtras();
    if (!this.aberta) return;
    this.comandos = [...this.comandosBase(), ...extras];
    this._filtrar();
  }

  _fechar() {
    if (!this.aberta) return;
    this.aberta = false;
    // Sai com o mesmo fade dos modais (ver Modal._fecharComAnimacao). A paleta
    // é o que mais se abre e fecha no dia a dia, e era justamente ela que
    // desaparecia num quadro só. O `is-closing` também desliga os cliques da
    // caixa que está saindo, e a referência é solta aqui para um `abrir()`
    // logo em seguida não mexer no overlay antigo.
    const saindo = this.overlay;
    saindo?.classList.add("is-closing");
    setTimeout(() => saindo?.remove(), SAIDA_MS);
    this.overlay = null;
    document.body.classList.remove("has-modal");
    if (this._focoAnterior instanceof HTMLElement) this._focoAnterior.focus();
  }

  _filtrar() {
    const termo = this.input.value.trim().toLowerCase();
    const pontuados = [];
    for (const cmd of this.comandos) {
      const pontos = pontuar(cmd, termo, this.recentes.indexOf(cmd.id));
      if (pontos > 0) pontuados.push({ cmd, pontos });
    }
    pontuados.sort((a, b) => b.pontos - a.pontos);
    this.filtrados = pontuados.slice(0, MAX_RESULTADOS).map((p) => p.cmd);
    this.indiceAtivo = 0;
    this._render();
  }

  _render() {
    this.lista.replaceChildren();
    if (this.filtrados.length === 0) {
      this.lista.innerHTML = `<div class="cmdk__empty">Nada encontrado para "${escapeHtml(this.input.value)}".</div>`;
      return;
    }

    let grupoAtual = null;
    this.filtrados.forEach((cmd, idx) => {
      if (cmd.grupo !== grupoAtual) {
        grupoAtual = cmd.grupo;
        const cabecalho = document.createElement("div");
        cabecalho.className = "cmdk__group";
        cabecalho.textContent = cmd.grupo;
        this.lista.appendChild(cabecalho);
      }
      const item = document.createElement("div");
      item.className = "cmdk__item" + (idx === this.indiceAtivo ? " is-active" : "");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(idx === this.indiceAtivo));
      item.id = `cmdk-item-${idx}`;
      item.innerHTML = `
        <span class="cmdk__icon">${icon(cmd.icone || "seta")}</span>
        <span class="cmdk__labels">
          <strong>${escapeHtml(cmd.titulo)}</strong>
          ${cmd.subtitulo ? `<span>${escapeHtml(cmd.subtitulo)}</span>` : ""}
        </span>
      `;
      // "mousedown" e não "click": o click só chegaria depois do blur do
      // campo, e o blur já teria fechado a paleta.
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this._executar(cmd);
      });
      item.addEventListener("mousemove", () => {
        if (this.indiceAtivo === idx) return;
        this.indiceAtivo = idx;
        this._marcarAtivo();
      });
      this.lista.appendChild(item);
    });
    this.input.setAttribute("aria-activedescendant", `cmdk-item-${this.indiceAtivo}`);
  }

  _teclado(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      this._fechar();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      this.indiceAtivo = (this.indiceAtivo + 1) % Math.max(1, this.filtrados.length);
      this._marcarAtivo();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.indiceAtivo = (this.indiceAtivo - 1 + this.filtrados.length) % Math.max(1, this.filtrados.length);
      this._marcarAtivo();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = this.filtrados[this.indiceAtivo];
      if (cmd) this._executar(cmd);
    }
  }

  /**
   * Move o destaque entre dois itens, em vez de reconstruir a lista inteira.
   *
   * `_render()` descarta e recria até doze itens -- com os listeners de cada
   * um -- a cada seta apertada e a cada movimento do mouse por cima da lista.
   * Segurar a seta para baixo virava uma sequência de reconstruções, e o
   * cintilar disso aparece justamente na tela que se usa com mais pressa.
   * É o mesmo tratamento que `SortableTable._marcarSelecionada` já dá às
   * linhas de tabela: mexer só no que mudou.
   */
  _marcarAtivo() {
    const itens = this.lista.querySelectorAll(".cmdk__item");
    itens.forEach((el, i) => {
      const ativo = i === this.indiceAtivo;
      el.classList.toggle("is-active", ativo);
      el.setAttribute("aria-selected", String(ativo));
    });
    // Com a busca sem resultado não há item nenhum: apontar o
    // `aria-activedescendant` para um id que não existe faz o leitor de tela
    // anunciar um item fantasma.
    if (itens.length > 0) this.input.setAttribute("aria-activedescendant", `cmdk-item-${this.indiceAtivo}`);
    else this.input.removeAttribute("aria-activedescendant");
    this._rolarAteAtivo();
  }

  _rolarAteAtivo() {
    this.lista.querySelector(".cmdk__item.is-active")?.scrollIntoView({ block: "nearest" });
  }

  _executar(cmd) {
    // Guarda os oito últimos: é o que faz "o que eu uso sempre" subir no topo
    // sem precisar digitar nada.
    this.recentes = [cmd.id, ...this.recentes.filter((id) => id !== cmd.id)].slice(0, 8);
    this._fechar();
    cmd.executar();
  }
}

/**
 * Pontua um comando contra o termo digitado.
 * 0 = não casa. Quanto maior, mais alto na lista.
 */
function pontuar(cmd, termo, posicaoRecente) {
  const bonusRecente = posicaoRecente >= 0 ? 40 - posicaoRecente : 0;
  if (!termo) return 10 + bonusRecente;

  const alvo = `${cmd.titulo} ${cmd.subtitulo || ""} ${cmd.grupo}`.toLowerCase();
  const titulo = cmd.titulo.toLowerCase();

  if (titulo.startsWith(termo)) return 1000 + bonusRecente;
  if (titulo.includes(termo)) return 700 + bonusRecente;
  if (alvo.includes(termo)) return 400 + bonusRecente;

  // Subsequência: "cls" casa com "CLienteS". Vale menos que um trecho
  // literal, mas é o que permite digitar só as consoantes.
  let i = 0;
  for (const letra of alvo) {
    if (letra === termo[i]) i += 1;
    if (i === termo.length) return 150 + bonusRecente;
  }
  return 0;
}
