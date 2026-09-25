/*
 * Card "Atualização dos Clientes" do Resumo: as contas (domain/situacao.js)
 * e a marcação (templates/resumo.js, corpoSituacao).
 *
 * A regra de quem está em dia é do servidor (tem teste lá). Aqui o que erra
 * em silêncio é a apresentação: porcentagem sobre o denominador errado, "100%
 * em dia" de ninguém, "pela data" sumindo do texto, nome de sistema virando
 * HTML.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { totaisSituacao, percentual, rotuloSituacao, sistemasQueExplicam } from "../js/domain/situacao.js";
import { corpoSituacao } from "../js/templates/resumo.js";

const cli = (nome) => ({ nome, cidade: "—", sistemas: [] });

test("totaisSituacao", async (t) => {
  const situacao = {
    em_dia: [cli("A"), cli("B")],
    desatualizado: [cli("C")],
    pendente: [cli("D")],
    sem_atualizaveis: [cli("E"), cli("F"), cli("G")],
  };
  const totais = totaisSituacao(situacao);

  await t.test("quem não controla versão fica fora do denominador", () => {
    assert.equal(totais.avaliados, 4);
    assert.equal(totais.foraDaAvaliacao, 3);
    assert.deepEqual(totais.grupos.map((g) => [g.chave, g.total, g.pct]), [["em_dia", 2, 50], ["desatualizado", 1, 25], ["pendente", 1, 25]]);
  });

  await t.test("sem ninguém para avaliar, zero -- não NaN nem 100%", () => {
    const vazio = totaisSituacao({ em_dia: [], desatualizado: [], pendente: [], sem_atualizaveis: [cli("X")] });
    assert.equal(vazio.avaliados, 0);
    assert.ok(vazio.grupos.every((g) => g.pct === 0));
    assert.equal(percentual(3, 0), 0);
  });
});

test("rótulos da situação", async (t) => {
  await t.test("'pela data' não some do texto", () => {
    assert.equal(rotuloSituacao("Em dia", true), "Em dia (pela data)");
    assert.equal(rotuloSituacao("Em dia", false), "Em dia");
  });

  await t.test("a lista de um grupo mostra os sistemas que o puseram ali", () => {
    const sistemas = [
      { sistema: "B_NFe", situacao: "Desatualizado", pelaData: true },
      { sistema: "B_Vendas", situacao: "Em dia" },
      { sistema: "B_Ordem", situacao: "Sem referência" },
    ];
    assert.equal(sistemasQueExplicam("desatualizado", sistemas), "B_NFe (pela data)");
    assert.equal(sistemasQueExplicam("pendente", sistemas), "B_Ordem: sem referência");
  });

  await t.test("quem foi decidido pelo B_Vendas mostra só ele", () => {
    const sistemas = [
      { sistema: "B_Vendas", situacao: "Em dia" },
      { sistema: "B_NFe", situacao: "Desatualizado" },
    ];
    assert.equal(sistemasQueExplicam("em_dia", sistemas, "B_Vendas"), "B_Vendas");
  });
});

test("corpoSituacao", async (t) => {
  const situacao = { em_dia: [cli("A")], desatualizado: [cli("B"), cli("C")], pendente: [], sem_atualizaveis: [] };
  const maisAtrasados = [
    { sistema: "B_NFe", total: 5 },
    { sistema: "B_Vendas", total: 3 },
    { sistema: '"><img src=x onerror=alert(1)>', total: 2 },
    { sistema: "B_Ordem", total: 1 },
  ];
  const marcacao = String(corpoSituacao(totaisSituacao(situacao), maisAtrasados));

  await t.test("cada total é um botão que abre o seu grupo", () => {
    for (const chave of ["em_dia", "desatualizado", "pendente"]) assert.match(marcacao, new RegExp(`data-grupo="${chave}"`));
  });

  await t.test("grupo vazio não vira pedaço da barra", () => {
    assert.equal((marcacao.match(/situacao__parte/g) || []).length, 2);
  });

  await t.test("mostra só os três sistemas mais atrasados, e oferece o resto", () => {
    assert.equal((marcacao.match(/data-sistema=/g) || []).length, 3);
    assert.match(marcacao, /Ver todos \(4\)/);
  });

  await t.test("nome de sistema não vira HTML", () => {
    assert.ok(!marcacao.includes("<img"));
  });

  await t.test("sem ninguém para avaliar, orienta em vez de mostrar porcentagem", () => {
    const vazio = String(corpoSituacao(totaisSituacao({ em_dia: [], desatualizado: [], pendente: [], sem_atualizaveis: [] }), []));
    assert.ok(!vazio.includes("%"));
    assert.match(vazio, /Cadastre clientes/);
  });
});
