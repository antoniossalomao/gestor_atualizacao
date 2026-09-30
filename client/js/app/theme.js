import { settings } from "./prefs.js";

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

export const theme = {
  /** @returns {"sistema"|"escuro"|"claro"} */
  atual() {
    const salvo = settings.get(CHAVE, "sistema");
    return MODOS.includes(salvo) ? salvo : "sistema";
  },

  /** Qual tema está de fato pintado na tela agora ("escuro" ou "claro"). */
  efetivo() {
    const modo = this.atual();
    if (modo !== "sistema") return modo;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "escuro";
  },

  aplicar(modo = this.atual()) {
    settings.set(CHAVE, modo);
    const raiz = document.documentElement;
    if (modo === "sistema") raiz.removeAttribute("data-tema");
    else raiz.setAttribute("data-tema", modo);
    // Faz o navegador pintar os controles nativos (barra de rolagem, campos
    // de data, menus de <select>) no esquema certo. Sem isto, o calendário do
    // input de data abre escuro sobre um app claro.
    raiz.style.colorScheme = this.efetivo() === "claro" ? "light" : "dark";
    // As cores lidas em JavaScript (fundo tingido das linhas de tabela)
    // ficam memorizadas por tema -- trocar de tema invalida essa memória,
    // senão as linhas continuariam pintadas com a paleta anterior.
    limparCacheTokens();
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
  theme.aplicar();
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (theme.atual() === "sistema") theme.aplicar("sistema");
  });
}

/**
 * Lê o valor atual de uma variável CSS de tema (ex.: `--zebra-a`).
 *
 * Existe porque `blendHex` faz conta com números e não consegue misturar uma
 * `var(--cor-x)` diretamente. Antes, as views que tingem linhas resolviam
 * isso copiando os hex do tema para dentro do JavaScript (`const ZEBRA =
 * ["#101218", "#15171f"]`) -- o que quebrou no momento em que existiu um
 * segundo tema: as linhas continuavam sendo pintadas com o cinza do tema
 * escuro por cima do fundo branco do tema claro.
 *
 * Lendo o token em tempo de execução, a mesma função serve aos dois temas.
 * O resultado é memorizado por tema, porque `getComputedStyle` força o
 * navegador a recalcular estilo e chamá-lo uma vez por linha de tabela seria
 * caro.
 */
const cacheTokens = new Map();

export function tokenHex(nome) {
  const tema = document.documentElement.getAttribute("data-tema") || "auto";
  const chave = `${tema}:${nome}`;
  if (cacheTokens.has(chave)) return cacheTokens.get(chave);
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || "#000000";
  cacheTokens.set(chave, valor);
  return valor;
}

/** Esquece os valores lidos -- chamado quando o tema muda. */
function limparCacheTokens() {
  cacheTokens.clear();
}
