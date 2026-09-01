function requireAgent(req, res, next) {
  const expected = req.app.locals.agentApiToken;
  const supplied = req.get("x-agent-token");
  if (!expected || !supplied || supplied !== expected) {
    res.status(401).json({ error: "Agente não autenticado." });
    return;
  }
  next();
}

module.exports = { requireAgent };