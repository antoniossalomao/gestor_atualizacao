const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const { requireAuth } = require("../middlewares/requireAuth");
const { requireRole } = require("../middlewares/requireRole");
const { requireAgent } = require("../middlewares/requireAgent");

// Planilhas de import: limite de 15 MB e validação rigorosa de extensão (.xlsx / .xls)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ext === ".xlsx" || ext === ".xls") {
      cb(null, true);
    } else {
      cb(new Error("Formato inválido. Envie uma planilha Excel (.xlsx ou .xls)."));
    }
  },
});

const EXTENSOES_PACOTE = new Set([".zip", ".rar", ".7z", ".tar.gz", ".gz", ".tar", ".exe", ".msi"]);

// Pacotes de atualização: limite de 500 MB e validação de extensão permitida
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
  fileFilter: (_req, file, cb) => {
    const lower = (file.originalname || "").toLowerCase();
    const permitido = [...EXTENSOES_PACOTE].some((ext) => lower.endsWith(ext));
    if (permitido) {
      cb(null, true);
    } else {
      cb(new Error("Formato não suportado. Envie arquivos compactados (.zip, .rar, .7z) ou executáveis (.exe, .msi)."));
    }
  },
});

/**
 * Monta o roteador da API (`/api/...`) a partir dos controllers ja
 * instanciados. Aplica middlewares de segurança e controle de papéis (RBAC).
 */
class ApiRouter {
  constructor(controllers, loginLimiter) {
    this.controllers = controllers;
    this.loginLimiter = loginLimiter;
    this.router = express.Router();
    this._registerAuthRoutes();
    this._registerProtectedRoutes();
  }

  // Rotas que precisam funcionar ANTES do login (checar status, logar, criar o 1o admin)
  _registerAuthRoutes() {
    const { auth } = this.controllers;
    this.router.get("/auth/status", auth.status);
    this.router.post("/auth/setup", this.loginLimiter.middleware, auth.setupAdmin);
    this.router.post("/auth/login", this.loginLimiter.middleware, auth.login);
    this.router.post("/auth/logout", auth.logout);

    // Rotas consumidas pelo Worker C# (protegidas por token do agente)
    const agent = express.Router();
    agent.use("/update", requireAgent);
    agent.get("/update/check/:cnpj", this.controllers.versoes.check);
    agent.post("/update/log", this.controllers.versoes.log);
    agent.get("/update/packages/:filename", this.controllers.versoes.download);
    agent.get("/update/status/:cnpj", this.controllers.versoes.statusAgente);
    this.router.use(agent);
  }

