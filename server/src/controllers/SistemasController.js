/** Rotas da lista de sistemas conhecidos (checkboxes na aba Clientes). */
class SistemasController {
  /** @param {import('../services/ClienteService').ClienteService} clienteService */
  constructor(clienteService) {
    this.clienteService = clienteService;
  }

  versoes = (req, res) => {
    res.json(this.clienteService.db.sistemas.versoes());
  };

  catalogo = (req, res) => {
    res.json(this.clienteService.db.sistemas.catalogo());
  };

  classificar = (req, res, next) => {
    try {
      res.json(this.clienteService.classificarSistema(req.params.id, req.body?.controlaVersao, req.session.user));
    } catch (err) { next(err); }
  };

  salvarVersao = (req, res, next) => {
    try {
      res.json(this.clienteService.salvarVersaoSistema(req.params.nome, req.body?.data, req.session.user, req.body?.versaoEsperada));
    } catch (err) { next(err); }
  };

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
