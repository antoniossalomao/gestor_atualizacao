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
const { LoginRateLimiter } = require("./middlewares/LoginRateLimiter");
const { ApiRouter } = require("./routes/index");
const { errorHandler } = require("./middlewares/errorHandler");

const CLIENT_DIR = path.join(__dirname, "..", "..", "client");
const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Classe raiz do backend: abre o banco, monta os servicos/controllers
 * (injecao de dependencia simples, na mao, sem framework de DI) e liga
 * tudo num app Express. Equivalente, do lado do servidor, ao papel que
 * "App(tk.Tk)" tinha em gestor/main_window.py -- so que aqui nao existe
 * janela nenhuma, o "start()" e o que corresponde ao antigo "mainloop()".
 */
class Server {
  /**
   * @param {{dbPath: string, port: number, sessionSecret: string, sessionSecure: boolean, discordWebhookUrl?: string}} config
   */
  constructor(config) {
    this.config = config;
    this.db = new Database(config.dbPath);
    this.app = express();
    this.app.locals.agentApiToken = config.agentApiToken;
    this.app.set("publicUrl", config.publicUrl);
    this._buildServices();
    this._buildControllers();
    this._configureExpress();
  }

  _buildServices() {
    // "historico" é passado para os demais serviços registrarem quem fez
    // o quê -- ver services/HistoricoService.js.
    const historico = new HistoricoService(this.db);
    const notifications = new NotificationService(this.config);
    this.services = {
      historico,
      notifications,
      auth: new AuthService(this.db, historico),
      clientes: new ClienteService(this.db, historico),
      atualizacoes: new AtualizacaoService(this.db, historico, notifications),
      agendamentos: new AgendamentoService(this.db, historico),
      backups: new BackupService(this.db, historico),
      versoes: new VersaoService(this.db, historico),
    };
  }

  _buildControllers() {
    const s = this.services;
    this.controllers = {
      auth: new AuthController(s.auth),
      clientes: new ClientesController(s.clientes),
      sistemas: new SistemasController(s.clientes),
      atualizacoes: new AtualizacoesController(s.atualizacoes),
      agendamentos: new AgendamentosController(s.agendamentos),
      resumo: new ResumoController(s.atualizacoes),
      backups: new BackupsController(s.backups),
      historico: new HistoricoController(s.historico),
      usuarios: new UsersController(s.auth),
      versoes: new VersoesController(s.versoes),
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
    // "1" = confia em um unico proxy na frente (o nosso), nao numa cadeia
    // qualquer que o cliente possa forjar por cabecalho.
    this.app.set("trust proxy", 1);

    // Cabeçalhos HTTP de segurança padrão (X-Content-Type-Options,
    // desativa X-Powered-By, política básica de referrer, etc.) --
    // gratuito e amplamente usado, sem sentido reescrever isso na mão.
    // "contentSecurityPolicy: false" porque a CSP default do helmet
    // bloquearia o Google Fonts que o tema usa (client/css/theme.css);
    // uma CSP sob medida fica como possível refinamento futuro.
    this.app.use(helmet({ contentSecurityPolicy: false }));

    this.app.use(express.json());
    this.app.use(
      session({
        store: new SqliteSessionStore({ filePath: path.join(dbDir, "sessions.sqlite") }),
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
    this.app.use("/api", new ApiRouter(this.controllers, this.loginLimiter).router);
    this.app.use(express.static(CLIENT_DIR));
    // Qualquer caminho que nao seja /api/... e nao bata com um arquivo
    // estatico devolve o index.html -- o front-end (sem framework de
    // roteamento) decide sozinho, em JS, qual tela mostrar a partir do
    // estado de login, entao toda URL "cai" na mesma pagina.
    this.app.get(/^(?!\/api).*/, (req, res) => {
      res.sendFile(path.join(CLIENT_DIR, "index.html"));
    });

    this.app.use(errorHandler);
  }

  start() {
    return new Promise((resolve) => {
      this.httpServer = this.app.listen(this.config.port, () => resolve(this.httpServer));
    });
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.httpServer) return resolve();
      this.httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

module.exports = { Server };
