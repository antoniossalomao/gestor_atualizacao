/**
 * Busca de texto do jeito que uma pessoa digita: sem acento, sem maiúscula,
 * palavras em qualquer ordem.
 *
 * Nasceu no painel de Configurações e saiu de lá quando a busca de ajustes
 * virou uma lista de resultados testável fora do navegador.
 */

/**
 * Minúsculas e sem acento, dos dois lados da comparação. Sem isto, procurar
 * "aparencia" não acharia "Aparência" -- e esperar que alguém digite o acento
 * certo numa caixa de busca é esperar demais.
 * @param {unknown} texto
 */
export function normalizarBusca(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Cada palavra do termo precisa aparecer no alvo, em qualquer ordem --
 * "linha densidade" acha "Densidade das linhas". Termo vazio não casa nada:
 * quem apagou a busca quer a tela de volta, não uma lista com tudo.
 * @param {string} alvo
 * @param {string} termo
 */
export function casaBusca(alvo, termo) {
  const partes = normalizarBusca(termo).trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return false;
  const texto = normalizarBusca(alvo);
  return partes.every((parte) => texto.includes(parte));
}

/**
 * Os itens que casam com o termo, na ordem original, mais os que casam pelo
 * TÍTULO na frente. Quem digita "tema" espera "Tema" antes de "Contraste",
 * que só fala de tema na ajuda.
 * @template T
 * @param {T[]} itens
 * @param {string} termo
 * @param {(item: T) => {titulo: string, resto?: string}} textos
 * @returns {T[]}
 */
export function filtrarPorBusca(itens, termo, textos) {
  const peloTitulo = [];
  const peloResto = [];
  for (const item of itens) {
    const { titulo, resto = "" } = textos(item);
    if (casaBusca(titulo, termo)) peloTitulo.push(item);
    else if (casaBusca(`${titulo} ${resto}`, termo)) peloResto.push(item);
  }
  return [...peloTitulo, ...peloResto];
}
