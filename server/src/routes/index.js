const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const { requireAuth } = require("../middlewares/requireAuth");
const { requireAgent } = require("../middlewares/requireAgent");

// Planilhas de import ficam so na memoria (nunca gravadas em disco) --
// suficiente pro tamanho de arquivo que uma planilha de atualizacoes tem, e
// mais simples que gerenciar uma pasta de uploads temporarios.
const upload = multer({ storage: multer.memoryStorage() });
// Pacotes são persistidos em disco porque o agente precisa baixá-los depois
// da publicação. O nome recebido do cliente é sanitizado no filename abaixo.
const pacoteUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      const destination = path.join(__dirname, "..", "..", "data", "packages");
      fs.mkdirSync(destination, { recursive: true });
      callback(null, destination);
    },
    filename: (_req, file, callback) => callback(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

/**
 * Monta o roteador da API (`/api/...`) a partir dos controllers ja
 * instanciados (ver Server.js, que faz a injecao de dependencia). Cada
 * grupo de rotas so chama o metodo correspondente do controller certo --
 * nenhuma logica de negocio mora aqui, so o mapeamento "verbo HTTP + caminho
 * -> metodo".
 */
class ApiRouter {
  /**
   * @param {{
   *   auth: import('../controllers/AuthController').AuthController,
   *   clientes: import('../controllers/ClientesController').ClientesController,
   *   sistemas: import('../controllers/SistemasController').SistemasController,
   *   atualizacoes: import('../controllers/AtualizacoesController').AtualizacoesController,
   *   agendamentos: import('../controllers/AgendamentosController').AgendamentosController,
   *   resumo: import('../controllers/ResumoController').ResumoController,
   *   backups: import('../controllers/BackupsController').BackupsController,
   *   historico: import('../controllers/HistoricoController').HistoricoController,
   *   usuarios: import('../controllers/UsersController').UsersController,
   *   configuracaoApi: import('../controllers/ConfiguracaoApiController').ConfiguracaoApiController,
   * }} controllers
   * @param {import('../middlewares/LoginRateLimiter').LoginRateLimiter} loginLimiter
   */
  constructor(controllers, loginLimiter) {
    this.controllers = controllers;
    this.loginLimiter = loginLimiter;
    this.router = express.Router();
    this._registerAuthRoutes();
    this._registerProtectedRoutes();
  }

  // Rotas que precisam funcionar ANTES do login (checar status, logar, criar o 1o admin).
  // "loginLimiter" só entra nas duas que aceitam senha (login/setup) -- as
  // demais (status, logout) não têm o que ser "forçado por tentativa".
  _registerAuthRoutes() {
    const { auth } = this.controllers;
    this.router.get("/auth/status", auth.status);
    this.router.post("/auth/setup", this.loginLimiter.middleware, auth.setupAdmin);
    this.router.post("/auth/login", this.loginLimiter.middleware, auth.login);
    this.router.post("/auth/logout", auth.logout);
    // Rotas consumidas pelo Worker C#: não usam sessão, pois o agente ainda
    // não possui login no navegador. A autenticação própria do agente será
    // adicionada quando CNPJ/HWID forem configurados no ambiente real.
    const agent = express.Router();
    agent.use("/update", requireAgent);
    agent.get("/update/check/:cnpj", this.controllers.versoes.check);
    agent.post("/update/log", this.controllers.versoes.log);
    agent.get("/update/packages/:filename", this.controllers.versoes.download);
    this.router.use(agent);
  }

  // Tudo abaixo exige sessao valida (ver middlewares/requireAuth.js).
  _registerProtectedRoutes() {
    const { clientes, sistemas, atualizacoes, agendamentos, resumo, backups, historico, usuarios, versoes, preferencias, configuracaoApi } =
      this.controllers;
    const api = express.Router();
    api.use(requireAuth);

    // Preferencias de apresentacao da conta logada (tema, densidade, linhas
    // por pagina...). Sem :id na rota de proposito: sao sempre as de quem
    // esta logado -- ver PreferenciasController.
    api.get("/preferencias", preferencias.get);
    api.put("/preferencias", preferencias.put);

    // Configuração "de equipe" (URL pública, chave dos agentes, webhook do
    // Discord...) -- diferente das preferências acima, que são por conta.
    // Restrito a administradores dentro do próprio service.
    api.get("/configuracao-api", configuracaoApi.get);
    api.put("/configuracao-api", configuracaoApi.put);
    api.post("/configuracao-api/gerar-token", configuracaoApi.gerarToken);

    api.get("/clientes", clientes.list);
    api.get("/clientes/names", clientes.names);
    api.get("/clientes/grupos", clientes.grupos);
    api.get("/clientes/by-nome/:nome", clientes.getByNome);
    api.post("/clientes", clientes.create);
    api.put("/clientes/:id", clientes.update);
    api.delete("/clientes/:id", clientes.remove);

    api.get("/clientes/:id/acessos", clientes.listAcessos);
    api.post("/clientes/:id/acessos", clientes.addAcesso);
    api.put("/clientes/acessos/:acessoId", clientes.updateAcesso);
    api.delete("/clientes/acessos/:acessoId", clientes.removeAcesso);

    api.post("/clientes/excluir-lote", clientes.removeMany);
    api.post("/clientes/adicionar-sistema-lote", clientes.addSistemaMany);

    api.get("/sistemas", sistemas.list);
    api.post("/sistemas", sistemas.create);
    // :nome (não :id) -- o catálogo inteiro é tratado por nome em toda parte
    // (checkboxes, `add`, o texto salvo em clientes.sistemas); manter o
    // mesmo identificador na exclusão evita um segundo conceito de "id de
    // sistema" que mais nada no app usa.
    api.delete("/sistemas/:nome", sistemas.remove);

    api.get("/atualizacoes", atualizacoes.list);
    api.get("/atualizacoes/responsaveis", atualizacoes.distinctResponsaveis);
    api.get("/atualizacoes/last-by-client/:nome", atualizacoes.lastForClient);
    api.get("/atualizacoes/recent-by-client/:nome", atualizacoes.recentForClient);
    api.get("/atualizacoes/versoes-por-sistema", atualizacoes.latestVersionBySystem);
    api.get("/atualizacoes/por-sistema", atualizacoes.porSistema);
    api.get("/atualizacoes/export", atualizacoes.exportXlsx);
    api.post("/atualizacoes/import", upload.single("arquivo"), atualizacoes.importXlsx);
    // Antes do POST generico logo abaixo, como o /import: caminho especifico
    // primeiro, senao "/atualizacoes" casaria antes e criaria um registro.
    api.post("/atualizacoes/excluir-lote", atualizacoes.removeMany);
    api.post("/atualizacoes", atualizacoes.create);
    api.put("/atualizacoes/:id", atualizacoes.update);
    api.delete("/atualizacoes/:id", atualizacoes.remove);

    api.get("/agendamentos", agendamentos.list);
    api.get("/agendamentos/lembretes", agendamentos.lembretes);
    // Caminhos especificos antes do POST generico logo abaixo (mesmo motivo
    // do /import em atualizacoes): senao "/agendamentos" casaria primeiro.
    api.post("/agendamentos/excluir-lote", agendamentos.removeMany);
    api.post("/agendamentos/concluir-lote", agendamentos.markDoneMany);
    api.post("/agendamentos", agendamentos.create);
    api.put("/agendamentos/:id", agendamentos.update);
    api.patch("/agendamentos/:id/done", agendamentos.markDone);
    api.patch("/agendamentos/:id/reabrir", agendamentos.reabrir);
    api.patch("/agendamentos/:id/arquivar", agendamentos.arquivar);
    api.delete("/agendamentos/:id", agendamentos.remove);

    api.get("/resumo", resumo.get);

    api.get("/backups", backups.list);
    api.post("/backups/:arquivo/restore", backups.restore);

    api.get("/historico", historico.list);

    api.get("/usuarios", usuarios.list);
    api.post("/usuarios", usuarios.create);
    api.put("/usuarios/me/senha", usuarios.changeOwnPassword);
    api.delete("/usuarios/:id", usuarios.remove);

    api.get("/versoes", versoes.list);
    api.get("/versoes/ativas", versoes.ativas);
    // Painel do atualizador automatico: versoes no ar + situacao de cada
    // agente + indicadores, numa chamada so (ver VersaoService.painel).
    api.get("/versoes/painel", versoes.painel);
    api.get("/versoes/logs", versoes.logs);
    api.delete("/versoes/agentes/:cnpj", versoes.removeAgent);
    // O multipart contém os metadados do formulário e um único compactado.
    api.post("/versoes", pacoteUpload.single("pacote"), versoes.create);
    api.put("/versoes/:id", versoes.update);
    api.post("/versoes/:id/publicar", versoes.publish);
    api.delete("/versoes/:id", versoes.remove);

    this.router.use(api);
  }
}

module.exports = { ApiRouter };
