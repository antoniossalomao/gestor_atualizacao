/**
 * Uma aba do Chrome, com o vocabulário que os testes usam: clicar, digitar,
 * apertar tecla, esperar, olhar o foco. Ver chrome.mjs para o porquê do CDP
 * direto.
 *
 * Clique e teclado são eventos de ENTRADA de verdade (Input.dispatch...), não
 * `elemento.click()` via JavaScript: um botão coberto por um modal, fora da
 * tela ou desabilitado não recebe o clique -- como não receberia da pessoa.
 * É isso que pega "o botão está lá mas ninguém consegue apertar".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PASTA_FALHAS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".falhas");
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Teclas usadas pelos testes: key, code, código virtual e texto (se digita). */
const TECLAS = {
  Enter: { code: "Enter", vk: 13, text: "\r" },
  Escape: { code: "Escape", vk: 27 },
  Tab: { code: "Tab", vk: 9 },
  Backspace: { code: "Backspace", vk: 8 },
  Delete: { code: "Delete", vk: 46 },
  Space: { key: " ", code: "Space", vk: 32, text: " " },
  ArrowUp: { code: "ArrowUp", vk: 38 },
  ArrowDown: { code: "ArrowDown", vk: 40 },
  ArrowLeft: { code: "ArrowLeft", vk: 37 },
  ArrowRight: { code: "ArrowRight", vk: 39 },
  Home: { code: "Home", vk: 36 },
  End: { code: "End", vk: 35 },
};
const MODIFICADORES = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

/** Papéis que alguém aciona -- todos precisam de nome acessível. */
const PAPEIS_INTERATIVOS = new Set([
  "button", "link", "textbox", "searchbox", "combobox", "checkbox", "radio", "switch",
  "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "slider", "spinbutton", "option", "listbox",
]);

export class Pagina {
  /**
   * @param {any} cdp conexão de chrome.mjs
   * @param {string} sessao
   */
  constructor(cdp, sessao) {
    this.cdp = cdp;
    this.sessao = sessao;
    /** @type {string[]} exceções e console.error vistos na página */
    this.erros = [];
    /** @type {null | ((pedido: {url: string, method: string}) => ({status: number, corpo?: unknown} | null))} */
    this._interceptador = null;
  }

