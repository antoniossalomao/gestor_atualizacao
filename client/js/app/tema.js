import { duradouras } from "./preferencias.js";

/**
 * Alternância entre tema escuro e claro.
 *
 * O app era escuro fixo. Como todas as cores já estavam declaradas como
 * variáveis CSS em `:root` (ver css/theme.css), oferecer um tema claro não
 * exigiu mexer em nenhum componente: basta redefinir as MESMAS variáveis sob
 * `[data-tema="claro"]`. Nenhum arquivo além do theme.css conhece cor
 * literal, então a troca vale para o app inteiro de uma vez.
 *
 * Três estados, não dois: "escuro", "claro" e "sistema" (segue o
 * `prefers-color-scheme` do SO, que é o padrão -- o app respeita a escolha que
 * a pessoa já fez no computador em vez de impor a dele).
 */
const MODOS = ["sistema", "escuro", "claro"];
const CHAVE = "tema";

export const temaApp = {
  /** @returns {"sistema"|"escuro"|"claro"} */
  atual() {
    const salvo = duradouras.get(CHAVE, "sistema");
    return MODOS.includes(salvo) ? salvo : "sistema";
  },

  /** Qual tema está de fato pintado na tela agora ("escuro" ou "claro"). */
  efetivo() {
    const modo = this.atual();
    if (modo !== "sistema") return modo;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "escuro";
  },

  aplicar(modo = this.atual()) {
    duradouras.set(CHAVE, modo);
    const raiz = document.documentElement;
    if (modo === "sistema") raiz.removeAttribute("data-tema");
    else raiz.setAttribute("data-tema", modo);
    // Faz o navegador pintar os controles nativos (barra de rolagem, campos
    // de data, menus de <select>) no esquema certo. Sem isto, o calendário do
    // input de data abre escuro sobre um app claro.
    raiz.style.colorScheme = this.efetivo() === "claro" ? "light" : "dark";
    document.dispatchEvent(new CustomEvent("tema:mudou", { detail: { modo, efetivo: this.efetivo() } }));
    return modo;
  },

  /** Avança para o próximo modo do ciclo e devolve qual ficou. */
  alternar() {
    const proximo = MODOS[(MODOS.indexOf(this.atual()) + 1) % MODOS.length];
    return this.aplicar(proximo);
  },

  rotulo(modo = this.atual()) {
    return { sistema: "Tema do sistema", escuro: "Tema escuro", claro: "Tema claro" }[modo];
  },
};

/**
 * Aplica o tema salvo antes de qualquer coisa aparecer na tela, e passa a
 * seguir o SO em tempo real quando o modo for "sistema" (alguns sistemas
 * trocam sozinhos ao anoitecer).
 */
export function iniciarTema() {
  temaApp.aplicar();
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (temaApp.atual() === "sistema") temaApp.aplicar("sistema");
  });
}
