/*
 * Testes do NotificationService -- o webhook que avisa o Discord.
 *
 * E' codigo que o servidor chama SEM `await` e cujo resultado ninguem olha.
 * Isso torna duas coisas obrigatorias, e as duas sao o foco aqui:
 *
 *  - **nunca lancar.** Uma falha de rede, um Discord fora do ar ou uma URL
 *    errada nao podem derrubar o cadastro de uma atualizacao. Sem `await`, uma
 *    excecao que escape vira "unhandled rejection" -- que, conforme a
 *    configuracao do Node, encerra o processo. O Discord fora do ar tiraria o
 *    painel do ar junto.
 *  - **sem webhook, nao tocar na rede.** A integracao e' opcional; com o campo
 *    vazio o servidor nao deve tentar POST nenhum.
 *
 * O `fetch` global e' substituido por um dublê -- nenhum teste aqui faz
 * requisicao de verdade.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { NotificationService } = require("../src/services/NotificationService");

const WEBHOOK = "https://discord.example/api/webhooks/1/abc";

/**
 * Troca o `fetch` global e o `console.warn` por dublês durante `corpo`.
 * Restaura os dois no fim, mesmo se algo lançar -- são estado global do
 * processo, e deixar sobra afetaria qualquer teste que rodasse depois.
 */
async function comFetchFalso(corpo, resposta = { ok: true, status: 204 }) {
  const fetchOriginal = globalThis.fetch;
  const warnOriginal = console.warn;
  const chamadas = [];
  const avisos = [];
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    if (typeof resposta === "function") return resposta();
    return resposta;
  };
  console.warn = (...args) => void avisos.push(args.join(" "));
  try {
    await corpo(chamadas, avisos);
  } finally {
    globalThis.fetch = fetchOriginal;
    console.warn = warnOriginal;
  }
}

/** O texto da mensagem enviada na chamada `i`. */
const conteudo = (chamadas, i = 0) => JSON.parse(chamadas[i].opcoes.body).content;

test("NotificationService - sem webhook configurado", async (t) => {
  await t.test("não faz requisição nenhuma", async () => {
    await comFetchFalso(async (chamadas) => {
      const s = new NotificationService({});
      await s.notifyAtualizacao({ cliente: "X" });
      await s.notifyAgenteSituacao({ empresa: "X", situacao: "erro" });
      assert.equal(chamadas.length, 0, "integração opcional é opcional de verdade");
    });
  });

  await t.test("string vazia conta como não configurado", async () => {
    await comFetchFalso(async (chamadas) => {
      const s = new NotificationService({ discordWebhookUrl: "" });
      await s.notifyAtualizacao({ cliente: "X" });
      assert.equal(chamadas.length, 0);
    });
  });
});

test("NotificationService - aviso de atualização", async (t) => {
  await t.test("monta a mensagem com o que foi preenchido", async () => {
    await comFetchFalso(async (chamadas) => {
      const s = new NotificationService({ discordWebhookUrl: WEBHOOK });
      await s.notifyAtualizacao({
        cliente: "Mercado Central",
        sistema: "B_Vendas",
        versao: "2.1",
        responsavel: "Camila",
      });

      assert.equal(chamadas.length, 1);
      assert.equal(chamadas[0].url, WEBHOOK);
      assert.equal(chamadas[0].opcoes.method, "POST");
      assert.equal(chamadas[0].opcoes.headers["Content-Type"], "application/json");

      const texto = conteudo(chamadas);
      assert.match(texto, /Mercado Central/);
      assert.match(texto, /B_Vendas/);
      assert.match(texto, /v2\.1/);
      assert.match(texto, /por Camila/);
    });
  });

  await t.test("campo vazio não vira 'undefined' na mensagem", async () => {
    // O cliente é o único obrigatório; metade do histórico não tem
    // responsável. Uma mensagem com "por undefined" no canal da equipe é o
    // tipo de detalhe que faz o aviso perder credibilidade.
    await comFetchFalso(async (chamadas) => {
      const s = new NotificationService({ discordWebhookUrl: WEBHOOK });
      await s.notifyAtualizacao({ cliente: "Padaria do Zé" });
      const texto = conteudo(chamadas);
      assert.match(texto, /Padaria do Zé/);
      assert.doesNotMatch(texto, /undefined|null/);
    });
  });
});

