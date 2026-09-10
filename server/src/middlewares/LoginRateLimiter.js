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
 *
 * Faxina periódica: sem ela, toda chave (IP+usuário) que já apareceu uma vez
 * ficava PARA SEMPRE no Map -- o filtro por janela só decide se a tentativa
 * CONTA, nunca tira a chave do mapa. Um serviço que fica meses no ar, servido
 * na rede/internet, acumularia uma entrada por combinação de IP+usuário já
 * tentada (login legítimo errando a senha uma vez, ou um bot testando
 * credenciais) sem nunca liberar memória. `_faxina` roda por conta própria
 * (não depende de alguém chamar o middleware de novo) e remove as chaves cuja
 * última tentativa já saiu da janela.
 */
class LoginRateLimiter {
  /** @param {{maxTentativas?: number, janelaMs?: number}} opcoes */
  constructor({ maxTentativas = 10, janelaMs = 10 * 60 * 1000 } = {}) {
    this.maxTentativas = maxTentativas;
    this.janelaMs = janelaMs;
    /** @type {Map<string, number[]>} chave (IP+usuário) -> horários das tentativas recentes */
    this.tentativas = new Map();

    // Uma faxina por janela é suficiente (não precisa ser mais frequente que
    // o próprio período que decide "essa tentativa ainda conta"). "unref":
    // esse timer sozinho não deve impedir o processo de encerrar -- mesmo
    // cuidado usado em AlertaAgenteService.
    this._timer = setInterval(() => this._faxina(), this.janelaMs);
    this._timer.unref?.();
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

  /** Remove chaves cujas tentativas já saíram todas da janela. */
  _faxina() {
    const agora = Date.now();
    for (const [chave, tentativas] of this.tentativas) {
      if (!tentativas.some((t) => agora - t < this.janelaMs)) this.tentativas.delete(chave);
    }
  }
}

module.exports = { LoginRateLimiter };
