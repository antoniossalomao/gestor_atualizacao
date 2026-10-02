/*
 * Campanhas (E11): filtro, textos e marcação -- o que erra em silêncio.
 * Um filtro que deixa passar um concluído faz a equipe ligar para quem já
 * foi atendido; um botão "Agendar" que aparece para Consulta promete uma
 * ação que o servidor recusa; um nome de cliente que vira HTML é injeção.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buscarClientes, descricaoPublico, modeloComQuemFalta, filtrarCandidatos, filtrarClientesCampanha, filtrosEscolhaVazios, opcoesFiltroEscolha, podeFiltrarQuemFalta, textoProgresso, seloPrazo } from "../js/domain/campanhas.js";
import { acoesClienteCampanha, cabecalhoCampanha, cartaoCampanha, celulaSituacaoCampanha, filtrosCampanha, filtrosEscolhaClientes, formularioAdicionarClientes, formularioAgendarPendentes, formularioCampanha, listaCampanhas, listaEscolhaClientes } from "../js/templates/campanhas.js";

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
  assert.doesNotMatch(String(cabecalhoCampanha(CAMPANHA, { role: "admin" })), /exportar/i, "a exportação de pendentes foi retirada");
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
    formularioAdicionarClientes(perigosa),
    formularioAgendarPendentes({ ...perigosa, pendentes: 2 }, MALICIOSO),
    formularioCampanha({ sistemas: [{ nome: MALICIOSO }], cidades: [], modelo: { sistema: MALICIOSO, versaoAlvo: MALICIOSO, titulo: MALICIOSO, descricao: MALICIOSO, clienteIds: [1] } }),
    filtrosEscolhaClientes({ cidades: [MALICIOSO, "B"], grupos: [MALICIOSO, "B"], regimes: [MALICIOSO, "B"] }, { ...filtrosEscolhaVazios(), cidade: MALICIOSO }, { podeFiltrarQuemFalta: true }),
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

const CANDIDATOS = [
  { id: 1, nome: "Loja Rede A", codigo: "10", cidade: "Marília", grupo: "Rede Sul", regime: "Simples Nacional", atendido: true },
  { id: 2, nome: "Loja Rede B", codigo: "11", cidade: "Bauru", grupo: "Rede Sul", regime: "Lucro Presumido", atendido: false },
  { id: 3, nome: "Loja Solta", codigo: "12", cidade: "Marília", grupo: "", regime: "Simples Nacional", atendido: false },
];

test("filtros da lista de escolha combinam entre si, com a busca", () => {
  const nomes = (filtros) => filtrarCandidatos(CANDIDATOS, { ...filtrosEscolhaVazios(), ...filtros }).map((c) => c.id);
  assert.deepEqual(nomes({}), [1, 2, 3]);
  assert.deepEqual(nomes({ cidade: "Marília" }), [1, 3]);
  assert.deepEqual(nomes({ grupo: "Rede Sul" }), [1, 2]);
  assert.deepEqual(nomes({ regime: "Simples Nacional" }), [1, 3]);
  assert.deepEqual(nomes({ cidade: "Marília", regime: "Simples Nacional", grupo: "Rede Sul" }), [1]);
  assert.deepEqual(nomes({ soQuemFalta: true }), [2, 3], "quem já cumpre a versão-alvo sai");
  assert.deepEqual(nomes({ soQuemFalta: true, cidade: "Marília" }), [3]);
  assert.deepEqual(nomes({ busca: "marilia", soQuemFalta: true }), [3], "a busca ignora acento e soma com os filtros");
});

test("'só quem falta' não tira ninguém quando a versão-alvo não julgou ninguém", () => {
  const sem = CANDIDATOS.map((c) => ({ ...c, atendido: null }));
  assert.equal(podeFiltrarQuemFalta(sem), false);
  assert.equal(podeFiltrarQuemFalta(CANDIDATOS), true);
  assert.equal(filtrarCandidatos(sem, { ...filtrosEscolhaVazios(), soQuemFalta: true }).length, 3);
});

test("opções dos filtros: só o que existe, sem repetição, em ordem", () => {
  assert.deepEqual(opcoesFiltroEscolha(CANDIDATOS), { cidades: ["Bauru", "Marília"], grupos: ["Rede Sul"], regimes: ["Lucro Presumido", "Simples Nacional"] });
  assert.deepEqual(opcoesFiltroEscolha([]), { cidades: [], grupos: [], regimes: [] });
});

test("filtros da escolha: seletor com uma opção só não aparece; 'só quem falta' desabilita sem versão-alvo", () => {
  const opcoes = opcoesFiltroEscolha(CANDIDATOS);
  const marcacao = String(filtrosEscolhaClientes(opcoes, { ...filtrosEscolhaVazios(), cidade: "Bauru" }, { podeFiltrarQuemFalta: true }));
  assert.match(marcacao, /data-filtro-escolha="cidade"/);
  assert.match(marcacao, /value="Bauru" selected/);
  assert.match(marcacao, /data-filtro-escolha="regime"/);
  assert.doesNotMatch(marcacao, /data-filtro-escolha="grupo"/, "só um grupo: filtro inútil");
  assert.doesNotMatch(marcacao, /type="checkbox"[^>]*disabled/);
  const sem = String(filtrosEscolhaClientes(opcoes, filtrosEscolhaVazios(), { podeFiltrarQuemFalta: false }));
  assert.match(sem, /type="checkbox"[^>]*disabled/);
  assert.match(sem, /informe a versão-alvo/);
});

test("adicionar e retirar clientes: só em campanha de escolhidos, aberta e para quem edita", () => {
  const cab = (c, usuario) => String(cabecalhoCampanha(c, usuario));
  const escolhida = { ...CAMPANHA, publico: "escolhidos" };
  assert.match(cab(escolhida, { role: "operador" }), /data-action="adicionar"/);
  assert.doesNotMatch(cab(CAMPANHA, { role: "operador" }), /data-action="adicionar"/, "campanha de todos não tem lista");
  assert.doesNotMatch(cab({ ...CAMPANHA, publico: "todos" }, { role: "admin" }), /data-action="adicionar"/);
  assert.doesNotMatch(cab(escolhida, { role: "consulta" }), /data-action="adicionar"/);
  assert.doesNotMatch(cab({ ...escolhida, encerradaEm: "2026-09-30T10:00:00Z" }, { role: "operador" }), /data-action="adicionar"/);

  const acoes = (opts) => String(acoesClienteCampanha(CLIENTES[0], { encerrada: false, ...opts }));
  assert.match(acoes({ role: "operador", podeRetirar: true }), /data-row-action="remover"/);
  assert.doesNotMatch(acoes({ role: "operador" }), /remover/, "sem podeRetirar (campanha de todos, ou o último cliente)");
  assert.doesNotMatch(acoes({ role: "consulta", podeRetirar: true }), /remover/);
  assert.doesNotMatch(acoes({ role: "operador", encerrada: true, podeRetirar: true }), /remover/);
  assert.match(acoes({ role: "operador", podeRetirar: true }).match(/<button[^>]*data-row-action="remover"[^>]*>/)[0], /title="[^"]+"[^>]*aria-label="[^"]+"|aria-label="[^"]+"[^>]*title="[^"]+"/);

  const janela = String(formularioAdicionarClientes({ titulo: "NT 1", sistema: "B_NFe" }));
  assert.match(janela, /data-role="escolha"(?![^>]*hidden)/, "a janela já abre com a lista visível");
  assert.match(janela, /data-action="salvar"/);
});

test("Agendar pendentes: botão só com pendente, campanha aberta e quem edita; a janela diz quantos e a prioridade", () => {
  const cab = (c, usuario) => String(cabecalhoCampanha(c, usuario));
  assert.match(cab(CAMPANHA, { role: "operador" }), /data-action="agendar-pendentes"[^>]*>[^<]*<svg[\s\S]*Agendar pendentes \(1\)/);
  assert.doesNotMatch(cab({ ...CAMPANHA, pendentes: 0 }, { role: "operador" }), /agendar-pendentes/);
  assert.doesNotMatch(cab(CAMPANHA, { role: "consulta" }), /agendar-pendentes/);
  assert.doesNotMatch(cab({ ...CAMPANHA, encerradaEm: "2026-09-30T10:00:00Z" }, { role: "operador" }), /agendar-pendentes/);

  const com = String(formularioAgendarPendentes({ ...CAMPANHA, pendentes: 12 }, "02/10/2026"));
  assert.match(com, /<strong>12 clientes pendentes<\/strong>/);
  assert.match(com, /value="02\/10\/2026"/);
  assert.match(com, /prioridade Alta/);
  assert.match(com, /Criar 12 agendamentos/);
  const sem = String(formularioAgendarPendentes({ ...CAMPANHA, prazo: "", pendentes: 1 }, "02/10/2026"));
  assert.match(sem, /prioridade Normal/);
  assert.match(sem, /<strong>1 cliente pendente<\/strong>/);
  assert.match(sem, /Criar 1 agendamento</);
});

test("campanha com quem falta: herda sistema, meta e quem não concluiu; prazo não", () => {
  const origem = { ...CAMPANHA, titulo: "NT 2026.001", descricao: "Cobrar até sexta", prazo: "30/09/2026", clientes: CLIENTES };
  const modelo = modeloComQuemFalta(origem);
  assert.deepEqual(modelo.clienteIds, [2, 3], "pendente e já agendado entram; concluído, não");
  assert.equal(modelo.sistema, "B_NFe");
  assert.equal(modelo.versaoAlvo, "25/09/2026");
  assert.equal(modelo.titulo, "NT 2026.001 — quem falta");
  assert.equal(modelo.descricao, "Cobrar até sexta");
  assert.ok(!("prazo" in modelo), "o prazo antigo não vem");
  assert.equal(modeloComQuemFalta({ ...origem, titulo: modelo.titulo }).titulo, "NT 2026.001 — quem falta", "não empilha o sufixo");
  assert.ok(modeloComQuemFalta({ ...origem, titulo: "x".repeat(120) }).titulo.length <= 120, "respeita o limite do título");
  assert.deepEqual(modeloComQuemFalta({ ...origem, clientes: [CLIENTES[0]] }).clienteIds, []);
});

test("botão 'Campanha com quem falta': só com alguém faltando, para quem edita, também na encerrada", () => {
  const cab = (c, usuario) => String(cabecalhoCampanha(c, usuario));
  assert.match(cab(CAMPANHA, { role: "operador" }), /data-action="nova-quem-falta"/);
  assert.match(cab({ ...CAMPANHA, encerradaEm: "2026-09-30T10:00:00Z" }, { role: "operador" }), /data-action="nova-quem-falta"/, "o uso principal: a campanha que acabou com gente faltando");
  assert.doesNotMatch(cab({ ...CAMPANHA, pendentes: 0, agendados: 0 }, { role: "operador" }), /nova-quem-falta/);
  assert.match(cab({ ...CAMPANHA, pendentes: 0, agendados: 2 }, { role: "operador" }), /nova-quem-falta/, "já agendado ainda não cumpriu");
  assert.doesNotMatch(cab(CAMPANHA, { role: "consulta" }), /nova-quem-falta/);
});

test("formulário com modelo: abre no sistema e meta herdados, com 'só escolhidos' marcado", () => {
  const modelo = modeloComQuemFalta({ ...CAMPANHA, descricao: "d", clientes: CLIENTES });
  const marcacao = String(formularioCampanha({ sistemas: [{ nome: "B_Vendas" }, { nome: "B_NFe", data: "20/09/2026" }], cidades: [], modelo }));
  assert.match(marcacao, /<option value="B_NFe"[^>]*selected/);
  assert.doesNotMatch(marcacao, /<option value="B_Vendas"[^>]*selected/);
  assert.match(marcacao, /id="cmp-versao"[^>]*value="25\/09\/2026"/);
  assert.match(marcacao, /value="NT 2026.001 — quem falta"/);
  assert.match(marcacao, /name="publico" value="escolhidos" checked/);
  assert.match(marcacao, /data-role="campo-cidade" hidden/);
  assert.doesNotMatch(marcacao, /data-role="escolha" hidden/);
  assert.match(marcacao, /Nova campanha com quem falta/);
  assert.match(marcacao, /2 clientes que ainda não cumpriram a meta/);
  assert.doesNotMatch(String(formularioCampanha({ sistemas: [{ nome: "B_NFe" }], cidades: [] })), /quem falta/, "sem modelo, formulário como sempre");
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
