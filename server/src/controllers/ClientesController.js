const { ValidationError } = require("../shared/errors");
const { parsePaginacao } = require("../shared/pagination");

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

  opcoesPorCodigo = (req, res) => {
    res.json(this.clienteService.opcoesPorCodigo());
  };

  grupos = (req, res) => {
    res.json(this.clienteService.grupos());
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

  listAcessos = (req, res, next) => {
    try {
      res.json(this.clienteService.listAcessos(Number(req.params.id)));
    } catch (err) {
      next(err);
    }
  };

  addAcesso = (req, res, next) => {
    try {
      res.status(201).json(this.clienteService.addAcesso(Number(req.params.id), req.body || {}, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  updateAcesso = (req, res, next) => {
    try {
      res.json(this.clienteService.updateAcesso(Number(req.params.acessoId), req.body || {}, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  removeAcesso = (req, res, next) => {
    try {
      this.clienteService.removeAcesso(Number(req.params.acessoId), req.session.user);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };

  removeMany = (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
      if (!ids || ids.length === 0) throw new ValidationError("Selecione ao menos um cliente para excluir.");
      res.json(this.clienteService.deleteMany(ids, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  addSistemaMany = (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
      if (!ids || ids.length === 0) throw new ValidationError("Selecione ao menos um cliente.");
      res.json(this.clienteService.addSistemaMany(ids, req.body?.sistema, req.session.user));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { ClientesController };
