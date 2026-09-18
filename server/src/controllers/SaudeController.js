/**
 * Controller HTTP para métricas operacionais e integridade do sistema.
 */
class SaudeController {
  /**
   * @param {import('../services/SaudeService').SaudeService} service
   */
  constructor(service) {
    this.service = service;
  }

  get = (req, res, next) => {
    try {
      res.json(this.service.obterDiagnostico());
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { SaudeController };
