/**
 * Trava simples de força bruta: bloqueia temporariamente tentativas de
 * login/criação de conta vindas do mesmo IP quando passam de um limite
 * numa janela de tempo. Sem isso, nada impedia alguém de tentar milhares
 * de senhas por segundo contra `/auth/login` -- risco real agora que o
 * servidor pode ficar acessível pela rede/internet (o app Python
 * original, de uso local e sem login, não tinha esse problema).
 *
 * Guardado em memória (um Map), não no banco -- é informação descartável
 * (reinicia zerada se o servidor reiniciar) e não precisa sobreviver a
 * isso; um pacote dedicado (ex. "express-rate-limit") resolveria o mesmo
 * problema, mas essa lógica é pequena o bastante para não valer mais uma
 * dependência externa (mesma filosofia de SqliteSessionStore.js).
 */
class LoginRateLimiter {
  /** @param {{maxTentativas?: number, janelaMs?: number}} opcoes */
  constructor({ maxTentativas = 10, janelaMs = 10 * 60 * 1000 } = {}) {
    this.maxTentativas = maxTentativas;
    this.janelaMs = janelaMs;
    /** @type {Map<string, number[]>} chave (IP+usuário) -> horários das tentativas recentes */
    this.tentativas = new Map();
  }

  /** Middleware Express: chame `.middleware` diretamente em `app.use`/`router.post`. */
  middleware = (req, res, next) => {
    const usuario = (req.body && req.body.usuario) || "";
    const chave = `${req.ip}:${usuario}`;
    const agora = Date.now();

    const recentes = (this.tentativas.get(chave) || []).filter((t) => agora - t < this.janelaMs);
    if (recentes.length >= this.maxTentativas) {
      res.status(429).json({ error: "Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente." });
      return;
    }
    recentes.push(agora);
    this.tentativas.set(chave, recentes);
    next();
  };
}

module.exports = { LoginRateLimiter };