  /** Abre uma aba nova, já escutando erros de console. */
  static async abrir(cdp, { largura = 1280, altura = 900 } = {}) {
    const { targetId } = await cdp.enviar("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.enviar("Target.attachToTarget", { targetId, flatten: true });
    const pagina = new Pagina(cdp, sessionId);
    pagina.targetId = targetId;
    await pagina.enviar("Page.enable");
    await pagina.enviar("Runtime.enable");
    cdp.ouvir(sessionId, "Runtime.exceptionThrown", ({ exceptionDetails: d }) => {
      pagina.erros.push(`exceção: ${d.exception?.description || d.text}`);
    });
    cdp.ouvir(sessionId, "Runtime.consoleAPICalled", ({ type, args }) => {
      if (type === "error") pagina.erros.push(`console.error: ${args.map((a) => a.value ?? a.description).join(" ")}`);
    });
    await pagina.tamanho(largura, altura);
    return pagina;
  }

  enviar(metodo, params) {
    return this.cdp.enviar(metodo, params, this.sessao);
  }

  async fechar() {
    await this.cdp.enviar("Target.closeTarget", { targetId: this.targetId }).catch(() => {});
  }

  // ------------------------------------------------------------ navegação ---

  /** Abre a URL e espera o `load`. */
  async ir(url) {
    const carregou = new Promise((ok) => {
      const parar = this.cdp.ouvir(this.sessao, "Page.loadEventFired", () => {
        parar();
        ok();
      });
    });
    await this.enviar("Page.navigate", { url });
    await carregou;
  }

  /**
   * Roda uma função DENTRO da página e devolve o resultado (JSON). A função é
   * serializada: não enxerga variáveis do teste, só os argumentos.
   *
   * @template T
   * @param {(...args: any[]) => T | Promise<T>} fn
   * @param {...unknown} args
   * @returns {Promise<T>}
   */
  async avaliar(fn, ...args) {
    const r = await this.enviar("Runtime.evaluate", {
      expression: `(${fn.toString()})(...${JSON.stringify(args)})`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`erro na página: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    }
    return r.result.value;
  }

  /**
   * Espera até a função (rodando na página) devolver algo verdadeiro, e
   * devolve esse valor. Falha com a descrição se o tempo acabar.
   */
  async esperar(fn, { args = [], tempo = 6000, descricao = fn.toString() } = {}) {
    const fim = Date.now() + tempo;
    let ultimo;
    while (Date.now() < fim) {
      ultimo = await this.avaliar(fn, ...args).catch((e) => e);
      if (ultimo && !(ultimo instanceof Error)) return ultimo;
      await espera(50);
    }
    await this.foto(`timeout-${descricao}`);
    throw new Error(`Tempo esgotado esperando: ${descricao}${ultimo instanceof Error ? ` (${ultimo.message})` : ""}`);
  }

  /**
   * Espera um elemento visível casar com o seletor (e, se dado, com o texto).
   *
   * "Visível" inclui estar POR CIMA: se o centro dele estiver na tela, é ele
   * (ou algo dentro dele) que o mouse encontra ali. Só "existir e ter
   * tamanho" deixou passar um modal aberto atrás da gaveta -- presente no
   * DOM, invisível para quem usa (ver .modal-overlay em components.css).
   */
  esperarVisivel(seletor, { texto, tempo } = {}) {
    return this.esperar(
      (sel, txt) =>
        [...document.querySelectorAll(sel)].some((el) => {
          if (!(el instanceof HTMLElement) || el.offsetParent === null || (txt && !el.innerText.includes(txt))) return false;
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return true; // fora da tela: rolar é outro assunto
          const noPonto = document.elementFromPoint(x, y);
          return Boolean(noPonto && (el === noPonto || el.contains(noPonto)));
        }),
      { args: [seletor, texto ?? null], tempo, descricao: `visível: ${seletor}${texto ? ` com "${texto}"` : ""}` }
    );
  }

  /** Espera nenhum elemento visível casar com o seletor. */
  esperarSumir(seletor, { tempo } = {}) {
    return this.esperar(
      (sel) => ![...document.querySelectorAll(sel)].some((el) => el instanceof HTMLElement && el.offsetParent !== null),
      { args: [seletor], tempo, descricao: `sumir: ${seletor}` }
    );
  }

  /** Texto visível do primeiro elemento que casa (ou null). */
  texto(seletor) {
    return this.avaliar((sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e instanceof HTMLElement && e.offsetParent !== null);
      return el ? el.innerText.replace(/\s+/g, " ").trim() : null;
    }, seletor);
  }

  // --------------------------------------------------------------- entrada ---

  /**
   * Clique de mouse de verdade no centro do elemento visível que casar com o
   * seletor (e o texto, se dado). Falha se outro elemento estiver por cima.
   */
  async clicar(seletor, { texto } = {}) {
    // Até 3 tentativas, e só quando o clique caiu FORA do alvo: a tela ainda
    // estava se arrumando (ver abaixo). Coberto e desabilitado falham na hora.
    for (let tentativa = 1; ; tentativa++) {
      const alvo = await this.esperar(
        async (sel, txt) => {
          const el = [...document.querySelectorAll(sel)].find(
            (e) => e instanceof HTMLElement && e.offsetParent !== null && (!txt || e.innerText.includes(txt))
          );
          if (!el) return null;
          el.scrollIntoView({ block: "center", inline: "center" });
          // Parado? A troca de aba e a gaveta entram com animação, e a barra
          // de ferramentas se rearruma quando os dados chegam (o contador
          // "0 tarefas" empurra o "+ Novo Agendamento" para a linha de
          // baixo). Medido no meio disso, o clique cai onde o botão ESTAVA.
          const antes = el.getBoundingClientRect();
          await new Promise((ok) => setTimeout(ok, 120));
          await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
          const r = el.getBoundingClientRect();
          if (Math.abs(r.left - antes.left) > 0.5 || Math.abs(r.top - antes.top) > 0.5) return null;
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          const noPonto = document.elementFromPoint(x, y);
          if (!noPonto || !(el === noPonto || el.contains(noPonto))) {
            return { coberto: noPonto ? noPonto.outerHTML.slice(0, 120) : "nada" };
          }
          if (/** @type {HTMLButtonElement} */ (el).disabled) return { desabilitado: true };
          // Anota se o clique que vem a seguir acerta este elemento.
          window.__cliqueAcertou = null;
          document.addEventListener("click", (e) => (window.__cliqueAcertou = el.contains(/** @type {Node} */ (e.target))), {
            capture: true,
            once: true,
          });
          return { x, y };
        },
        { args: [seletor, texto ?? null], descricao: `clicável: ${seletor}${texto ? ` "${texto}"` : ""}` }
      );
      if (alvo.coberto) throw new Error(`${seletor}: coberto por ${alvo.coberto}`);
      if (alvo.desabilitado) throw new Error(`${seletor}: desabilitado`);
      const base = { x: alvo.x, y: alvo.y, button: "left", clickCount: 1 };
      await this.enviar("Input.dispatchMouseEvent", { type: "mouseMoved", x: alvo.x, y: alvo.y });
      await this.enviar("Input.dispatchMouseEvent", { ...base, type: "mousePressed" });
      await this.enviar("Input.dispatchMouseEvent", { ...base, type: "mouseReleased" });
      // null: nenhum "click" (o alvo sumiu no meio, ex.: um menu que fechou
      // ao receber o mousedown) -- não há o que repetir.
      if ((await this.avaliar(() => window.__cliqueAcertou)) !== false) return;
      if (tentativa >= 3) throw new Error(`${seletor}: o clique caiu fora do elemento 3 vezes (a tela não parou de se mexer)`);
    }
  }

  /** Clica no campo, apaga o que houver e digita o texto. */
  async digitar(seletor, texto, { limpar = true } = {}) {
    await this.clicar(seletor);
    if (limpar) {
      await this.avaliar((sel) => {
        const el = /** @type {HTMLInputElement} */ (document.activeElement?.matches(sel) ? document.activeElement : document.querySelector(sel));
        el.select?.();
      }, seletor);
      await this.tecla("Backspace");
    }
    if (texto) await this.enviar("Input.insertText", { text: texto });
  }

  /**
   * Aperta uma tecla ("Enter", "Escape", "Tab", "ArrowDown", uma letra...),
   * com modificadores opcionais ({shift: true}).
   */
  async tecla(nome, mods = {}) {
    const def = TECLAS[nome] || {
      code: /^[0-9]$/.test(nome) ? `Digit${nome}` : `Key${nome.toUpperCase()}`,
      vk: nome.toUpperCase().charCodeAt(0),
      text: nome,
    };
    const modifiers = Object.entries(mods).reduce((soma, [m, ligado]) => soma + (ligado ? MODIFICADORES[m] : 0), 0);
    const comum = {
      key: def.key || nome,
      code: def.code,
      windowsVirtualKeyCode: def.vk,
      nativeVirtualKeyCode: def.vk,
      modifiers,
    };
    // Com Ctrl/Alt/Meta, a tecla é atalho e não digita nada.
    const digita = def.text && !(modifiers & (MODIFICADORES.ctrl | MODIFICADORES.alt | MODIFICADORES.meta));
    await this.enviar("Input.dispatchKeyEvent", { ...comum, type: digita ? "keyDown" : "rawKeyDown", ...(digita ? { text: def.text } : {}) });
    await this.enviar("Input.dispatchKeyEvent", { ...comum, type: "keyUp" });
  }

  /** Quem está com o foco: tag, texto/rótulo e alguns atributos, para asserção e mensagem. */
  foco() {
    return this.avaliar(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return {
        tag: el.tagName.toLowerCase(),
        texto: (el.getAttribute("aria-label") || /** @type {HTMLElement} */ (el).innerText || "").replace(/\s+/g, " ").trim().slice(0, 80),
        action: el.getAttribute("data-action"),
        name: el.getAttribute("name"),
        id: el.id || null,
        dentroDe: [".drawer", ".modal", "[role=dialog]", ".sidebar", ".app-sidebar"].filter((s) => el.closest(s)),
      };
    });
  }

  /**
   * Faz a PRÓXIMA janela de "escolher arquivo" que a página abrir receber
   * este arquivo, sem janela nenhuma -- como se a pessoa o tivesse escolhido.
   * Devolve uma promessa que resolve quando o arquivo foi entregue.
   *
   * @param {string} caminho arquivo local
   */
  async escolherArquivoNaProxima(caminho) {
    await this.enviar("Page.setInterceptFileChooserDialog", { enabled: true });
    return new Promise((ok) => {
      const parar = this.cdp.ouvir(this.sessao, "Page.fileChooserOpened", async ({ backendNodeId }) => {
        parar();
        await this.enviar("DOM.setFileInputFiles", { files: [caminho], backendNodeId });
        await this.enviar("Page.setInterceptFileChooserDialog", { enabled: false });
        ok();
      });
    });
  }

  // ------------------------------------------------------------- ambiente ---

  /** Largura/altura da janela; `escala` 2 com metade da largura simula zoom de 200%. */
  async tamanho(largura, altura = 900, { escala = 1 } = {}) {
    await this.enviar("Emulation.setDeviceMetricsOverride", {
      width: largura,
      height: altura,
      deviceScaleFactor: escala,
      mobile: largura < 500,
    });
  }

  /** "claro" ou "escuro": emula a preferência do sistema, que é o padrão do app. */
  async tema(tema) {
    await this.enviar("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: tema === "escuro" ? "dark" : "light" }],
    });
  }

  /**
   * Responde no lugar do servidor os pedidos para os quais `decidir` devolver
   * algo ({status, corpo}); os demais seguem normalmente. `null` desliga.
   * É como os testes simulam falha da API no meio de um envio.
   */
  async interceptar(decidir) {
    if (!decidir) {
      this._interceptador = null;
      await this.enviar("Fetch.disable");
      return;
    }
    if (!this._pararFetch) {
      this._pararFetch = this.cdp.ouvir(this.sessao, "Fetch.requestPaused", async ({ requestId, request }) => {
        const resposta = this._interceptador?.({ url: request.url, method: request.method });
        if (!resposta) return this.enviar("Fetch.continueRequest", { requestId }).catch(() => {});
        const corpo = Buffer.from(resposta.corpo === undefined ? "" : JSON.stringify(resposta.corpo)).toString("base64");
        await this.enviar("Fetch.fulfillRequest", {
          requestId,
          responseCode: resposta.status,
          responseHeaders: [{ name: "Content-Type", value: "application/json" }],
          body: corpo,
        }).catch(() => {});
      });
    }
    this._interceptador = decidir;
    await this.enviar("Fetch.enable", { patterns: [{ urlPattern: "*/api/*" }] });
  }

  // ------------------------------------------------------------ verificação ---

  /**
   * Elementos acionáveis sem nome acessível, pela árvore de acessibilidade do
   * próprio Chrome (a mesma que o leitor de tela recebe). Checagem de APOIO:
   * pega o botão só de ícone sem aria-label e o campo sem rótulo, não julga
   * se o nome faz sentido -- isso continua sendo revisão de gente.
   */
  async semNomeAcessivel() {
    await this.enviar("Accessibility.enable");
    const { nodes } = await this.enviar("Accessibility.getFullAXTree");
    const problemas = [];
    for (const n of nodes) {
      if (n.ignored || !PAPEIS_INTERATIVOS.has(n.role?.value)) continue;
      if (String(n.name?.value ?? "").trim()) continue;
      let html = "?";
      if (n.backendDOMNodeId) {
        const { object } = await this.enviar("DOM.resolveNode", { backendNodeId: n.backendDOMNodeId }).catch(() => ({}));
        if (object?.objectId) {
          const r = await this.enviar("Runtime.callFunctionOn", {
            objectId: object.objectId,
            functionDeclaration: "function () { return this.outerHTML ? this.outerHTML.slice(0, 160) : String(this) }",
            returnByValue: true,
          });
          html = r.result.value;
        }
      }
      problemas.push(`${n.role.value}: ${html}`);
    }
    return problemas;
  }

  /** Quanto a página passa da largura da janela (0 = sem rolagem horizontal). */
  excessoHorizontal() {
    return this.avaliar(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  }

  /** Salva uma captura em navegador/.falhas/ (fora do git) para diagnóstico. */
  async foto(nome) {
    try {
      const { data } = await this.enviar("Page.captureScreenshot", { format: "png" });
      fs.mkdirSync(PASTA_FALHAS, { recursive: true });
      const arquivo = path.join(PASTA_FALHAS, `${nome.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 100)}.png`);
      fs.writeFileSync(arquivo, Buffer.from(data, "base64"));
      return arquivo;
    } catch {
      return null;
    }
  }
}
