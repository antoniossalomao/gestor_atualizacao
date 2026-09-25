/** Filtros de leitura da aba Sistemas; nunca alteram a versão oficial. */
export function filtrarClientesDoSistema(rows, situacao = "Todos", busca = "") {
  const normalizar = (texto) => String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const termo = normalizar(busca.trim());
  return rows.filter((row) => {
    const passaSituacao = situacao === "Todos" ||
      (situacao === "Em dia" && row.situacao === "Em dia") ||
      (situacao === "Desatualizados" && row.situacao === "Desatualizado") ||
      (situacao === "Sem informação" && ["Nunca atualizado", "Sem referência", "Sem informação"].includes(row.situacao));
    return passaSituacao && (!termo || normalizar(`${row.cliente} ${row.cidade}`).includes(termo));
  });
}
