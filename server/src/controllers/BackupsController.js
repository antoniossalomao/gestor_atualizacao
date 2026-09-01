/** Rotas da tela de Backups: listar pontos no tempo e restaurar um deles. */
class BackupsController {
  /** @param {import('../services/BackupService').BackupService} backupService */
  constructor(backupService) {
    this.backupService = backupService;
  }

  list = (req, res) => {
    res.json(this.backupService.list());
  };

  restore = (req, res, next) => {
    try {
      this.backupService.restore(req.params.arquivo, req.session.user);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { BackupsController };
