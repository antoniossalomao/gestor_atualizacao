const { ValidationError } = require("../services/errors");
const { parsePaginacao } = require("./pagination");

/** Rotas do historico de atualizacoes: CRUD, filtro por responsavel, import/export .xlsx. */
class AtualizacoesController {
  /** @param {import('../services/AtualizacaoService').AtualizacaoService} atualizacaoService */
  constructor(atualizacaoService) {
    this.atualizacaoService = atualizacaoService;
  }

  list = (req, res) => {
    const { search = "", responsavel = "Todos" } = req.query;
    res.json(this.atualizacaoService.list(search, responsavel, parsePaginacao(req.query)));
  };

  distinctResponsaveis = (req, res) => {
    res.json(this.atualizacaoService.distinctResponsaveis());
  };

  lastForClient = (req, res) => {
    res.json(this.atualizacaoService.lastUpdateForClient(req.params.nome));
  };

  latestVersionBySystem = (req, res) => {
    res.json(this.atualizacaoService.latestVersionBySystem());
  };

  porSistema = (req, res, next) => {
    try {
      const { sistema = "", dataCorte = "" } = req.query;
      res.json(this.atualizacaoService.relatorioPorSistema(sistema, dataCorte));
    } catch (err) {
      next(err);
    }
  };

  create = (req, res, next) => {
    try {
      res.status(201).json(this.atualizacaoService.create(req.body || {}, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  update = (req, res, next) => {
    try {
      res.json(this.atualizacaoService.update(Number(req.params.id), req.body || {}, req.session.user));
    } catch (err) {
      next(err);
    }
  };

  remove = (req, res, next) => {
    try {
      this.atualizacaoService.delete(Number(req.params.id), req.session.user);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };

  importXlsx = async (req, res, next) => {
    try {
      if (!req.file) throw new ValidationError("Selecione um arquivo .xlsx para importar.");
      const resultado = await this.atualizacaoService.importXlsx(req.file.buffer, req.session.user);
      res.json(resultado);
    } catch (err) {
      next(err);
    }
  };

  exportXlsx = async (req, res, next) => {
    try {
      const search = String(req.query.search || "");
      const responsavel = String(req.query.responsavel || "Todos");
      const buffer = await this.atualizacaoService.exportXlsxBuffer(search, responsavel);
      const filtrado = search || responsavel !== "Todos";
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="atualizacoes${filtrado ? "-filtrado" : ""}.xlsx"`);
      res.send(Buffer.from(buffer));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { AtualizacoesController };
