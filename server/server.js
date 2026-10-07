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

const { Servidor } = require("./src/Servidor");
const { problemaNoSegredoDeSessao } = require("./src/config/segredoSessao");
const { lerTransporte } = require("./src/config/transporte");

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

// HTTPS e proxy: combinação errada recusa a subida pelo mesmo motivo do
// segredo acima -- ver src/config/transporte.js.
const transporte = lerTransporte(process.env);
if (transporte.problemas.length) {
  for (const problema of transporte.problemas) console.error(`O servidor NÃO foi iniciado: ${problema}`);
  console.error('Ver "HTTPS" no README.');
  process.exit(1);
}

const config = {
  port: Number(process.env.PORT) || 3000,
  host: transporte.config.host,
  dbPath: path.resolve(__dirname, process.env.DB_PATH || "./data/gestao.db"),
  sessionSecret: String(process.env.SESSION_SECRET),
  sessionSecure: transporte.config.sessionSecure,
  agentApiToken: process.env.AGENT_API_TOKEN || "",
  // PUBLIC_URL, DISCORD_WEBHOOK_URL, ALERTA_AGENTES_INTERVALO_MINUTOS e
  // AGENDAMENTO_ARQUIVAR_DIAS viraram regras da equipe, no banco, editadas
  // na tela Administração. O .env só é lido para elas UMA vez, para trazer o
  // que a instalação já tinha -- ver ConfiguracaoSistemaService.importarValoresIniciais.
  ambiente: process.env,
  // Com um proxy reverso confiável na frente (Caddy, nginx...) terminando o
  // HTTPS, o Express confia no X-Forwarded-For/-Proto dele para descobrir o
  // IP real do cliente (usado pelo rate limiter do login) e se a conexão
  // foi segura. Desligado (padrão): sem proxy, qualquer cliente poderia
  // forjar esse cabeçalho e burlar o rate limiter usando IPs diferentes a
  // cada tentativa.
  trustProxy: transporte.config.trustProxy,
};

const server = new Servidor(config);

server.start().then(() => {
  // Com HTTPS ligado, o endereço que a equipe usa é o do proxy, que o Node
  // não conhece; o que ele sabe dizer é onde o proxy deve encaminhar. Sem
  // HTTPS, avisa que a rede não alcança -- quem acessava por http://IP:3000
  // antes do P01 acha aqui por que parou.
  const local = `http://${config.host || "localhost"}:${config.port}`;
  if (config.sessionSecure) console.log(`Gestor de Atualizações rodando em ${local}, só para o proxy HTTPS`);
  else console.log(`Gestor de Atualizações rodando em ${local} (HTTP só nesta máquina; para a rede, ver "HTTPS" no README)`);
  console.log(`Banco de dados: ${config.dbPath}`);
}).catch(async (err) => {
  console.error(`O servidor NÃO foi iniciado: ${err.message}`);
  await server.stop();
  server.db.close();
  process.exit(1);
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
