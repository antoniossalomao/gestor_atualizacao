/**
 * Conteúdo da aba Sobre e ajuda das Configurações (A11, 30/09/2026).
 *
 * Mora aqui, e não dentro de views/configuracoes/ajustes.js, por dois
 * motivos: é texto puro (nenhum DOM), e precisa de teste. O que dá errado em
 * silêncio numa ajuda é ela descrever uma tela que mudou de nome, esquecer
 * uma tela nova ou explicar a situação com um prazo que a equipe já trocou
 * -- client/tests/ajuda.test.mjs confere os três.
 */

/** Prazo usado quando o servidor não mandou as regras (o padrão de regrasEquipe.js). */
const PRAZO_PADRAO = 60;

/**
 * Como usar cada tela, pela chave da aba em App.js. Só aparecem as telas que
 * a pessoa vê no menu: sem o Atualizador ligado, Distribuição e Versões
 * somem; Administração, só para administrador.
 * @type {Record<string, string>}
 */
export const COMO_USAR_TELAS = {
  resumo:
    "Visão geral da equipe. O card \"Atualização dos Clientes\" diz quantos estão em dia, aguardando ou desatualizados; clique num grupo ou num sistema de \"Onde estão os atrasos\" para ver os clientes. Clicar numa barra de \"Atualizações por sistema\" abre Atualizações já filtrada.",
  atualizacoes:
    "Registro de cada atualização feita num cliente. Use a busca, o responsável e o botão Filtros (período) para recortar; \"+ Nova Atualização\" abre o formulário. Em \"Mais ações\" há exportar e importar planilha; em \"Relatórios\", o texto pronto do período ou do cliente.",
  agendamentos:
    "Tarefas da equipe em colunas por status (A Fazer, Em Andamento, Sem resposta, Concluído). Arraste o cartão para mudar o status. Tarefas concluídas há mais tempo que o prazo da equipe saem da vista e ficam no filtro \"Arquivadas\".",
  clientes:
    "Cadastro de clientes e dos sistemas que cada um usa. Clique numa linha para editar. Com várias linhas marcadas (Shift + clique), dá para adicionar um sistema a todas de uma vez.",
  consulta:
    "Ficha de um cliente: dados de cadastro, a situação de cada sistema e as últimas atualizações. Abre também ao clicar num cliente em outras telas.",
  distribuicao:
    "Agentes do Atualizador instalados nos clientes: último contato, versão em cada máquina e incidentes relatados.",
  versoes:
    "Envio e publicação dos pacotes que o Atualizador distribui aos clientes.",
  sistemas:
    "Clientes de um sistema com a última atualização e a situação de cada um. Filtre pela situação, busque por cliente ou cidade, ou use Filtros para ver só quem teve a última atualização antes de uma data. Em \"Versões oficiais\" fica a data e a versão de referência de cada sistema.",
  campanhas:
    "Metas de versão: escolha um sistema e uma versão e acompanhe quantos clientes já a receberam. A campanha pode valer para todos os clientes do sistema, para uma cidade ou só para clientes escolhidos.",
  administracao:
    "Só para administradores: contas e papéis, regras da equipe (prazos, arquivamento, classificação dos sistemas), importação de dados, integrações, backups, auditoria e diagnóstico do servidor.",
  configuracoes:
    "As suas preferências: conta e senha, tela inicial, notificações, tema e tamanho do texto. Valem só para você, em qualquer computador em que você entrar.",
};

/**
 * O que mudou de visível, do mais novo para o mais antigo. É um resumo para
 * a equipe; o histórico completo, com o motivo de cada mudança, é o
 * CHANGELOG.md do repositório. Mantenha curto: uns seis itens.
 */
export const NOVIDADES = [
  {
    data: "30/09/2026",
    titulo: "Situação com prazo depois da versão oficial",
    texto: "Uma versão oficial nova não deixa mais todos os clientes desatualizados no dia seguinte: há um prazo (Administração) em que eles ficam \"Aguardando atualização\". Nunca atualizado conta como desatualizado.",
  },
  {
    data: "30/09/2026",
    titulo: "NFCe e Consignado M2 pela data do B_Vendas",
    texto: "Sistemas que vão para o cliente junto com o B_Vendas usam a data da última atualização dele. A aba Sistemas e a ficha avisam \"pela data do B_Vendas\".",
  },
  {
    data: "30/09/2026",
    titulo: "Gráfico de atualizações por sistema",
    texto: "Barras em ordem, com a comparação com o mês anterior. Clicar numa barra abre Atualizações filtrada pelo sistema e pelo mês.",
  },
  {
    data: "30/09/2026",
    titulo: "Tabelas na altura da tela",
    texto: "Em Clientes, Atualizações, Sistemas e Agendamentos a tabela ocupa o espaço que sobra na tela, sem a página e a tabela rolarem ao mesmo tempo.",
  },
  {
    data: "30/09/2026",
    titulo: "Nova Campanha na Ação rápida",
    texto: "Alt + N oferece Nova Campanha, que abre direto o formulário.",
  },
  {
    data: "30/09/2026",
    titulo: "Regime tributário na ficha",
    texto: "A ficha do cliente mostra o regime tributário junto de cidade e grupo.",
  },
];

/**
 * As novidades agrupadas por data, na ordem em que estão na lista (a mais
 * nova primeiro). A aba Sobre mostra uma linha do tempo: seis itens com a
 * mesma data repetida seis vezes era ruído que escondia o que importa, o
 * título de cada um.
 * @param {Array<{data: string, titulo: string, texto: string}>} novidades
 * @returns {Array<{data: string, itens: Array<{data: string, titulo: string, texto: string, indice: number}>}>}
 */
export function agruparNovidades(novidades) {
  /** @type {Array<{data: string, itens: Array<{data: string, titulo: string, texto: string, indice: number}>}>} */
  const grupos = [];
  novidades.forEach((n, indice) => {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.data === n.data) ultimo.itens.push({ ...n, indice });
    else grupos.push({ data: n.data, itens: [{ ...n, indice }] });
  });
  return grupos;
}

/**
 * A regra de situação (ADR-0013, services/situacaoVersao.js no servidor) em
 * palavras, com o prazo que a equipe usa hoje.
 *
 * `tom` é a cor com que a situação aparece no resto do app (a bolinha do
 * Resumo, o selo da ficha): a legenda da ajuda precisa ter a MESMA cor, ou
 * ensina a ler uma tela que não existe. As duas últimas entradas não são
 * situações, são regras de como elas se combinam -- por isso `tom: null`.
 * @param {number | null | undefined} prazoDias `prazoVersaoDias` das regras públicas
 * @returns {Array<{titulo: string, texto: string, tom: "boa"|"neutra"|"alta"|"fora"|null}>}
 */
export function explicacaoSituacoes(prazoDias) {
  const n = Number.isInteger(prazoDias) && /** @type {number} */ (prazoDias) >= 0 ? /** @type {number} */ (prazoDias) : PRAZO_PADRAO;
  const dias = n === 1 ? "1 dia" : `${n} dias`;
  return [
    {
      titulo: "Em dia",
      tom: "boa",
      texto: "A última atualização do cliente no sistema é da data da versão oficial ou posterior.",
    },
    {
      titulo: "Aguardando atualização",
      tom: "neutra",
      texto: n === 0
        ? "Não acontece com o prazo atual (0 dias): quem não está em dia já é desatualizado."
        : `A última atualização é de menos de ${dias} antes da versão oficial, e a oficial saiu há menos de ${dias}. É o tempo que a equipe tem para chegar ao cliente.`,
    },
    {
      titulo: "Desatualizado",
      tom: "alta",
      texto: `Passaram ${dias} da versão oficial sem o cliente receber, ou a última atualização é de ${dias} ou mais antes da oficial, ou o cliente nunca foi atualizado no sistema.`,
    },
    {
      titulo: "Sem versão oficial",
      tom: "fora",
      texto: "O sistema não tem versão oficial cadastrada (Sistemas › Versões oficiais) e não conta contra ninguém.",
    },
    {
      titulo: "Componente fixo",
      tom: "fora",
      texto: "Sistema marcado como Fixo em Administração › Operação: não tem versão para acompanhar e fica fora da conta.",
    },
    {
      titulo: "Situação do cliente",
      tom: null,
      texto: "Quem tem B_Vendas é julgado pelo B_Vendas. Sem ele, basta um sistema desatualizado para o cliente ser desatualizado; em dia, só com todos em dia.",
    },
    {
      titulo: "Sistemas que vão junto com o B_Vendas",
      tom: null,
      texto: "NFCe e Consignado M2 (e o que mais estiver marcado em Administração › Operação) usam a data da última atualização do B_Vendas do cliente.",
    },
  ];
}
