import { escaparHtml } from "./html.js";
import { normalizarBusca, casaBusca } from "./busca.js";

/**
 * Filtra sugestões ignorando acentos e maiúsculas: quem COMEÇA com o termo
 * vem antes de quem apenas contém, e buscas com várias palavras também acham
 * termos fora de ordem contígua.
 * @param {string[]} values
 * @param {string} digitado
 * @param {number} [limite]
 * @returns {string[]}
 */
export function filtrarSugestoes(values, digitado, limite = 30) {
  const termo = normalizarBusca(digitado).trim().replace(/\s+/g, " ");
  if (!termo) return [];
  const multi = termo.includes(" ");
  const comeca = [];
  const contem = [];
  const palavras = [];

  for (const v of values || []) {
    const alvo = normalizarBusca(v).trim();
    if (alvo.startsWith(termo)) comeca.push(v);
    else if (alvo.includes(termo)) contem.push(v);
    else if (multi && casaBusca(v, termo)) palavras.push(v);
  }
  return [...comeca, ...contem, ...palavras].slice(0, limite);
}

/** Mapeia o texto normalizado para os intervalos `[inicio, fim)` da string original. */
function mapearIndicesNormalizados(texto) {
  let norm = "";
  /** @type {Array<[number, number]>} */
  const mapa = [];
  let offset = 0;
  for (const ch of texto) {
    const pedaco = normalizarBusca(ch);
    for (let j = 0; j < pedaco.length; j += 1) {
      norm += pedaco[j];
      mapa.push([offset, offset + ch.length]);
    }
    offset += ch.length;
  }
  return { norm, mapa };
}

/**
 * Envolve em `<mark>` o trecho que casou com o termo digitado, preservando
 * acentos originais e escapando HTML.
 * @param {string} valor
 * @param {string} digitado
 * @returns {string}
 */
export function destacarTrecho(valor, digitado) {
  const texto = String(valor ?? "");
  const termo = normalizarBusca(digitado).trim().replace(/\s+/g, " ");
  if (!termo) return escaparHtml(texto);

  const { norm, mapa } = mapearIndicesNormalizados(texto);
  /** @type {Array<[number, number]>} */
  const intervalos = [];

  const posExata = norm.indexOf(termo);
  if (posExata >= 0) {
    intervalos.push([mapa[posExata][0], mapa[posExata + termo.length - 1][1]]);
  } else {
    for (const parte of termo.split(" ").filter(Boolean)) {
      const pos = norm.indexOf(parte);
      if (pos >= 0) intervalos.push([mapa[pos][0], mapa[pos + parte.length - 1][1]]);
    }
  }

  if (intervalos.length === 0) return escaparHtml(texto);

  intervalos.sort((a, b) => a[0] - b[0]);
  /** @type {Array<[number, number]>} */
  const mesclados = [];
  for (const [ini, fim] of intervalos) {
    const anterior = mesclados[mesclados.length - 1];
    if (anterior && ini <= anterior[1]) anterior[1] = Math.max(anterior[1], fim);
    else mesclados.push([ini, fim]);
  }

  let out = "";
  let cursor = 0;
  for (const [ini, fim] of mesclados) {
    if (ini > cursor) out += escaparHtml(texto.slice(cursor, ini));
    out += `<mark>${escaparHtml(texto.slice(ini, fim))}</mark>`;
    cursor = fim;
  }
  if (cursor < texto.length) out += escaparHtml(texto.slice(cursor));
  return out;
}
