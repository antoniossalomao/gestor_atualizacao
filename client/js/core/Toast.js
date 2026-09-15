import { icon } from "./icons.js";

const DURACAO_MS = 4000;
const DURACAO_ACAO_MS = 7000;
const SAIDA_MS = 180;

/**
 * Um ícone por natureza de aviso.
 *
 * Antes o tipo do toast era comunicado SÓ pela cor da barrinha lateral --
 * verde, vermelho, azul. Cor sozinha é o pior jeito de dizer algo importante:
 * uma parte das pessoas não distingue verde de vermelho, e no canto da tela,
 * de relance, três barras finas de cores próximas parecem a mesma coisa. Com o
 * ícone, "deu certo" e "deu errado" têm formas diferentes.
 */
const ICONES = { success: "check", error: "alerta", info: "relogio" };

/**
 * Avisos rápidos no canto da tela ("Registro salvo.", etc.), sem travar a
 * interação -- equivalente de `widgets.show_toast` no app Tkinter original.
 *
 * O que mudou em relação à primeira versão, e por quê:
 *
 *  - **Fecha com animação** em vez de sumir do DOM de uma vez. Um elemento que
 *    desaparece instantaneamente é lido como "piscou/bugou"; deslizar para
 *    fora em 180ms é lido como "terminou".
 *  - **Botão de fechar** e **pausa ao passar o mouse**: 2.4s não davam tempo de
 *    ler uma mensagem de erro comprida, e não havia como segurar ela na tela.
 *  - **Não duplica**: dois toasts com o mesmo texto viram um só com contador
 *    ("2×"). Importar uma planilha grande disparava a mesma mensagem várias
 *    vezes, empilhando lixo no canto.
 *  - **Ação de desfazer**: `toast.undo(texto, fn)` mostra um botão "Desfazer".
 *    É o que substituiu o modal de confirmação em toda exclusão -- confirmar
 *    no automático não protege ninguém, poder voltar atrás protege.
 */
export class ToastManager {
  constructor() {
    this.stack = document.getElementById("toast-stack");
    /** @type {Map<string, {el: HTMLElement, n: number, timer: number}>} */
    this.ativos = new Map();
  }

  /**
   * @param {string} message
   * @param {"success"|"error"|"info"} kind
   * @param {{acao?: {label: string, onClick: () => void}, duracao?: number}} [opts]
   */
  show(message, kind = "success", opts = {}) {
    const chave = `${kind}:${message}`;
    const existente = this.ativos.get(chave);
    // Mesma mensagem repetida vira um contador, em vez de N caixas idênticas.
    if (existente && !opts.acao) {
      existente.n += 1;
      existente.el.querySelector(".toast__count").textContent = `${existente.n}×`;
      existente.el.querySelector(".toast__count").hidden = false;
      this._agendarSaida(chave, opts.duracao || DURACAO_MS);
      return;
    }

    const el = document.createElement("div");
    el.className = `toast toast--${kind}`;
    el.setAttribute("role", kind === "error" ? "alert" : "status");

    const marca = document.createElement("span");
    marca.className = "toast__icon";
    marca.setAttribute("aria-hidden", "true");
    marca.innerHTML = icon(ICONES[kind] || "relogio");

    const texto = document.createElement("span");
    texto.className = "toast__text";
    texto.textContent = message;

    const contador = document.createElement("span");
    contador.className = "toast__count";
    contador.hidden = true;

    el.append(marca, texto, contador);

    if (opts.acao) {
      const botaoAcao = document.createElement("button");
      botaoAcao.type = "button";
      botaoAcao.className = "toast__action";
      botaoAcao.textContent = opts.acao.label;
      botaoAcao.addEventListener("click", () => {
        opts.acao.onClick();
        this._remover(chave);
      });
      el.appendChild(botaoAcao);
    }

    const fechar = document.createElement("button");
    fechar.type = "button";
    fechar.className = "toast__close";
    fechar.setAttribute("aria-label", "Fechar aviso");
    fechar.textContent = "✕";
    fechar.addEventListener("click", () => this._remover(chave));
    el.appendChild(fechar);

    // Ler uma mensagem exige que ela pare de correr contra o relógio: com o
    // mouse em cima -- ou com o teclado dentro dela --, o toast fica.
    //
    // O `focusin` não é detalhe: o toast de "Desfazer" é alcançável por Tab, e
    // sem isto ele podia sumir com o foco DENTRO dele, jogando o foco de volta
    // para o começo da página no meio da ação que a pessoa ia desfazer.
    const segurar = () => clearTimeout(this.ativos.get(chave)?.timer);
    // Devolve a duração ORIGINAL, e não a padrão. O toast com "Desfazer" vive
    // mais tempo de propósito (`DURACAO_ACAO_MS`): passar o mouse por cima dele
    // e sair encurtava a janela de desfazer para a de um aviso comum -- ou
    // seja, o gesto de ir até o botão era o que tirava tempo de usá-lo.
    const soltar = () => this._agendarSaida(chave, this.ativos.get(chave)?.duracao || DURACAO_MS);
    el.addEventListener("mouseenter", segurar);
    el.addEventListener("mouseleave", soltar);
    el.addEventListener("focusin", segurar);
    el.addEventListener("focusout", soltar);

    const duracao = opts.duracao || (opts.acao ? DURACAO_ACAO_MS : DURACAO_MS);
    this.stack.appendChild(el);
    this.ativos.set(chave, { el, n: 1, timer: 0, duracao });
    this._agendarSaida(chave, duracao);
  }

  success(message, opts) {
    this.show(message, "success", opts);
  }

  error(message, opts) {
    this.show(message, "error", opts);
  }

  info(message, opts) {
    this.show(message, "info", opts);
  }

  /**
   * Aviso com botão "Desfazer". Usado no lugar do modal de confirmação das
   * exclusões: a ação acontece na hora (rápido) e fica reversível por alguns
   * segundos (seguro).
   */
  undo(message, onUndo, label = "Desfazer") {
    this.show(message, "info", { acao: { label, onClick: onUndo } });
  }

  _agendarSaida(chave, ms) {
    const entrada = this.ativos.get(chave);
    if (!entrada) return;
    clearTimeout(entrada.timer);
    entrada.timer = setTimeout(() => this._remover(chave), ms);
  }

  _remover(chave) {
    const entrada = this.ativos.get(chave);
    if (!entrada) return;
    clearTimeout(entrada.timer);
    this.ativos.delete(chave);
    entrada.el.classList.add("is-leaving");
    setTimeout(() => entrada.el.remove(), SAIDA_MS);
  }
}

export const toast = new ToastManager();
