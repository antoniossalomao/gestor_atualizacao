const { ErroDeValidacao } = require("../shared/erros");
const { lerPaginacao } = require("./paginacao");

/** Rotas de CRUD de clientes (aba Clientes) + lista de nomes p/ autocompletar. */
class ClientesController {
  /** @param {import('../services/ClienteService').ClienteService} clienteService */
  constructor(clienteService) {
    this.clienteService = clienteService;
  }

  list = (req, res) => {
    res.json(this.clienteService.list(req.query.search || "", lerPaginacao(req.query)));
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

  cidades = (req, res) => {
    res.json(this.clienteService.cidades());
  };

  obterPorNome = (req, res) => {
    res.json(this.clienteService.obterPorNome(req.params.nome));
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

  listarAcessos = (req, res, next) => {
    try {
      res.json(this.clienteService.listarAcessos(Number(req.params.id)));
    } catch (err) {
      next(err);
    }
  };

  adicionarAcesso = (req, res, next) => {
    try {
      res.status(201).json(this.clienteService.adicionarAcesso(Number(req.params.id), req.body || {}, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  alterarAcesso = (req, res, next) => {
    try {
      res.json(this.clienteService.alterarAcesso(Number(req.params.acessoId), req.body || {}, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  removerAcesso = (req, res, next) => {
    try {
      this.clienteService.removerAcesso(Number(req.params.acessoId), req.session.user);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };

  removeMany = (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
      if (!ids || ids.length === 0) throw new ErroDeValidacao("Selecione ao menos um cliente para excluir.");
      res.json(this.clienteService.excluirVarios(ids, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  adicionarSistemaEmLote = (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
      if (!ids || ids.length === 0) throw new ErroDeValidacao("Selecione ao menos um cliente.");
      res.json(this.clienteService.adicionarSistemaEmLote(ids, req.body?.sistema, req.session.user));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { ClientesController };
