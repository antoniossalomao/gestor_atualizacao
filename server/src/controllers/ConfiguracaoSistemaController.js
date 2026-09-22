/** Rotas da tela "Atualizador" (liga/desliga Distribuição, Versões e o alerta de agentes). Só administradores -- ver requireRole nas rotas. */
class ConfiguracaoSistemaController {
  /** @param {import('../services/ConfiguracaoSistemaService').ConfiguracaoSistemaService} configuracaoSistemaService */
  constructor(configuracaoSistemaService) {
    this.configuracaoSistemaService = configuracaoSistemaService;
  }

  get = (req, res, next) => {
    try {
      res.json(this.configuracaoSistemaService.ler(req.session.user));
    } catch (err) {
      next(err);
    }
  };

  put = (req, res, next) => {
    try {
      res.json(this.configuracaoSistemaService.definir(req.session.user, req.body?.atualizadorHabilitado));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { ConfiguracaoSistemaController };
