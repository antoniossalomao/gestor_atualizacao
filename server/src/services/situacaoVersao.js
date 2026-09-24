const { parseData } = require("../shared/validation");

/**
 * A regra de "este cliente está em dia?" -- uma só, usada pelo Resumo, pela
 * aba Sistemas e pela ficha do cliente. Antes cada uma tinha a sua: o
 * Resumo chamava de "em dia" quem teve QUALQUER atendimento nos últimos 60
 * dias (o que não diz nada sobre versão), e as outras duas comparavam o
 * texto da versão com `===`.
 *
 * Três decisões, tomadas com a equipe (ver docs/adr/0008):
 *
 *  1. **Compara como data, não como texto.** Versão aqui é uma data
 *     (dd/mm/aaaa). Com `===`, quem recebeu uma versão MAIS NOVA que a
 *     oficial (teste, ou oficial rebaixada) aparecia como atrasado.
 *     Desatualizado é só a recebida ANTERIOR à oficial.
 *  2. **A fonte é o atendimento.** O que o agente reporta não entra aqui.
 *  3. **Atendimento sem versão usa a data do atendimento.** Os atendimentos
 *     de antes da versão oficial existir não gravaram versão (eram mais de
 *     mil em produção). Pela regra estrita, todo cliente ficaria "pendente"
 *     e o indicador não serviria para nada. Então: atendido na data da
 *     oficial ou depois conta como em dia, antes dela como desatualizado --
 *     e a situação sai marcada `pelaData`, para a tela não apresentar como
 *     versão comprovada o que é dedução pela data.
 */

/**
 * Situação de UM sistema de um cliente.
 * @param {{data?: string, versao?: string|null}|null|undefined} registro último atendimento do cliente naquele sistema
 * @param {string|null|undefined} oficial versão oficial do sistema (dd/mm/aaaa)
 * @returns {{situacao: "Em dia"|"Desatualizado"|"Nunca atualizado"|"Sem referência"|"Sem informação", pelaData: boolean}}
 */
function situacaoDoSistema(registro, oficial) {
  if (!registro) return { situacao: "Nunca atualizado", pelaData: false };
  const dataOficial = parseData(oficial || "");
  if (!dataOficial) return { situacao: "Sem referência", pelaData: false };
  // Uma versão que não é data (texto livre antigo, "1.0") não é comparável:
  // cai na data do atendimento, do mesmo jeito que a versão ausente.
  const recebida = parseData(registro.versao || "");
  if (recebida) return { situacao: recebida < dataOficial ? "Desatualizado" : "Em dia", pelaData: false };
  const atendimento = parseData(registro.data || "");
  if (!atendimento) return { situacao: "Sem informação", pelaData: false };
  return { situacao: atendimento < dataOficial ? "Desatualizado" : "Em dia", pelaData: true };
}

/**
 * Situação do cliente como um todo, a partir da situação de cada sistema
 * que CONTROLA versão (sem os fixos e sem os inativos -- quem chama filtra).
 * Os grupos não se sobrepõem, para as contagens do Resumo somarem o total:
 * um atraso confirmado ganha de uma informação faltando em outro sistema.
 * @param {string[]} situacoes
 * @returns {"desatualizado"|"pendente"|"em_dia"|"sem_atualizaveis"}
 */
function situacaoDoCliente(situacoes) {
  if (situacoes.length === 0) return "sem_atualizaveis";
  if (situacoes.includes("Desatualizado")) return "desatualizado";
  if (situacoes.every((s) => s === "Em dia")) return "em_dia";
  return "pendente";
}

/** O sistema entra na situação de versão? (fixos e inativos, não) */
function contaParaVersao(sistema) {
  return Boolean(sistema && sistema.ativo && sistema.controla_versao);
}

module.exports = { situacaoDoSistema, situacaoDoCliente, contaParaVersao };
