/**
 * Constantes usadas pelas telas do front-end: colunas de formulário/tabela
 * e opções fixas. Mesmos valores usados no backend (server/src/config/
 * constants.js) -- duplicados aqui de propósito, porque o front-end não
 * tem como "importar" um arquivo do lado do servidor: cada lado roda em
 * um processo diferente (navegador vs. Node). Se um dia esses valores
 * precisarem mudar, é só lembrar de atualizar os dois lugares.
 */

export const COLUMNS = [
  { key: "cliente", label: "Cliente" },
  { key: "sistema", label: "Sistema" },
  { key: "versao", label: "Versão" },
  { key: "responsavel", label: "Quem Atualizou" },
  { key: "data", label: "Data" },
  { key: "motivo", label: "Motivo" },
  { key: "maquinas", label: "Máquinas" },
  { key: "obs", label: "Obs" },
];

export const AGENDA_COLUMNS = [
  { key: "tarefa", label: "Tarefa" },
  { key: "cliente", label: "Cliente" },
  { key: "responsavel", label: "Responsável" },
  { key: "data", label: "Data" },
  { key: "horario", label: "Horário" },
  { key: "status", label: "Status" },
];

export const STATUS_OPTIONS = ["A Fazer", "Em Andamento", "Sem resposta", "Concluído"];

export const DESATUALIZADO_DIAS = 60;
