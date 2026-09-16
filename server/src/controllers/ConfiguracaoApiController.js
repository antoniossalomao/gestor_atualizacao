/** Rotas da tela "Configuração da API" (URL pública, chave dos agentes, webhook do Discord...). Só administradores -- ver ConfiguracaoApiService. */
class ConfiguracaoApiController {
  /** @param {import('../services/ConfiguracaoApiService').ConfiguracaoApiService} configuracaoApiService */
  constructor(configuracaoApiService) {
    this.configuracaoApiService = configuracaoApiService;
  }

  get = (req, res, next) => {
    try {
      res.json(this.configuracaoApiService.ler(req.session.user));
    } catch (err) {
      next(err);
    }
  };

  put = (req, res, next) => {
    try {
      res.json(this.configuracaoApiService.salvar(req.session.user, req.body || {}));
    } catch (err) {
      next(err);
    }
  };

  gerarToken = (req, res, next) => {
    try {
      res.json({ token: this.configuracaoApiService.gerarToken(req.session.user) });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { ConfiguracaoApiController };
