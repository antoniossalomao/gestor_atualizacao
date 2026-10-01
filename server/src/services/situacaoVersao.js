const { lerData } = require("./validacao");

/**
 * A regra de "este cliente está em dia?" -- uma só, usada pelo Resumo, pela
 * aba Sistemas e pela ficha do cliente. Antes cada uma tinha a sua: o
 * Resumo chamava de "em dia" quem teve QUALQUER atualização nos últimos 60
 * dias (o que não diz nada sobre versão), e as outras duas comparavam o
 * texto da versão com `===`.
 *
 * Quatro decisões, tomadas com a equipe (ver docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0008 e #adr-0013):
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
 *  4. **Há um prazo depois da versão oficial (30/09/2026).** Ter a última
 *     atualização anterior à oficial não basta para estar desatualizado:
 *     com a regra estrita, TODO cliente ficava vermelho no dia seguinte à
 *     publicação de uma versão, antes de a equipe ter tido tempo de
 *     visitar alguém. Com N = `prazoVersaoDias` (regras da equipe, padrão
 *     60), quem tem a última atualização anterior à oficial é:
 *       - "Desatualizado" se ela é N dias ou mais ANTERIOR à oficial (já
 *         estava longe dela quando a versão saiu), ou se a oficial saiu há N
 *         dias ou mais (o prazo venceu);
 *       - "Aguardando atualização" nos outros casos: foi atualizado pouco
 *         antes da versão sair, e a versão é recente.
 *     A primeira versão (publicada em 30/09/2026) só contava da data da
 *     oficial: com a oficial do B_Vendas de 09/09, cliente parado havia um
 *     ano também ficava "aguardando", e o Resumo não mostrava nenhum
 *     desatualizado. As datas são a dd/mm/aaaa que as telas mostram, e não o
 *     dia em que alguém cadastrou a oficial no painel.
 *     Campanhas chamam sem prazo: lá a pergunta é "já chegou na meta?".
 */

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Situação de UM sistema de um cliente.
 * @param {{data?: string}|null|undefined} registro última atualização do cliente naquele sistema
 * @param {string|null|undefined} oficial versão oficial do sistema (dd/mm/aaaa)
 * @param {{prazoDias?: number|null, hoje?: Date}} [prazo] sem `prazoDias`, atrasado é
 *   desatualizado na hora (Campanhas)
 * @returns {{situacao: "Em dia"|"Aguardando atualização"|"Desatualizado"|"Nunca atualizado"|"Sem referência"|"Sem informação"}}
 */
function situacaoDoSistema(registro, oficial, { prazoDias = null, hoje = new Date() } = {}) {
  if (!registro) return { situacao: "Nunca atualizado" };
  const dataOficial = lerData(oficial || "");
  if (!dataOficial) return { situacao: "Sem referência" };
  const dataAtualizacao = lerData(registro.data || "");
  if (!dataAtualizacao) return { situacao: "Sem informação" };
  if (dataAtualizacao >= dataOficial) return { situacao: "Em dia" };
  if (prazoDias == null) return { situacao: "Desatualizado" };
  const inicioDeHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  // round, e não floor: numa virada de horário de verão o dia tem 23 ou 25 h.
  const diasDesdeOficial = Math.round((inicioDeHoje.getTime() - dataOficial.getTime()) / DIA_MS);
  const diasAntesDaOficial = Math.round((dataOficial.getTime() - dataAtualizacao.getTime()) / DIA_MS);
  const prazoVencido = diasDesdeOficial >= prazoDias || diasAntesDaOficial >= prazoDias;
  return { situacao: prazoVencido ? "Desatualizado" : "Aguardando atualização" };
}

/** O sistema que, quando o cliente tem, decide sozinho a situação dele. */
const SISTEMA_PRINCIPAL = "B_Vendas";

/**
 * Qual última atualização julga um sistema do cliente (A13, 30/09/2026).
 *
 * Um sistema marcado como "atualiza junto com o B_Vendas" (NFCe, Consignado
 * M2 -- coluna `atualiza_com_principal`, editável na Administração) vai para
 * o cliente junto com o B_Vendas, e ninguém lança uma atualização separada
 * para ele. Julgado pela própria data, aparecia atrasado num cliente com o
 * B_Vendas em dia. Então, num cliente que TEM B_Vendas, vale a última
 * atualização do B_Vendas -- comparada com a versão oficial do PRÓPRIO
 * sistema e com o prazo, como qualquer outro. Sem B_Vendas no cliente, o
 * dependente volta a usar a própria data.
 *
 * @param {{atualiza_com_principal?: number}|null|undefined} sistema linha do catálogo
 * @param {any} proprio última atualização do cliente neste sistema
 * @param {{tem: boolean, registro: any}} principal o B_Vendas deste cliente
 * @returns {{registro: any, pelaDataDe: string|null}} `pelaDataDe` para a tela dizer de onde veio a data
 */
