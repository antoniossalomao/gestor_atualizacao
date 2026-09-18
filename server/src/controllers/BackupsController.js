/** Rotas da tela de Backups: listar pontos no tempo, download seguro e restauração protegida. */
class BackupsController {
  /** @param {import('../services/BackupService').BackupService} backupService */
  constructor(backupService) {
    this.backupService = backupService;
  }

  list = (req, res) => {
    res.json(this.backupService.list());
  };

  download = (req, res, next) => {
    try {
      const arquivo = req.params.arquivo;
      const caminho = this.backupService.getBackupPath(arquivo);
      res.download(caminho, arquivo);
    } catch (err) {
      next(err);
    }
  };

  downloadCurrent = (_req, res, next) => {
    try {
      const caminho = this.backupService.getCurrentDbPath();
      const filename = `gestao_atual_${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
      res.download(caminho, filename);
    } catch (err) {
      next(err);
    }
  };

  restore = (req, res, next) => {
    try {
      this.backupService.restore(req.params.arquivo, req.session.user, req.body || {});
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { BackupsController };
