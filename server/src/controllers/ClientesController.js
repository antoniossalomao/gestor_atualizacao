const { parsePaginacao } = require("./pagination");

/** Rotas de CRUD de clientes (aba Clientes) + lista de nomes p/ autocompletar. */
class ClientesController {
  /** @param {import('../services/ClienteService').ClienteService} clienteService */
  constructor(clienteService) {
    this.clienteService = clienteService;
  }

  list = (req, res) => {
    res.json(this.clienteService.list(req.query.search || "", parsePaginacao(req.query)));
  };

  names = (req, res) => {
    res.json(this.clienteService.names());
  };

  getByNome = (req, res) => {
    res.json(this.clienteService.getByNome(req.params.nome));
  };

  create = (req, res, next) => {
    try {
      res.status(201).json(this.clienteService.create(req.body || {}, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  update = (req, res, next) => {
    try {
      res.json(this.clienteService.update(Number(req.params.id), req.body || {}, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  remove = (req, res, next) => {
    try {
      this.clienteService.delete(Number(req.params.id), req.session.user);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { ClientesController };
