/**
 * Ponto de entrada do backend. So le a configuracao (arquivo .env) e manda
 * o servidor subir -- nenhuma logica de verdade mora aqui, igual o antigo
 * "Atualizacao.py" so decidia onde ficava o gestao.db e chamava
 * App(DB_PATH).mainloop().
 *
 * Uso: `npm start` (producao) ou `npm run dev` (reinicia sozinho a cada
 * alteracao de arquivo, via nodemon).
 */
// "quiet": o dotenv 17 passou a imprimir um banner ("injected env (N) from
// .env") no console a cada início -- puramente cosmético, mas é uma saída
// nova que não existia antes da atualização de dependências de set/2026;
// silenciado para manter o log de start igual ao de sempre.
require("dotenv").config({ quiet: true });
const path = require("path");

const { Server } = require("./src/Server");
const { problemaNoSegredoDeSessao } = require("./src/config/segredoSessao");

// Recusa subir sem um SESSION_SECRET de verdade -- ver o porquê em
// src/config/segredoSessao.js. Antes de abrir o banco, de propósito: não
// há nada a fazer com o servidor de pé se o login dele pode ser forjado.
const problemaSegredo = problemaNoSegredoDeSessao(process.env.SESSION_SECRET);
if (problemaSegredo) {
  console.error(`O servidor NÃO foi iniciado: ${problemaSegredo}`);
  console.error("Gere um valor aleatório e grave em SESSION_SECRET no server/.env:");
  console.error("  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  process.exit(1);
}

const config = {
  port: Number(process.env.PORT) || 3000,
  dbPath: path.resolve(__dirname, process.env.DB_PATH || "./data/gestao.db"),
  sessionSecret: String(process.env.SESSION_SECRET),
  sessionSecure: process.env.SESSION_SECURE === "true",
  agentApiToken: process.env.AGENT_API_TOKEN || "",
  // PUBLIC_URL, DISCORD_WEBHOOK_URL, ALERTA_AGENTES_INTERVALO_MINUTOS e
  // AGENDAMENTO_ARQUIVAR_DIAS viraram regras da equipe, no banco, editadas
  // na tela Administração. O .env só é lido para elas UMA vez, para trazer o
  // que a instalação já tinha -- ver ConfiguracaoSistemaService.importarValoresIniciais.
  ambiente: process.env,
  // "true" quando há exatamente um proxy reverso confiável na frente (Caddy,
  // nginx...) terminando o HTTPS. Ligado: o Express confia no X-Forwarded-For
  // para descobrir o IP real do cliente (usado pelo rate limiter do login).
  // Desligado (padrão): sem proxy, qualquer cliente poderia forjar esse
  // cabeçalho e burlar o rate limiter usando IPs diferentes a cada tentativa.
  trustProxy: process.env.TRUST_PROXY === "true",
};

const server = new Server(config);

server.start().then(() => {
  console.log(`Gestor de Atualizações rodando em http://localhost:${config.port}`);
  console.log(`Banco de dados: ${config.dbPath}`);
});

// Encerra a conexao com o banco de forma organizada ao parar o processo
// (Ctrl+C no terminal, ou o gerenciador de processos pedindo pra parar) --
// evita deixar o arquivo do SQLite num estado de escrita pela metade.
for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, () => {
    server
      .stop()
      .catch(() => {})
      .finally(() => {
        server.db.close();
        process.exit(0);
      });
  });
}
