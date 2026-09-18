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

  insert(nome, usuario, senhaHash, role = "operador") {
    const criadoEm = new Date().toISOString();
    const info = this.conn
      .prepare("INSERT INTO usuarios (nome, usuario, senha_hash, role, criado_em) VALUES (?, ?, ?, ?, ?)")
      .run(nome, usuario, senhaHash, role, criadoEm);
    return this.findById(info.lastInsertRowid);
  }

  /** Atualiza o papel do usuário (admin, operador ou consulta). */
  updateRole(id, role) {
    this.conn.prepare("UPDATE usuarios SET role = ? WHERE id = ?").run(role, id);
    return this.findById(id);
  }

  /** Atualiza nome e papel de um usuário existente. */
  updateUser(id, { nome, role }) {
    if (nome && role) {
      this.conn.prepare("UPDATE usuarios SET nome = ?, role = ? WHERE id = ?").run(nome, role, id);
    } else if (nome) {
      this.conn.prepare("UPDATE usuarios SET nome = ? WHERE id = ?").run(nome, id);
    } else if (role) {
      this.conn.prepare("UPDATE usuarios SET role = ? WHERE id = ?").run(role, id);
    }
    return this.findById(id);
  }

  /** Troca só o hash da senha -- usado tanto pela troca de senha própria quanto por um reset futuro. */
  updateSenhaHash(id, senhaHash) {
    this.conn.prepare("UPDATE usuarios SET senha_hash = ? WHERE id = ?").run(senhaHash, id);
  }

  /** Registra o instante do login bem-sucedido -- ver findById/list, que agora devolvem "ultimo_login". */
  registrarLogin(id) {
    this.conn.prepare("UPDATE usuarios SET ultimo_login = ? WHERE id = ?").run(new Date().toISOString(), id);
  }

  /**
   * As preferencias de apresentacao desta conta.
   *
   * Devolve `{}` -- e nao null -- quando a conta nunca salvou nenhuma: quem
   * chama quer aplicar um conjunto de preferencias, e "nenhuma" e um conjunto
   * vazio, nao a ausencia de resposta. JSON corrompido (edicao manual do
   * banco, gravacao interrompida) tambem vira `{}`: o app abrir nos padroes e
   * muito melhor que ele nao abrir.
   */
  preferencias(usuarioId) {
    const linha = this.conn.prepare("SELECT prefs_json FROM usuario_preferencias WHERE usuario_id = ?").get(usuarioId);
    if (!linha) return {};
    try {
      const valor = JSON.parse(linha.prefs_json);
      return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
    } catch {
      return {};
    }
  }

  /** Grava o conjunto INTEIRO de preferencias da conta (substitui o anterior). */
  salvarPreferencias(usuarioId, prefs) {
    this.conn
      .prepare(
        `INSERT INTO usuario_preferencias (usuario_id, prefs_json, atualizado_em) VALUES (@id, @json, @agora)
         ON CONFLICT(usuario_id) DO UPDATE SET prefs_json = @json, atualizado_em = @agora`
      )
      .run({ id: usuarioId, json: JSON.stringify(prefs), agora: new Date().toISOString() });
  }
}

module.exports = { UsuarioRepository };
