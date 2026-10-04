const { lerPaginacao } = require("./paginacao");
const { BaseController } = require("./BaseController");

/** Rotas da agenda de tarefas internas (aba Agendamentos). */
class AgendamentosController extends BaseController {
  /** @param {import('../services/AgendamentoService').AgendamentoService} agendamentoService */
  constructor(agendamentoService) {
    super();
    this.agendamentoService = agendamentoService;
  }

  list = (req, res) => {
    const { search = "", status = "Todos", prioridade, quando } = req.query;
    res.json(this.agendamentoService.list(search, status, { ...lerPaginacao(req.query), prioridade, quando }));
  };

  lembretes = (req, res) => {
    res.json(this.agendamentoService.lembretes());
  };

  create = (req, res, next) => {
    this.handleSync(() => this.agendamentoService.create(req.body || {}, req.session.user), req, res, next, 201);
  };

  update = (req, res, next) => {
    this.handleSync(() => this.agendamentoService.update(Number(req.params.id), req.body || {}, req.session.user), req, res, next);
  };

  remove = (req, res, next) => {
    this.handleSync(() => {
      this.agendamentoService.delete(Number(req.params.id), req.session.user);
    }, req, res, next, 204);
  };

  marcarConcluida = (req, res, next) => {
    this.handleSync(() => {
      this.agendamentoService.marcarConcluida(Number(req.params.id), req.session.user);
    }, req, res, next, 204);
  };

  reabrir = (req, res, next) => {
    this.handleSync(() => this.agendamentoService.reabrir(Number(req.params.id), req.session.user), req, res, next);
  };

  arquivar = (req, res, next) => {
    this.handleSync(() => {
      this.agendamentoService.arquivar(Number(req.params.id), req.session.user);
    }, req, res, next, 204);
  };

}

module.exports = { AgendamentosController };
