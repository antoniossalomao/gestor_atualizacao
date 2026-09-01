/** Rotas de gerenciamento de contas (tela de Usuários, aberta pelo cabeçalho). */
class UsersController {
  /** @param {import('../services/AuthService').AuthService} authService */
  constructor(authService) {
    this.authService = authService;
  }

  list = (req, res) => {
    res.json(this.authService.listUsers());
  };

  create = (req, res, next) => {
    try {
      const usuario = this.authService.createUser(req.body || {}, req.session.user);
      res.status(201).json(usuario);
    } catch (err) {
      next(err);
    }
  };

  remove = (req, res, next) => {
    try {
      this.authService.deleteUser(Number(req.params.id), req.session.user);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { UsersController };