function registroQueDecide(sistema, proprio, principal) {
  if (sistema?.atualiza_com_principal && principal.tem) return { registro: principal.registro || null, pelaDataDe: SISTEMA_PRINCIPAL };
  return { registro: proprio || null, pelaDataDe: null };
}

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
 * Sem B_Vendas, valem todos os sistemas: desatualizado se algum estiver, em
 * dia só com todos em dia.
 *
 * **Nunca atualizado é desatualizado** (decisão da equipe, 30/09/2026). Antes
 * havia um grupo "Verificação pendente" para quem não tinha data, e em
 * produção ele só juntava clientes nunca atualizados -- 99 de 368 -- como
 * se faltasse conferir alguma coisa. O mesmo vale para uma data que não se
 * consegue ler ("Sem informação"): não há como dizer que recebeu a versão.
 * Já "Sem referência" (o sistema não tem versão oficial cadastrada) não
 * julga ninguém: o sistema sai da conta, como um fixo.
 *
 * Os grupos não se sobrepõem, para as contagens do Resumo somarem o total.
 * @param {Array<{sistema: string, situacao: string}>} sistemas
 * @returns {{grupo: "desatualizado"|"aguardando"|"em_dia"|"sem_atualizaveis", decididoPor: string|null}}
 */
function situacaoDoCliente(sistemas) {
  const avaliaveis = sistemas.filter((s) => s.situacao !== "Sem referência");
  if (avaliaveis.length === 0) return { grupo: "sem_atualizaveis", decididoPor: null };
  const principal = avaliaveis.find((s) => s.sistema.toLowerCase() === SISTEMA_PRINCIPAL.toLowerCase());
  const consideradas = principal ? [principal.situacao] : avaliaveis.map((s) => s.situacao);
  const decididoPor = principal ? principal.sistema : null;
  if (consideradas.some(contaComoAtraso)) return { grupo: "desatualizado", decididoPor };
  if (consideradas.every((s) => s === "Em dia")) return { grupo: "em_dia", decididoPor };
  return { grupo: "aguardando", decididoPor };
}

/**
 * Os sistemas que explicam por que o cliente está no grupo: o que a lista do
 * Resumo mostra na coluna "Sistemas". Quem tem B_Vendas foi decidido só por
 * ele, então só ele aparece. Sem B_Vendas, um desatualizado lista os
 * atrasados e um aguardando lista os que aguardam. A regra mora aqui, ao
 * lado de situacaoDoCliente, para o front-end só formatar o que recebe.
 * @param {"desatualizado"|"aguardando"|"em_dia"|"sem_atualizaveis"} grupo
 * @param {Array<{sistema: string, situacao: string}>} sistemas
 * @param {string|null} decididoPor
 */
function sistemasQueExplicam(grupo, sistemas, decididoPor) {
  if (decididoPor) return sistemas.filter((s) => s.sistema === decididoPor);
  if (grupo === "desatualizado") return sistemas.filter((s) => contaComoAtraso(s.situacao));
  if (grupo === "aguardando") return sistemas.filter((s) => s.situacao === "Aguardando atualização");
  return sistemas;
}

/**
 * Situações de UM sistema que põem o cliente como desatualizado -- e que o
 * card conta em "Onde estão os atrasos".
 * @param {string} situacao
 */
function contaComoAtraso(situacao) {
  return situacao === "Desatualizado" || situacao === "Nunca atualizado" || situacao === "Sem informação";
}


/** O sistema entra na situação de versão? (fixos e inativos, não) */
function contaParaVersao(sistema) {
  return Boolean(sistema && sistema.ativo && sistema.controla_versao);
}

module.exports = { situacaoDoSistema, situacaoDoCliente, sistemasQueExplicam, contaComoAtraso, contaParaVersao, registroQueDecide, SISTEMA_PRINCIPAL };
