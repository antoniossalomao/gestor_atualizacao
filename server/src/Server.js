const path = require("path");

const express = require("express");
const session = require("express-session");
const helmet = require("helmet");

const { Database } = require("./database/Database");
const { SqliteSessionStore } = require("./database/SqliteSessionStore");
const { HistoricoService } = require("./services/HistoricoService");
const { AuthService } = require("./services/AuthService");
const { ClienteService } = require("./services/ClienteService");
const { AtualizacaoService } = require("./services/AtualizacaoService");
const { AgendamentoService } = require("./services/AgendamentoService");
const { BackupService } = require("./services/BackupService");
const { NotificationService } = require("./services/NotificationService");
const { VersaoService } = require("./services/VersaoService");
const { PreferenciaService } = require("./services/PreferenciaService");
const { AlertaAgenteService } = require("./services/AlertaAgenteService");
const { ConfiguracaoSistemaService } = require("./services/ConfiguracaoSistemaService");
const { AuthController } = require("./controllers/AuthController");
const { ClientesController } = require("./controllers/ClientesController");
const { SistemasController } = require("./controllers/SistemasController");
const { AtualizacoesController } = require("./controllers/AtualizacoesController");
const { AgendamentosController } = require("./controllers/AgendamentosController");
const { ResumoController } = require("./controllers/ResumoController");
const { BackupsController } = require("./controllers/BackupsController");
const { HistoricoController } = require("./controllers/HistoricoController");
const { UsersController } = require("./controllers/UsersController");
const { VersoesController } = require("./controllers/VersoesController");
const { PreferenciasController } = require("./controllers/PreferenciasController");
const { ConfiguracaoSistemaController } = require("./controllers/ConfiguracaoSistemaController");
const { SaudeService } = require("./services/SaudeService");
const { SaudeController } = require("./controllers/SaudeController");
const { LoginRateLimiter } = require("./middlewares/LoginRateLimiter");
const { ApiRouter } = require("./routes/index");
const { errorHandler } = require("./middlewares/errorHandler");
const { notFoundHandler } = require("./middlewares/notFoundHandler");

const CLIENT_DIR = path.join(__dirname, "..", "..", "client");
const UM_DIA_MS = 24 * 60 * 60 * 1000;

// Um pedido "de arquivo": o ultimo segmento do caminho termina em ".algo"
// (ate 8 caracteres, sem barra). Serve para separar "/clientes" (rota do
// front-end, cai no index.html) de "/js/app/App.js" ou "/css/theme.css"
// (arquivo que ou existe, ou e' 404) -- ver o fallback no fim de
// _configureExpress().
const EXTENSAO_DE_ARQUIVO = /\.[a-zA-Z0-9]{1,8}$/;

// Caminhos dentro de client/ que existem para o desenvolvimento e nao devem
// ser servidos pelo navegador -- ver _configureExpress().
const NAO_SERVIR = [/^\/package(-lock)?\.json$/, /^\/tests(\/|$)/];

/**
 * Classe raiz do backend: abre o banco, monta os servicos/controllers
 * (injecao de dependencia simples, na mao, sem framework de DI) e liga
 * tudo num app Express. Equivalente, do lado do servidor, ao papel que
 * "App(tk.Tk)" tinha em gestor/main_window.py -- so que aqui nao existe
 * janela nenhuma, o "start()" e o que corresponde ao antigo "mainloop()".
 */
class Server {
  /**
   * @param {{dbPath: string, port: number, sessionSecret: string, sessionSecure: boolean, agentApiToken?: string, trustProxy?: boolean, ambiente?: Record<string, string|undefined>}} config
   *   `ambiente` (normalmente process.env) só serve para importar, uma vez, as
   *   regras da equipe que antes moravam no .env -- ver
   *   ConfiguracaoSistemaService.importarValoresIniciais.
   */
  constructor(config) {
    this.config = config;
    this.db = new Database(config.dbPath);
    this.app = express();
    this.app.locals.agentApiToken = config.agentApiToken;
    this._buildServices();
    this._buildControllers();
    this._configureExpress();
  }

