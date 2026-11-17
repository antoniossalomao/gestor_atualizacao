const crypto = require("crypto");

/** O valor do .env.example. Chave igual a esta é pública e equivale a não ter chave. */
const TOKEN_DE_EXEMPLO = "troque-por-um-token-longo-e-aleatorio";

/**
 * Compara token e segredo em tempo constante (usado também pela proteção
 * CSRF, middlewares/protecaoCsrf.js). `timingSafeEqual` exige os
 * dois buffers do mesmo tamanho -- por isso o comprimento é checado antes
 * (vazar o comprimento por timing não importa aqui, só o conteúdo).
 */
function tokensIguais(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function exigirAgente(req, res, next) {
  const expected = String(req.app.locals.agentApiToken || "").trim();
  const supplied = req.get("x-agent-token");
  if (!expected || expected === TOKEN_DE_EXEMPLO || !supplied || !tokensIguais(supplied, expected)) {
    res.status(401).json({ error: "Agente não autenticado." });
    return;
  }
  next();
}

module.exports = { exigirAgente, tokensIguais, TOKEN_DE_EXEMPLO };