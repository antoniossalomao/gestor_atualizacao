const PAGE_SIZE_PADRAO = 50;
const PAGE_SIZE_MAXIMO = 200;

/**
 * Lê "page"/"pageSize"/"sortBy"/"sortDir" da query string de forma segura
 * (números inteiros positivos, "pageSize" com um teto máximo, "sortDir"
 * restrito a "asc"/"desc"). Sem o teto em "pageSize", alguém poderia pedir
 * `?pageSize=999999999` e forçar o servidor a montar uma resposta gigante
 * de propósito. "sortBy" em si não precisa ser validado aqui -- cada
 * repositório só aceita chaves de uma lista própria (ver
 * shared/sortHelper.js), então um valor desconhecido simplesmente cai
 * na ordenação padrão, sem risco de virar SQL.
 */
function parsePaginacao(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAXIMO, Math.max(1, parseInt(query.pageSize, 10) || PAGE_SIZE_PADRAO));
  const sortBy = typeof query.sortBy === "string" ? query.sortBy : undefined;
  const sortDir = query.sortDir === "asc" ? "asc" : "desc";
  return { page, pageSize, sortBy, sortDir };
}

module.exports = { parsePaginacao };
