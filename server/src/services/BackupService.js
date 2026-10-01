const bcrypt = require("bcryptjs");
const { ErroNaoEncontrado, ErroDeValidacao, ErroDePermissao } = require("../shared/erros");

/**
 * Camada sobre Database para a tela de Backups e proteção de restauração.
 */
class BackupService {
  /**
   * @param {import("../database/BancoDeDados").BancoDeDados} db
   * @param {import('./HistoricoService').HistoricoService} historico
   * @param {import('../database/ArmazemDeSessaoSqlite').ArmazemDeSessaoSqlite} [sessionStore]
   */
  constructor(db, historico, sessionStore = null) {
    this.db = db;
    this.historico = historico;
    this.sessionStore = sessionStore;
  }

  setSessionStore(sessionStore) {
    this.sessionStore = sessionStore;
  }

  list() {
    return this.db.listBackups();
  }

  getBackupPath(arquivo) {
    const existe = this.list().some((b) => b.arquivo === arquivo);
    if (!existe) throw new ErroNaoEncontrado("Backup não encontrado.");
    return this.db.getBackupPath(arquivo);
  }

  getCurrentDbPath() {
    return this.db.getCurrentDbPath();
  }

  /**
   * Restaura o banco de dados com proteção máxima:
   * - Apenas administradores
   * - Confirmação com a palavra exata "RESTAURAR"
   * - Validação da senha atual do administrador
   * - Invalidação das sessões ativas
   * @param {string} arquivo
   * @param {{id:number, nome:string, usuario:string, role:string}} usuario
   * @param {{senha?:string, confirmacao?:string}} seguranca
   */
  restore(arquivo, usuario, { senha, confirmacao } = {}) {
    if (!usuario || usuario.role !== "admin") {
      throw new ErroDePermissao("Apenas administradores podem restaurar backups.");
    }

    if ((confirmacao || "").trim() !== "RESTAURAR") {
      throw new ErroDeValidacao('Confirmação inválida. Digite exatamente a palavra "RESTAURAR" em maiúsculas.');
    }

    if (!senha) {
      throw new ErroDeValidacao("Informe sua senha atual de administrador para autorizar a restauração.");
    }

    const usuarioBanco = this.db.usuarios.findByUsuario(usuario.usuario);
    if (!usuarioBanco || !bcrypt.compareSync(senha, usuarioBanco.senha_hash)) {
      throw new ErroDeValidacao("Senha de administrador incorreta.");
    }

    const existe = this.list().some((b) => b.arquivo === arquivo);
    if (!existe) throw new ErroNaoEncontrado("Backup não encontrado.");

    this.db.restoreFrom(arquivo);

    // Invalida sessões ativas para evitar incompatibilidade com dados do banco restaurado
    if (this.sessionStore && typeof this.sessionStore.clearAll === "function") {
      this.sessionStore.clearAll();
    }

    // Registrado no banco já restaurado
    this.historico.registrar(
      usuario,
      "restaurar_backup",
      "backup",
      `Restaurado o backup de ${arquivo} após confirmação de segurança`
    );
  }
}

module.exports = { BackupService };
