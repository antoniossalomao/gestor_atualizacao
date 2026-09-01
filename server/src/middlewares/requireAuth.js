/**
 * Bloqueia rotas da API para quem nao esta logado. `req.session.user` e
 * preenchido pelo AuthController no login/setup, e some quando a sessao
 * expira ou o usuario faz logout.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  next();
}

module.exports = { requireAuth };
