/**
 * Decide como o servidor conversa com o navegador: atrás do proxy que termina
 * o HTTPS (Caddy em proxy/Caddyfile ou balanceador da Azure), ou em HTTP puro
 * só para a própria máquina (docs/ARQUITETURA.md#adr-0010).
 *
 * Somente HTTPS na rede (decisão de 29/09/2026, ao preparar o painel para
 * sair do PC de quem o usa): HTTP puro continua existindo, mas escutando só
 * em 127.0.0.1 -- é o `npm run dev` de quem desenvolve. Antes, o servidor
 * escutava em todas as interfaces e a equipe inteira acessava
 * http://IP:3000, mandando a senha em texto puro. Quem ainda tentar esse
 * endereço vê "conexão recusada": é o sinal de que falta o proxy.
 *
 * O Node nunca fala TLS aqui -- quem fala é o proxy. Por isso as duas
 * variáveis andam juntas, e uma combinação errada falhava EM SILÊNCIO:
 *
 * - SESSION_SECURE=true sem TRUST_PROXY: o Express enxerga toda conexão como
 *   HTTP, o express-session se recusa a mandar o cookie marcado "Secure", e o
 *   login aceita a senha e volta para a tela de login, sem erro nenhum.
 * - SESSION_SECURE=TRUE, =1, =sim: antes, qualquer coisa diferente de "true"
 *   virava false sem aviso, e a instalação que achava estar protegida
 *   continuava mandando cookie por HTTP.
 *
 * As duas viram recusa de subida, com o motivo em português, no mesmo
 * espírito de segredoSessao.js; em produção elas vêm no server/.env ou App
 * Settings, e validar no boot protege contra falhas silenciosas. Função pura
 * (não lê process.env nem encerra o processo) para ser testável -- quem decide
 * o que fazer é o server.js.
 */

/** Onde o HTTP puro escuta: só a própria máquina alcança. */
const HOST_SO_LOCAL = "127.0.0.1";

/**
 * @param {string|undefined} valor
 * @param {string} nome
 * @returns {{valor: boolean} | {problema: string}}
 */
function lerBooleano(valor, nome) {
  const texto = String(valor ?? "").trim().toLowerCase();
  if (texto === "" || texto === "false") return { valor: false };
  if (texto === "true") return { valor: true };
  return { problema: `${nome}="${valor}" não é um valor válido. Use true ou false.` };
}

/**
 * @param {Record<string, string|undefined>} env normalmente process.env
 * @returns {{
 *   config: {sessionSecure: boolean, trustProxy: boolean, host: string|undefined},
 *   problemas: string[],
 * }}
 *   `problemas` não vazio = não subir. `host` indefinido = todas as
 *   interfaces, útil quando o proxy externo (ex.: Azure App Service) conecta
 *   fora do loopback. Atrás do Caddy local, defina HOST=127.0.0.1.
 */
function lerTransporte(env) {
  const problemas = [];
  const secure = lerBooleano(env.SESSION_SECURE, "SESSION_SECURE");
  if ("problema" in secure) problemas.push(secure.problema);
  const trust = lerBooleano(env.TRUST_PROXY, "TRUST_PROXY");
  if ("problema" in trust) problemas.push(trust.problema);

  const sessionSecure = "valor" in secure ? secure.valor : false;
  const trustProxy = "valor" in trust ? trust.valor : false;

  if (sessionSecure && "valor" in trust && !trustProxy) {
    problemas.push(
      "SESSION_SECURE=true exige o proxy HTTPS na frente e TRUST_PROXY=true. " +
        "Sem TRUST_PROXY, toda conexão parece HTTP e ninguém consegue entrar."
    );
  }

  let host = HOST_SO_LOCAL;
  if (sessionSecure) {
    const hostEnv = String(env.HOST ?? "").trim().toLowerCase();
    if (hostEnv === "" || hostEnv === "0.0.0.0") host = undefined;
    else if (hostEnv === "127.0.0.1" || hostEnv === "localhost") host = HOST_SO_LOCAL;
    else problemas.push(`HOST="${env.HOST}" não é válido. Use 127.0.0.1 (proxy na mesma máquina) ou deixe vazio.`);
  }

  return { config: { sessionSecure, trustProxy, host }, problemas };
}

module.exports = { lerTransporte };
