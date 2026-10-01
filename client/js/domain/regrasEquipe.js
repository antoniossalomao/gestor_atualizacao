/**
 * As regras da equipe que qualquer conta pode ver (`GET
 * /configuracao-sistema`, as marcadas `publica` em server/src/config/
 * regrasEquipe.js), ditas do jeito que a aba Regras da equipe das
 * Configurações mostra.
 *
 * A aba só explicava que "existem regras globais" e mandava para a
 * Administração -- onde quem não é admin nem entra. A pergunta real de quem
 * abre essa aba é "qual é o prazo?", e a resposta estava escondida.
 */

/**
 * "1 dia", "60 dias", ou um travessão quando o servidor não mandou (a tela
 * desenha antes de a resposta chegar).
 * @param {unknown} n
 */
export function formatarDias(n) {
  if (!Number.isInteger(n) || /** @type {number} */ (n) < 0) return "—";
  return n === 1 ? "1 dia" : `${n} dias`;
}

/**
 * @param {{prazoVersaoDias?: number, desatualizadoDias?: number, agendamentoArquivarDias?: number, atualizadorHabilitado?: boolean}} regras
 * @returns {Array<{id: string, titulo: string, valor: string, texto: string, abaAdmin: string}>}
 *   `abaAdmin` é a aba da Administração onde a regra se edita.
 */
export function resumoRegrasEquipe(regras) {
  const prazo = regras?.prazoVersaoDias;
  return [
    {
      id: "prazoVersaoDias",
      titulo: "Prazo depois da versão oficial",
      valor: formatarDias(prazo),
      texto: prazo === 0
        ? "Quem não recebeu a versão oficial já conta como desatualizado no dia seguinte."
        : "Dentro desse prazo, quem não recebeu a versão oficial fica \"Aguardando atualização\". Depois, \"Desatualizado\".",
      abaAdmin: "operacao",
    },
    {
      id: "desatualizadoDias",
      titulo: "Cliente sem atualização",
      valor: formatarDias(regras?.desatualizadoDias),
      texto: "Sem nenhuma atualização registrada por mais que isso, o cliente entra na lista \"Sem atualização\" do Resumo.",
      abaAdmin: "operacao",
    },
    {
      id: "agendamentoArquivarDias",
      titulo: "Arquivar tarefa concluída",
      valor: formatarDias(regras?.agendamentoArquivarDias),
      texto: "Depois disso a tarefa sai do quadro de Agendamentos e fica no filtro \"Arquivadas\".",
      abaAdmin: "operacao",
    },
    {
      id: "atualizadorHabilitado",
      titulo: "Atualizador automático",
      valor: regras?.atualizadorHabilitado === false ? "Desligado" : regras?.atualizadorHabilitado === true ? "Ligado" : "—",
      texto: regras?.atualizadorHabilitado === false
        ? "As telas Distribuição e Versões ficam ocultas e os agentes não recebem pacotes."
        : "Os agentes instalados nos clientes recebem as versões publicadas em Versões.",
      abaAdmin: "integracoes",
    },
  ];
}
