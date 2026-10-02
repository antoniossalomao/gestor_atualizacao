/*
 * Regras de tela das Campanhas de atualização, sem DOM (testáveis no Node).
 *
 * Quem decide se um cliente está atendido é o servidor
 * (server/src/services/CampanhaService.js); aqui só se filtra e se descreve
 * o que ele devolveu. Recalcular a situação no navegador seria um segundo
 * lugar para a regra divergir.
 */

/** Filtros rápidos da tabela, na ordem em que aparecem. */
export const FILTROS_CAMPANHA = [
  { chave: "pendente", rotulo: "Pendentes" },
  { chave: "agendado", rotulo: "Já agendados" },
  { chave: "concluido", rotulo: "Concluídos" },
  { chave: "todos", rotulo: "Todos" },
];

/** Rótulo e severidade (as mesmas cores do card de situação do Resumo). */
export const SITUACAO_CAMPANHA = {
  concluido: { rotulo: "Concluído", severidade: "boa" },
  agendado: { rotulo: "Já agendado", severidade: "media" },
  pendente: { rotulo: "Pendente", severidade: "alta" },
};

/**
 * Clientes de um filtro rápido, com busca por nome, código ou cidade.
 * Não reordena nem altera as linhas.
 * @template {{nome: string, codigo?: string, cidade?: string, situacao: string}} T
 * @param {T[]} clientes
 * @param {string} filtro
 * @param {string} [busca]
 * @returns {T[]}
 */
export function filtrarClientesCampanha(clientes, filtro, busca = "") {
  return buscarClientes(clientes.filter((c) => filtro === "todos" || c.situacao === filtro), busca);
}

/**
 * Busca por nome, código ou cidade, sem acento nem caixa. Serve à tabela da
 * campanha e à lista onde se escolhem os clientes dela.
 * @template {{nome: string, codigo?: string, cidade?: string}} T
 * @param {T[]} clientes
 * @param {string} [busca]
 * @returns {T[]}
 */
export function buscarClientes(clientes, busca = "") {
  const termo = normalizar(busca);
  if (!termo) return clientes;
  return clientes.filter((c) => [c.nome, c.codigo, c.cidade].some((v) => normalizar(v).includes(termo)));
}

/** @typedef {{busca: string, cidade: string, grupo: string, regime: string, soQuemFalta: boolean}} FiltrosEscolha */

/**
 * Estado inicial dos filtros da lista de escolha de clientes.
 * @returns {FiltrosEscolha}
 */
export function filtrosEscolhaVazios() {
  return { busca: "", cidade: "", grupo: "", regime: "", soQuemFalta: false };
}

/**
 * Valores que existem entre os candidatos, para montar as opções dos filtros:
 * só o que dá resultado (um filtro com opção que não acha ninguém confunde).
 * @param {Array<{cidade?: string, grupo?: string, regime?: string}>} candidatos
 */
export function opcoesFiltroEscolha(candidatos) {
  const unicos = (campo) => [...new Set(candidatos.map((c) => (c[campo] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { cidades: unicos("cidade"), grupos: unicos("grupo"), regimes: unicos("regime") };
}

/**
 * Candidatos que passam pelos filtros da lista de escolha. "Só quem falta"
 * tira quem já cumpre a versão-alvo; com `atendido` nulo (sem versão-alvo
 * válida não há como julgar) não tira ninguém.
 * @template {{nome: string, codigo?: string, cidade?: string, grupo?: string, regime?: string, atendido?: boolean|null}} T
 * @param {T[]} candidatos
 * @param {FiltrosEscolha} filtros
 * @returns {T[]}
 */
export function filtrarCandidatos(candidatos, filtros) {
  const porCampo = candidatos.filter((c) => {
    if (filtros.cidade && (c.cidade || "") !== filtros.cidade) return false;
    if (filtros.grupo && (c.grupo || "") !== filtros.grupo) return false;
    if (filtros.regime && (c.regime || "") !== filtros.regime) return false;
    if (filtros.soQuemFalta && c.atendido === true) return false;
    return true;
  });
  return buscarClientes(porCampo, filtros.busca);
}

/** O filtro "só quem falta" só faz sentido se algum candidato foi julgado. */
export function podeFiltrarQuemFalta(candidatos) {
  return candidatos.some((c) => c.atendido === true || c.atendido === false);
}

/**
 * Quem a campanha cobre, em uma frase curta: os clientes escolhidos, uma
 * cidade ou o sistema inteiro.
 * @param {{publico?: string, cidade?: string}} c
 */
export function descricaoPublico(c) {
  if (c.publico === "escolhidos") return "Clientes escolhidos";
  return c.cidade || "Todas as cidades";
}

/**
 * Frase do placar: "12 de 40 clientes atualizados (30%)". Sem clientes, diz
 * isso em vez de um "0%" ou "100%" que não significa nada.
 * @param {{totalClientes: number, atendidos: number, percentual: number|null, publico?: string}} c
 */
export function textoProgresso(c) {
  if (!c.totalClientes) return c.publico === "escolhidos" ? "Nenhum cliente escolhido usa mais este sistema." : "Nenhum cliente usa este sistema.";
  return `${c.atendidos} de ${c.totalClientes} ${c.totalClientes === 1 ? "cliente atualizado" : "clientes atualizados"} (${c.percentual}%)`;
}

/** Sufixo do título de uma campanha criada a partir de quem falta em outra. */
const SUFIXO_QUEM_FALTA = " — quem falta";
const MAX_TITULO = 120;

/**
 * Ponto de partida de uma nova campanha para quem ainda não cumpriu a meta
 * de outra: mesmo sistema e versão-alvo, só os clientes que não estão
 * "concluídos" (pendentes e já agendados), título e descrição herdados. O
 * prazo NÃO vem: o da campanha anterior já passou, ou deixou de valer.
 * @param {{titulo: string, descricao?: string, sistema: string, versaoAlvo: string, clientes: Array<{id: number, situacao: string}>}} campanha
 * @returns {{sistema: string, versaoAlvo: string, titulo: string, descricao: string, clienteIds: number[]}}
 */
export function modeloComQuemFalta(campanha) {
  const base = campanha.titulo.endsWith(SUFIXO_QUEM_FALTA) ? campanha.titulo.slice(0, -SUFIXO_QUEM_FALTA.length) : campanha.titulo;
  return {
    sistema: campanha.sistema,
    versaoAlvo: campanha.versaoAlvo,
    // O limite do título é o do servidor: passar dele faria o formulário nascer inválido.
    titulo: `${base.slice(0, MAX_TITULO - SUFIXO_QUEM_FALTA.length)}${SUFIXO_QUEM_FALTA}`,
    descricao: campanha.descricao || "",
    clienteIds: campanha.clientes.filter((c) => c.situacao !== "concluido").map((c) => c.id),
  };
}

/**
 * Situação do prazo, para o selo do cartão.
 * @param {{prazo: string, encerradaEm?: string|null, atrasada?: boolean}} c
 * @returns {{texto: string, tipo: "neutro"|"alerta"|"encerrada"}|null}
 */
export function seloPrazo(c) {
  if (c.encerradaEm) return { texto: "Encerrada", tipo: "encerrada" };
  if (!c.prazo) return null;
  return c.atrasada ? { texto: `Prazo vencido em ${c.prazo}`, tipo: "alerta" } : { texto: `Prazo ${c.prazo}`, tipo: "neutro" };
}

function normalizar(v) {
  return String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
