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
  const termo = normalizar(busca);
  return clientes.filter((c) => {
    if (filtro !== "todos" && c.situacao !== filtro) return false;
    if (!termo) return true;
    return [c.nome, c.codigo, c.cidade].some((v) => normalizar(v).includes(termo));
  });
}

/**
 * Frase do placar: "12 de 40 clientes atualizados (30%)". Sem clientes, diz
 * isso em vez de um "0%" ou "100%" que não significa nada.
 * @param {{totalClientes: number, atendidos: number, percentual: number|null}} c
 */
export function textoProgresso(c) {
  if (!c.totalClientes) return "Nenhum cliente usa este sistema.";
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
