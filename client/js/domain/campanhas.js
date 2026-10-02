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

/**
 * Texto da tarefa criada pelo botão "Agendar" da linha. Nomeia a campanha
 * para quem abrir Agendamentos saber de onde a tarefa veio.
 * @param {{sistema: string, versaoAlvo: string, titulo: string}} campanha
 */
export function tarefaDaCampanha(campanha) {
  return `Atualizar ${campanha.sistema} para ${campanha.versaoAlvo} — ${campanha.titulo}`;
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
