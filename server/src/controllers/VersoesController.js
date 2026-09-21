/**
 * Adaptador HTTP do módulo de versões.
 *
 * O controller só traduz requisições Express para chamadas do serviço e
 * traduz os resultados em respostas HTTP. Validações e regras permanecem
 * em VersaoService.
 */
class VersoesController {
  constructor(service) {
    this.service = service;
  }

  list = (req, res) => res.json(this.service.list());

  /** O que está no ar agora, uma linha por sistema. */
  ativas = (req, res) => res.json(this.service.ativas());

  /**
   * Tudo que o painel de acompanhamento precisa, numa chamada só: versões no
   * ar, situação de cada agente e indicadores do período.
   */
  painel = (req, res, next) => {
    try {
      res.json(this.service.painel());
    } catch (err) {
      next(err);
    }
  };

  logs = (req, res, next) => {
    try {
      res.json(this.service.logs(req.query || {}));
    } catch (err) {
      next(err);
    }
  };

  removeAgent = (req, res, next) => {
    try {
      res.json(this.service.removerAgente(req.params.cnpj, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  pausarAgente = (req, res, next) => {
    try {
      res.json(this.service.pausarAgente(req.params.cnpj, req.session.user, req.body?.motivo));
    } catch (err) {
      next(err);
    }
  };

  retomarAgente = (req, res, next) => {
    try {
      res.json(this.service.retomarAgente(req.params.cnpj, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  /** Consumido pelo Worker C# (rota de agente, sem sessão -- ver requireAgent). */
  statusAgente = (req, res, next) => {
    try {
      res.json(this.service.statusAgente(req.params.cnpj));
    } catch (err) {
      next(err);
    }
  };

  create = async (req, res, next) => {
    try {
      const item = await this.service.create(
        req.body || {},
        req.session.user,
        req.file,
        req.app.get("publicUrl") || `${req.protocol}://${req.get("host")}`
      );
      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  };

  update = (req, res, next) => {
    try {
      res.json(this.service.update(Number(req.params.id), req.body || {}, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  publish = (req, res, next) => {
    try {
      res.json(this.service.publish(Number(req.params.id), req.session.user));
    } catch (err) {
      next(err);
    }
  };

  promover = (req, res, next) => {
    try { res.json(this.service.promover(Number(req.params.id), req.session.user)); } catch (err) { next(err); }
  };

  rollback = (req, res, next) => {
    try { res.json(this.service.rollback(Number(req.params.id), req.session.user)); } catch (err) { next(err); }
  };

  remove = (req, res, next) => {
    try {
      res.json(this.service.remove(Number(req.params.id), req.session.user));
    } catch (err) {
      next(err);
    }
  };

  check = (req, res, next) => {
    try {
      res.json(this.service.check(req.params.cnpj, req.query.versao, req.query.sistema));
    } catch (err) {
      next(err);
    }
  };

  log = (req, res, next) => {
    try {
      res.json(this.service.log(req.body || {}));
    } catch (err) {
      next(err);
    }
  };

  download = (req, res, next) => {
    try {
      res.download(this.service.download(req.params.filename), req.params.filename);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { VersoesController };
