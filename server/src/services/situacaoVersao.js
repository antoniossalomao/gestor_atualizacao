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

/** O sistema que, quando o cliente tem, decide sozinho a situação dele. */
const SISTEMA_PRINCIPAL = "B_Vendas";

/**
 * Situação do cliente como um todo, a partir da situação de cada sistema
 * que CONTROLA versão (sem os fixos e sem os inativos -- quem chama filtra).
 *
 * **Quem tem B_Vendas é julgado só pelo B_Vendas.** É o sistema que puxa a
 * atualização dos outros: com ele em dia, a equipe considera o cliente
 * atualizado, mesmo com um B_NFe para trás. Pela regra "todos em dia",
 * que valia antes, só 21 de 369 clientes de produção ficavam em dia -- um
 * número que não batia com o que a equipe vê no dia a dia. Nome fixo aqui,
 * e não regra editável, por escolha da equipe.
 *
 * Sem B_Vendas, valem todos os sistemas: um atraso confirmado ganha de uma
 * informação faltando em outro sistema, e em dia é só com todos em dia.
 *
 * Os grupos não se sobrepõem, para as contagens do Resumo somarem o total.
 * @param {Array<{sistema: string, situacao: string}>} sistemas
 * @returns {{grupo: "desatualizado"|"pendente"|"em_dia"|"sem_atualizaveis", decididoPor: string|null}}
 */
function situacaoDoCliente(sistemas) {
  if (sistemas.length === 0) return { grupo: "sem_atualizaveis", decididoPor: null };
  const principal = sistemas.find((s) => s.sistema.toLowerCase() === SISTEMA_PRINCIPAL.toLowerCase());
  const consideradas = principal ? [principal.situacao] : sistemas.map((s) => s.situacao);
  const decididoPor = principal ? principal.sistema : null;
  if (consideradas.includes("Desatualizado")) return { grupo: "desatualizado", decididoPor };
  if (consideradas.every((s) => s === "Em dia")) return { grupo: "em_dia", decididoPor };
  return { grupo: "pendente", decididoPor };
}


/** O sistema entra na situação de versão? (fixos e inativos, não) */
function contaParaVersao(sistema) {
  return Boolean(sistema && sistema.ativo && sistema.controla_versao);
}

module.exports = { situacaoDoSistema, situacaoDoCliente, contaParaVersao, SISTEMA_PRINCIPAL };
