import { html } from "../utils/html.js";

/**
 * Chips de "filtro ativo" acima de uma lista (hoje, a de Atualizações). O
 * rótulo repete o que a pessoa DIGITOU na busca -- é texto livre, e por isso
 * passa pela tag `html`.
 */

/**
 * Quais chips mostrar para os filtros da aba Atualizações, e com que rótulo.
 * A ação de limpar cada um fica na view (ela mexe nos campos da tela); aqui
 * sai só o `id` que a view usa para achar a ação.
 *
 * @param {{busca?: string, responsavel?: string, desde?: string, ate?: string}} filtros
 * @returns {Array<{id: "busca"|"responsavel"|"periodo", label: string}>}
 */
export function chipsFiltroAtualizacoes({ busca, responsavel, desde, ate }) {
  /** @type {Array<{id: "busca"|"responsavel"|"periodo", label: string}>} */
  const chips = [];
  if (busca) chips.push({ id: "busca", label: `Busca: "${busca}"` });
  // "Todos" é o valor do <select> quando não há filtro -- não vira chip.
  if (responsavel && responsavel !== "Todos") chips.push({ id: "responsavel", label: `Responsável: ${responsavel}` });
  if (desde || ate) {
    const periodo = desde && ate ? `${desde} a ${ate}` : desde ? `A partir de ${desde}` : `Até ${ate}`;
    chips.push({ id: "periodo", label: `Período: ${periodo}` });
  }
  return chips;
}

/** @param {Array<{id: string, label: string}>} chips */
export function htmlChips(chips) {
  return html`${chips.map(
    (c) =>
      html`<span class="filter-chip"><span>${c.label}</span><button type="button" class="filter-chip__remove" data-chip="${c.id}" aria-label="Remover filtro">✕</button></span>`
  )}`;
}
