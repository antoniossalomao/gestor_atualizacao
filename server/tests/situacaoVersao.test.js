/*
 * Situação de versão do cliente (services/situacaoVersao.js) e o card do
 * Resumo que a usa.
 *
 * Erra em silêncio: um cliente contado no grupo errado não quebra tela
 * nenhuma, só faz o Resumo mentir. Os casos abaixo são os que a regra
 * anterior errava e os que a equipe decidiu (fixos fora; desde 29/09/2026,
 * tudo julgado pela data da atualização, não pela versão recebida).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Database } = require("../src/database/Database");
const { HistoricoService } = require("../src/services/HistoricoService");
const { AtualizacaoService } = require("../src/services/AtualizacaoService");
const { situacaoDoSistema, situacaoDoCliente, contaParaVersao } = require("../src/services/situacaoVersao");

test("situacaoDoSistema", async (t) => {
  await t.test("sem prazo (Campanhas), atualizado antes da oficial é desatualizado; na data dela ou depois, em dia", () => {
    assert.deepEqual(situacaoDoSistema({ data: "01/09/2026" }, "09/09/2026"), { situacao: "Desatualizado" });
    assert.deepEqual(situacaoDoSistema({ data: "09/09/2026" }, "09/09/2026"), { situacao: "Em dia" }, "no próprio dia conta");
    assert.deepEqual(situacaoDoSistema({ data: "10/09/2026" }, "09/09/2026"), { situacao: "Em dia" });
  });

  await t.test("a versão recebida não decide mais: vale só a data da atualização", () => {
    // Até 29/09/2026 a recebida mandava, e isto era "Desatualizado".
    assert.equal(situacaoDoSistema({ data: "25/09/2026", versao: "22/09/2026" }, "24/09/2026").situacao, "Em dia");
    // E uma recebida mais nova não salva uma atualização anterior à oficial.
    assert.equal(situacaoDoSistema({ data: "20/09/2026", versao: "25/09/2026" }, "24/09/2026").situacao, "Desatualizado");
  });

  await t.test("compara como data, não como texto", () => {
    // Como texto, "09/10/2026" < "24/09/2026"; como data, é depois.
    assert.equal(situacaoDoSistema({ data: "09/10/2026" }, "24/09/2026").situacao, "Em dia");
  });

  await t.test("prazo depois da oficial: conta da DATA da oficial, dia 0 a N-1 aguarda, dia N atrasa (A07)", () => {
    const antes = { data: "01/09/2026" };
    const oficial = "10/09/2026";
    const em = (dia, mes = 9) => ({ prazoDias: 60, hoje: new Date(2026, mes - 1, dia, 15, 30) });
    assert.equal(situacaoDoSistema(antes, oficial, em(10)).situacao, "Aguardando atualização", "dia 0: a oficial acabou de sair");
    // 10/09 + 59 dias = 08/11; + 60 = 09/11. A hora do dia não importa.
    assert.equal(situacaoDoSistema(antes, oficial, em(8, 11)).situacao, "Aguardando atualização", "dia N-1");
    assert.equal(situacaoDoSistema(antes, oficial, em(9, 11)).situacao, "Desatualizado", "dia N");
    assert.equal(situacaoDoSistema({ data: "10/09/2026" }, oficial, em(9, 11)).situacao, "Em dia", "o prazo não mexe em quem está em dia");
    assert.equal(situacaoDoSistema(antes, oficial, { prazoDias: 0, hoje: new Date(2026, 8, 10) }).situacao, "Desatualizado", "prazo 0 é a regra estrita");
  });

  await t.test("prazo não inventa situação: sem data oficial e sem atualização continuam como antes", () => {
    const prazo = { prazoDias: 60, hoje: new Date(2026, 8, 10) };
    assert.equal(situacaoDoSistema({ data: "01/09/2026" }, "", prazo).situacao, "Sem referência");
    assert.equal(situacaoDoSistema(null, "10/09/2026", prazo).situacao, "Nunca atualizado");
  });

  await t.test("o que falta nunca vira em dia", () => {
    assert.equal(situacaoDoSistema(null, "09/09/2026").situacao, "Nunca atualizado");
    assert.equal(situacaoDoSistema({ data: "10/09/2026", versao: "10/09/2026" }, "").situacao, "Sem referência");
    assert.equal(situacaoDoSistema({ data: "31/02/2026", versao: null }, "09/09/2026").situacao, "Sem informação");
  });
});

test("situacaoDoCliente", async (t) => {
  const grupo = (...pares) => situacaoDoCliente(pares.map(([sistema, situacao]) => ({ sistema, situacao }))).grupo;

  await t.test("com B_Vendas, só ele decide", () => {
    assert.equal(grupo(["B_Vendas", "Em dia"], ["B_NFe", "Desatualizado"]), "em_dia", "NFe atrasada não derruba");
    assert.equal(grupo(["B_Vendas", "Desatualizado"], ["B_NFe", "Em dia"]), "desatualizado");
    assert.equal(grupo(["B_Vendas", "Nunca atualizado"], ["B_NFe", "Em dia"]), "pendente");
    assert.deepEqual(situacaoDoCliente([{ sistema: "B_Vendas", situacao: "Em dia" }]), { grupo: "em_dia", decididoPor: "B_Vendas" });
  });

  await t.test("sem B_Vendas, um atraso confirmado ganha de informação faltando", () => {
    assert.equal(grupo(["B_Importa", "Em dia"], ["B_Ordem", "Sem referência"], ["B_NFe", "Desatualizado"]), "desatualizado");
  });
  await t.test("aguardando: atrasado dentro do prazo, sem atraso vencido nem informação faltando", () => {
    assert.equal(grupo(["B_Vendas", "Aguardando atualização"], ["B_NFe", "Desatualizado"]), "aguardando", "com B_Vendas, só ele decide");
    assert.equal(grupo(["B_NFe", "Aguardando atualização"], ["B_Importa", "Em dia"]), "aguardando");
    assert.equal(grupo(["B_NFe", "Aguardando atualização"], ["B_Importa", "Desatualizado"]), "desatualizado");
    assert.equal(grupo(["B_NFe", "Aguardando atualização"], ["B_Importa", "Nunca atualizado"]), "pendente", "falta de dado não se esconde atrás do prazo");
  });
  await t.test("sem B_Vendas, em dia só com TODOS em dia", () => {
    assert.equal(grupo(["B_NFe", "Em dia"], ["B_Importa", "Em dia"]), "em_dia");
    assert.equal(grupo(["B_NFe", "Em dia"], ["B_Importa", "Nunca atualizado"]), "pendente");
    assert.equal(situacaoDoCliente([{ sistema: "B_NFe", situacao: "Em dia" }]).decididoPor, null);
  });
  await t.test("sem sistema que controle versão fica fora da conta", () => {
    assert.equal(situacaoDoCliente([]).grupo, "sem_atualizaveis");
  });
  await t.test("fixo e inativo não contam", () => {
    assert.equal(contaParaVersao({ ativo: 1, controla_versao: 0 }), false);
    assert.equal(contaParaVersao({ ativo: 0, controla_versao: 1 }), false);
    assert.equal(contaParaVersao({ ativo: 1, controla_versao: 1 }), true);
    assert.equal(contaParaVersao(undefined), false);
  });
});

function ambiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-situacao-"));
  const db = new Database(path.join(tmpDir, "gestao.db"));
  const servico = new AtualizacaoService(db, new HistoricoService(db), { notifyAtualizacao: async () => {} });
  const id = (nome) => db.sistemas.resolver(nome).id;
  const cliente = (nome, sistemas) => db.clientes.insert("", nome, "Marília", sistemas.map(id), "");
  const atender = (nome, sistema, data) => servico.create({ cliente: nome, sistema, data }, null);
  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, servico, cliente, atender, cleanup };
}

/** dd/mm/aaaa de N dias atrás. */
function diasAtras(n) {
  const d = new Date(Date.now() - n * 86400000);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

test("Resumo - situação dos clientes", async (t) => {
  const env = ambiente();
  try {
    env.db.sistemas.salvarVersao("B_Vendas", "01/01/2026");
    env.db.sistemas.salvarVersao("B_NFe", "01/01/2026");

    env.cliente("Loja Dois Sistemas", ["B_Vendas", "B_NFe", "Suporte Bredas"]);
    env.atender("Loja Dois Sistemas", "B_Vendas, B_NFe", "05/01/2026");

    env.cliente("Mercado Atrasado", ["B_NFe"]);
    env.atender("Mercado Atrasado", "B_NFe", "05/01/2026");

    env.cliente("Nunca Atendido", ["B_Vendas"]);
    env.cliente("Só Fixos", ["Suporte Bredas", "B_Atualizador"]);

    // A oficial muda DEPOIS da atualização do Mercado Atrasado.
    env.db.sistemas.salvarVersao("B_NFe", "10/01/2026");
    const s = env.servico.resumo().situacaoClientes;
    const nomes = (grupo) => s[grupo].map((c) => c.nome);

    await t.test("cada cliente cai em um grupo só, e os grupos somam o total", () => {
      // A Loja está com a NFe atrasada, mas o B_Vendas em dia: conta em dia.
      assert.deepEqual(nomes("em_dia"), ["Loja Dois Sistemas"]);
      assert.deepEqual(nomes("desatualizado"), ["Mercado Atrasado"]);
      assert.deepEqual(nomes("pendente"), ["Nunca Atendido"]);
      assert.deepEqual(nomes("sem_atualizaveis"), ["Só Fixos"]);
      const soma = s.em_dia.length + s.desatualizado.length + s.pendente.length + s.sem_atualizaveis.length;
      assert.equal(soma, env.db.clientes.count());
    });

    await t.test("mudar a oficial não reescreve a versão que o cliente recebeu", () => {
      const nfe = env.servico.situacaoCliente("Mercado Atrasado").find((x) => x.sistema === "B_NFe");
      assert.equal(nfe.instalada, "01/01/2026");
      assert.equal(nfe.situacao, "Desatualizado");
    });

    await t.test("sistema fixo não aparece na situação consolidada, mas continua na ficha", () => {
      const doCliente = s.em_dia.find((c) => c.nome === "Loja Dois Sistemas");
      assert.ok(!doCliente.sistemas.some((x) => x.sistema === "Suporte Bredas"));
      const ficha = env.servico.situacaoCliente("Só Fixos");
      assert.ok(ficha.every((x) => x.contaNaSituacao === false));
      assert.ok(ficha.every((x) => x.fixo && x.situacao === "Componente fixo" && x.oficial === ""));
    });

    await t.test("o card aponta o sistema com mais clientes atrasados", () => {
      // Os dois clientes com B_NFe estão atrasados nele: 2 de 2.
      assert.deepEqual(s.sistemasMaisAtrasados, [{ sistema: "B_NFe", total: 2, clientes: 2 }]);
    });

    await t.test("nova atualização recebe a oficial e tira o cliente do atraso", () => {
      env.atender("Mercado Atrasado", "B_NFe", "11/01/2026");
      const depois = env.servico.resumo().situacaoClientes;
      assert.ok(depois.em_dia.some((c) => c.nome === "Mercado Atrasado"));
    });
  } finally {
    env.cleanup();
  }
});

test("Resumo - tempo sem atualização não é situação de versão", () => {
  const env = ambiente();
  try {
    env.db.sistemas.salvarVersao("B_Vendas", "01/01/2020");
    env.cliente("Recente Mas Atrasado", ["B_Vendas"]);
    env.atender("Recente Mas Atrasado", "B_Vendas", diasAtras(1));
    // A oficial nova sai hoje: a atualização de ontem gravou a de 2020.
    env.db.sistemas.salvarVersao("B_Vendas", diasAtras(0));

    const resumo = env.servico.resumo();
    assert.ok(!resumo.semAtualizacao.some((c) => c.nome === "Recente Mas Atrasado"), "atualizado ontem");
    // A oficial é de hoje: dentro do prazo, aguarda -- mas já não está em dia.
    assert.ok(resumo.situacaoClientes.aguardando.some((c) => c.nome === "Recente Mas Atrasado"), "mas com a versão velha");
  } finally {
    env.cleanup();
  }
});

test("Resumo - parado há muito tempo pode estar em dia", () => {
  const env = ambiente();
  try {
    env.db.sistemas.salvarVersao("B_Vendas", "01/01/2020");
    env.cliente("Parado Em Dia", ["B_Vendas"]);
    env.atender("Parado Em Dia", "B_Vendas", diasAtras(200));

    const resumo = env.servico.resumo();
    assert.ok(resumo.semAtualizacao.some((c) => c.nome === "Parado Em Dia"), "200 dias sem atualização");
    assert.ok(resumo.situacaoClientes.em_dia.some((c) => c.nome === "Parado Em Dia"), "mas nenhuma versão nova saiu desde então");
  } finally {
    env.cleanup();
  }
});
