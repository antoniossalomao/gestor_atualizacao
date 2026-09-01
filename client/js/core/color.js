/**
 * Mistura duas cores hexadecimais ('#rrggbb'); t=0 devolve colorA, t=1
 * devolve colorB. Usado para tingir sutilmente o fundo de uma linha de tabela
 * (ex.: "quanto mais atrasado o cliente, mais vermelho o fundo" nas abas
 * Resumo e Sistemas). Equivalente de `theme.blend_hex` no app Python.
 */
export function blendHex(colorA, colorB, t) {
  const [ra, ga, ba] = toRgb(colorA);
  const [rb, gb, bb] = toRgb(colorB);
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const b = Math.round(ba + (bb - ba) * t);
  return `rgb(${r}, ${g}, ${b})`;
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
export function limparCacheTokens() {
  cacheTokens.clear();
}

function toRgb(hex) {
  const h = String(hex).replace("#", "").trim();
  // Aceita a forma curta (#abc), que o navegador pode devolver ao ler o token.
  const cheio = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(cheio.slice(0, 2), 16) || 0, parseInt(cheio.slice(2, 4), 16) || 0, parseInt(cheio.slice(4, 6), 16) || 0];
}
