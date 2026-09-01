const { NotFoundError } = require("./errors");

/**
 * Camada fina sobre Database para a tela de Backups. A logica de
 * copiar/restaurar arquivos mora dentro de Database (que ja e a dona do
 * caminho do banco e da conexao) -- este servico so garante que o
 * controller nunca lide com caminhos de arquivo brutos vindos do cliente.
 */
class BackupService {
  /**
   * @param {import('../database/Database').Database} db
   * @param {import('./HistoricoService').HistoricoService} historico
   */
  constructor(db, historico) {
    this.db = db;
    this.historico = historico;
  }

  list() {
    return this.db.listBackups();
  }

  /** @param {string} arquivo precisa ser exatamente um nome devolvido por list() */
  restore(arquivo, usuario) {
    const existe = this.list().some((b) => b.arquivo === arquivo);
    if (!existe) throw new NotFoundError("Backup não encontrado.");
    this.db.restoreFrom(arquivo);
    // Registrado DEPOIS de restoreFrom(): a tabela "historico" também
    // volta ao estado do backup escolhido, então só uma entrada gravada
    // no banco já restaurado (a versão "atual" a partir de agora) fica
    // visível dali pra frente.
    this.historico.registrar(usuario, "restaurar_backup", "backup", `Restaurado o backup de ${arquivo}`);
  }
}

module.exports = { BackupService };
