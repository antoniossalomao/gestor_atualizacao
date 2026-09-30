/** Filtros de leitura da aba Sistemas; nunca alteram a versão oficial. */
export function filtrarClientesDoSistema(rows, situacao = "Todos", busca = "") {
  const normalizar = (texto) => String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const termo = normalizar(busca.trim());
  return rows.filter((row) => {
    const passaSituacao = situacao === "Todos" ||
      (situacao === "Em dia" && row.situacao === "Em dia") ||
      (situacao === "Aguardando atualização" && row.situacao === "Aguardando atualização") ||
      // Nunca atualizado é desatualizado (decisão de 30/09/2026, ver
      // services/situacaoVersao.js no servidor).
      (situacao === "Desatualizados" && ["Desatualizado", "Nunca atualizado", "Sem informação"].includes(row.situacao)) ||
      (situacao === "Sem versão oficial" && row.situacao === "Sem referência");
    return passaSituacao && (!termo || normalizar(`${row.cliente} ${row.cidade}`).includes(termo));
  });
}
