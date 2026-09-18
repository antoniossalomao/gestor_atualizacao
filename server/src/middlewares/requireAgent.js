const crypto = require("crypto");

/**
 * Compara token e segredo em tempo constante. `timingSafeEqual` exige os
 * dois buffers do mesmo tamanho -- por isso o comprimento é checado antes
 * (vazar o comprimento por timing não importa aqui, só o conteúdo).
 */
function tokensIguais(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAgent(req, res, next) {
  const expected = req.app.locals.agentApiToken;
  const supplied = req.get("x-agent-token");
  if (!expected || !supplied || !tokensIguais(supplied, expected)) {
    res.status(401).json({ error: "Agente não autenticado." });
    return;
  }
  next();
}

module.exports = { requireAgent };