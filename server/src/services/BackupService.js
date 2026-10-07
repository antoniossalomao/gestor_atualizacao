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

  definirArmazemDeSessao(sessionStore) {
    this.sessionStore = sessionStore;
  }

  list() {
    return this.db.listarBackups();
  }

  caminhoDoBackup(arquivo) {
    const existe = this.list().some((b) => b.arquivo === arquivo);
    if (!existe) throw new ErroNaoEncontrado("Backup não encontrado.");
    return this.db.caminhoDoBackup(arquivo);
  }

  caminhoDoBancoAtual() {
    return this.db.caminhoDoBancoAtual();
  }

  criarCopiaTemporaria() {
    return this.db.criarCopiaTemporaria();
  }

  /**
   * Uma cópia agora, pedida pela tela -- antes de mexer em muita coisa (uma
   * importação grande, uma reclassificação de sistemas), quando a última
   * cópia automática é da subida do servidor, talvez de semanas atrás. Entra
   * na mesma conta da retenção: com o limite cheio, a mais antiga sai.
   * @param {{id:number, nome:string, usuario:string, role:string}} usuario
   */
  criar(usuario) {
    if (!usuario || usuario.role !== "admin") {
      throw new ErroDePermissao("Apenas administradores podem fazer cópias do banco.");
    }
    const feita = this.db._backup();
    if (!feita) throw new ErroDeValidacao("Não foi possível fazer a cópia agora. Confira o espaço em disco e as permissões da pasta do banco.");
    this.historico?.registrar(usuario, "criar", "backup", `Cópia do banco feita pela tela (${feita.arquivo})`);
    return this.list().find((b) => b.arquivo === feita.arquivo) || { arquivo: feita.arquivo, integro: feita.integro };
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

    if (typeof confirmacao !== "string" || confirmacao.trim() !== "RESTAURAR") {
      throw new ErroDeValidacao('Confirmação inválida. Digite exatamente a palavra "RESTAURAR" em maiúsculas.');
    }

    if (typeof senha !== "string" || !senha) {
      throw new ErroDeValidacao("Informe sua senha atual de administrador para autorizar a restauração.");
    }

    const usuarioBanco = this.db.usuarios.buscarPorUsuario(usuario.usuario);
    if (!usuarioBanco || !bcrypt.compareSync(senha, usuarioBanco.senha_hash)) {
      throw new ErroDeValidacao("Senha de administrador incorreta.");
    }

    const existe = this.list().some((b) => b.arquivo === arquivo);
    if (!existe) throw new ErroNaoEncontrado("Backup não encontrado.");

    this.db.restaurarDe(arquivo);

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
