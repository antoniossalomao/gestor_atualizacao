/**
 * Rotas de autenticacao: status (precisa configurar? esta logado?), criar o
 * primeiro administrador, login e logout.
 *
 * Nota de estilo: cada metodo e definido como "arrow function" atribuida a
 * uma propriedade da classe (em vez de "metodo normal"). Isso faz o `this`
 * de dentro do metodo ficar sempre travado na instancia do controller,
 * mesmo quando o Express chama o metodo "solto" (sem o objeto na frente) --
 * sem isso, precisariamos escrever `.bind(this)` toda vez que registrassemos
 * a rota.
 */
class AuthController {
  /**
   * @param {import('../services/AuthService').AuthService} authService
   * @param {import('../services/ConfiguracaoSistemaService').ConfiguracaoSistemaService} configuracaoSistemaService
   */
  constructor(authService, configuracaoSistemaService) {
    this.authService = authService;
    this.configuracaoSistemaService = configuracaoSistemaService;
  }

  // "/auth/status" já é a primeira chamada que o front-end faz ao abrir a
  // página (antes até de saber se há sessão) -- por isso é o lugar mais
  // barato para o cliente descobrir se o Atualizador está habilitado, sem
  // uma segunda requisição só para isso (ver App.js).
  status = (req, res) => {
    const logado = Boolean(req.session.user);
    res.json({
      needsSetup: this.authService.needsSetup(),
      user: req.session.user || null,
      atualizadorHabilitado: this.configuracaoSistemaService.atualizadorHabilitado(),
      // As regras públicas da equipe (ver config/regrasEquipe.js) vão junto
      // pelo mesmo motivo -- mas só com sessão: esta rota é aberta, e quem
      // não entrou não tem por que saber as regras internas da equipe.
      regras: logado ? this.configuracaoSistemaService.ler() : null,
    });
  };

  setupAdmin = (req, res, next) => {
    try {
      const user = this.authService.setupAdmin(req.body || {});
      this._iniciarSessao(req, user, next, () => res.status(201).json({ user }));
    } catch (err) {
      next(err);
    }
  };

  login = (req, res, next) => {
    try {
      const { usuario, senha } = req.body || {};
      const user = this.authService.login(usuario, senha);
      this._iniciarSessao(req, user, next, () => res.json({ user }));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Prende o usuario autenticado a uma sessao NOVA, em vez de reaproveitar a
   * que o visitante ja tinha antes de entrar.
   *
   * Sem o `regenerate`, o identificador da sessao continua o mesmo de antes do
   * login -- entao quem conseguisse fazer o navegador da vitima usar um
   * identificador escolhido por ele (um link preparado, um cookie plantado)
   * ficaria com esse mesmo identificador ja autenticado depois que a vitima
   * digitasse a senha, sem nunca ter sabido a senha. E o ataque classico de
   * "fixacao de sessao"; trocar o identificador no momento do login corta a
   * ligacao entre o "antes" e o "depois".
   */
  _iniciarSessao(req, user, next, onOk) {
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = user;
      req.session.save((saveErr) => (saveErr ? next(saveErr) : onOk()));
    });
  }

  logout = (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie("gestor.sid");
      res.status(204).end();
    });
  };
}

module.exports = { AuthController };
