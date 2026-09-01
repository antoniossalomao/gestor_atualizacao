/**
 * Camada fina sobre HistoricoRepository. Os outros serviços chamam
 * `registrar(...)` logo depois de uma criação/edição/exclusão bem
 * sucedida, para deixar registrado quem fez o quê.
 */
class HistoricoService {
  /** @param {import('../database/Database').Database} db */
  constructor(db) {
    this.db = db;
  }

  /**
   * @param {{id:number, nome:string}|null|undefined} usuario quem fez a ação (req.session.user)
   * @param {"criar"|"atualizar"|"excluir"|"restaurar_backup"|"marcar_concluida"} acao
   * @param {"cliente"|"atualizacao"|"agendamento"|"sistema"|"backup"} entidade
   * @param {string} descricao texto curto e legível (ex.: "Cliente 'Acme Corp'")
   */
  registrar(usuario, acao, entidade, descricao) {
    this.db.historico.registrar({
      usuarioId: usuario ? usuario.id : null,
      usuarioNome: usuario ? usuario.nome : "Sistema",
      acao,
      entidade,
      descricao,
    });
  }

  list(options) {
    return this.db.historico.list(options);
  }
}

module.exports = { HistoricoService };
