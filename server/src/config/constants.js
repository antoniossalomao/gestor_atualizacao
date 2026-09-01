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
  { key: "responsavel", label: "Responsável" },
  { key: "data", label: "Data" },
  { key: "status", label: "Status" },
];

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
  "B_Integração", "DFe", "B_Escola", "B_RAT",
];

// Cliente sem nenhuma atualizacao registrada por mais que isso vira
// "desatualizado" na tela de Resumo.
const DESATUALIZADO_DIAS = 60;

// Apelidos/variacoes de nome encontradas no historico real de
// atualizacoes (campo "sistema", texto livre) para o mesmo sistema de
// "clientes.sistemas" -- ex.: "B_NFCe" foi usado por um tempo no lugar de
// "NFCe" antes de virar consistente. Usado só pelo relatório por sistema
// (AtualizacaoService.relatorioPorSistema), pra não tratar como "nunca
// atualizado" um cliente cuja atualização só foi anotada com o nome antigo.
const SISTEMA_APELIDOS = {
  NFCe: ["B_NFCe"],
};

// Quantos backups automaticos manter na pasta "backups" -- os mais
// antigos alem desse numero sao apagados a cada vez que o servidor sobe.
const BACKUP_KEEP = 10;

module.exports = {
  COLUMNS,
  AGENDA_COLUMNS,
  STATUS_OPTIONS,
  SISTEMAS_CONHECIDOS,
  DESATUALIZADO_DIAS,
  SISTEMA_APELIDOS,
  BACKUP_KEEP,
};