  _buildServices() {
    // "historico" é passado para os demais serviços registrarem quem fez
    // o quê -- ver services/HistoricoService.js.
    const historico = new HistoricoService(this.db);
    // As regras da equipe vêm primeiro: quase todo o resto lê alguma delas.
    const configuracaoSistema = new ConfiguracaoSistemaService(this.db, historico, { tokenAgentes: this.config.agentApiToken });
    // Uma vez só, na primeira subida depois de as regras irem para o banco --
    // ver ConfiguracaoSistemaService.importarValoresIniciais.
    configuracaoSistema.importarValoresIniciais(this.config.ambiente || {});
    const notifications = new NotificationService({ webhookUrl: () => configuracaoSistema.valor("discordWebhookUrl") });
    const versoes = new VersaoService(this.db, historico);
    this.services = {
      historico,
      notifications,
      auth: new AuthService(this.db, historico),
      preferencias: new PreferenciaService(this.db),
      clientes: new ClienteService(this.db, historico),
      atualizacoes: new AtualizacaoService(this.db, historico, notifications, configuracaoSistema),
      agendamentos: new AgendamentoService(this.db, historico, configuracaoSistema),
      backups: new BackupService(this.db, historico),
      versoes,
      configuracaoSistema,
      // Verifica a situação dos agentes C# periodicamente e avisa o
      // Discord quando um fica offline/com erro -- ver start()/stop()
      // abaixo, que ligam e desligam o timer junto com o servidor HTTP.
      // Recebe "configuracaoSistema" para não rodar nenhuma checagem
      // (nem gerar alarme falso) enquanto o Atualizador estiver desativado.
      alertaAgentes: new AlertaAgenteService(this.db, versoes, notifications, configuracaoSistema),
      saude: new SaudeService({ db: this.db, backups: new BackupService(this.db, historico), versoes }),
    };
  }

  _buildControllers() {
    const s = this.services;
    this.controllers = {
      auth: new AuthController(s.auth, s.configuracaoSistema),
      clientes: new ClientesController(s.clientes),
      sistemas: new SistemasController(s.clientes),
      atualizacoes: new AtualizacoesController(s.atualizacoes),
      agendamentos: new AgendamentosController(s.agendamentos),
      resumo: new ResumoController(s.atualizacoes),
      backups: new BackupsController(s.backups),
      historico: new HistoricoController(s.historico),
      usuarios: new UsersController(s.auth),
      // A URL pública entra nos links de download dos pacotes. É regra da
      // equipe (Administração); sem ela, vale o endereço pelo qual o admin
      // acessou o painel ao enviar o pacote.
      versoes: new VersoesController(s.versoes, () => s.configuracaoSistema.valor("publicUrl")),
      preferencias: new PreferenciasController(s.preferencias),
      configuracaoSistema: new ConfiguracaoSistemaController(s.configuracaoSistema, s.notifications),
      saude: new SaudeController(s.saude),
    };
    this.loginLimiter = new LoginRateLimiter();
  }

  _configureExpress() {
    const dbDir = path.dirname(this.db.path);

    // Atras de um proxy reverso (Caddy/nginx terminando o HTTPS), a conexao
    // que chega ate o Node e HTTP simples -- sem isto o Express enxerga
    // `req.protocol === "http"` e o express-session, com `cookie.secure`
    // ligado, se recusa a mandar o cookie de login. O sintoma seria "ninguem
    // consegue entrar", sem erro nenhum aparecendo. Tambem e o que faz
    // `req.get("host")` devolver o dominio publico em vez do host interno,
    // usado pelo VersoesController para montar a URL dos pacotes.
    // Configuravel via TRUST_PROXY=true no .env: falso por padrao (rede
    // local sem proxy) para que o IP real do cliente nunca venha de um
    // cabecalho X-Forwarded-For que o cliente possa forjar e usar para
    // burlar o rate limiter do login.
    this.app.set("trust proxy", this.config.trustProxy ? 1 : false);

    // Cabeçalhos HTTP de segurança padrão (X-Content-Type-Options,
    // desativa X-Powered-By, política básica de referrer, etc.) --
    // gratuito e amplamente usado, sem sentido reescrever isso na mão.
    //
    // CSP sob medida (refinamento prometido no comentário antigo aqui):
    // script-src fica só 'self' -- a proteção real contra XSS está em não
    // liberar 'unsafe-inline' aqui, por isso o script de tema saiu do
    // <head> para client/js/theme-init.js (ver index.html). style-src
    // precisa de 'unsafe-inline' porque várias views montam HTML com
    // atributo style="" direto (ex.: ClientesView, AtualizacoesView,
    // BarChart/PieChart) -- CSP não bloqueia style.propriedade via JS, só
    // style="" no HTML e <style> inline, então isso não abre brecha nova
    // pra script, só pra CSS. fonts.googleapis.com/gstatic.com liberados
    // porque é de lá que vem a fonte do tema (ver index.html).
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'self'"],
            // O helmet inclui isto por padrao, mas ele manda o navegador
            // recarregar TODO recurso da pagina (CSS, JS, chamadas de API)
            // via HTTPS -- inexistente aqui, ja que o servidor roda em HTTP
            // puro na rede local (ver SESSION_SECURE=false no .env). O
            // Chrome trata "localhost" como confiavel e ignora isso, mas
            // aplica a regra para qualquer IP (ex.: 192.168.0.85), fazendo
            // todo recurso falhar em silencio e a pagina ficar em branco.
            upgradeInsecureRequests: null,
          },
        },
      })
    );

    this.app.use(express.json({ limit: "1mb" }));
    this.sessionStore = new SqliteSessionStore({ filePath: path.join(dbDir, "sessions.sqlite") });
    this.services.backups.setSessionStore(this.sessionStore);
    // Permite que AuthService.changePassword invalide as sessões ativas do
    // usuário após a troca de senha -- mesmo padrão de injeção pós-construção
    // usado por BackupService acima (o store só existe aqui, depois de _buildServices).
    this.services.auth.setSessionStore(this.sessionStore);
    this.app.use(
      session({
        store: this.sessionStore,
        name: "gestor.sid",
        secret: this.config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
          maxAge: UM_DIA_MS * 7,
          httpOnly: true,
          secure: this.config.sessionSecure,
          sameSite: "lax",
        },
      })
    );

    // API primeiro, depois os arquivos estaticos do front-end -- assim uma
    // rota de API mal digitada nunca cai silenciosamente no fallback do
    // index.html.
    this.app.use("/api", new ApiRouter(this.controllers, this.loginLimiter, this.services.configuracaoSistema).router);

    // A pasta client/ e' servida inteira, mas nem tudo que mora nela e' do
    // navegador: "package.json" (so declara o script de teste) e "tests/"
    // existem para o desenvolvimento. Servir isso nao vaza segredo nenhum --
    // nao ha segredo nesses arquivos --, mas entrega de graca um mapa dos
    // modulos internos a quem esta so olhando, e nao ha um unico motivo para
    // estarem acessiveis. Bloqueado ANTES do express.static: depois ja seria
    // tarde, o arquivo teria sido enviado.
    this.app.use((req, res, next) => {
      if (!NAO_SERVIR.some((padrao) => padrao.test(req.path))) return next();
      // 404 direto, no mesmo formato do notFoundHandler. Nao e' "next()" com
      // desvio: "next('router')" aqui, no nivel do app, tem semantica sutil
      // (encerra o router atual) e deixaria "/tests" -- sem extensao -- cair
      // no fallback de SPA e responder o index.html com 200.
      res.status(404).type("txt").send("Arquivo não encontrado.");
    });
    this.app.use(express.static(CLIENT_DIR));
    // Qualquer caminho que nao seja /api/... e nao bata com um arquivo
    // estatico devolve o index.html -- o front-end (sem framework de
    // roteamento) decide sozinho, em JS, qual tela mostrar a partir do
    // estado de login, entao toda URL "cai" na mesma pagina.
    //
    // Menos os pedidos que sao claramente de ARQUIVO (tem extensao): esses
    // recebem 404 de verdade. Sem essa excecao, um caminho de asset errado
    // -- "/js/core/App.js" depois de o arquivo ter mudado de pasta, por
    // exemplo -- respondia 200 com o HTML do index.html no lugar do modulo,
    // e o navegador so reclamava la na frente com "Failed to load module
    // script: expected a JavaScript module script but the server responded
    // with a MIME type of text/html". Encontrado exatamente assim numa
    // reorganizacao de pastas do client. E' o mesmo raciocinio que ja
    // justifica montar a API antes do estatico, logo acima: erro de
    // caminho deve falhar alto, nao virar uma pagina em branco.
    this.app.get(/^(?!\/api).*/, (req, res, next) => {
      if (EXTENSAO_DE_ARQUIVO.test(req.path)) return next();
      res.sendFile(path.join(CLIENT_DIR, "index.html"));
    });

    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  start() {
    // O intervalo é regra da equipe (minutos, com piso de 1 garantido em
    // config/regrasEquipe.js), lido de novo a cada reprogramação: mudar o
    // intervalo ou o webhook na Administração reinicia o timer na hora, e
    // configurar o webhook com o servidor já no ar liga o alerta sem reiniciar.
    const { alertaAgentes, configuracaoSistema } = this.services;
    alertaAgentes.start(() => configuracaoSistema.valor("alertaAgentesIntervaloMinutos") * 60 * 1000);
    configuracaoSistema.aoMudar((mudou) => {
      if (mudou.includes("alertaAgentesIntervaloMinutos") || mudou.includes("discordWebhookUrl")) {
        alertaAgentes.reprogramar();
      }
    });
    return new Promise((resolve) => {
      this.httpServer = this.app.listen(this.config.port, () => resolve(this.httpServer));
    });
  }

  stop() {
    this.services.alertaAgentes.stop();
    // O store de sessoes tem um arquivo SQLite proprio, separado do banco
    // principal -- ele nao fecha junto com `db.close()` do chamador, entao
    // precisa ser fechado aqui, senao o handle sobrevive ao "stop".
    this.sessionStore?.close();
    return new Promise((resolve, reject) => {
      if (!this.httpServer) return resolve();
      this.httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

module.exports = { Server };
