/**
 * Rotas das regras da equipe (tela Administração). Leitura das regras
 * públicas para qualquer conta logada; o resto só administrador -- ver
 * requireRole nas rotas e a checagem repetida no serviço.
 */
class ConfiguracaoSistemaController {
  /**
   * @param {import('../services/ConfiguracaoSistemaService').ConfiguracaoSistemaService} configuracaoSistemaService
   * @param {import('../services/NotificationService').NotificationService} [notifications]
   */
  constructor(configuracaoSistemaService, notifications) {
    this.configuracaoSistemaService = configuracaoSistemaService;
    this.notifications = notifications;
  }

  get = (req, res) => res.json(this.configuracaoSistemaService.ler());

  completa = (req, res, next) => {
    try {
      res.json(this.configuracaoSistemaService.completa(req.session.user));
    } catch (err) {
      next(err);
    }
  };

  put = (req, res, next) => {
    try {
      res.json(this.configuracaoSistemaService.atualizar(req.session.user, req.body || {}));
    } catch (err) {
      next(err);
    }
  };

  /**
   * Manda uma mensagem de teste ao Discord. Aceita a URL do formulário (ainda
   * não salva) para dar para conferir ANTES de gravar; sem ela, usa a salva.
   */
  testarDiscord = async (req, res, next) => {
    try {
      const url = req.body?.url ? this.configuracaoSistemaService.validarWebhook(req.body.url) : undefined;
      res.json(await this.notifications.testar(url));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { ConfiguracaoSistemaController };
