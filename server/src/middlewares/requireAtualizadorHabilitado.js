/**
 * Bloqueia as rotas do Atualizador (`/api/versoes/*`, admin, e `/api/update/*`,
 * agente C#) enquanto ele estiver desativado em Configurações -- ver
 * ConfiguracaoSistemaService. Sem isto, desativar a tela no front-end não
 * impediria alguém de chamar a API direto (ou um agente antigo de continuar
 * reportando), então a checagem precisa estar aqui também, não só na UI.
 *
 * @param {import('../services/ConfiguracaoSistemaService').ConfiguracaoSistemaService} configuracaoSistemaService
 */
function requireAtualizadorHabilitado(configuracaoSistemaService) {
  return (req, res, next) => {
    if (!configuracaoSistemaService.atualizadorHabilitado()) {
      res.status(403).json({ error: "O Atualizador está desativado temporariamente neste servidor." });
      return;
    }
    next();
  };
}

module.exports = { requireAtualizadorHabilitado };
