/*
 * Testes do AlertaAgenteService -- o que avisa o Discord quando um agente para
 * de atualizar.
 *
 * A regra central e' **avisar so na TRANSICAO**, e ela erra para os dois lados
 * em silencio:
 *
 *  - avisando demais → um agente offline ha uma semana gera um aviso a cada
 *    ciclo (a cada 15 minutos, por padrao). O canal vira ruido, e em pouco
 *    tempo ninguem le mais nenhum aviso -- inclusive os que importam;
 *  - avisando de menos → o problema comeca e ninguem fica sabendo. E' o
 *    cenario que o servico existe para evitar.
 *
 * Nenhum dos dois gera erro. Por isso o teste.
 *
 * O `VersaoService` e o `NotificationService` sao dubles: o que esta sob teste
 * e' a MAQUINA DE ESTADOS, nao o calculo da situacao (que e' do painel) nem o
 * envio HTTP.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Database } = require("../src/database/Database");
const { AlertaAgenteService } = require("../src/services/AlertaAgenteService");
const { ConfiguracaoSistemaService } = require("../src/services/ConfiguracaoSistemaService");

function ambiente(situacaoInicial = "ok") {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-alerta-"));
  const db = new Database(path.join(tmpDir, "gestao.db"));

  const agente = { cnpj: "C001", empresa: "Mercado Central", situacao: situacaoInicial, ultimoDetalhe: "" };
  const versoes = { painel: () => ({ agentes: [agente] }) };
  const avisos = [];
  const notifications = {
    webhookUrl: "https://discord.example/webhook",
    notifyAgenteSituacao: async (payload) => void avisos.push(payload),
  };

  const configuracaoSistema = new ConfiguracaoSistemaService(db);
  const service = new AlertaAgenteService(db, versoes, notifications, configuracaoSistema);
  const cleanup = () => {
    try {
      service.stop();
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, service, agente, avisos, notifications, cleanup };
}

test("AlertaAgenteService - avisa só na transição", async (t) => {
  const env = ambiente("ok");
  try {
    await t.test("agente saudável não gera aviso nenhum", async () => {
      await env.service.verificar();
      assert.equal(env.avisos.length, 0);
    });

    await t.test("ao ENTRAR em erro, avisa uma vez", async () => {
      env.agente.situacao = "erro";
      env.agente.ultimoDetalhe = "falha ao aplicar script";
      await env.service.verificar();

      assert.equal(env.avisos.length, 1);
      assert.equal(env.avisos[0].empresa, "Mercado Central");
      assert.equal(env.avisos[0].situacao, "erro");
      assert.equal(env.avisos[0].detalhe, "falha ao aplicar script", "o aviso leva o motivo junto");
    });

    await t.test("continuando em erro, NÃO repete o aviso", async () => {
      // É isto que impede o canal de virar ruído. Um agente offline há uma
      // semana geraria ~670 mensagens iguais no padrão de 15 minutos.
      for (let i = 0; i < 5; i += 1) await env.service.verificar();
      assert.equal(env.avisos.length, 1, "continua sendo um aviso só");
    });

    await t.test("mudando de um problema para OUTRO, avisa de novo", async () => {
      // "offline" depois de "erro" é informação nova: o agente parou de se
      // comunicar de vez, e quem está acompanhando precisa saber.
      env.agente.situacao = "offline";
      await env.service.verificar();
      assert.equal(env.avisos.length, 2);
      assert.equal(env.avisos[1].situacao, "offline");
    });

    await t.test("ao VOLTAR ao normal, avisa que normalizou", async () => {
      env.agente.situacao = "ok";
      await env.service.verificar();
      assert.equal(env.avisos.length, 3);
      assert.equal(env.avisos[2].situacao, "ok", "fecha o ciclo: o problema acabou");
    });

    await t.test("depois de normalizar, o silêncio volta", async () => {
      await env.service.verificar();
      await env.service.verificar();
      assert.equal(env.avisos.length, 3);
    });

    await t.test("e um problema novo depois disso avisa de novo", async () => {
      env.agente.situacao = "erro";
      await env.service.verificar();
      assert.equal(env.avisos.length, 4, "o estado foi mesmo limpo ao normalizar");
    });
  } finally {
    env.cleanup();
  }
});

test("AlertaAgenteService - o que conta como 'voltou'", async (t) => {
  const env = ambiente("offline");
  try {
    await t.test("sair de 'offline' para 'desatualizado' já é voltar", async () => {
      // Não precisa chegar a "ok": sair de offline/erro para qualquer situação
      // não-alarmante já significa que o agente voltou a se comunicar, que é
      // a informação que interessa a quem está esperando.
      await env.service.verificar();
      assert.equal(env.avisos.length, 1, "entrou em offline");

      env.agente.situacao = "desatualizado";
      await env.service.verificar();
      assert.equal(env.avisos.length, 2);
      assert.equal(env.avisos[1].situacao, "desatualizado");
    });
  } finally {
    env.cleanup();
  }
});

test("AlertaAgenteService - resistência a falha", async (t) => {
  await t.test("uma falha no envio não derruba o servidor", async () => {
    // Este serviço roda num timer, sem ninguém esperando o resultado. Uma
    // exceção escapando aqui viraria "unhandled rejection" e, dependendo da
    // configuração do Node, derruba o processo -- ou seja, o Discord fora do
    // ar tiraria o painel do ar junto.
    const env = ambiente("erro");
    try {
      env.notifications.notifyAgenteSituacao = async () => {
        throw new Error("Discord fora do ar");
      };
      await assert.doesNotReject(() => env.service.verificar());
    } finally {
      env.cleanup();
    }
  });

  await t.test("uma falha ao montar o painel também é contida", async () => {
    const env = ambiente("ok");
    try {
      env.service.versaoService = {
        painel() {
          throw new Error("banco indisponível");
        },
      };
      await assert.doesNotReject(() => env.service.verificar());
    } finally {
      env.cleanup();
    }
  });
});

test("AlertaAgenteService - respeita o Atualizador desativado", async (t) => {
  await t.test("desativado, verificar() não avisa nem lê o painel", async () => {
    const env = ambiente("erro");
    try {
      let painelChamado = false;
      env.service.versaoService = {
        painel() {
          painelChamado = true;
          return { agentes: [env.agente] };
        },
      };
      env.service.configuracaoSistema.definir(null, false);
      await env.service.verificar();
      assert.equal(painelChamado, false, "nem chega a montar o painel enquanto desativado");
      assert.equal(env.avisos.length, 0);
    } finally {
      env.cleanup();
    }
  });

  await t.test("reativado, volta a avisar no ciclo seguinte", async () => {
    const env = ambiente("erro");
    try {
      env.service.configuracaoSistema.definir(null, false);
      await env.service.verificar();
      assert.equal(env.avisos.length, 0);

      env.service.configuracaoSistema.definir(null, true);
      await env.service.verificar();
      assert.equal(env.avisos.length, 1, "sem precisar recriar o serviço nem reiniciar nada");
    } finally {
      env.cleanup();
    }
  });
});

test("AlertaAgenteService - start/stop", async (t) => {
  await t.test("sem webhook configurado, nem liga o timer", () => {
    // Sem webhook não há para onde avisar; ligar a verificação seria bater no
    // banco a cada 15 minutos para não fazer nada com o resultado.
    const env = ambiente("ok");
    try {
      env.notifications.webhookUrl = "";
      env.service.start(60_000);
      assert.equal(env.service.timer, null);
    } finally {
      env.cleanup();
    }
  });

  await t.test("com webhook, liga uma vez só e o timer é 'unref'", () => {
    const env = ambiente("ok");
    try {
      env.service.start(60_000);
      const primeiro = env.service.timer;
      assert.ok(primeiro, "deveria ter ligado");
      assert.equal(primeiro.hasRef(), false, "o timer não pode segurar o processo no ar");

      env.service.start(60_000);
      assert.equal(env.service.timer, primeiro, "chamar start() de novo não cria um segundo timer");
    } finally {
      env.cleanup();
    }
  });

  await t.test("stop() desliga e pode ser chamado duas vezes", () => {
    const env = ambiente("ok");
    try {
      env.service.start(60_000);
      env.service.stop();
      assert.equal(env.service.timer, null);
      assert.doesNotThrow(() => env.service.stop());
    } finally {
      env.cleanup();
    }
  });
});
