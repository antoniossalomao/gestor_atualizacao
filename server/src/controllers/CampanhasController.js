/** Rotas da aba Campanhas (metas de versão por sistema). */
class CampanhasController {
  /** @param {import('../services/CampanhaService').CampanhaService} campanhaService */
  constructor(campanhaService) {
    this.campanhaService = campanhaService;
  }

  /**
   * Lista as campanhas filtradas pela situação (ativas ou encerradas).
   * Rota: GET /api/campanhas
   */
  list = (req, res) => {
    res.json(this.campanhaService.list(String(req.query.situacao || "ativas")));
  };

  /**
   * Lista os clientes que possuem o sistema especificado para a escolha na campanha.
   * Rota: GET /api/campanhas/clientes-do-sistema
   */
  clientesDoSistema = (req, res, next) => {
    try {
      res.json(this.campanhaService.clientesDoSistema(req.query.sistema, req.query.versaoAlvo));
    } catch (err) { next(err); }
  };

  /**
   * Obtém os detalhes de uma campanha específica.
   * Rota: GET /api/campanhas/:id
   */
  get = (req, res, next) => {
    try {
      res.json(this.campanhaService.detalhe(req.params.id));
    } catch (err) { next(err); }
  };

  /**
   * Cria uma nova campanha.
   * Rota: POST /api/campanhas
   */
  create = (req, res, next) => {
    try {
      res.status(201).json(this.campanhaService.create(req.body || {}, req.session.user));
    } catch (err) { next(err); }
  };

  /**
   * Atualiza os dados de uma campanha existente.
   * Rota: PUT /api/campanhas/:id
   */
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

  /**
   * Encerra a campanha, congelando seu placar de progresso.
   * Rota: PATCH /api/campanhas/:id/encerrar
   */
  encerrar = (req, res, next) => {
    try {
      res.json(this.campanhaService.encerrar(req.params.id, req.session.user));
    } catch (err) { next(err); }
  };

  /**
   * Reabre uma campanha encerrada, descongelando seu placar.
   * Rota: PATCH /api/campanhas/:id/reabrir
   */
  reabrir = (req, res, next) => {
    try {
      res.json(this.campanhaService.reabrir(req.params.id, req.session.user));
    } catch (err) { next(err); }
  };

  /**
   * Exclui uma campanha. Apaga a meta e o placar, mas mantém tarefas criadas.
   * Rota: DELETE /api/campanhas/:id
   */
  remove = (req, res, next) => {
    try {
      this.campanhaService.remove(req.params.id, req.session.user);
      res.status(204).end();
    } catch (err) { next(err); }
  };
}

module.exports = { CampanhasController };
