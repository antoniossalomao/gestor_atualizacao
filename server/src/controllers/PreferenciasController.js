/** Rotas das preferencias de apresentacao da conta logada. */
class PreferenciasController {
  /** @param {import('../services/PreferenciaService').PreferenciaService} preferenciaService */
  constructor(preferenciaService) {
    this.preferenciaService = preferenciaService;
  }

  // Sempre as preferencias de QUEM ESTA LOGADO -- o id sai da sessao, nunca
  // da URL nem do corpo. Sem isso, a rota viraria "leia/escreva as
  // preferencias de qualquer conta" com um numero trocado na requisicao.
  get = (req, res, next) => {
    try {
      res.json(this.preferenciaService.ler(req.session.user));
    } catch (err) {
      next(err);
    }
  };

  put = (req, res, next) => {
    try {
      res.json(this.preferenciaService.salvar(req.session.user, req.body || {}));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { PreferenciasController };
