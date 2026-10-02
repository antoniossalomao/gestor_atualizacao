/*
 * Campanhas (E11): filtro, textos e marcação -- o que erra em silêncio.
 * Um filtro que deixa passar um concluído faz a equipe ligar para quem já
 * foi atendido; um botão "Agendar" que aparece para Consulta promete uma
 * ação que o servidor recusa; um nome de cliente que vira HTML é injeção.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buscarClientes, descricaoPublico, filtrarClientesCampanha, textoProgresso, tarefaDaCampanha, seloPrazo } from "../js/domain/campanhas.js";
import { acoesClienteCampanha, cabecalhoCampanha, cartaoCampanha, celulaSituacaoCampanha, filtrosCampanha, formularioCampanha, listaCampanhas, listaEscolhaClientes } from "../js/templates/campanhas.js";

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
    formularioCampanha({ sistemas: [{ nome: MALICIOSO, data: MALICIOSO }], cidades: [MALICIOSO] }),
    formularioCampanha({ sistemas: [], campanha: perigosa }),
    listaEscolhaClientes([{ id: 1, nome: MALICIOSO, codigo: MALICIOSO, cidade: MALICIOSO }], new Set([1])),
    cartaoCampanha({ ...perigosa, publico: "escolhidos" }, false),
  ]) {
    assert.doesNotMatch(String(marcacao), /<img/);
  }
});

test("formulário de edição não deixa mudar a meta", () => {
  const marcacao = String(formularioCampanha({ sistemas: [], campanha: CAMPANHA }));
  assert.match(marcacao, /id="cmp-sistema"[^>]*disabled/);
  assert.match(marcacao, /data-field="versaoAlvo"[^>]*disabled/);
  assert.doesNotMatch(marcacao, /<select[^>]*id="cmp-sistema"/);
  assert.match(marcacao, /<select[^>]*id="cmp-cidade"/);
});

test("campanha para clientes escolhidos: busca, descrição do público e formulário", () => {
  assert.deepEqual(buscarClientes(CLIENTES, "uberl").map((c) => c.id), [3]);
  assert.equal(buscarClientes(CLIENTES, "  ").length, 3, "busca em branco devolve todos");
  assert.equal(descricaoPublico({ publico: "escolhidos", cidade: "" }), "Clientes escolhidos");
  assert.equal(descricaoPublico({ publico: "todos", cidade: "Uberaba" }), "Uberaba");
  assert.equal(descricaoPublico({ publico: "todos", cidade: "" }), "Todas as cidades");
  assert.equal(descricaoPublico({}), "Todas as cidades", "campanha sem o campo (resposta antiga) vale para todos");
  assert.match(String(cabecalhoCampanha({ ...CAMPANHA, publico: "escolhidos" }, { role: "operador" })), /Clientes escolhidos/);
  assert.match(String(cartaoCampanha({ ...CAMPANHA, publico: "escolhidos", cidade: "" }, false)), /Clientes escolhidos/);
  assert.equal(textoProgresso({ totalClientes: 0, atendidos: 0, percentual: null, publico: "escolhidos" }), "Nenhum cliente escolhido usa mais este sistema.");

  const novo = String(formularioCampanha({ sistemas: [{ nome: "B_NFe" }], cidades: ["Uberaba"] }));
  assert.match(novo, /name="publico" value="todos" checked/);
  assert.match(novo, /data-role="escolha" hidden/);
  const edicao = String(formularioCampanha({ sistemas: [], campanha: { ...CAMPANHA, publico: "escolhidos" } }));
  assert.match(edicao, /name="publico" value="escolhidos" checked/);
  assert.match(edicao, /data-role="campo-cidade" hidden/);
  assert.doesNotMatch(edicao, /data-role="escolha" hidden/);
});

test("lista de escolha marca só quem está na seleção", () => {
  const lista = String(listaEscolhaClientes(CLIENTES, new Set([2])));
  assert.match(lista, /value="2" checked/);
  assert.doesNotMatch(lista, /value="1" checked|value="3" checked/);
  assert.match(lista, /Cód\. 303 · Uberlândia/);
  assert.match(String(listaEscolhaClientes([], new Set())), /Nenhum cliente encontrado/);
});

test("filtros mostram a contagem de cada grupo; lista vazia orienta", () => {
  const filtros = String(filtrosCampanha("pendente", { pendente: 1, agendado: 1, concluido: 1, todos: 3 }));
  assert.match(filtros, /data-filtro="pendente" aria-pressed="true"/);
  assert.match(filtros, /Todos <span class="filtro-rapido__n">3<\/span>/);
  assert.match(String(listaCampanhas([], null, { encerradas: false, podeCriar: true })), /Crie uma/);
  assert.doesNotMatch(String(listaCampanhas([], null, { encerradas: false, podeCriar: false })), /Crie uma/);
});

/*
 * Importação de planilha (templates/importacao.js) -- mesmo arquivo porque
 * é o outro fluxo entregue junto com as Campanhas no fechamento do plano.
 */
import { previaImportacao, resultadoImportacao, orientacaoImportacao } from "../js/templates/importacao.js";

const PREVIA = {
  total: 4, validas: 3, comErro: 1, duplicadas: 1, clientesSemCadastro: 1, colunasIgnoradas: [], semCabecalho: false,
  ocorrencias: [
    { linha: 3, cliente: MALICIOSO, data: "2026-08-12", sistema: "", erro: { tipo: "data", mensagem: MALICIOSO }, avisos: [] },
    { linha: 4, cliente: "Loja", data: "10/08/2026", sistema: "B_NFe", erro: null, avisos: [{ tipo: "duplicidade", mensagem: "Repetida nesta planilha." }] },
  ],
};

test("prévia: o botão diz quantas linhas entram, conforme pular duplicidades", () => {
  assert.match(String(previaImportacao(PREVIA, "a.xlsx", true)), /Importar 2 linhas/);
  assert.match(String(previaImportacao(PREVIA, "a.xlsx", false)), /Importar 3 linhas/);
  const nada = String(previaImportacao({ ...PREVIA, validas: 1, duplicadas: 1 }, "a.xlsx", true));
  assert.match(nada, /data-action="importar" disabled/);
});

test("prévia: erro e aviso são distinguidos, e nada digitado vira HTML", () => {
  const m = String(previaImportacao(PREVIA, MALICIOSO, true));
  assert.doesNotMatch(m, /<img/);
  assert.match(m, /Erro · Data:/);
  assert.match(m, /Aviso · Duplicidade:/);
  assert.doesNotMatch(String(resultadoImportacao({ inserted: 1, ignoradas: 0, naoCadastrados: [MALICIOSO] })), /<img/);
});

test("orientação explica o formato antes de escolher o arquivo", () => {
  const m = String(orientacaoImportacao());
  assert.match(m, /dd\/mm\/aaaa/);
  assert.match(m, /versão oficial atual <strong>não<\/strong> é aplicada/);
});
