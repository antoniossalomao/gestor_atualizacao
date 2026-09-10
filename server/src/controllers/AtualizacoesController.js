const { ValidationError } = require("../services/errors");
const { parsePaginacao } = require("./pagination");

/**
 * Le o intervalo de datas da query string. Nao valida o formato aqui de
 * proposito: quem sabe o que e' uma data valida e' o repositorio, que precisa
 * converter "dd/mm/aaaa" para a forma ordenavel de qualquer jeito, e qualquer
 * coisa que ele nao reconhecer vira "sem filtro" (ver `paraOrdenavel`). Assim
 * a regra mora num lugar so, em vez de duas checagens que podem discordar.
 */
function periodo(query) {
  return { desde: String(query.desde || ""), ate: String(query.ate || "") };
}

/**
 * Teto da exclusao em lote. Nao e' por medo do SQLite (ele apaga milhoes sem
 * suar) -- e' pelo "Desfazer": a tela guarda os registros excluidos para poder
 * recria-los, e devolver dez mil deles numa resposta HTTP so, para ficarem
 * pendurados na memoria do navegador durante alguns segundos, e' um preco que
 * nenhuma operacao de tela deveria cobrar. Acima disso, o caminho certo e'
 * filtrar melhor antes de excluir.
 */
const LOTE_MAXIMO = 500;

/** Rotas do historico de atualizacoes: CRUD, filtro por responsavel, import/export .xlsx. */
class AtualizacoesController {
  /** @param {import('../services/AtualizacaoService').AtualizacaoService} atualizacaoService */
  constructor(atualizacaoService) {
    this.atualizacaoService = atualizacaoService;
  }

  list = (req, res) => {
    const { search = "", responsavel = "Todos" } = req.query;
    res.json(this.atualizacaoService.list(search, responsavel, { ...parsePaginacao(req.query), ...periodo(req.query) }));
  };

  distinctResponsaveis = (req, res) => {
    res.json(this.atualizacaoService.distinctResponsaveis());
  };

  lastForClient = (req, res) => {
    res.json(this.atualizacaoService.lastUpdateForClient(req.params.nome));
  };

  recentForClient = (req, res) => {
    res.json(this.atualizacaoService.recentUpdatesForClient(req.params.nome, req.query.limit));
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

  /**
   * Exclusao em lote. E' POST e nao DELETE porque a lista de ids vai no corpo
   * da requisicao, e corpo em DELETE e' terreno mal definido (parte dos
   * proxies e clientes descarta). O caminho proprio tambem evita qualquer
   * ambiguidade com o `DELETE /atualizacoes/:id` que ja existe.
   */
  removeMany = (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
      if (!ids || ids.length === 0) throw new ValidationError("Selecione ao menos um registro para excluir.");
      if (ids.length > LOTE_MAXIMO) {
        throw new ValidationError(`Só é possível excluir até ${LOTE_MAXIMO} registros de uma vez.`);
      }
      res.json(this.atualizacaoService.deleteMany(ids, req.session.user));
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
      const intervalo = periodo(req.query);
      const buffer = await this.atualizacaoService.exportXlsxBuffer(search, responsavel, intervalo);
      const filtrado = search || responsavel !== "Todos" || intervalo.desde || intervalo.ate;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="atualizacoes${filtrado ? "-filtrado" : ""}.xlsx"`);
      res.send(Buffer.from(buffer));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { AtualizacoesController };
