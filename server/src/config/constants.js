/**
 * Constantes de configuracao do backend: colunas de formulario, opcoes
 * fixas e regras de negocio simples (ex.: prazo de "cliente desatualizado").
 *
 * Nada neste arquivo acessa banco de dados ou monta rotas -- so valores.
 * Equivalente direto de "gestor/config.py" do projeto Python original.
 *
 * Nota para quem esta comecando a programar: em JavaScript, "module.exports"
 * e a forma de dizer "estes valores daqui podem ser usados por outros
 * arquivos que derem 'require' neste arquivo".
 */

// Colunas do formulario/tabela de Atualizacoes: { chave no banco, rotulo pro usuario }.
const COLUMNS = [
  { key: "cliente", label: "Cliente" },
  { key: "sistema", label: "Sistema" },
  { key: "versao", label: "Versão" },
  { key: "responsavel", label: "Quem Atualizou" },
  { key: "data", label: "Data" },
  { key: "motivo", label: "Motivo" },
  { key: "maquinas", label: "Máquinas" },
  { key: "obs", label: "Obs" },
];

// Colunas do formulario/tabela de Agendamentos.
const AGENDA_COLUMNS = [
  { key: "tarefa", label: "Tarefa" },
  { key: "cliente", label: "Cliente" },
  { key: "sistema", label: "Sistema" },
  { key: "responsavel", label: "Responsável" },
  { key: "prioridade", label: "Prioridade" },
  { key: "data", label: "Data" },
  { key: "horario", label: "Horário" },
  { key: "status", label: "Status" },
  { key: "obs", label: "Obs" },
];

// Níveis de prioridade de uma tarefa agendada (ordem crescente de urgência).
// "Normal" é o padrão: tarefas sem prioridade definida ficam aqui.
const PRIORIDADE_OPTIONS = ["Baixa", "Normal", "Alta", "Urgente"];

// Opcoes fixas de andamento de uma tarefa (a ordem importa: e a ordem de
// prioridade usada para ordenar a tabela -- pendentes antes de concluidas.
// "Concluído" precisa continuar sendo o ULTIMO item: o front-end usa
// STATUS_OPTIONS[length - 1] para saber qual e o status de "tarefa feita").
const STATUS_OPTIONS = ["A Fazer", "Em Andamento", "Sem resposta", "Concluído"];

// Lista inicial de sistemas conhecidos, usada so para "semear" o banco na
// primeira vez que ele e criado (depois disso a lista mora na tabela
// "sistemas" e pode crescer pela propria tela de Clientes).
const SISTEMAS_CONHECIDOS = [
  "B_Vendas", "NFCe", "B_NFe", "B_Importa", "B_AreaContador", "B_Atualizador",
  "B_Ordem", "B_NFSe", "Sped", "B_Pre Pedido", "B_Logistica", "B_Loc", "B_Link",
  "B_Integração", "DFe", "B_Escola", "B_RAT", "Suporte Bredas",
];

// Nome do sistema marcado automaticamente num cliente quando uma
// atualizacao registra a observacao correspondente -- ver
// AtualizacaoService._marcarSuporteBredasSeNecessario e
// Database._backfillSuporteBredas.
const SISTEMA_SUPORTE_BREDAS = "Suporte Bredas";
const OBS_SUPORTE_BREDAS = "adicionado o suporte bredas";

// DESATUALIZADO_DIAS, BACKUP_KEEP e AGENDAMENTO_ARQUIVAR_DIAS moravam aqui.
// Viraram regras da equipe, editaveis na tela Administracao -- ver
// config/regrasEquipe.js.

// Valor do filtro de status que pede justamente o que some da lista. Nao e
// um status de verdade (nao entra em STATUS_OPTIONS, ninguem marca uma
// tarefa como "Arquivadas") -- e um modo de consulta.
const FILTRO_ARQUIVADAS = "Arquivadas";

module.exports = {
  COLUMNS,
  AGENDA_COLUMNS,
  STATUS_OPTIONS,
  PRIORIDADE_OPTIONS,
  SISTEMAS_CONHECIDOS,
  SISTEMA_SUPORTE_BREDAS,
  OBS_SUPORTE_BREDAS,
  FILTRO_ARQUIVADAS,
};

