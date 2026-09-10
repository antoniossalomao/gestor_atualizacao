const { BaseRepository } = require("./BaseRepository");

/**
 * Contas de login (tabela nova, nao existia no app Python original --
 * la o uso era individual, sem usuarios). Guarda so o hash da senha,
 * NUNCA a senha em texto puro (o hash e calculado em AuthService, com
 * bcryptjs, antes de chegar aqui).
 */
class UsuarioRepository extends BaseRepository {
  get table() {
    return "usuarios";
  }

  findByUsuario(usuario) {
    return this.conn.prepare("SELECT * FROM usuarios WHERE usuario = ?").get(usuario) || null;
  }

  findById(id) {
    return (
      this.conn.prepare("SELECT id, nome, usuario, role, criado_em, ultimo_login FROM usuarios WHERE id = ?").get(id) || null
    );
  }

  /** Todas as contas (sem o hash da senha), para a tela de gerenciar usuários. */
  list() {
    return this.conn.prepare("SELECT id, nome, usuario, role, criado_em, ultimo_login FROM usuarios ORDER BY nome").all();
  }

  insert(nome, usuario, senhaHash, role = "user") {
    const criadoEm = new Date().toISOString();
    const info = this.conn
      .prepare("INSERT INTO usuarios (nome, usuario, senha_hash, role, criado_em) VALUES (?, ?, ?, ?, ?)")
      .run(nome, usuario, senhaHash, role, criadoEm);
    return this.findById(info.lastInsertRowid);
  }

  /** Troca só o hash da senha -- usado tanto pela troca de senha própria quanto por um reset futuro. */
  updateSenhaHash(id, senhaHash) {
    this.conn.prepare("UPDATE usuarios SET senha_hash = ? WHERE id = ?").run(senhaHash, id);
  }

  /** Registra o instante do login bem-sucedido -- ver findById/list, que agora devolvem "ultimo_login". */
  registrarLogin(id) {
    this.conn.prepare("UPDATE usuarios SET ultimo_login = ? WHERE id = ?").run(new Date().toISOString(), id);
  }
}

module.exports = { UsuarioRepository };
