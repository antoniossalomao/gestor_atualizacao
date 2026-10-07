/**
 * Centraliza respostas e captura de erros dos controllers síncronos.
 */
class BaseController {

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
