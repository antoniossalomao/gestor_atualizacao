const { lerPaginacao } = require("./paginacao");

/**
 * Encapsula a lógica de paginação e captura de erros para reduzir o boilerplate nos controllers.
 */
class BaseController {

  handle(promise, res, next, status = 200) {
    promise
      .then(result => {
        if (result === undefined) {
          res.status(status).end();
        } else {
          res.status(status).json(result);
        }
      })
      .catch(next);
  }

  handleSync(fn, req, res, next, status = 200) {
    try {
      const result = fn(req, res);
      if (result === undefined) {
        res.status(status).end();
      } else {
        res.status(status).json(result);
      }
    } catch (err) {
      next(err);
    }
  }

}

module.exports = { BaseController };
