/**
 * Erro "esperado" de validacao/regra de negocio (campo obrigatorio faltando,
 * nome duplicado, etc.) -- diferente de um erro de programacao ou de banco.
 * Os controllers capturam especificamente este tipo para devolver HTTP 400
 * com uma mensagem que pode ser mostrada direto pro usuario, em vez de um
 * genérico "erro interno do servidor" (500).
 */
class ErroDeValidacao extends Error {
  constructor(message) {
    super(message);
    this.name = "ErroDeValidacao";
    this.statusCode = 400;
  }
}

/** Erro "nao encontrado" (id que nao existe mais, por exemplo). */
class ErroNaoEncontrado extends Error {
  constructor(message = "Registro não encontrado.") {
    super(message);
    this.name = "ErroNaoEncontrado";
    this.statusCode = 404;
  }
}

/** Erro de permissao (usuario logado, mas sem o papel necessario para a acao). */
class ErroDePermissao extends Error {
  constructor(message = "Você não tem permissão para fazer isso.") {
    super(message);
    this.name = "ErroDePermissao";
    this.statusCode = 403;
  }
}

/** Edição otimista: o registro mudou desde que a pessoa abriu o formulário. */
class ErroDeConflito extends Error {
  constructor(message, atual = null) {
    super(message);
    this.name = "ErroDeConflito";
    this.statusCode = 409;
    this.atual = atual;
  }
}

module.exports = { ErroDeValidacao, ErroNaoEncontrado, ErroDePermissao, ErroDeConflito };
