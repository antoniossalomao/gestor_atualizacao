/**
 * Monta a cláusula ORDER BY de forma segura a partir de uma lista de
 * colunas permitidas (`sortMap`: chave pedida pelo front-end -> expressão
 * SQL de verdade). Nunca interpola `sortBy`/`sortDir` direto no SQL --
 * `sortBy` só vira SQL se for exatamente uma chave conhecida do mapa, e
 * `sortDir` só pode virar um destes dois literais fixos. Sem essa
 * checagem, um `sortBy`/`sortDir` vindos da URL (controlados por quem
 * está usando o navegador) poderiam ser usados para injetar SQL.
 *
 * @param {Record<string, string>} sortMap chave -> expressão SQL segura
 * @param {string|undefined} sortBy chave pedida (pode não existir no mapa)
 * @param {"asc"|"desc"|undefined} sortDir
 * @param {string} fallback ORDER BY completo usado quando sortBy é inválido/ausente
 * @returns {string} cláusula ORDER BY completa (sem a palavra "ORDER BY")
 */
function buildOrderBy(sortMap, sortBy, sortDir, fallback) {
  const expr = sortBy ? sortMap[sortBy] : null;
  if (!expr) return fallback;
  const dir = sortDir === "asc" ? "ASC" : "DESC";
  return `${expr} ${dir}, id DESC`;
}

module.exports = { buildOrderBy };
