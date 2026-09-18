/*
 * Testes do ConfiguracaoApiService -- a tela que deixa um administrador editar
 * cinco chaves do .env pelo navegador, sem abrir editor de texto no servidor.
 *
 * E' um serviço que ESCREVE NUM ARQUIVO DE CONFIGURACAO, o que traz dois riscos
 * que nenhum outro serviço do projeto tem:
 *
 *  - **injecao de variavel de ambiente.** A gravacao monta uma linha
 *    "CHAVE=valor". Uma quebra de linha dentro do valor criaria uma SEGUNDA
 *    linha, que o dotenv leria como outra variavel -- um jeito de definir
 *    qualquer configuracao do servidor pelo campo de texto de um formulario.
 *  - **perda do arquivo.** O .env tem comentarios longos explicando cada
 *    chave, e outras variaveis (PORT, DB_PATH, SESSION_SECRET) que esta tela
 *    nao mostra. Reescrever sem preservar tudo isso quebraria o servidor no
 *    proximo arranque.
 *
 * O `envPath` e' injetavel no construtor, entao os testes escrevem num arquivo
 * temporario -- nunca no .env de verdade.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { ConfiguracaoApiService } = require("../src/services/ConfiguracaoApiService");

const ADMIN = { id: 1, nome: "Admin", role: "admin" };
const OPERADOR = { id: 2, nome: "Operador", role: "operador" };
const CONSULTA = { id: 3, nome: "Consulta", role: "consulta" };

const ENV_INICIAL = `# Configuracao local deste servidor. Nao versionar.

# Porta em que o servidor HTTP vai escutar.
PORT=3000

# Caminho do banco.
DB_PATH=./data/gestao.db

# Segredo de sessao -- NAO aparece na tela.
SESSION_SECRET=um-segredo-muito-longo-e-aleatorio

AGENT_API_TOKEN=token-antigo-com-mais-de-16
PUBLIC_URL=http://192.168.0.85:3000
DISCORD_WEBHOOK_URL=
ALERTA_AGENTES_INTERVALO_MINUTOS=15
AGENDAMENTO_ARQUIVAR_DIAS=7
`;

const VALIDO = {
  agentApiToken: "um-token-novo-bem-longo-123456",
  publicUrl: "http://192.168.0.99:3000",
  discordWebhookUrl: "",
  alertaAgentesIntervaloMinutos: 20,
  agendamentoArquivarDias: 30,
};

function ambiente(conteudo = ENV_INICIAL) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-env-"));
  const envPath = path.join(tmpDir, ".env");
  fs.writeFileSync(envPath, conteudo);
  const service = new ConfiguracaoApiService({ envPath });
  const cleanup = () => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { service, envPath, texto: () => fs.readFileSync(envPath, "utf8"), cleanup };
}

test("ConfiguracaoApiService - só administradores", async (t) => {
  const env = ambiente();
  try {
    await t.test("operador e consulta não podem nem ver", () => {
      // A chave da API é o segredo compartilhado com o agente de TODOS os
      // clientes. Ler já é demais para uma conta comum.
      for (const quem of [OPERADOR, CONSULTA, null, undefined, {}]) {
        assert.throws(() => env.service.ler(quem), /Apenas administradores/);
        assert.throws(() => env.service.salvar(quem, VALIDO), /Apenas administradores/);
        assert.throws(() => env.service.gerarToken(quem), /Apenas administradores/);
      }
    });

    await t.test("administrador vê os valores atuais", () => {
      const r = env.service.ler(ADMIN);
      assert.equal(r.agentApiToken, "token-antigo-com-mais-de-16");
      assert.equal(r.publicUrl, "http://192.168.0.85:3000");
      assert.equal(r.alertaAgentesIntervaloMinutos, 15);
      assert.equal(r.agendamentoArquivarDias, 7);
    });

    await t.test("o SESSION_SECRET não é exposto pela tela", () => {
      // Só as cinco chaves "de equipe" aparecem. O segredo de sessão fica de
      // fora de propósito: quem o tem forja cookie de qualquer pessoa.
      const r = env.service.ler(ADMIN);
      assert.equal(JSON.stringify(r).includes("um-segredo-muito-longo"), false);
    });
  } finally {
    env.cleanup();
  }
});

test("ConfiguracaoApiService - injeção de variável no .env", async (t) => {
  const env = ambiente();
  try {
    await t.test("quebra de linha na chave da API é recusada", () => {
      // Sem isto, um administrador poderia definir QUALQUER variável do
      // servidor por um campo de texto -- inclusive SESSION_SECRET ou DB_PATH.
      for (const ataque of [
        "token-valido-16chars\nSESSION_SECRET=eu-escolhi",
        "token-valido-16chars\r\nDB_PATH=/outro/lugar.db",
        "token-valido-16chars\rPORT=9999",
      ]) {
        assert.throws(() => env.service.salvar(ADMIN, { ...VALIDO, agentApiToken: ataque }), /caracteres inválidos/);
      }
    });

    await t.test("'=' e '#' também são recusados na chave", () => {
      // "=" partiria o par chave/valor; "#" viraria comentário e apagaria o
      // resto do valor em silêncio.
      assert.throws(() => env.service.salvar(ADMIN, { ...VALIDO, agentApiToken: "token=com=igual123" }), /caracteres inválidos/);
      assert.throws(() => env.service.salvar(ADMIN, { ...VALIDO, agentApiToken: "token#com#hash123" }), /caracteres inválidos/);
    });

    await t.test("quebra de linha nas URLs é recusada", () => {
      assert.throws(
        () => env.service.salvar(ADMIN, { ...VALIDO, publicUrl: "http://x\nPORT=9999" }),
        /caracteres inválidos|inválida/
      );
      assert.throws(
        () => env.service.salvar(ADMIN, { ...VALIDO, discordWebhookUrl: "https://x\nPORT=9999" }),
        /caracteres inválidos|inválida/
      );
    });

    await t.test("nada disso chegou a ser gravado", () => {
      // O arquivo tem que estar intacto: a validação acontece ANTES de
      // qualquer escrita.
      assert.equal(env.texto(), ENV_INICIAL);
    });
  } finally {
    env.cleanup();
  }
});

test("ConfiguracaoApiService - validação dos campos", async (t) => {
  const env = ambiente();
  try {
    await t.test("chave da API vazia ou curta demais é recusada", () => {
      assert.throws(() => env.service.salvar(ADMIN, { ...VALIDO, agentApiToken: "" }), /não pode ficar vazia/);
      assert.throws(() => env.service.salvar(ADMIN, { ...VALIDO, agentApiToken: "   " }), /não pode ficar vazia/);
      assert.throws(() => env.service.salvar(ADMIN, { ...VALIDO, agentApiToken: "curto" }), /entre 16 e 200/);
      assert.throws(() => env.service.salvar(ADMIN, { ...VALIDO, agentApiToken: "a".repeat(201) }), /entre 16 e 200/);
    });

    await t.test("URL pública precisa ser http ou https", () => {
      assert.throws(() => env.service.salvar(ADMIN, { ...VALIDO, publicUrl: "" }), /não pode ficar vazia/);
      assert.throws(() => env.service.salvar(ADMIN, { ...VALIDO, publicUrl: "192.168.0.1:3000" }), /inválida/);
      assert.throws(() => env.service.salvar(ADMIN, { ...VALIDO, publicUrl: "ftp://x/y" }), /http: ou https:/);
      assert.throws(() => env.service.salvar(ADMIN, { ...VALIDO, publicUrl: "file:///etc/passwd" }), /http: ou https:/);
    });

    await t.test("webhook do Discord exige HTTPS, mas pode ficar vazio", () => {
      // Vazio = "não avise ninguém", que é um estado legítimo. Mas se for
      // configurado, o token do webhook não pode trafegar em claro.
      assert.doesNotThrow(() => env.service.salvar(ADMIN, { ...VALIDO, discordWebhookUrl: "" }));
      assert.throws(
        () => env.service.salvar(ADMIN, { ...VALIDO, discordWebhookUrl: "http://discord.com/api/webhooks/1/x" }),
        /https:/
      );
      assert.doesNotThrow(() =>
        env.service.salvar(ADMIN, { ...VALIDO, discordWebhookUrl: "https://discord.com/api/webhooks/1/x" })
      );
    });

    await t.test("os dois intervalos precisam ser inteiros dentro da faixa", () => {
      for (const ruim of [0, -1, 1441, 1.5, "abc", null]) {
        assert.throws(
          () => env.service.salvar(ADMIN, { ...VALIDO, alertaAgentesIntervaloMinutos: ruim }),
          /entre 1 e 1440/,
          `intervalo ${ruim}`
        );
      }
      for (const ruim of [0, -1, 366, 2.5, "abc", null]) {
        assert.throws(
          () => env.service.salvar(ADMIN, { ...VALIDO, agendamentoArquivarDias: ruim }),
          /entre 1 e 365/,
          `dias ${ruim}`
        );
      }
    });

    await t.test("barra final da URL pública é removida", () => {
      // Os links de download são montados como `${PUBLIC_URL}/api/...`; com a
      // barra, viraria "//api/..." -- que alguns servidores tratam diferente.
      const r = env.service.salvar(ADMIN, { ...VALIDO, publicUrl: "http://192.168.0.99:3000///" });
      assert.equal(r.publicUrl, "http://192.168.0.99:3000");
    });
  } finally {
    env.cleanup();
  }
});

test("ConfiguracaoApiService - a gravação preserva o arquivo", async (t) => {
  const env = ambiente();
  try {
    await t.test("as cinco chaves são trocadas", () => {
      env.service.salvar(ADMIN, VALIDO);
      const t2 = env.texto();
      assert.match(t2, /^AGENT_API_TOKEN=um-token-novo-bem-longo-123456$/m);
      assert.match(t2, /^PUBLIC_URL=http:\/\/192\.168\.0\.99:3000$/m);
      assert.match(t2, /^ALERTA_AGENTES_INTERVALO_MINUTOS=20$/m);
      assert.match(t2, /^AGENDAMENTO_ARQUIVAR_DIAS=30$/m);
    });

    await t.test("as OUTRAS variáveis continuam intactas", () => {
      // PORT, DB_PATH e SESSION_SECRET não aparecem na tela. Perdê-las na
      // regravação deixaria o servidor sem subir no próximo arranque -- e o
      // erro apareceria só no reinício, longe da causa.
      const t2 = env.texto();
      assert.match(t2, /^PORT=3000$/m);
      assert.match(t2, /^DB_PATH=\.\/data\/gestao\.db$/m);
      assert.match(t2, /^SESSION_SECRET=um-segredo-muito-longo-e-aleatorio$/m);
    });

    await t.test("os comentários continuam lá", () => {
      // O .env deste projeto documenta cada chave com parágrafos inteiros de
      // explicação. Reescrever só os pares chave=valor apagaria tudo isso.
      const t2 = env.texto();
      assert.match(t2, /# Porta em que o servidor HTTP vai escutar\./);
      assert.match(t2, /# Segredo de sessao -- NAO aparece na tela\./);
    });

    await t.test("chave ausente é acrescentada, não ignorada", () => {
      const env2 = ambiente("PORT=3000\n");
      try {
        env2.service.salvar(ADMIN, VALIDO);
        const t2 = env2.texto();
        assert.match(t2, /^PORT=3000$/m, "o que já existia continua");
        assert.match(t2, /^AGENT_API_TOKEN=um-token-novo-bem-longo-123456$/m);
        assert.match(t2, /^AGENDAMENTO_ARQUIVAR_DIAS=30$/m);
      } finally {
        env2.cleanup();
      }
    });

    await t.test("arquivo inexistente não quebra: cria do zero", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-env2-"));
      const envPath = path.join(tmpDir, ".env");
      try {
        const s = new ConfiguracaoApiService({ envPath });
        assert.doesNotThrow(() => s.salvar(ADMIN, VALIDO));
        assert.match(fs.readFileSync(envPath, "utf8"), /^AGENT_API_TOKEN=/m);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  } finally {
    env.cleanup();
  }
});

test("ConfiguracaoApiService - gerarToken", async (t) => {
  const env = ambiente();
  try {
    await t.test("gera 64 caracteres hexadecimais", () => {
      const token = env.service.gerarToken(ADMIN);
      assert.match(token, /^[0-9a-f]{64}$/);
    });

    await t.test("dois tokens nunca saem iguais", () => {
      const a = env.service.gerarToken(ADMIN);
      const b = env.service.gerarToken(ADMIN);
      assert.notEqual(a, b);
    });

    await t.test("gerar NÃO grava nada", () => {
      // Quem gerou ainda pode desistir. Gravar aqui deixaria todos os agentes
      // com 401 antes de a pessoa sequer clicar em salvar.
      const antes = env.texto();
      env.service.gerarToken(ADMIN);
      assert.equal(env.texto(), antes);
    });

    await t.test("o token gerado passa na própria validação", () => {
      // Se não passasse, a tela ofereceria um botão que gera algo que ela
      // mesma recusa a salvar.
      const token = env.service.gerarToken(ADMIN);
      assert.doesNotThrow(() => env.service.salvar(ADMIN, { ...VALIDO, agentApiToken: token }));
    });
  } finally {
    env.cleanup();
  }
});

test("ConfiguracaoApiService - aviso de reinício", async (t) => {
  const env = ambiente();
  try {
    await t.test("avisa quando o arquivo diverge do que o processo carregou", () => {
      // O servidor lê process.env no arranque; esta classe só mexe no ARQUIVO.
      // Sem o aviso, quem salvou acharia que já estava valendo -- e os agentes
      // continuariam usando o token antigo, sem nenhum sintoma no painel.
      const r = env.service.ler(ADMIN);
      assert.equal(typeof r.reinicioNecessario, "boolean");

      // Todas as cinco chaves são salvas e restauradas: mexer em process.env
      // é estado global do processo, e deixar sobra faria este teste
      // influenciar qualquer outro que rode depois dele -- o tipo de
      // interferência que só aparece quando a ordem dos testes muda.
      const CHAVES = [
        "AGENT_API_TOKEN",
        "PUBLIC_URL",
        "DISCORD_WEBHOOK_URL",
        "ALERTA_AGENTES_INTERVALO_MINUTOS",
        "AGENDAMENTO_ARQUIVAR_DIAS",
      ];
      const originais = Object.fromEntries(CHAVES.map((k) => [k, process.env[k]]));
      try {
        process.env.AGENT_API_TOKEN = "token-antigo-com-mais-de-16";
        process.env.PUBLIC_URL = "http://192.168.0.85:3000";
        process.env.DISCORD_WEBHOOK_URL = "";
        process.env.ALERTA_AGENTES_INTERVALO_MINUTOS = "15";
        process.env.AGENDAMENTO_ARQUIVAR_DIAS = "7";
        assert.equal(env.service.ler(ADMIN).reinicioNecessario, false, "arquivo igual à memória");

        env.service.salvar(ADMIN, VALIDO);
        assert.equal(env.service.ler(ADMIN).reinicioNecessario, true, "depois de salvar, diverge");
      } finally {
        for (const [k, v] of Object.entries(originais)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
    });
  } finally {
    env.cleanup();
  }
});
