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

  update = (req, res, next) => {
    try {
      const usuario = this.authService.updateUser(Number(req.params.id), req.body || {}, req.session.user);
      res.json(usuario);
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

  changeOwnPassword = (req, res, next) => {
    try {
      const { senhaAtual, senhaNova } = req.body || {};
      this.authService.changePassword(req.session.user, senhaAtual, senhaNova);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };

  // -- a própria conta (Configurações > Conta), aberta a qualquer papel --

  meuPerfil = (req, res, next) => {
    try {
      res.json(this.authService.meuPerfil(req.session.user));
    } catch (err) {
      next(err);
    }
  };

  atualizarMeuPerfil = (req, res, next) => {
    try {
      const perfil = this.authService.atualizarMeuNome(req.session.user, (req.body || {}).nome);
      // A sessão guarda uma cópia do nome, feita no login: é dela que
      // /auth/status e o Histórico tiram quem é quem. Sem atualizar aqui, o
      // nome novo só apareceria no próximo login.
      req.session.user = { ...req.session.user, nome: perfil.nome };
      res.json(perfil);
    } catch (err) {
      next(err);
    }
  };

  listarSessoes = (req, res, next) => {
    try {
      res.json(this.authService.sessoesDe(req.session.user, req.sessionID));
    } catch (err) {
      next(err);
    }
  };

  encerrarSessao = (req, res, next) => {
    try {
      this.authService.encerrarSessao(req.session.user, String(req.params.id), req.sessionID);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };

  encerrarOutrasSessoes = (req, res, next) => {
    try {
      res.json({ encerradas: this.authService.encerrarOutrasSessoes(req.session.user, req.sessionID) });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { UsersController };
