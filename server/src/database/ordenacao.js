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
  // `Object.hasOwn` + checagem de tipo, e nao `sortMap[sortBy]` direto: o acesso
  // por indice a um objeto literal tambem alcanca o que ele HERDA de Object
  // ("constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"). Todos
  // esses devolvem valor "truthy", passavam pela checagem `if (!expr)` e eram
  // interpolados no SQL:
  //
  //     ?sortBy=constructor  ->  ORDER BY function Object() { [native code] } ASC
  //
  // Nao e' injecao -- nada que o atacante escreve chega ao SQL --, mas e' SQL
  // invalido: a consulta lanca, e qualquer pessoa logada derrubava com 500 toda
  // listagem paginada mudando um parametro na barra de endereco. Encontrado ao
  // escrever o teste desta funcao (tests/shared.test.js).
  const expr = typeof sortBy === "string" && Object.hasOwn(sortMap, sortBy) ? sortMap[sortBy] : null;
  if (typeof expr !== "string" || !expr) return fallback;
  const dir = sortDir === "asc" ? "ASC" : "DESC";
  return `${expr} ${dir}, id DESC`;
}

module.exports = { buildOrderBy };
