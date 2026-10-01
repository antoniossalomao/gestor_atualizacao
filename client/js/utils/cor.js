/**
 * Mistura duas cores hexadecimais ('#rrggbb'); t=0 devolve colorA, t=1
 * devolve colorB. Usado para tingir sutilmente o fundo de uma linha de tabela
 * (ex.: "quanto mais atrasado o cliente, mais vermelho o fundo" nas abas
 * Resumo e Sistemas).
 */
export function misturarHex(colorA, colorB, t) {
  const [ra, ga, ba] = toRgb(colorA);
  const [rb, gb, bb] = toRgb(colorB);
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const b = Math.round(ba + (bb - ba) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function toRgb(hex) {
  const h = String(hex).replace("#", "").trim();
  // Aceita a forma curta (#abc), que o navegador pode devolver ao ler o token.
  const cheio = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(cheio.slice(0, 2), 16) || 0, parseInt(cheio.slice(2, 4), 16) || 0, parseInt(cheio.slice(4, 6), 16) || 0];
}
