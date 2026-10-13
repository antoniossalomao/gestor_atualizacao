const { lerPaginacao } = require("./paginacao");
const { BaseController } = require("./BaseController");

/** Rotas da agenda de tarefas internas (aba Agendamentos). */
class AgendamentosController extends BaseController {
  /** @param {import('../services/AgendamentoService').AgendamentoService} agendamentoService */
  constructor(agendamentoService) {
    super();
    this.agendamentoService = agendamentoService;
  }

  /**
   * Lista os agendamentos (tarefas) filtrados e paginados.
   * Rota: GET /api/agendamentos
   */
  list = (req, res) => {
    const { search = "", status = "Todos", prioridade, quando } = req.query;
    res.json(this.agendamentoService.list(search, status, { ...lerPaginacao(req.query), prioridade, quando }));
  };

  /**
   * Obtém os lembretes para o contador do sino de notificações (atrasados e vencendo hoje).
   * Rota: GET /api/agendamentos/lembretes
   */
  lembretes = (req, res) => {
    res.json(this.agendamentoService.lembretes());
  };

  /**
   * Cria um novo agendamento.
   * Rota: POST /api/agendamentos
   */
  create = (req, res, next) => {
    this.handleSync(() => this.agendamentoService.create(req.body || {}, req.session.user), req, res, next, 201);
  };

  /**
   * Atualiza os dados de um agendamento existente com tratamento contra edições concorrentes.
   * Rota: PUT /api/agendamentos/:id
   */
  update = (req, res, next) => {
    this.handleSync(() => this.agendamentoService.update(Number(req.params.id), req.body || {}, req.session.user), req, res, next);
  };

  /**
   * Exclui um agendamento.
   * Rota: DELETE /api/agendamentos/:id
   */
  remove = (req, res, next) => {
    this.handleSync(() => {
      this.agendamentoService.delete(Number(req.params.id), req.session.user);
    }, req, res, next, 204);
  };

  /**
   * Marca uma tarefa como concluída, registrando a data e hora.
   * Rota: PATCH /api/agendamentos/:id/concluir
   */
  marcarConcluida = (req, res, next) => {
    this.handleSync(() => {
      this.agendamentoService.marcarConcluida(Number(req.params.id), req.session.user);
    }, req, res, next, 204);
  };

  /**
   * Reabre uma tarefa concluída ou arquivada, voltando o status para pendente.
   * Rota: PATCH /api/agendamentos/:id/reabrir
   */
  reabrir = (req, res, next) => {
    this.handleSync(() => this.agendamentoService.reabrir(Number(req.params.id), req.session.user), req, res, next);
  };

  /**
   * Arquiva manualmente uma tarefa concluída para retirá-la da visão principal.
   * Rota: PATCH /api/agendamentos/:id/arquivar
   */
  arquivar = (req, res, next) => {
    this.handleSync(() => {
      this.agendamentoService.arquivar(Number(req.params.id), req.session.user);
    }, req, res, next, 204);
  };

}

module.exports = { AgendamentosController };