  // Rotas autenticadas e controladas por papéis (RBAC)
  _registerProtectedRoutes() {
    const { clientes, sistemas, atualizacoes, agendamentos, resumo, backups, historico, usuarios, versoes, preferencias, configuracaoApi, saude } =
      this.controllers;
    const api = express.Router();
    api.use(requireAuth);

    // Saúde operacional e diagnóstico do sistema (exclusivo Administrador)
    api.get("/saude", requireRole("admin"), saude.get);

    // Preferências pessoais do usuário conectado (acessível a qualquer autenticado)
    api.get("/preferencias", preferencias.get);
    api.put("/preferencias", preferencias.put);

    // Configuração do sistema / .env (exclusivo Administrador)
    api.get("/configuracao-api", requireRole("admin"), configuracaoApi.get);
    api.put("/configuracao-api", requireRole("admin"), configuracaoApi.put);
    api.post("/configuracao-api/gerar-token", requireRole("admin"), configuracaoApi.gerarToken);

    // Clientes: leitura aberta a Consulta; escrita a Operador/Admin; exclusão em lote a Admin
    api.get("/clientes", clientes.list);
    api.get("/clientes/names", clientes.names);
    api.get("/clientes/grupos", clientes.grupos);
    api.get("/clientes/by-nome/:nome", clientes.getByNome);
    api.post("/clientes", requireRole("operador", "admin"), clientes.create);
    api.put("/clientes/:id", requireRole("operador", "admin"), clientes.update);
    api.delete("/clientes/:id", requireRole("operador", "admin"), clientes.remove);

    api.get("/clientes/:id/acessos", clientes.listAcessos);
    api.post("/clientes/:id/acessos", requireRole("operador", "admin"), clientes.addAcesso);
    api.put("/clientes/acessos/:acessoId", requireRole("operador", "admin"), clientes.updateAcesso);
    api.delete("/clientes/acessos/:acessoId", requireRole("operador", "admin"), clientes.removeAcesso);

    api.post("/clientes/excluir-lote", requireRole("admin"), clientes.removeMany);
    api.post("/clientes/adicionar-sistema-lote", requireRole("operador", "admin"), clientes.addSistemaMany);

    // Sistemas
    api.get("/sistemas", sistemas.list);
    api.post("/sistemas", requireRole("operador", "admin"), sistemas.create);
    api.delete("/sistemas/:nome", requireRole("operador", "admin"), sistemas.remove);

    // Atualizações
    api.get("/atualizacoes", atualizacoes.list);
    api.get("/atualizacoes/responsaveis", atualizacoes.distinctResponsaveis);
    api.get("/atualizacoes/last-by-client/:nome", atualizacoes.lastForClient);
    api.get("/atualizacoes/recent-by-client/:nome", atualizacoes.recentForClient);
    api.get("/atualizacoes/versoes-por-sistema", atualizacoes.latestVersionBySystem);
    api.get("/atualizacoes/por-sistema", atualizacoes.porSistema);
    api.get("/atualizacoes/export", atualizacoes.exportXlsx);
    api.post("/atualizacoes/import", requireRole("operador", "admin"), upload.single("arquivo"), atualizacoes.importXlsx);
    api.post("/atualizacoes/excluir-lote", requireRole("admin"), atualizacoes.removeMany);
    api.post("/atualizacoes", requireRole("operador", "admin"), atualizacoes.create);
    api.put("/atualizacoes/:id", requireRole("operador", "admin"), atualizacoes.update);
    api.delete("/atualizacoes/:id", requireRole("operador", "admin"), atualizacoes.remove);

    // Agendamentos
    api.get("/agendamentos", agendamentos.list);
    api.get("/agendamentos/lembretes", agendamentos.lembretes);
    api.post("/agendamentos/excluir-lote", requireRole("admin"), agendamentos.removeMany);
    api.post("/agendamentos/concluir-lote", requireRole("operador", "admin"), agendamentos.markDoneMany);
    api.post("/agendamentos", requireRole("operador", "admin"), agendamentos.create);
    api.put("/agendamentos/:id", requireRole("operador", "admin"), agendamentos.update);
    api.patch("/agendamentos/:id/done", requireRole("operador", "admin"), agendamentos.markDone);
    api.patch("/agendamentos/:id/reabrir", requireRole("operador", "admin"), agendamentos.reabrir);
    api.patch("/agendamentos/:id/arquivar", requireRole("operador", "admin"), agendamentos.arquivar);
    api.delete("/agendamentos/:id", requireRole("operador", "admin"), agendamentos.remove);

    // Resumo e Histórico
    api.get("/resumo", resumo.get);
    api.get("/historico", historico.list);

    // Backups: listagem para usuários autorizados, download e restore exclusivos do Admin
    api.get("/backups", backups.list);
    api.get("/backups/atual/download", requireRole("admin"), backups.downloadCurrent);
    api.get("/backups/:arquivo/download", requireRole("admin"), backups.download);
    api.post("/backups/:arquivo/restore", requireRole("admin"), backups.restore);

    // Gestão de Usuários: listagem e administração restrita a Admin; troca de senha própria aberta
    api.get("/usuarios", requireRole("admin"), usuarios.list);
    api.post("/usuarios", requireRole("admin"), usuarios.create);
    api.put("/usuarios/:id", requireRole("admin"), usuarios.update);
    api.put("/usuarios/me/senha", usuarios.changeOwnPassword);
    api.delete("/usuarios/:id", requireRole("admin"), usuarios.remove);

    // Versões e Distribuição
    api.get("/versoes", versoes.list);
    api.get("/versoes/ativas", versoes.ativas);
    api.get("/versoes/painel", versoes.painel);
    api.get("/versoes/logs", versoes.logs);
    api.delete("/versoes/agentes/:cnpj", requireRole("admin"), versoes.removeAgent);
    api.patch("/versoes/agentes/:cnpj/pausar", requireRole("operador", "admin"), versoes.pausarAgente);
    api.patch("/versoes/agentes/:cnpj/retomar", requireRole("operador", "admin"), versoes.retomarAgente);

    // Criação de rascunhos (operador e admin); Publicação e exclusão (somente admin)
    api.post("/versoes", requireRole("operador", "admin"), pacoteUpload.single("pacote"), versoes.create);
    api.put("/versoes/:id", requireRole("operador", "admin"), versoes.update);
    api.post("/versoes/:id/publicar", requireRole("admin"), versoes.publish);
    api.delete("/versoes/:id", requireRole("admin"), versoes.remove);

    this.router.use(api);
  }
}

module.exports = { ApiRouter };
