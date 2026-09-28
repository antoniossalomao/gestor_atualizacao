/*
 * Campanhas (E11): filtro, textos e marcação -- o que erra em silêncio.
 * Um filtro que deixa passar um concluído faz a equipe ligar para quem já
 * foi atendido; um botão "Agendar" que aparece para Consulta promete uma
 * ação que o servidor recusa; um nome de cliente que vira HTML é injeção.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { filtrarClientesCampanha, textoProgresso, tarefaDaCampanha, seloPrazo } from "../js/domain/campanhas.js";
import { acoesClienteCampanha, cabecalhoCampanha, cartaoCampanha, celulaSituacaoCampanha, filtrosCampanha, formularioCampanha, listaCampanhas } from "../js/templates/campanhas.js";

const MALICIOSO = '"><img src=x onerror=alert(1)>';
const CLIENTES = [
  { id: 1, nome: "Água Azul", codigo: "101", cidade: "Uberaba", situacao: "concluido" },
  { id: 2, nome: "Loja B", codigo: "202", cidade: "Araxá", situacao: "agendado", agendamento: { data: "30/09/2026", responsavel: "Ana" } },
  { id: 3, nome: "Loja C", codigo: "303", cidade: "Uberlândia", situacao: "pendente" },
];
const CAMPANHA = { id: 7, titulo: "NT 2026.001", sistema: "B_NFe", versaoAlvo: "25/09/2026", prazo: "30/09/2026", descricao: "", totalClientes: 3, atendidos: 1, agendados: 1, pendentes: 1, percentual: 33, encerradaEm: null, atrasada: false };

test("filtro rápido separa os grupos e a busca ignora acento", () => {
  assert.deepEqual(filtrarClientesCampanha(CLIENTES, "pendente").map((c) => c.id), [3]);
  assert.deepEqual(filtrarClientesCampanha(CLIENTES, "agendado").map((c) => c.id), [2]);
  assert.deepEqual(filtrarClientesCampanha(CLIENTES, "concluido").map((c) => c.id), [1]);
  assert.equal(filtrarClientesCampanha(CLIENTES, "todos").length, 3);
  assert.deepEqual(filtrarClientesCampanha(CLIENTES, "todos", "agua").map((c) => c.id), [1]);
  assert.deepEqual(filtrarClientesCampanha(CLIENTES, "todos", "araxa").map((c) => c.id), [2]);
  assert.deepEqual(filtrarClientesCampanha(CLIENTES, "todos", "303").map((c) => c.id), [3]);
});

test("progresso sem clientes não finge porcentagem", () => {
  assert.equal(textoProgresso({ totalClientes: 0, atendidos: 0, percentual: null }), "Nenhum cliente usa este sistema.");
  assert.equal(textoProgresso(CAMPANHA), "1 de 3 clientes atualizados (33%)");
});

test("tarefa criada pela campanha diz de onde veio", () => {
  assert.equal(tarefaDaCampanha(CAMPANHA), "Atualizar B_NFe para 25/09/2026 — NT 2026.001");
});

test("selo do prazo", () => {
  assert.equal(seloPrazo({ prazo: "" }), null);
  assert.deepEqual(seloPrazo({ prazo: "30/09/2026", atrasada: true }), { texto: "Prazo vencido em 30/09/2026", tipo: "alerta" });
  assert.equal(seloPrazo({ prazo: "30/09/2026", encerradaEm: "2026-09-30T10:00:00Z" }).tipo, "encerrada");
});

test("Agendar só para pendente, e nunca para Consulta ou campanha encerrada", () => {
  const acoes = (row, opts) => String(acoesClienteCampanha(row, opts));
  assert.match(acoes(CLIENTES[2], { role: "operador", encerrada: false }), /data-row-action="agendar"/);
  assert.doesNotMatch(acoes(CLIENTES[1], { role: "operador", encerrada: false }), /agendar/);
  assert.doesNotMatch(acoes(CLIENTES[0], { role: "operador", encerrada: false }), /agendar/);
  assert.doesNotMatch(acoes(CLIENTES[2], { role: "consulta", encerrada: false }), /agendar|acessos/);
  assert.doesNotMatch(acoes(CLIENTES[2], { role: "admin", encerrada: true }), /agendar/);
  // Botões só com ícone: nome acessível e dica sempre presentes.
  for (const botao of acoes(CLIENTES[2], { role: "admin", encerrada: false }).match(/<button[^>]*>/g)) {
    assert.match(botao, /aria-label="[^"]+"/);
    assert.match(botao, /title="[^"]+"/);
  }
});

test("ações da campanha respeitam o papel", () => {
  assert.doesNotMatch(String(cabecalhoCampanha(CAMPANHA, { role: "consulta" })), /data-action="(editar|encerrar|excluir)"/);
  assert.match(String(cabecalhoCampanha(CAMPANHA, { role: "consulta" })), /data-action="exportar"/);
  assert.doesNotMatch(String(cabecalhoCampanha(CAMPANHA, { role: "operador" })), /data-action="excluir"/);
  assert.match(String(cabecalhoCampanha(CAMPANHA, { role: "admin" })), /data-action="excluir"/);
  const encerrada = String(cabecalhoCampanha({ ...CAMPANHA, encerradaEm: "2026-09-30T10:00:00Z" }, { role: "operador" }));
  assert.match(encerrada, /data-action="reabrir"/);
  assert.doesNotMatch(encerrada, /data-action="editar"/);
});

test("texto digitado não vira HTML", () => {
  const perigosa = { ...CAMPANHA, titulo: MALICIOSO, descricao: MALICIOSO, sistema: MALICIOSO };
  for (const marcacao of [
    cartaoCampanha(perigosa, true),
    cabecalhoCampanha(perigosa, { role: "admin" }),
    celulaSituacaoCampanha({ situacao: "agendado", agendamento: { data: MALICIOSO, responsavel: MALICIOSO } }),
    acoesClienteCampanha({ id: 1, nome: MALICIOSO, situacao: "pendente" }, { role: "admin", encerrada: false }),
    formularioCampanha({ sistemas: [{ nome: MALICIOSO, data: MALICIOSO }] }),
    formularioCampanha({ sistemas: [], campanha: perigosa }),
  ]) {
    assert.doesNotMatch(String(marcacao), /<img/);
  }
});

test("formulário de edição não deixa mudar a meta", () => {
  const marcacao = String(formularioCampanha({ sistemas: [], campanha: CAMPANHA }));
  assert.match(marcacao, /id="cmp-sistema"[^>]*disabled/);
  assert.match(marcacao, /data-field="versaoAlvo"[^>]*disabled/);
  assert.doesNotMatch(marcacao, /<select/);
});

test("filtros mostram a contagem de cada grupo; lista vazia orienta", () => {
  const filtros = String(filtrosCampanha("pendente", { pendente: 1, agendado: 1, concluido: 1, todos: 3 }));
  assert.match(filtros, /data-filtro="pendente" aria-pressed="true"/);
  assert.match(filtros, /Todos <span class="filtro-rapido__n">3<\/span>/);
  assert.match(String(listaCampanhas([], null, { encerradas: false, podeCriar: true })), /Crie uma/);
  assert.doesNotMatch(String(listaCampanhas([], null, { encerradas: false, podeCriar: false })), /Crie uma/);
});

