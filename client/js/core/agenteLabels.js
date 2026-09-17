/**
 * Rótulos amigáveis para os campos que o agente C# manda em cada retorno
 * (ver Worker.cs/ApiService.SendLog) -- num arquivo só porque tanto
 * DistribuicaoView (feed "Últimos retornos" e tooltip da tabela) quanto
 * AgenteDetalheModal (histórico completo por agente) precisam do mesmo
 * mapeamento, e duplicá-lo nos dois arriscava eles saírem de sincronia.
 */
export const FASES = {
  aguardando_autorizacao: "Aguardando autorização",
  shutdown: "Parando o banco",
  backup_pre: "Backup pré-atualização",
  scripts: "Rodando scripts",
  copia_arquivos: "Copiando arquivos",
  injecao_binarios: "Injetando executáveis",
  online: "Religando o banco",
  backup_pos: "Backup pós-atualização",
  concluido: "Concluído",
};

/** @param {string|null|undefined} fase @returns {string|null} */
export function faseLabel(fase) {
  return fase ? FASES[fase] || fase : null;
}
