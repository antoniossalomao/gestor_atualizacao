/** Rotas da lista de sistemas conhecidos (checkboxes na aba Clientes). */
class SistemasController {
  /** @param {import('../services/ClienteService').ClienteService} clienteService */
  constructor(clienteService) {
    this.clienteService = clienteService;
  }

  list = (req, res) => {
    res.json(this.clienteService.listSistemas());
  };

  create = (req, res, next) => {
    try {
      const { nome } = req.body || {};
      res.status(201).json(this.clienteService.addSistema(nome, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  remove = (req, res, next) => {
    try {
      res.json(this.clienteService.removeSistema(req.params.nome, req.session.user));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { SistemasController };
