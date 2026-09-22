const bcrypt = require("bcryptjs");

const { ValidationError, ForbiddenError } = require("../shared/errors");

const SALT_ROUNDS = 10;
const SENHA_MIN_LENGTH = 8;

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
    /** @type {import('../database/SqliteSessionStore').SqliteSessionStore|null} */
    this.sessionStore = null;
  }

  /**
   * Injeta o store de sessões após a construção (o store só existe depois de
   * _configureExpress, que roda após _buildServices -- mesmo padrão do
   * BackupService.setSessionStore).
   * @param {import('../database/SqliteSessionStore').SqliteSessionStore} store
   */
  setSessionStore(store) {
    this.sessionStore = store;
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
    const criado = this.createUser({ nome, usuario, senha }, null, "admin");
    // Sem isto, a tela de Usuários mostraria "Nunca acessou" para o próprio
    // admin, mesmo estando ele nesse exato momento olhando a tela recém-aberta
    // -- setupAdmin() cria a sessão direto (ver AuthController), sem passar
    // por login(), que é onde ultimo_login normalmente é registrado.
    this.db.usuarios.registrarLogin(criado.id);
    return criado;
  }

  /**
    * Cria uma conta adicional. Apenas administradores podem criar novas contas.
    * Papéis suportados: "admin", "operador" e "consulta" (default: "operador").
    * @param {{nome:string, usuario:string, senha:string, role?:string}} dados
    * @param {{id:number, nome:string, role:string}|null} usuarioLogado quem está criando (null só no setup inicial)
    * @param {"admin"|"operador"|"consulta"} [papelPadrao="operador"]
    */
  createUser({ nome, usuario, senha, role }, usuarioLogado, papelPadrao = "operador") {
    if (usuarioLogado && usuarioLogado.role !== "admin") {
      throw new ForbiddenError("Apenas administradores podem criar novos usuários.");
    }
    const nomeLimpo = (nome || "").trim();
    const usuarioLimpo = (usuario || "").trim();
    const papelEscolhido = (role || papelPadrao || "operador").toLowerCase();
    const papeisValidos = ["admin", "operador", "consulta", "user"];

    if (!nomeLimpo) throw new ValidationError("Informe o nome da pessoa.");
    if (!usuarioLimpo) throw new ValidationError("Informe um nome de usuário para login.");
    if (!papeisValidos.includes(papelEscolhido)) {
      throw new ValidationError("Papel inválido. Escolha entre Administrador, Operador ou Consulta.");
    }
    const papelFinal = papelEscolhido === "user" ? "operador" : papelEscolhido;

    if (!senha || senha.length < SENHA_MIN_LENGTH) {
      throw new ValidationError(`A senha precisa ter pelo menos ${SENHA_MIN_LENGTH} caracteres.`);
    }
    if (this.db.usuarios.findByUsuario(usuarioLimpo)) {
      throw new ValidationError(`Já existe uma conta com o usuário '${usuarioLimpo}'.`);
    }
    const hash = bcrypt.hashSync(senha, SALT_ROUNDS);
    const criado = this.db.usuarios.insert(nomeLimpo, usuarioLimpo, hash, papelFinal);
    if (this.historico) {
      this.historico.registrar(
        usuarioLogado,
        "criar",
        "usuario",
        `Usuário "${criado.nome}" (@${criado.usuario}) criado como [${criado.role}]`
      );
    }
    return { id: criado.id, nome: criado.nome, usuario: criado.usuario, role: criado.role };
  }

  /** Todas as contas cadastradas (sem hash de senha), para a tela de Usuários. */
  listUsers() {
    return this.db.usuarios.list();
  }

  /**
   * Atualiza dados de um usuário (nome e/ou papel). Restrito a administradores.
   * Não permite rebaixar o último administrador do sistema.
   * @param {number} id
   * @param {{nome?:string, role?:string}} dados
   * @param {{id:number, nome:string, role:string}} usuarioLogado
   */
  updateUser(id, { nome, role }, usuarioLogado) {
    if (usuarioLogado.role !== "admin") {
      throw new ForbiddenError("Apenas administradores podem alterar usuários e permissões.");
    }
    const alvo = this.db.usuarios.findById(id);
    if (!alvo) throw new ValidationError("Usuário não encontrado.");

    let novoPapel = role ? role.toLowerCase() : alvo.role;
    if (novoPapel === "user") novoPapel = "operador";
    if (!["admin", "operador", "consulta"].includes(novoPapel)) {
      throw new ValidationError("Papel inválido. Escolha entre Administrador, Operador ou Consulta.");
    }

    if (alvo.role === "admin" && novoPapel !== "admin") {
      const admins = this.db.usuarios.list().filter((u) => u.role === "admin");
      if (admins.length <= 1) {
        throw new ValidationError("Não é possível rebaixar o único administrador ativo do sistema.");
      }
    }

    const atualizado = this.db.usuarios.updateUser(id, {
      nome: (nome || alvo.nome).trim(),
      role: novoPapel,
    });

    if (this.historico) {
      this.historico.registrar(
        usuarioLogado,
        "atualizar",
        "usuario",
        `Usuário "${atualizado.nome}" (@${atualizado.usuario}) atualizado para papel [${atualizado.role}]`
      );
    }
    return atualizado;
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
    if (alvo.role === "admin") {
      const admins = this.db.usuarios.list().filter((u) => u.role === "admin");
      if (admins.length <= 1) {
        throw new ValidationError("Não é possível remover o único administrador ativo do sistema.");
      }
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
    this.db.usuarios.registrarLogin(linha.id);
    return { id: linha.id, nome: linha.nome, usuario: linha.usuario, role: linha.role };
  }

  /**
   * Troca a própria senha -- antes disso a única forma de "esquecer" uma
   * senha era um administrador apagar a conta e criar outra (perdendo o
   * histórico de quem fez o quê, já que ele referencia o id da conta). Exige
   * a senha atual (não basta estar logado): a sessão pode ter ficado aberta
   * num computador que não é o da pessoa, e trocar a senha sem confirmar a
   * atual travaria o dono de verdade pra fora.
   * @param {{id:number}} usuarioLogado
   */
  changePassword(usuarioLogado, senhaAtual, senhaNova) {
    const linha = this.db.usuarios.findByUsuario(usuarioLogado.usuario);
    // Só acontece se a conta foi excluída por outra pessoa entre a sessão
    // abrir e este pedido chegar -- não é um caminho que a tela normal
    // alcança, mas devolve um erro claro em vez de travar num bcrypt.compareSync(null).
    if (!linha) throw new ValidationError("Sua conta não foi encontrada. Faça login novamente.");
    if (!bcrypt.compareSync(senhaAtual || "", linha.senha_hash)) {
      throw new ValidationError("Senha atual incorreta.");
    }
    if (!senhaNova || senhaNova.length < SENHA_MIN_LENGTH) {
      throw new ValidationError(`A nova senha precisa ter pelo menos ${SENHA_MIN_LENGTH} caracteres.`);
    }
    this.db.usuarios.updateSenhaHash(linha.id, bcrypt.hashSync(senhaNova, SALT_ROUNDS));
    this.historico.registrar(usuarioLogado, "atualizar", "usuario", `Senha de "${linha.nome}" (@${linha.usuario}) alterada`);
    // Revoga todas as sessões ativas deste usuário em outros navegadores /
    // dispositivos: a sessão comprometida não sobrevive à troca de senha.
    // Sem isto, um atacante com o cookie roubado continuaria com acesso mesmo
    // depois de a vítima trocar a senha -- exatamente o cenário que motivou
    // o requisito de confirmar a senha atual antes de trocar.
    this.sessionStore?.clearByUserId(linha.id);
  }
}

module.exports = { AuthService };
