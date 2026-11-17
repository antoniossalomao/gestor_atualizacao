/**
 * Normaliza texto para buscas sem diferenciar caixa nem acentos
 * ("joao" encontra "JOÃO", "acougue" encontra "AÇOUGUE").
 * Usado tanto em JavaScript quanto como função SQLite (`sem_acento`).
 * @param {unknown} texto
 * @returns {string}
 */
function normalizarTextoBusca(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Monta condição SQL usando `instr(sem_acento(...), @param) > 0` em várias colunas,
 * evitando surpresas com curingas `_` / `%` do `LIKE` (ex.: nomes como `B_Vendas`)
 * e ignorando acentos e maiúsculas.
 * @param {string[]} colunas
 * @param {string} [param]
 */
function clausulaBuscaSemAcento(colunas, param = "termoNorm") {
  return `(${colunas.map((col) => `instr(sem_acento(coalesce(${col}, '')), @${param}) > 0`).join(" OR ")})`;
}

module.exports = { normalizarTextoBusca, clausulaBuscaSemAcento };
