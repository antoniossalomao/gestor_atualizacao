const { parseData } = require("../shared/validation");

/**
 * A regra de "este cliente está em dia?" -- uma só, usada pelo Resumo, pela
 * aba Sistemas e pela ficha do cliente. Antes cada uma tinha a sua: o
 * Resumo chamava de "em dia" quem teve QUALQUER atualização nos últimos 60
 * dias (o que não diz nada sobre versão), e as outras duas comparavam o
 * texto da versão com `===`.
 *
 * Três decisões, tomadas com a equipe (ver docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0008):
 *
 *  1. **Compara como data, não como texto.** Versão aqui é uma data
 *     (dd/mm/aaaa). Com `===`, quem recebeu uma versão MAIS NOVA que a
 *     oficial (teste, ou oficial rebaixada) aparecia como atrasado.
 *     Desatualizado é só a recebida ANTERIOR à oficial.
 *  2. **A fonte é a atualização.** O que o agente reporta não entra aqui.
 *  3. **Vale a DATA da atualização, não a versão recebida.** Atualizado na
 *     data da oficial ou depois conta como em dia; antes dela, como
 *     desatualizado. Até 29/09/2026 a versão recebida mandava e a data só
 *     entrava quando a atualização não tinha versão (marcada "pela data").
 *     A equipe trocou: a versão recebida vinha preenchida de forma
 *     irregular (mais de mil atualizações antigas sem ela, texto livre em
 *     outros), e duas regras na mesma tela confundiam mais do que
 *     ajudavam. A versão recebida continua gravada na atualização e
 *     aparece na ficha e no relatório -- só não decide mais a situação.
 */

/**
 * Situação de UM sistema de um cliente.
 * @param {{data?: string}|null|undefined} registro última atualização do cliente naquele sistema
 * @param {string|null|undefined} oficial versão oficial do sistema (dd/mm/aaaa)
 * @returns {{situacao: "Em dia"|"Desatualizado"|"Nunca atualizado"|"Sem referência"|"Sem informação"}}
 */
function situacaoDoSistema(registro, oficial) {
  if (!registro) return { situacao: "Nunca atualizado" };
  const dataOficial = parseData(oficial || "");
  if (!dataOficial) return { situacao: "Sem referência" };
  const dataAtualizacao = parseData(registro.data || "");
  if (!dataAtualizacao) return { situacao: "Sem informação" };
  return { situacao: dataAtualizacao < dataOficial ? "Desatualizado" : "Em dia" };
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
