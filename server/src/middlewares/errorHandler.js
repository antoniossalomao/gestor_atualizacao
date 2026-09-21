/**
 * Middleware final do Express: qualquer erro passado para `next(err)` em
 * algum controller cai aqui. Erros "esperados" (ValidationError,
 * NotFoundError -- ver shared/errors.js) ja sabem seu proprio
 * `statusCode` e tem uma mensagem segura de mostrar pro usuario; qualquer
 * outro erro (bug, falha do banco) vira um 500 generico, sem vazar detalhes
 * internos para quem esta usando o navegador.
 */
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  if (statusCode === 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(statusCode).json({
    error: statusCode === 500 ? "Erro interno do servidor." : err.message,
    ...(statusCode === 409 && err.atual ? { atual: err.atual } : {}),
  });
}

module.exports = { errorHandler };