test("NotificationService - aviso de situação do agente", async (t) => {
  const casos = [
    ["offline", /offline/i, /24h/],
    ["erro", /erro/i, null],
    ["pendencias", /pendent/i, null],
    ["aguardando_autorizacao_demorada", /autoriza/i, /Fase 2/],
  ];

  for (const [situacao, esperado, extra] of casos) {
    await t.test(`"${situacao}" produz uma mensagem própria`, async () => {
      await comFetchFalso(async (chamadas) => {
        const s = new NotificationService({ discordWebhookUrl: WEBHOOK });
        await s.notifyAgenteSituacao({ empresa: "Acme", situacao });
        const texto = conteudo(chamadas);
        assert.match(texto, /Acme/);
        assert.match(texto, esperado);
        if (extra) assert.match(texto, extra);
        assert.doesNotMatch(texto, /undefined|null/);
      });
    });
  }

  await t.test("o detalhe do erro entra na mensagem quando existe", async () => {
    // É a diferença entre "o agente deu erro" e "o agente deu erro: o script X
    // falhou" -- a segunda já diz por onde começar.
    await comFetchFalso(async (chamadas) => {
      const s = new NotificationService({ discordWebhookUrl: WEBHOOK });
      await s.notifyAgenteSituacao({ empresa: "Acme", situacao: "erro", detalhe: "script 042 falhou" });
      assert.match(conteudo(chamadas), /script 042 falhou/);
    });
  });

  await t.test("sem detalhe, a frase termina com ponto, não com dois-pontos", async () => {
    await comFetchFalso(async (chamadas) => {
      const s = new NotificationService({ discordWebhookUrl: WEBHOOK });
      await s.notifyAgenteSituacao({ empresa: "Acme", situacao: "erro" });
      assert.match(conteudo(chamadas), /\.$/);
    });
  });

  await t.test("qualquer outra situação é tratada como 'normalizou'", async () => {
    // O AlertaAgenteService só chama com uma situação boa quando o agente SAIU
    // de um estado ruim -- então o caso geral aqui é o "voltou ao normal".
    await comFetchFalso(async (chamadas) => {
      const s = new NotificationService({ discordWebhookUrl: WEBHOOK });
      await s.notifyAgenteSituacao({ empresa: "Acme", situacao: "ok" });
      assert.match(conteudo(chamadas), /normalizou/);
    });
  });
});

test("NotificationService - nunca derruba quem chamou", async (t) => {
  await t.test("rede fora do ar não lança", async () => {
    await comFetchFalso(
      async (chamadas, avisos) => {
        const s = new NotificationService({ discordWebhookUrl: WEBHOOK });
        await assert.doesNotReject(() => s.notifyAtualizacao({ cliente: "X" }));
        assert.ok(
          avisos.some((a) => /Falha ao notificar Discord/.test(a)),
          "mas registra, para não falhar em silêncio total"
        );
      },
      () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }
    );
  });

  await t.test("resposta HTTP de erro não lança", async () => {
    await comFetchFalso(
      async (chamadas, avisos) => {
        const s = new NotificationService({ discordWebhookUrl: WEBHOOK });
        await assert.doesNotReject(() => s.notifyAgenteSituacao({ empresa: "X", situacao: "erro" }));
        assert.ok(avisos.some((a) => /HTTP 404/.test(a)), "e o código do erro aparece no aviso");
      },
      { ok: false, status: 404 }
    );
  });

  await t.test("webhook revogado (401) também é só um aviso", async () => {
    // Acontece de verdade: alguém apaga o webhook no Discord e ninguém avisa
    // o servidor. O painel tem que continuar funcionando normalmente.
    await comFetchFalso(
      async (chamadas, avisos) => {
        const s = new NotificationService({ discordWebhookUrl: WEBHOOK });
        await assert.doesNotReject(() => s.notifyAtualizacao({ cliente: "X" }));
        assert.ok(avisos.some((a) => /HTTP 401/.test(a)));
      },
      { ok: false, status: 401 }
    );
  });
});
