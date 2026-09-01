const bcrypt = require("bcryptjs");

const { ValidationError, ForbiddenError } = require("./errors");

const SALT_ROUNDS = 10;
const SENHA_MIN_LENGTH = 6;

/**
 * Login multiusuario -- novidade em relacao ao app Python original, que
 * era de uso individual e nao tinha conceito de conta. Guarda so o hash
 * da senha (bcrypt); a senha em texto puro nunca e salva em lugar nenhum.
 */
class AuthService {
  /**
   * @param {import('../database/Database').Database} db
   * @param {import('./HistoricoService').HistoricoService} historico
   */
  constructor(db, historico) {
    this.db = db;
    this.historico = historico;
  }

  /** True quando ainda nao existe nenhuma conta -- o front-end mostra a tela de "criar administrador" nesse caso. */
  needsSetup() {
    return this.db.usuarios.count() === 0;
  }

  /**
   * Cria a primeira conta (administrador). So funciona enquanto nao existir
   * nenhum usuario -- depois disso, novas contas sao criadas pela tela de
   * Usuarios (por quem ja estiver logado), via createUser().
   */
  setupAdmin({ nome, usuario, senha }) {
    if (!this.needsSetup()) {
      throw new ValidationError("Já existe uma conta cadastrada; use a tela de login.");
    }
    return this.createUser({ nome, usuario, senha }, null, "admin");
  }

  /**
   * Cria uma conta adicional. Qualquer pessoa já logada pode convidar
   * mais alguém (mesma filosofia de "todo login tem acesso completo" usada
   * no resto do app) -- só a remoção de conta é restrita a administradores
   * (ver deleteUser). Contas convidadas entram com o papel "user"; só a
   * primeira conta (setupAdmin) recebe "admin" automaticamente.
   * @param {{id:number, nome:string}|null} usuarioLogado quem está criando (null só no setup inicial)
   * @param {"admin"|"user"} role
   */
  createUser({ nome, usuario, senha }, usuarioLogado, role = "user") {
    const nomeLimpo = (nome || "").trim();
    const usuarioLimpo = (usuario || "").trim();
    if (!nomeLimpo) throw new ValidationError("Informe o nome da pessoa.");
    if (!usuarioLimpo) throw new ValidationError("Informe um nome de usuário para login.");
    if (!senha || senha.length < SENHA_MIN_LENGTH) {
      throw new ValidationError(`A senha precisa ter pelo menos ${SENHA_MIN_LENGTH} caracteres.`);
    }
    if (this.db.usuarios.findByUsuario(usuarioLimpo)) {
      throw new ValidationError(`Já existe uma conta com o usuário '${usuarioLimpo}'.`);
    }
    const hash = bcrypt.hashSync(senha, SALT_ROUNDS);
    const criado = this.db.usuarios.insert(nomeLimpo, usuarioLimpo, hash, role);
    if (this.historico) {
      this.historico.registrar(usuarioLogado, "criar", "usuario", `Usuário "${criado.nome}" (@${criado.usuario})`);
    }
    return { id: criado.id, nome: criado.nome, usuario: criado.usuario, role: criado.role };
  }

  /** Todas as contas cadastradas (sem hash de senha), para a tela de Usuários. */
  listUsers() {
    return this.db.usuarios.list();
  }

  /**
   * Remove uma conta. Só administradores podem remover contas; além disso,
   * duas travas de segurança: ninguém pode se auto-excluir pela tela (evita
   * ficar sem conta logada por engano) e não é possível remover a última
   * conta que resta (o sistema ficaria sem ninguém capaz de entrar).
   * @param {number} id conta a remover
   * @param {{id:number, nome:string, role:string}} usuarioLogado quem está pedindo a remoção
   */
  deleteUser(id, usuarioLogado) {
    if (usuarioLogado.role !== "admin") {
      throw new ForbiddenError("Apenas administradores podem remover usuários.");
    }
    if (id === usuarioLogado.id) {
      throw new ValidationError("Você não pode excluir a própria conta enquanto está logado com ela.");
    }
    const alvo = this.db.usuarios.findById(id);
    if (!alvo) throw new ValidationError("Usuário não encontrado.");
    if (this.db.usuarios.count() <= 1) {
      throw new ValidationError("Não é possível remover a única conta existente.");
    }
    this.db.usuarios.delete(id);
    this.historico.registrar(usuarioLogado, "excluir", "usuario", `Usuário "${alvo.nome}" (@${alvo.usuario})`);
  }

  /** @returns {{id:number, nome:string, usuario:string, role:string}} usuario autenticado (sem o hash da senha) */
  login(usuario, senha) {
    const linha = this.db.usuarios.findByUsuario((usuario || "").trim());
    // Mensagem generica de proposito (nao diz se foi o usuario ou a senha
    // que estava errada) -- evita que alguem descubra, por tentativa, quais
    // nomes de usuario existem no sistema.
    const erroPadrao = new ValidationError("Usuário ou senha inválidos.");
    if (!linha) throw erroPadrao;
    const confere = bcrypt.compareSync(senha || "", linha.senha_hash);
    if (!confere) throw erroPadrao;
    return { id: linha.id, nome: linha.nome, usuario: linha.usuario, role: linha.role };
  }
}

module.exports = { AuthService };
