/**
 * Com SESSION_SECURE=true, recusa qualquer pedido que não tenha chegado por
 * HTTPS -- o "caminho alternativo" do critério de aceite do P01
 * (docs/MELHORIAS.md). Sem isto, quem digitasse http://IP:3000 direto na
 * porta do Node continuaria mandando a senha em texto puro: o cookie
 * "Secure" protege a sessão, mas não o POST do login, que sai antes dele.
 *
 * `req.secure` vem do X-Forwarded-Proto do proxy, e só é confiável se
 * TRUST_PROXY estiver restrito ao proxy -- ver config/transporte.js.
 *
 * Recusa em vez de redirecionar, de propósito:
 * - num POST, o redirecionamento chega tarde: a senha já atravessou a rede
 *   em HTTP quando a resposta volta;
 * - montar o https:// a partir do cabeçalho Host deixaria quem manda o
 *   pedido escolher para onde o navegador vai (redirecionamento aberto);
 * - quem acessa pelo endereço oficial nem chega aqui: o proxy já manda do
 *   http:// para o https:// antes (o Caddy faz isso sozinho).
 */

/**
 * Pedidos que continuam valendo por HTTP. Só o healthcheck do Docker, que
 * roda DENTRO do container e bate direto no Node (ver Dockerfile). A rota é
 * aberta e, sem cookie -- que o navegador não manda por HTTP com "Secure" --,
 * não devolve nada além de "precisa configurar?" e "Atualizador ligado?".
 */
const LIBERADOS_EM_HTTP = new Set(["GET /api/auth/status", "HEAD /api/auth/status"]);

const MENSAGEM = "Este painel só aceita conexões HTTPS. Acesse pelo endereço https:// oficial.";

/** @type {import("express").RequestHandler} */
function exigirHttps(req, res, next) {
  if (req.secure || LIBERADOS_EM_HTTP.has(`${req.method} ${req.path}`)) return next();
  // 403 e não 426 (Upgrade Required): o 426 pede o cabeçalho Upgrade, que é
  // de troca de protocolo na mesma conexão (TLS em HTTP/1.1, RFC 2817) e que
  // nenhum navegador implementa. O formato segue o notFoundHandler.
  if (req.path.startsWith("/api")) return res.status(403).json({ error: MENSAGEM });
  res.status(403).type("txt").send(MENSAGEM);
}

module.exports = { exigirHttps };
