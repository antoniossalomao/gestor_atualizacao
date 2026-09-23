/*
 * Regras da equipe (config/regrasEquipe.js + ConfiguracaoSistemaService).
 *
 * O que erra em silêncio aqui, e por isso tem teste:
 *  - uma regra inválida gravada pela metade (a tela salva várias de uma vez);
 *  - o webhook do Discord -- que é um segredo -- indo parar no Histórico ou na
 *    resposta de uma conta que não é admin;
 *  - a importação do .env sobrescrevendo, a cada subida, o que foi mudado
 *    pela tela;
 *  - quem consome a regra (arquivar tarefa, "desatualizado", poda de backups,
 *    alerta de agentes) continuar usando o valor antigo depois de salvar.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Database } = require("../src/database/Database");
const { HistoricoService } = require("../src/services/HistoricoService");
const { ConfiguracaoSistemaService, TOKEN_DE_EXEMPLO } = require("../src/services/ConfiguracaoSistemaService");
const { AgendamentoService } = require("../src/services/AgendamentoService");
const { AtualizacaoService } = require("../src/services/AtualizacaoService");
const { NotificationService } = require("../src/services/NotificationService");
const { AlertaAgenteService } = require("../src/services/AlertaAgenteService");
const { REGRAS, validarRegra, converterRegra } = require("../src/config/regrasEquipe");
const { Server } = require("../src/Server");

const ADMIN = { id: 1, nome: "Admin", role: "admin" };
const OPERADOR = { id: 2, nome: "Operador", role: "operador" };
const WEBHOOK = "https://discord.com/api/webhooks/123/segredo-do-canal";

function ambiente(opcoes = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-regras-"));
  const db = new Database(path.join(tmpDir, "gestao.db"));
  const historico = new HistoricoService(db);
  const regras = new ConfiguracaoSistemaService(db, historico, opcoes);
  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { tmpDir, db, historico, regras, cleanup };
}

const eventos = (db) => db.historico.list({ page: 1, pageSize: 100 }).rows.filter((e) => e.entidade === "configuracao");

// ------------------------------------------------------------------ validação

test("Regras - validação de cada tipo", async (t) => {
  await t.test("inteiro: aceita número e texto numérico, dentro da faixa", () => {
    assert.equal(validarRegra("agendamentoArquivarDias", 7), 7);
    assert.equal(validarRegra("agendamentoArquivarDias", "7"), 7, "o <input> e o .env mandam texto");
    assert.equal(validarRegra("desatualizadoDias", REGRAS.desatualizadoDias.max), REGRAS.desatualizadoDias.max);
  });

  await t.test("inteiro: recusa vazio, fração, texto com unidade e fora da faixa", () => {
    // Number("") é 0 -- sem a checagem, o campo apagado viraria "0 dias".
    for (const ruim of ["", "   ", "30 dias", 7.5, "7.5", 0, -1, 366, null, undefined, true]) {
      assert.throws(() => validarRegra("agendamentoArquivarDias", ruim), /entre 1 e 365/, JSON.stringify(ruim));
    }
  });

  await t.test("booleano: só true/false de verdade", () => {
    assert.equal(validarRegra("atualizadorHabilitado", false), false);
    for (const ruim of ["false", 0, 1, null]) {
      assert.throws(() => validarRegra("atualizadorHabilitado", ruim), /sim ou não/);
    }
  });

  await t.test("URL pública: http ou https, sem barra no fim, vazio permitido", () => {
    assert.equal(validarRegra("publicUrl", "http://192.168.0.85:3000/"), "http://192.168.0.85:3000");
    assert.equal(validarRegra("publicUrl", ""), "");
    assert.throws(() => validarRegra("publicUrl", "ftp://x"), /http:\/\/ ou https:\/\//);
    assert.throws(() => validarRegra("publicUrl", "não é url"), /não é um endereço válido/);
  });

  await t.test("webhook: só https e só hosts do Discord", () => {
    assert.equal(validarRegra("discordWebhookUrl", WEBHOOK), WEBHOOK);
    // O servidor faz POST nesta URL: aceitar qualquer host deixaria a tela
    // disparar requisições do servidor para onde quisesse.
    assert.throws(() => validarRegra("discordWebhookUrl", "https://intranet.local/webhook"), /Discord/);
    assert.throws(() => validarRegra("discordWebhookUrl", "http://discord.com/api/webhooks/1/x"), /https/);
  });

  await t.test("regra desconhecida é recusada", () => {
    assert.throws(() => validarRegra("sessionSecret", "x"), /desconhecida/);
  });

  await t.test("valor gravado inválido cai no padrão em vez de derrubar a leitura", () => {
    assert.equal(converterRegra("desatualizadoDias", "abc"), REGRAS.desatualizadoDias.padrao);
    assert.equal(converterRegra("desatualizadoDias", "5"), REGRAS.desatualizadoDias.padrao, "abaixo do mínimo");
    assert.equal(converterRegra("desatualizadoDias", null), REGRAS.desatualizadoDias.padrao);
    assert.equal(converterRegra("atualizadorHabilitado", "false"), false);
  });
});

// ------------------------------------------------------------------ serviço

test("Regras - leitura e gravação pelo serviço", async (t) => {
  const env = ambiente({ tokenAgentes: "abcdef0123456789-final-9f3c" });
  t.after(env.cleanup);

  await t.test("sem nada gravado, cada regra vale o padrão", () => {
    for (const [nome, regra] of Object.entries(REGRAS)) assert.equal(env.regras.valor(nome), regra.padrao, nome);
  });

  await t.test("conta comum lê só as públicas -- nada de webhook nem URL", () => {
    env.regras.atualizar(ADMIN, { discordWebhookUrl: WEBHOOK });
    const publicas = env.regras.ler();
    assert.deepEqual(Object.keys(publicas).sort(), ["agendamentoArquivarDias", "atualizadorHabilitado", "desatualizadoDias"]);
    assert.ok(!JSON.stringify(publicas).includes("segredo-do-canal"));
  });

  await t.test("completa e atualizar são só de administrador", () => {
    assert.throws(() => env.regras.completa(OPERADOR), /administradores/);
    assert.throws(() => env.regras.atualizar(OPERADOR, { desatualizadoDias: 30 }), /administradores/);
    assert.throws(() => env.regras.atualizar(null, { desatualizadoDias: 30 }), /administradores/);
  });

  await t.test("a chave dos agentes nunca sai inteira: só a situação e o final", () => {
    const { chaveAgentes } = env.regras.completa(ADMIN);
    assert.deepEqual(chaveAgentes, { situacao: "configurada", final: "9f3c" });
    assert.ok(!JSON.stringify(env.regras.completa(ADMIN)).includes("abcdef0123456789"));
  });

  await t.test("tudo ou nada: uma regra inválida recusa o pedido inteiro", () => {
    const antes = env.regras.valor("desatualizadoDias");
    assert.throws(() => env.regras.atualizar(ADMIN, { desatualizadoDias: 90, agendamentoArquivarDias: 0 }), /entre 1 e 365/);
    assert.equal(env.regras.valor("desatualizadoDias"), antes, "a válida não pode ter sido gravada sozinha");
  });

  await t.test("grava só o que veio; o resto fica", () => {
    env.regras.atualizar(ADMIN, { desatualizadoDias: 90 });
    assert.equal(env.regras.valor("desatualizadoDias"), 90);
    assert.equal(env.regras.valor("discordWebhookUrl"), WEBHOOK);
  });

  await t.test("o Histórico registra antes e depois -- mas nunca o webhook", () => {
    env.regras.atualizar(ADMIN, { discordWebhookUrl: "https://discord.com/api/webhooks/9/outro-segredo", agendamentoArquivarDias: 12 });
    const [ultimo] = eventos(env.db);
    // SELECT * traz detalhes_json cru: o antes/depois inteiro está nesta linha.
    const tudo = JSON.stringify(ultimo);
    assert.match(ultimo.detalhes_json, /agendamentoArquivarDias/, "o antes/depois foi registrado");
    assert.ok(!tudo.includes("outro-segredo") && !tudo.includes("segredo-do-canal"), "o segredo vazou para o Histórico");
    assert.match(ultimo.descricao, /Webhook do Discord/);
    assert.match(ultimo.descricao, /tarefa concluída/);
  });

  await t.test("salvar sem mudar nada não gera evento no Histórico", () => {
    const antes = eventos(env.db).length;
    env.regras.atualizar(ADMIN, { desatualizadoDias: 90 });
    assert.equal(eventos(env.db).length, antes);
  });

  await t.test("aoMudar avisa só o que mudou, e um ouvinte com defeito não atrapalha os outros", () => {
    const recebidos = [];
    env.regras.aoMudar(() => {
      throw new Error("ouvinte com defeito");
    });
    env.regras.aoMudar((mudou) => recebidos.push(mudou));
    const erroOriginal = console.error;
    console.error = () => {};
    try {
      env.regras.atualizar(ADMIN, { desatualizadoDias: 90, alertaAgentesIntervaloMinutos: 5 });
    } finally {
      console.error = erroOriginal;
    }
    assert.deepEqual(recebidos, [["alertaAgentesIntervaloMinutos"]]);
    assert.equal(env.regras.valor("alertaAgentesIntervaloMinutos"), 5, "o salvamento não pode ser desfeito pelo ouvinte");
  });

  await t.test("chave dos agentes ausente ou igual à do exemplo aparece como tal", () => {
    const semChave = ambiente({ tokenAgentes: "" });
    const exemplo = ambiente({ tokenAgentes: TOKEN_DE_EXEMPLO });
    try {
      assert.deepEqual(semChave.regras.completa(ADMIN).chaveAgentes, { situacao: "ausente" });
      assert.deepEqual(exemplo.regras.completa(ADMIN).chaveAgentes, { situacao: "exemplo" });
    } finally {
      semChave.cleanup();
      exemplo.cleanup();
    }
  });
});

test("Regras - importação única do .env", async (t) => {
  const envArquivo = {
    DISCORD_WEBHOOK_URL: WEBHOOK,
    PUBLIC_URL: "http://192.168.0.85:3000/",
    AGENDAMENTO_ARQUIVAR_DIAS: "3",
    ALERTA_AGENTES_INTERVALO_MINUTOS: "zero", // inválido: fica o padrão
    SESSION_SECRET: "nada-a-ver-com-regra",
  };

  await t.test("traz o que a instalação tinha, ignora o inválido", () => {
    const env = ambiente();
    try {
      const importadas = env.regras.importarValoresIniciais(envArquivo);
      assert.deepEqual(importadas.sort(), ["agendamentoArquivarDias", "discordWebhookUrl", "publicUrl"]);
      assert.equal(env.regras.valor("discordWebhookUrl"), WEBHOOK);
      assert.equal(env.regras.valor("publicUrl"), "http://192.168.0.85:3000");
      assert.equal(env.regras.valor("agendamentoArquivarDias"), 3);
      assert.equal(env.regras.valor("alertaAgentesIntervaloMinutos"), REGRAS.alertaAgentesIntervaloMinutos.padrao);
      assert.match(eventos(env.db)[0].descricao, /trazidas do \.env/);
    } finally {
      env.cleanup();
    }
  });

  await t.test("não sobrescreve o que foi mudado pela tela (segunda subida)", () => {
    const env = ambiente();
    try {
      env.regras.importarValoresIniciais(envArquivo);
      env.regras.atualizar(ADMIN, { agendamentoArquivarDias: 20 });
      const antes = eventos(env.db).length;
      assert.deepEqual(env.regras.importarValoresIniciais(envArquivo), [], "nada a importar da segunda vez");
      assert.equal(env.regras.valor("agendamentoArquivarDias"), 20, "o .env antigo voltou a mandar");
      assert.equal(eventos(env.db).length, antes, "sem evento de importação vazio");
    } finally {
      env.cleanup();
    }
  });
});

// ------------------------------------------------------------------ consumidores

test("Regras - quem usa a regra enxerga a mudança na hora", async (t) => {
  await t.test("Agendamentos: a lista informa e usa os dias de arquivar", () => {
    const env = ambiente();
    try {
      const agendamentos = new AgendamentoService(env.db, env.historico, env.regras);
      assert.equal(agendamentos.list().arquivarDias, REGRAS.agendamentoArquivarDias.padrao);
      env.regras.atualizar(ADMIN, { agendamentoArquivarDias: 5 });
      assert.equal(agendamentos.list().arquivarDias, 5);
    } finally {
      env.cleanup();
    }
  });

  await t.test("Resumo: o limite de 'desatualizado' muda quem entra na lista", () => {
    const env = ambiente();
    try {
      const atualizacoes = new AtualizacaoService(env.db, env.historico, { notifyAtualizacao: async () => {} }, env.regras);
      env.db.conn.prepare("INSERT INTO clientes (codigo, nome) VALUES ('C1', 'Mercado X')").run();
      const quarentaDiasAtras = new Date(Date.now() - 40 * 86400000);
      const data = `${String(quarentaDiasAtras.getDate()).padStart(2, "0")}/${String(quarentaDiasAtras.getMonth() + 1).padStart(2, "0")}/${quarentaDiasAtras.getFullYear()}`;
      env.db.conn.prepare("INSERT INTO atualizacoes (cliente, sistema, versao, data) VALUES ('Mercado X', 'B_Vendas', '1', ?)").run(data);

      let resumo = atualizacoes.resumo();
      assert.equal(resumo.desatualizadoDias, 60);
      assert.ok(!resumo.desatualizados.some((c) => c.nome === "Mercado X"), "40 dias < 60");

      env.regras.atualizar(ADMIN, { desatualizadoDias: 30 });
      resumo = atualizacoes.resumo();
      assert.equal(resumo.desatualizadoDias, 30, "a tela escreve o rótulo com este número");
      assert.ok(resumo.desatualizados.some((c) => c.nome === "Mercado X"), "40 dias > 30");
    } finally {
      env.cleanup();
    }
  });

  await t.test("Backups: a poda na subida respeita quantas cópias guardar", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-regras-bkp-"));
    const dbPath = path.join(tmpDir, "gestao.db");
    try {
      let db = new Database(dbPath);
      new ConfiguracaoSistemaService(db, new HistoricoService(db)).atualizar(ADMIN, { backupsManter: 3 });
      db.conn.close();
      // Cada abertura de um banco que já existia faz uma cópia e poda as antigas.
      for (let i = 0; i < 6; i++) {
        db = new Database(dbPath);
        db.conn.close();
      }
      const pastaBackups = fs.readdirSync(tmpDir, { withFileTypes: true }).find((e) => e.isDirectory() && /backup/i.test(e.name));
      const copias = fs.readdirSync(path.join(tmpDir, pastaBackups.name)).filter((f) => f.endsWith(".db"));
      assert.ok(copias.length <= 3, `deveriam sobrar no máximo 3 cópias, sobraram ${copias.length}`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("Discord: o webhook é lido a cada envio, não guardado na subida", async () => {
    const env = ambiente();
    try {
      const notifications = new NotificationService({ webhookUrl: () => env.regras.valor("discordWebhookUrl") });
      assert.equal(notifications.webhookUrl, "");
      env.regras.atualizar(ADMIN, { discordWebhookUrl: WEBHOOK });
      assert.equal(notifications.webhookUrl, WEBHOOK);
      assert.deepEqual(await new NotificationService({}).testar(), { ok: false, detalhe: "Nenhum webhook configurado." });
    } finally {
      env.cleanup();
    }
  });

  await t.test("Alerta de agentes: configurar o webhook com o servidor no ar liga o timer", () => {
    const env = ambiente();
    const notifications = new NotificationService({ webhookUrl: () => env.regras.valor("discordWebhookUrl") });
    const alerta = new AlertaAgenteService(env.db, { painel: () => ({ agentes: [] }) }, notifications, env.regras);
    try {
      alerta.start(() => env.regras.valor("alertaAgentesIntervaloMinutos") * 60_000);
      assert.equal(alerta.timer, null, "sem webhook ainda: nada ligado");

      env.regras.aoMudar(() => alerta.reprogramar());
      env.regras.atualizar(ADMIN, { discordWebhookUrl: WEBHOOK });
      assert.ok(alerta.timer, "antes precisava reiniciar o servidor para isto");

      const anterior = alerta.timer;
      env.regras.atualizar(ADMIN, { alertaAgentesIntervaloMinutos: 2 });
      assert.notEqual(alerta.timer, anterior, "intervalo novo, timer novo");
    } finally {
      alerta.stop();
      env.cleanup();
    }
  });
});

// ------------------------------------------------------------------ HTTP

test("Regras - rotas HTTP", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-regras-http-"));
  const server = new Server({
    port: 0,
    dbPath: path.join(tmpDir, "gestao.db"),
    sessionSecret: "segredo-de-teste",
    sessionSecure: false,
    agentApiToken: "token-de-teste-bem-comprido-a1b2",
    ambiente: { DISCORD_WEBHOOK_URL: WEBHOOK },
  });
  await server.start();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  t.after(async () => {
    await server.stop().catch(() => {});
    server.db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const pedir = (caminho, { cookie, metodo = "GET", corpo } = {}) =>
    fetch(`${base}/api${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  const entrar = async (usuario, senha) => {
    const r = await pedir("/auth/login", { metodo: "POST", corpo: { usuario, senha } });
    return r.headers.get("set-cookie").split(";")[0];
  };

  const setup = await pedir("/auth/setup", { metodo: "POST", corpo: { nome: "Admin", usuario: "admin", senha: "senha-admin-123" } });
  const admin = setup.headers.get("set-cookie").split(";")[0];
  await pedir("/usuarios", { cookie: admin, metodo: "POST", corpo: { nome: "Op", usuario: "op", senha: "senha-op-12345", role: "operador" } });
  const operador = await entrar("op", "senha-op-12345");

  await t.test("o webhook do .env foi importado na subida", async () => {
    const r = await pedir("/configuracao-sistema/completa", { cookie: admin });
    assert.equal((await r.json()).valores.discordWebhookUrl, WEBHOOK);
  });

  await t.test("/auth/status traz as regras públicas só para quem entrou", async () => {
    const semSessao = await (await pedir("/auth/status")).json();
    assert.equal(semSessao.regras, null);
    const comSessao = await (await pedir("/auth/status", { cookie: operador })).json();
    assert.equal(comSessao.regras.desatualizadoDias, 60);
    assert.equal(comSessao.regras.discordWebhookUrl, undefined);
  });

  await t.test("operador lê as públicas, mas não a completa nem grava", async () => {
    assert.equal((await pedir("/configuracao-sistema", { cookie: operador })).status, 200);
    assert.equal((await pedir("/configuracao-sistema/completa", { cookie: operador })).status, 403);
    assert.equal((await pedir("/configuracao-sistema", { cookie: operador, metodo: "PUT", corpo: { desatualizadoDias: 30 } })).status, 403);
  });

  await t.test("admin grava; valor inválido volta 400 com a mensagem da regra", async () => {
    const ok = await pedir("/configuracao-sistema", { cookie: admin, metodo: "PUT", corpo: { desatualizadoDias: 45 } });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).valores.desatualizadoDias, 45);

    const ruim = await pedir("/configuracao-sistema", { cookie: admin, metodo: "PUT", corpo: { desatualizadoDias: 2 } });
    assert.equal(ruim.status, 400);
    assert.match((await ruim.json()).error, /entre 7 e 730/);
  });

  await t.test("o teste do Discord recusa URL que não é do Discord, sem fazer requisição", async () => {
    const r = await pedir("/configuracao-sistema/testar-discord", { cookie: admin, metodo: "POST", corpo: { url: "https://127.0.0.1:9/qualquer" } });
    assert.equal(r.status, 400);
  });

  await t.test("a rota antiga que reescrevia o .env não existe mais", async () => {
    assert.equal((await pedir("/configuracao-api", { cookie: admin })).status, 404);
  });
});
