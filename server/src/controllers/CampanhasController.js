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
      res.json(this.campanhaService.clientesDoSistema(req.query.sistema));
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

  exportarXlsx = async (req, res, next) => {
    try {
      const { buffer, campanha } = await this.campanhaService.exportarPendentesXlsx(req.params.id);
      // Nome de arquivo identificável e só com caracteres seguros no cabeçalho.
      const sufixo = `${campanha.sistema}-${campanha.versaoAlvo}`.replace(/[^a-zA-Z0-9_-]+/g, "-");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="campanha-pendentes-${sufixo}.xlsx"`);
      res.send(Buffer.from(buffer));
    } catch (err) { next(err); }
  };
}

module.exports = { CampanhasController };
