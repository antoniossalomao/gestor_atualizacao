/*
 * Preferências de notificação (planejamento 13.4): o que o sino conta, de
 * quem, e quando o Gestor fica quieto.
 *
 * Tudo aqui erra em silêncio: um horário silencioso que não vira a noite
 * acorda alguém às 23h; um "só as minhas" que compara o nome inteiro esconde
 * as tarefas da própria pessoa; um tipo desligado que continua contando faz o
 * número do sino mentir.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { montarNotificacoes, totalDe, emSilencio } from "../js/domain/notificacoes.js";
import { ehResponsavel } from "../js/domain/pessoa.js";

const as = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2026, 8, 28, h, m);
};

test("horário silencioso", async (t) => {
  const noite = { ativo: true, inicio: "19:00", fim: "07:00" };
  await t.test("desligado nunca silencia", () => {
    assert.equal(emSilencio(as("23:00"), { ...noite, ativo: false }), false);
  });
  await t.test("intervalo que vira a noite", () => {
    for (const h of ["19:00", "23:59", "00:00", "06:59"]) assert.equal(emSilencio(as(h), noite), true, h);
    for (const h of ["07:00", "12:00", "18:59"]) assert.equal(emSilencio(as(h), noite), false, h);
  });
  await t.test("intervalo dentro do dia", () => {
    const almoco = { ativo: true, inicio: "12:00", fim: "13:30" };
    assert.equal(emSilencio(as("12:00"), almoco), true);
    assert.equal(emSilencio(as("13:29"), almoco), true);
    assert.equal(emSilencio(as("13:30"), almoco), false, "o fim é exclusivo");
    assert.equal(emSilencio(as("11:59"), almoco), false);
  });
  await t.test("início igual ao fim, ou horário inválido, não silencia nada", () => {
    assert.equal(emSilencio(as("10:00"), { ativo: true, inicio: "10:00", fim: "10:00" }), false);
    assert.equal(emSilencio(as("10:00"), { ativo: true, inicio: "25:00", fim: "07:00" }), false);
  });
});

test("de quem é a tarefa", () => {
  assert.equal(ehResponsavel("Antonio", "Antonio Salomão"), true, "primeiro nome da tarefa x nome inteiro da conta");
  assert.equal(ehResponsavel("antonio salomao", "Antonio Salomão"), true, "sem caixa nem acento");
  assert.equal(ehResponsavel("Antonio Salomão", "Antonio"), true);
  assert.equal(ehResponsavel("Ana", "Anabela Souza"), false, "palavra inteira, não pedaço");
  assert.equal(ehResponsavel("Camila", "Antonio Salomão"), false);
  assert.equal(ehResponsavel("", "Antonio"), false);
});

test("filtro do sino", async (t) => {
  const ontem = new Date(Date.now() - 86400000);
  const dd = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const hoje = dd(new Date());
  const dados = {
    lembretes: [
      { tarefa: "A", cliente: "Loja 1", responsavel: "Antonio", data: dd(ontem) },
      { tarefa: "B", cliente: "Loja 2", responsavel: "Camila", data: dd(ontem) },
      { tarefa: "C", cliente: "Loja 3", responsavel: "Antonio", data: hoje },
    ],
    painel: { agentes: [{ situacao: "erro", empresa: "Posto" }] },
  };
  const chaves = (filtro) => montarNotificacoes(dados, filtro).map((n) => n.chave);

  await t.test("sem filtro, é o comportamento de antes", () => {
    assert.deepEqual(chaves(), ["agendamentos-atrasados", "agentes-erro", "agendamentos-hoje"]);
    assert.equal(totalDe(montarNotificacoes(dados)), 4);
  });
  await t.test("tipo desligado some da lista e do total", () => {
    assert.deepEqual(chaves({ agentes: false }), ["agendamentos-atrasados", "agendamentos-hoje"]);
    assert.deepEqual(chaves({ atrasados: false, hoje: false }), ["agentes-erro"]);
    assert.equal(totalDe(montarNotificacoes(dados, { atrasados: false })), 2);
  });
  await t.test("só as minhas filtra tarefas, não agentes", () => {
    const minhas = montarNotificacoes(dados, { escopo: "minhas", usuario: "Antonio Salomão" });
    assert.equal(minhas.find((n) => n.chave === "agendamentos-atrasados").quantidade, 1);
    assert.equal(minhas.find((n) => n.chave === "agentes-erro").quantidade, 1);
    assert.equal(totalDe(minhas), 3);
  });
  await t.test("só as minhas sem nome de usuário mostra tudo, em vez de esconder tudo", () => {
    assert.equal(totalDe(montarNotificacoes(dados, { escopo: "minhas", usuario: "" })), 4);
  });
});
