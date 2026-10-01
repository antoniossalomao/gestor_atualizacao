/**
 * Colunas de formulário, opções fixas e limites do backend. Só valores:
 * nada aqui acessa banco nem monta rotas.
 */

// Colunas do formulario/tabela de Atualizacoes: { chave no banco, rotulo pro usuario }.
const COLUNAS_ATUALIZACOES = [
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
const COLUNAS_AGENDAMENTOS = [
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
const OPCOES_PRIORIDADE = ["Baixa", "Normal", "Alta", "Urgente"];

// Opcoes fixas de andamento de uma tarefa (a ordem importa: e a ordem de
// prioridade usada para ordenar a tabela -- pendentes antes de concluidas.
// "Concluído" precisa continuar sendo o ULTIMO item: o front-end usa
// OPCOES_STATUS[length - 1] para saber qual e o status de "tarefa feita").
const OPCOES_STATUS = ["A Fazer", "Em Andamento", "Sem resposta", "Concluído"];

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
// BancoDeDados._backfillSuporteBredas.
const SISTEMA_SUPORTE_BREDAS = "Suporte Bredas";
const OBS_SUPORTE_BREDAS = "adicionado o suporte bredas";

// DESATUALIZADO_DIAS, BACKUP_KEEP e AGENDAMENTO_ARQUIVAR_DIAS moravam aqui.
// Viraram regras da equipe, editaveis na tela Administracao -- ver
// config/regrasEquipe.js.

// Valor do filtro de status que pede justamente o que some da lista. Nao e
// um status de verdade (nao entra em OPCOES_STATUS, ninguem marca uma
// tarefa como "Arquivadas") -- e um modo de consulta.
const FILTRO_ARQUIVADAS = "Arquivadas";

// Tamanho máximo de cada upload, em MB, pelo nome do campo do formulário:
// "arquivo" é a planilha de importação, "pacote" é o pacote de uma versão.
// Mora aqui, e não só no multer (routes/index.js), porque a mensagem de
// "arquivo grande demais" (middlewares/tratadorDeErros.js) precisa dizer o
// número -- e os dois lugares não podem discordar. O que protege a memória
// na importação é o limite de LINHAS (config/limitesPlanilha.js); estes 15 MB
// só barram o absurdo antes de o arquivo chegar ao leitor.
const LIMITE_UPLOAD_MB = { arquivo: 15, pacote: 500 };

// Versão do painel, lida do package.json do servidor (que o Dockerfile copia
// para a imagem). Até 30/09/2026 havia três números diferentes: "2.1.0" fixo
// no Diagnóstico, "Versão 2.0" escrito na aba Sobre e "1.0.0" no
// package.json. Agora é um só -- para mudar, mude o package.json.
const VERSAO_PAINEL = require("../../package.json").version;

module.exports = {
  COLUNAS_ATUALIZACOES,
  COLUNAS_AGENDAMENTOS,
  OPCOES_STATUS,
  OPCOES_PRIORIDADE,
  SISTEMAS_CONHECIDOS,
  SISTEMA_SUPORTE_BREDAS,
  OBS_SUPORTE_BREDAS,
  FILTRO_ARQUIVADAS,
  LIMITE_UPLOAD_MB,
  VERSAO_PAINEL,
};

