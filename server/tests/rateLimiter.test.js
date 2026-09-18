/*
 * Testes do LoginRateLimiter -- a trava de forca bruta contra /auth/login.
 *
 * E' o tipo de codigo que "funciona" sem fazer nada: se a contagem quebrar,
 * ninguem percebe, porque o sintoma e' a AUSENCIA de bloqueio. So apareceria
 * num incidente -- que e' tarde demais.
 *
 * Tres propriedades importam, e as tres sao testadas aqui:
 *
 *  - **bloqueia** depois do limite;
 *  - **e' por IP+usuario**, nao global: um atacante martelando uma conta nao
 *    pode deixar o resto da equipe de fora;
 *  - **a janela desliza**: quem errou a senha uma vez de manha nao fica
 *    penalizado a tarde.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { LoginRateLimiter } = require("../src/middlewares/LoginRateLimiter");

/** Dublê mínimo de req/res: só o que o middleware realmente usa. */
function chamar(limiter, { ip = "10.0.0.1", usuario = "alguem" } = {}) {
  const resultado = { status: null, json: null, passou: false };
  const req = { ip, body: { usuario } };
  const res = {
    status(code) {
      resultado.status = code;
      return this;
    },
    json(corpo) {
      resultado.json = corpo;
      return this;
    },
  };
  limiter.middleware(req, res, () => {
    resultado.passou = true;
  });
  return resultado;
}

test("LoginRateLimiter - bloqueio", async (t) => {
  await t.test("deixa passar até o limite, e bloqueia a partir dele", () => {
    const limiter = new LoginRateLimiter({ maxTentativas: 3, janelaMs: 60_000 });

    for (let i = 1; i <= 3; i += 1) {
      assert.equal(chamar(limiter).passou, true, `tentativa ${i} deveria passar`);
    }
    const bloqueada = chamar(limiter);
    assert.equal(bloqueada.passou, false, "a 4ª não pode chegar ao login");
    assert.equal(bloqueada.status, 429);
  });

  await t.test("a mensagem de bloqueio não entrega nada a quem está atacando", () => {
    const limiter = new LoginRateLimiter({ maxTentativas: 1, janelaMs: 60_000 });
    chamar(limiter);
    const r = chamar(limiter);

    // Nem diz se o usuário existe, nem quantas tentativas faltam, nem quanto
    // tempo exatamente falta -- só que é para esperar.
    assert.match(r.json.error, /Muitas tentativas/);
    assert.doesNotMatch(r.json.error, /usuário|senha|existe/i);
  });

  await t.test("uma vez bloqueado, continua bloqueado dentro da janela", () => {
    const limiter = new LoginRateLimiter({ maxTentativas: 2, janelaMs: 60_000 });
    chamar(limiter);
    chamar(limiter);
    for (let i = 0; i < 5; i += 1) {
      assert.equal(chamar(limiter).status, 429);
    }
  });
});

test("LoginRateLimiter - o bloqueio é por IP + usuário", async (t) => {
  await t.test("bloquear uma conta não bloqueia as outras do mesmo IP", () => {
    // Importa porque a equipe pode sair por um IP só (NAT do escritório):
    // alguém errando a própria senha não pode trancar os colegas para fora.
    const limiter = new LoginRateLimiter({ maxTentativas: 2, janelaMs: 60_000 });

    chamar(limiter, { usuario: "camila" });
    chamar(limiter, { usuario: "camila" });
    assert.equal(chamar(limiter, { usuario: "camila" }).status, 429);

    assert.equal(chamar(limiter, { usuario: "marcos" }).passou, true, "outro usuário continua livre");
  });

  await t.test("bloquear um IP não bloqueia o mesmo usuário em outro IP", () => {
    const limiter = new LoginRateLimiter({ maxTentativas: 2, janelaMs: 60_000 });

    chamar(limiter, { ip: "10.0.0.1", usuario: "camila" });
    chamar(limiter, { ip: "10.0.0.1", usuario: "camila" });
    assert.equal(chamar(limiter, { ip: "10.0.0.1", usuario: "camila" }).status, 429);

    assert.equal(chamar(limiter, { ip: "10.0.0.2", usuario: "camila" }).passou, true);
  });

  await t.test("requisição sem corpo não derruba o middleware", () => {
    // `/auth/login` sem JSON, ou com corpo vazio, é o que uma varredura
    // automatizada manda primeiro. Tem que ser tratado como tentativa, não
    // virar 500.
    const limiter = new LoginRateLimiter({ maxTentativas: 5, janelaMs: 60_000 });
    const res = { status: () => res, json: () => res };
    let passou = false;
    assert.doesNotThrow(() => limiter.middleware({ ip: "10.0.0.9" }, res, () => (passou = true)));
    assert.equal(passou, true);
  });
});

test("LoginRateLimiter - a janela desliza", async (t) => {
  await t.test("tentativa antiga deixa de contar", () => {
    // Quem errou a senha de manhã não pode ficar penalizado à tarde. As
    // tentativas são envelhecidas à mão porque esperar a janela de verdade
    // passar faria o teste demorar minutos.
    const limiter = new LoginRateLimiter({ maxTentativas: 2, janelaMs: 60_000 });
    chamar(limiter);
    chamar(limiter);
    assert.equal(chamar(limiter).status, 429, "bloqueado agora");

    const chave = "10.0.0.1:alguem";
    limiter.tentativas.set(
      chave,
      limiter.tentativas.get(chave).map((t) => t - 120_000)
    );
    assert.equal(chamar(limiter).passou, true, "passada a janela, libera");
  });

  await t.test("a faxina remove chaves que saíram da janela", () => {
    // Sem ela, toda combinação IP+usuário já tentada ficaria no Map para
    // sempre. Num servidor meses no ar, exposto à rede, isso é vazamento de
    // memória proporcional ao número de bots que passaram por lá.
    const limiter = new LoginRateLimiter({ maxTentativas: 5, janelaMs: 60_000 });
    chamar(limiter, { usuario: "antigo" });
    chamar(limiter, { usuario: "recente" });
    assert.equal(limiter.tentativas.size, 2);

    const chave = "10.0.0.1:antigo";
    limiter.tentativas.set(
      chave,
      limiter.tentativas.get(chave).map((t) => t - 120_000)
    );
    limiter._faxina();

    assert.equal(limiter.tentativas.has(chave), false, "a antiga saiu");
    assert.equal(limiter.tentativas.has("10.0.0.1:recente"), true, "a recente ficou");
  });

  await t.test("a faxina não apaga quem ainda está dentro da janela", () => {
    const limiter = new LoginRateLimiter({ maxTentativas: 5, janelaMs: 60_000 });
    chamar(limiter);
    limiter._faxina();
    assert.equal(limiter.tentativas.size, 1);
  });
});

test("LoginRateLimiter - o timer não segura o processo", async (t) => {
  await t.test("o intervalo da faxina é 'unref'", () => {
    // Sem `unref`, este timer sozinho manteria o processo do Node vivo para
    // sempre: `npm test` nunca terminaria, e o serviço não encerraria limpo
    // ao receber SIGTERM.
    const limiter = new LoginRateLimiter({ janelaMs: 60_000 });
    assert.equal(limiter._timer.hasRef(), false);
    clearInterval(limiter._timer);
  });
});
