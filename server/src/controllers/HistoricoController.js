const { parsePaginacao } = require("../shared/pagination");

/** Rota da aba Histórico: lista paginada de quem fez o quê. */
class HistoricoController {
  /** @param {import('../services/HistoricoService').HistoricoService} historicoService */
  constructor(historicoService) {
    this.historicoService = historicoService;
  }

  list = (req, res) => {
    const { search = "", entidade = "Todos" } = req.query;
    res.json(this.historicoService.list({ ...parsePaginacao(req.query), search, entidade }));
  };
}

module.exports = { HistoricoController };
