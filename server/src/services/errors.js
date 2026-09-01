/**
 * Erro "esperado" de validacao/regra de negocio (campo obrigatorio faltando,
 * nome duplicado, etc.) -- diferente de um erro de programacao ou de banco.
 * Os controllers capturam especificamente este tipo para devolver HTTP 400
 * com uma mensagem que pode ser mostrada direto pro usuario, em vez de um
 * genérico "erro interno do servidor" (500).
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

/** Erro "nao encontrado" (id que nao existe mais, por exemplo). */
class NotFoundError extends Error {
  constructor(message = "Registro não encontrado.") {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

/** Erro de permissao (usuario logado, mas sem o papel necessario para a acao). */
class ForbiddenError extends Error {
  constructor(message = "Você não tem permissão para fazer isso.") {
    super(message);
    this.name = "ForbiddenError";
    this.statusCode = 403;
  }
}

module.exports = { ValidationError, NotFoundError, ForbiddenError };
