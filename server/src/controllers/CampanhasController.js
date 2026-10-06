/** Rotas da aba Campanhas (metas de versão por sistema). */
class CampanhasController {
  /** @param {import('../services/CampanhaService').CampanhaService} campanhaService */
  constructor(campanhaService) {
    this.campanhaService = campanhaService;
  }

  list = (req, res) => {
    res.json(this.campanhaService.list(String(req.query.situacao || "ativas")));
  };

  clientesDoSistema = (req, res, next) => {
    try {
      res.json(this.campanhaService.clientesDoSistema(req.query.sistema, req.query.versaoAlvo));
    } catch (err) { next(err); }
  };

  get = (req, res, next) => {
    try {
      res.json(this.campanhaService.detalhe(req.params.id));
    } catch (err) { next(err); }
  };

  create = (req, res, next) => {
    try {
      res.status(201).json(this.campanhaService.create(req.body || {}, req.session.user));
    } catch (err) { next(err); }
  };

  update = (req, res, next) => {
    try {
      res.json(this.campanhaService.update(req.params.id, req.body || {}, req.session.user));
    } catch (err) { next(err); }
  };

  /**
   * Adiciona um ou mais clientes à campanha escolhida, desde que não estejam nela e tenham o sistema.
   * Rota: POST /api/campanhas/:id/clientes
   */
  adicionarClientes = (req, res, next) => {
    try {
      res.json(this.campanhaService.adicionarClientes(req.params.id, req.body?.clientes, req.session.user));
    } catch (err) { next(err); }
  };

  /**
   * Remove um cliente da campanha escolhida, atualizando o total de clientes.
   * Rota: DELETE /api/campanhas/:id/clientes/:clienteId
   */
  removerCliente = (req, res, next) => {
    try {
      res.json(this.campanhaService.removerCliente(req.params.id, req.params.clienteId, req.session.user));
    } catch (err) { next(err); }
  };

  /**
   * Agenda a tarefa de atualização para os clientes da campanha.
   * Pode agendar para todos os pendentes ou para uma lista específica.
   * Rota: POST /api/campanhas/:id/agendar
   */
  agendar = (req, res, next) => {
    try {
      res.json(this.campanhaService.agendar(req.params.id, req.body || {}, req.session.user));
    } catch (err) { next(err); }
  };

  encerrar = (req, res, next) => {
    try {
      res.json(this.campanhaService.encerrar(req.params.id, req.session.user));
    } catch (err) { next(err); }
  };

  reabrir = (req, res, next) => {
    try {
      res.json(this.campanhaService.reabrir(req.params.id, req.session.user));
    } catch (err) { next(err); }
  };

  remove = (req, res, next) => {
    try {
      this.campanhaService.remove(req.params.id, req.session.user);
      res.status(204).end();
    } catch (err) { next(err); }
  };
}

module.exports = { CampanhasController };
