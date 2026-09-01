/** Rota unica da aba Resumo: todos os indicadores calculados de uma vez. */
class ResumoController {
  /** @param {import('../services/AtualizacaoService').AtualizacaoService} atualizacaoService */
  constructor(atualizacaoService) {
    this.atualizacaoService = atualizacaoService;
  }

  get = (req, res) => {
    res.json(this.atualizacaoService.resumo());
  };
}

module.exports = { ResumoController };
