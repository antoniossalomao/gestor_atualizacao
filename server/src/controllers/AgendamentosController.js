const { parsePaginacao } = require("./pagination");

/** Rotas da agenda de tarefas internas (aba Agendamentos). */
class AgendamentosController {
  /** @param {import('../services/AgendamentoService').AgendamentoService} agendamentoService */
  constructor(agendamentoService) {
    this.agendamentoService = agendamentoService;
  }

  list = (req, res) => {
    const { search = "", status = "Todos" } = req.query;
    res.json(this.agendamentoService.list(search, status, parsePaginacao(req.query)));
  };

  lembretes = (req, res) => {
    res.json(this.agendamentoService.lembretes());
  };

  create = (req, res, next) => {
    try {
      res.status(201).json(this.agendamentoService.create(req.body || {}, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  update = (req, res, next) => {
    try {
      res.json(this.agendamentoService.update(Number(req.params.id), req.body || {}, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  remove = (req, res, next) => {
    try {
      this.agendamentoService.delete(Number(req.params.id), req.session.user);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };

  markDone = (req, res, next) => {
    try {
      this.agendamentoService.markDone(Number(req.params.id), req.session.user);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { AgendamentosController };
