const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const { exigirLogin } = require("../middlewares/exigirLogin");
const { exigirPapel } = require("../middlewares/exigirPapel");
const { exigirAgente } = require("../middlewares/exigirAgente");
const { exigirAtualizadorHabilitado } = require("../middlewares/exigirAtualizadorHabilitado");
const { protecaoCsrf } = require("../middlewares/protecaoCsrf");
const { LIMITE_UPLOAD_MB } = require("../config/constantes");
const { ErroDeValidacao } = require("../shared/erros");

// Planilhas de import: limite de 15 MB e validação rigorosa de extensão (.xlsx / .xls)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_UPLOAD_MB.arquivo * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ext === ".xlsx" || ext === ".xls") {
      cb(null, true);
    } else {
      // ErroDeValidacao, e não Error: sem o statusCode, a recusa virava
      // "Erro interno do servidor." (500) e ia para o log como falha (P05).
      cb(new ErroDeValidacao("Formato inválido. Envie uma planilha Excel (.xlsx ou .xls)."));
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
  limits: { fileSize: LIMITE_UPLOAD_MB.pacote * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const lower = (file.originalname || "").toLowerCase();
    const permitido = [...EXTENSOES_PACOTE].some((ext) => lower.endsWith(ext));
    if (permitido) {
      cb(null, true);
    } else {
      cb(new ErroDeValidacao("Formato não suportado. Envie arquivos compactados (.zip, .rar, .7z) ou executáveis (.exe, .msi)."));
    }
  },
});

/**
 * Monta o roteador da API (`/api/...`) a partir dos controllers ja
 * instanciados. Aplica middlewares de segurança e controle de papéis (RBAC).
 */
class ApiRouter {
  /** @param {import('../services/ConfiguracaoSistemaService').ConfiguracaoSistemaService} configuracaoSistemaService */
  constructor(controllers, loginLimiter, configuracaoSistemaService) {
    this.controllers = controllers;
    this.loginLimiter = loginLimiter;
    this.configuracaoSistemaService = configuracaoSistemaService;
    this.router = express.Router();
    // Antes de qualquer rota, inclusive dos uploads: uma escrita recusada
    // não pode deixar nem o arquivo gravado pelo multer. Ver protecaoCsrf.js.
    this.router.use(protecaoCsrf);
    this._registrarRotasDeAutenticacao();
    this._registrarRotasProtegidas();
  }

  // Rotas que precisam funcionar ANTES do login (checar status, logar, criar o 1o admin)
  _registrarRotasDeAutenticacao() {
    const { auth } = this.controllers;
    this.router.get("/auth/status", auth.status);
    this.router.post("/auth/setup", this.loginLimiter.middleware, auth.configurarAdmin);
    this.router.post("/auth/login", this.loginLimiter.middleware, auth.login);
    this.router.post("/auth/logout", auth.logout);

    // Rotas consumidas pelo Worker C# (protegidas por token do agente e,
    // enquanto o Atualizador estiver desativado em Configurações, bloqueadas
    // também aqui -- ver exigirAtualizadorHabilitado).
    const agent = express.Router();
    agent.use("/update", exigirAgente, exigirAtualizadorHabilitado(this.configuracaoSistemaService));
    agent.get("/update/check/:cnpj", this.controllers.versoes.check);
    agent.post("/update/log", this.controllers.versoes.log);
    agent.get("/update/packages/:filename", this.controllers.versoes.download);
    agent.get("/update/status/:cnpj", this.controllers.versoes.statusAgente);
    this.router.use(agent);
  }

  // Rotas autenticadas e controladas por papéis (RBAC)
  _registrarRotasProtegidas() {
    const {
      clientes,
      sistemas,
      atualizacoes,
      agendamentos,
      resumo,
      backups,
      historico,
      usuarios,
      versoes,
      preferencias,
      configuracaoSistema,
      saude,
      campanhas,
    } = this.controllers;
    const api = express.Router();
    api.use(exigirLogin);

    // Saúde operacional e diagnóstico do sistema (exclusivo Administrador)
    api.get("/saude", exigirPapel("admin"), saude.get);

    // Preferências pessoais do usuário conectado (acessível a qualquer autenticado)
    api.get("/preferencias", preferencias.get);
    api.put("/preferencias", preferencias.put);

    // Regras da equipe (config/regrasEquipe.js). As públicas para qualquer
    // autenticado -- o front-end usa para decidir o que mostrar e para
    // explicar o que mostra --; todas as outras operações, só Admin.
    // (As antigas /configuracao-api, que reescreviam o .env, saíram.)
    api.get("/configuracao-sistema", configuracaoSistema.get);
    api.get("/configuracao-sistema/completa", exigirPapel("admin"), configuracaoSistema.completa);
    api.put("/configuracao-sistema", exigirPapel("admin"), configuracaoSistema.put);
    api.post("/configuracao-sistema/testar-discord", exigirPapel("admin"), configuracaoSistema.testarDiscord);

    // Clientes: leitura aberta a Consulta; escrita a Operador/Admin; exclusão em lote a Admin
    api.get("/clientes", clientes.list);
    api.get("/clientes/names", clientes.names);
    api.get("/clientes/opcoes-por-codigo", clientes.opcoesPorCodigo);
    api.get("/clientes/grupos", clientes.grupos);
    api.get("/clientes/cidades", clientes.cidades);
    api.get("/clientes/by-nome/:nome", clientes.obterPorNome);
    api.post("/clientes", exigirPapel("operador", "admin"), clientes.create);
    api.put("/clientes/:id", exigirPapel("operador", "admin"), clientes.update);
    api.delete("/clientes/:id", exigirPapel("operador", "admin"), clientes.remove);

    api.get("/clientes/:id/acessos", clientes.listarAcessos);
    api.post("/clientes/:id/acessos", exigirPapel("operador", "admin"), clientes.adicionarAcesso);
    api.put("/clientes/acessos/:acessoId", exigirPapel("operador", "admin"), clientes.alterarAcesso);
    api.delete("/clientes/acessos/:acessoId", exigirPapel("operador", "admin"), clientes.removerAcesso);

    api.post("/clientes/excluir-lote", exigirPapel("admin"), clientes.removeMany);
    api.post("/clientes/adicionar-sistema-lote", exigirPapel("operador", "admin"), clientes.adicionarSistemaEmLote);

    // Sistemas
    api.get("/sistemas", sistemas.list);
    api.get("/sistemas/versoes", sistemas.versoes);
    api.get("/sistemas/catalogo", exigirPapel("admin"), sistemas.catalogo);
    api.patch("/sistemas/:id/classificacao", exigirPapel("admin"), sistemas.classificar);
    api.put("/sistemas/:nome/versao", exigirPapel("operador", "admin"), sistemas.salvarVersao);
    api.post("/sistemas", exigirPapel("operador", "admin"), sistemas.create);
    api.delete("/sistemas/:nome", exigirPapel("operador", "admin"), sistemas.remove);

    // Atualizações
    api.get("/atualizacoes", atualizacoes.list);
    api.get("/atualizacoes/relatorio", atualizacoes.relatorio);
    api.get("/atualizacoes/situacao-cliente/:nome", atualizacoes.situacaoCliente);
    api.get("/atualizacoes/responsaveis", atualizacoes.responsaveisDistintos);
    api.get("/atualizacoes/recent-by-client/:nome", atualizacoes.recentForClient);
    api.get("/atualizacoes/por-sistema", atualizacoes.porSistema);
    api.get("/atualizacoes/export", atualizacoes.exportarXlsx);
    // Prévia antes de importar: só lê, mas com o mesmo papel da importação --
    // quem não pode importar não tem por que conferir.
    api.post("/atualizacoes/import/previa", exigirPapel("operador", "admin"), upload.single("arquivo"), atualizacoes.previaImport);
    api.post("/atualizacoes/import", exigirPapel("operador", "admin"), upload.single("arquivo"), atualizacoes.importarXlsx);
    api.post("/atualizacoes/excluir-lote", exigirPapel("admin"), atualizacoes.removeMany);
    api.post("/atualizacoes", exigirPapel("operador", "admin"), atualizacoes.create);
    api.put("/atualizacoes/:id", exigirPapel("operador", "admin"), atualizacoes.update);
    api.delete("/atualizacoes/:id", exigirPapel("operador", "admin"), atualizacoes.remove);

    // Agendamentos
    api.get("/agendamentos", agendamentos.list);
    api.get("/agendamentos/lembretes", agendamentos.lembretes);
    api.post("/agendamentos", exigirPapel("operador", "admin"), agendamentos.create);
    api.put("/agendamentos/:id", exigirPapel("operador", "admin"), agendamentos.update);
    api.patch("/agendamentos/:id/done", exigirPapel("operador", "admin"), agendamentos.marcarConcluida);
    api.patch("/agendamentos/:id/reabrir", exigirPapel("operador", "admin"), agendamentos.reabrir);
    api.patch("/agendamentos/:id/arquivar", exigirPapel("operador", "admin"), agendamentos.arquivar);
    api.delete("/agendamentos/:id", exigirPapel("operador", "admin"), agendamentos.remove);

    // Campanhas: leitura para todos; criar, editar e encerrar para quem já
    // registra atualizações; excluir só Admin (apaga a meta e o placar).
    api.get("/campanhas", campanhas.list);
    api.get("/campanhas/:id", campanhas.get);
    api.get("/campanhas/:id/export", campanhas.exportarXlsx);
    api.post("/campanhas", exigirPapel("operador", "admin"), campanhas.create);
    api.put("/campanhas/:id", exigirPapel("operador", "admin"), campanhas.update);
    api.patch("/campanhas/:id/encerrar", exigirPapel("operador", "admin"), campanhas.encerrar);
    api.patch("/campanhas/:id/reabrir", exigirPapel("operador", "admin"), campanhas.reabrir);
    api.delete("/campanhas/:id", exigirPapel("admin"), campanhas.remove);

    // Resumo e Histórico
    api.get("/resumo", resumo.get);
    api.get("/historico", historico.list);

    // Backups: listagem para usuários autorizados, download e restore exclusivos do Admin
    api.get("/backups", backups.list);
    api.get("/backups/atual/download", exigirPapel("admin"), backups.downloadCurrent);
    api.get("/backups/:arquivo/download", exigirPapel("admin"), backups.download);
    api.post("/backups/:arquivo/restore", exigirPapel("admin"), backups.restore);

    // Gestão de Usuários: listagem e administração restrita a Admin; troca de senha própria aberta
    api.get("/usuarios", exigirPapel("admin"), usuarios.list);
    // A própria conta (nome e sessões abertas), para qualquer papel. Vem
    // ANTES de "/usuarios/:id": com ele primeiro, um PUT em /usuarios/me
    // casaria com ":id" e cairia no exigirPapel("admin").
    api.get("/usuarios/me", usuarios.meuPerfil);
    api.put("/usuarios/me", usuarios.atualizarMeuPerfil);
    api.get("/usuarios/me/sessoes", usuarios.listarSessoes);
    api.delete("/usuarios/me/sessoes", usuarios.encerrarOutrasSessoes);
    api.delete("/usuarios/me/sessoes/:id", usuarios.encerrarSessao);
    api.post("/usuarios", exigirPapel("admin"), usuarios.create);
    api.put("/usuarios/:id", exigirPapel("admin"), usuarios.update);
    api.put("/usuarios/me/senha", usuarios.changeOwnPassword);
    api.delete("/usuarios/:id", exigirPapel("admin"), usuarios.remove);

    // Versões e Distribuição -- bloqueadas enquanto o Atualizador estiver
    // desativado em Configurações (ver exigirAtualizadorHabilitado); sem
    // isto, desligar a tela não impediria chamar a API direto.
    api.use("/versoes", exigirAtualizadorHabilitado(this.configuracaoSistemaService));
    api.get("/versoes", versoes.list);
    api.get("/versoes/ativas", versoes.ativas);
    api.get("/versoes/painel", versoes.painel);
    api.get("/versoes/logs", versoes.logs);
    api.delete("/versoes/agentes/:cnpj", exigirPapel("admin"), versoes.removeAgent);
    api.patch("/versoes/agentes/:cnpj/pausar", exigirPapel("operador", "admin"), versoes.pausarAgente);
    api.patch("/versoes/agentes/:cnpj/retomar", exigirPapel("operador", "admin"), versoes.retomarAgente);

    // Criação de rascunhos (operador e admin); Publicação e exclusão (somente admin)
    api.post("/versoes", exigirPapel("operador", "admin"), pacoteUpload.single("pacote"), versoes.create);
    api.put("/versoes/:id", exigirPapel("operador", "admin"), versoes.update);
    api.post("/versoes/:id/publicar", exigirPapel("admin"), versoes.publish);
    api.post("/versoes/:id/promover", exigirPapel("admin"), versoes.promover);
    api.post("/versoes/:id/rollback", exigirPapel("admin"), versoes.rollback);
    api.delete("/versoes/:id", exigirPapel("admin"), versoes.remove);

    this.router.use(api);
  }
}

module.exports = { ApiRouter };
