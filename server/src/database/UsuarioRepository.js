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
    return this.conn.prepare("SELECT id, nome, usuario, role, criado_em FROM usuarios WHERE id = ?").get(id) || null;
  }

  /** Todas as contas (sem o hash da senha), para a tela de gerenciar usuários. */
  list() {
    return this.conn.prepare("SELECT id, nome, usuario, role, criado_em FROM usuarios ORDER BY nome").all();
  }

  insert(nome, usuario, senhaHash, role = "user") {
    const criadoEm = new Date().toISOString();
    const info = this.conn
      .prepare("INSERT INTO usuarios (nome, usuario, senha_hash, role, criado_em) VALUES (?, ?, ?, ?, ?)")
      .run(nome, usuario, senhaHash, role, criadoEm);
    return this.findById(info.lastInsertRowid);
  }
}

module.exports = { UsuarioRepository };
