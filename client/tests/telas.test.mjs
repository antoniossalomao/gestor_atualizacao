/*
 * Testes das telas mais usadas: Agendamentos, Atualizações, Consultar
 * Cliente, Resumo, o sino de notificações e a Administração.
 *
 * As views em si não carregam no Node (mexem no `document` já ao serem
 * importadas). O que se testa aqui é o que foi tirado delas justamente para
 * isso: a regra (domain/) e a marcação (templates/). A view ficou só com o
 * que precisa de DOM: pegar a marcação, jogar num innerHTML e ligar eventos.
 *
 * Nos templates, o foco é o que erra EM SILÊNCIO -- texto digitado por alguém
 * que vira HTML, uma permissão que deixa de esconder um botão, uma tarefa de
 * hoje que aparece como vencida. Layout não se testa aqui.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { STATUS_CONCLUIDO, estaAtrasada } from "../js/domain/agendamento.js";
import { cartaoKanban, colunasKanban, slugStatus } from "../js/templates/agendamentos.js";
import { chipsFiltroAtualizacoes, htmlChips } from "../js/templates/filtros.js";
import { splitSistemas, montarMatrizVersoes } from "../js/domain/matrizVersoes.js";
import { cartaoAcesso, linhaMatrizVersoes } from "../js/templates/consulta.js";
import { formatarMes, primeiroDiaDoMes, tendenciaMensal } from "../js/domain/resumo.js";
import { statTile, deltaTendencia } from "../js/templates/resumo.js";
import { listaNotificacoes, itemNotificacao } from "../js/templates/notificacoes.js";
import { alteracoesRegras, descreverChaveAgentes, formatarTempoAtivo, papelNormalizado } from "../js/domain/administracao.js";
import { linhaUsuario, linhaBackup, blocosSaude, linhaRegraNumero } from "../js/templates/administracao.js";
import { cartaoPerfil, linhaSessao, listaSessoes, previaTabela, listaAtalhos, resultadosBusca } from "../js/templates/configuracoes.js";
import { cabecalhoSecao, tituloCartao } from "../js/templates/secao.js";
import { descreverAparelho } from "../js/domain/aparelho.js";
import { descricaoPapel } from "../js/domain/pessoa.js";
import { filtrarClientesDoSistema } from "../js/domain/filtrosSistemas.js";

test("Sistemas: situação e busca filtram clientes sem mudar seus dados", () => {
  const rows = [
    { cliente: "Água Azul", cidade: "Uberaba", situacao: "Em dia" },
    { cliente: "Loja B", cidade: "Araxá", situacao: "Desatualizado" },
    { cliente: "Loja C", cidade: "Uberlândia", situacao: "Sem referência" },
  ];
  assert.deepEqual(filtrarClientesDoSistema(rows, "Em dia", "agua"), [rows[0]]);
  assert.deepEqual(filtrarClientesDoSistema(rows, "Desatualizados", "araxá"), [rows[1]]);
  assert.deepEqual(filtrarClientesDoSistema(rows, "Sem informação"), [rows[2]]);
  assert.equal(rows[0].situacao, "Em dia");
});

const MALICIOSO = '"><img src=x onerror=alert(1)>';
const texto = (v) => String(v);

/** Valor de um atributo, com as entidades desfeitas -- o que o navegador entregaria em `dataset`. */
function atributo(marcacao, nome) {
  const m = new RegExp(`${nome}="([^"]*)"`).exec(marcacao);
  if (!m) return null;
  return m[1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Nenhum trecho do texto malicioso sobreviveu como marcação.
 *
 * O nome da tag aceita dígito (`[a-z][a-z0-9]*`): só com letras, um `<h3>`
 * logo depois de um atributo legítimo não era reconhecido como tag, e o teste
 * acusava injeção onde não havia nenhuma.
 */
function semInjecao(marcacao) {
  assert.ok(!marcacao.includes("<img"), "uma tag digitada virou HTML de verdade");
  assert.ok(!/"\s*>\s*</.test(marcacao.replace(/"\s*>\s*<(\/?[a-z][a-z0-9]*[\s>])/g, "")), "um atributo foi fechado antes da hora");
}

// Quarta-feira, 23/09/2026, 15h -- fixo para "hoje" e "vencida" não mudarem com o dia em que o teste roda.
const AGORA = new Date(2026, 8, 23, 15, 0, 0);

// ---------------------------------------------------------------- Agendamentos

test("Agendamentos - quando uma tarefa está vencida", async (t) => {
  await t.test("antes de hoje: vencida; hoje e depois: não", () => {
    assert.equal(estaAtrasada("22/09/2026", AGORA), true);
    assert.equal(estaAtrasada("23/09/2026", AGORA), false, "a de hoje não vence às 15h");
    assert.equal(estaAtrasada("24/09/2026", AGORA), false);
  });

  await t.test("às 23h59 a de hoje ainda não venceu", () => {
    assert.equal(estaAtrasada("23/09/2026", new Date(2026, 8, 23, 23, 59)), false);
  });

  await t.test("data vazia ou torta nunca conta como vencida", () => {
    // Senão tarefa importada sem data ficaria vermelha no quadro para sempre.
    for (const d of ["", null, undefined, "2026-09-01", "1/9/2026", "ontem"]) {
      assert.equal(estaAtrasada(d, AGORA), false, JSON.stringify(d));
    }
  });

  await t.test("o status concluído é o último do fluxo", () => {
    assert.equal(STATUS_CONCLUIDO, "Concluído");
  });
});

test("Agendamentos - cartão do kanban", async (t) => {
  const base = { id: 7, tarefa: "Atualizar", cliente: "Mercado X", status: "A Fazer", data: "30/09/2026" };

  await t.test("título e cliente digitados não viram HTML, em nenhum dos três lugares", () => {
    const html = texto(cartaoKanban({ ...base, tarefa: MALICIOSO, cliente: MALICIOSO }, "operador", { agora: AGORA }));
    semInjecao(html);
    // O aria-label era o lugar vulnerável: escapeHtml antigo, sem aspas.
    assert.equal(atributo(html, "aria-label"), `Tarefa ${MALICIOSO}`);
    assert.equal(atributo(html, "title"), MALICIOSO);
  });

  await t.test("vencida ganha o selo e a classe; a de hoje, o selo 'Hoje'", () => {
    const vencida = texto(cartaoKanban({ ...base, data: "01/09/2026" }, "operador", { agora: AGORA }));
    assert.match(vencida, /kanban-card is-overdue/);
    assert.match(vencida, />Vencida</);

    const hoje = texto(cartaoKanban({ ...base, data: "23/09/2026" }, "operador", { agora: AGORA }));
    assert.doesNotMatch(hoje, /is-overdue/);
    assert.match(hoje, />Hoje</);
  });

  await t.test("concluída nunca aparece como vencida nem como 'Hoje'", () => {
    const html = texto(cartaoKanban({ ...base, status: STATUS_CONCLUIDO, data: "01/09/2026" }, "operador", { agora: AGORA }));
    assert.doesNotMatch(html, /is-overdue|Vencida|>Hoje</);
  });

  await t.test("perfil Consulta não arrasta cartão nem vê 'Reabrir'", () => {
    const arquivada = { ...base, status: STATUS_CONCLUIDO, arquivadoEm: "2026-09-01" };
    const consulta = texto(cartaoKanban(arquivada, "consulta", { agora: AGORA }));
    assert.doesNotMatch(consulta, /draggable/);
    assert.doesNotMatch(consulta, /data-row-action="reabrir"/);

    const operador = texto(cartaoKanban(arquivada, "operador", { agora: AGORA }));
    assert.match(operador, /data-row-action="reabrir"/, "operador reabre a arquivada");
    assert.doesNotMatch(operador, /draggable/, "arquivada não se arrasta, nem para operador");

    assert.match(texto(cartaoKanban(base, "operador", { agora: AGORA })), /draggable="true"/);
  });

  await t.test("Arquivar só aparece para tarefa concluída ativa e usuário que pode editar", () => {
    const concluida = { ...base, status: STATUS_CONCLUIDO };
    const operador = texto(cartaoKanban(concluida, "operador", { agora: AGORA }));
    assert.match(operador, /data-row-action="arquivar"/);
    assert.doesNotMatch(operador, /data-row-action="converter"/);
    assert.doesNotMatch(texto(cartaoKanban(base, "operador", { agora: AGORA })), /data-row-action="arquivar"/);
    assert.doesNotMatch(texto(cartaoKanban(concluida, "consulta", { agora: AGORA })), /data-row-action="arquivar"/);
    assert.doesNotMatch(texto(cartaoKanban({ ...concluida, arquivadoEm: "2026-09-01" }, "admin", { agora: AGORA })), /data-row-action="arquivar"/);
  });

  await t.test("sem data nem sistema/responsável: nada de '·' solto nem <time> vazio", () => {
    const html = texto(cartaoKanban({ id: 1, tarefa: "t", status: "A Fazer" }, "operador", { agora: AGORA }));
    assert.doesNotMatch(html, /<time/);
    assert.match(html, /kanban-card__meta">—</);
    assert.match(html, />Sem cliente</);
  });
});

test("Agendamentos - colunas do kanban", async (t) => {
  const colunas = [
    { status: "A Fazer", titulo: "A Fazer", itens: [{ id: 1, tarefa: "a", status: "A Fazer" }] },
    { status: "Concluído", titulo: "Concluído", itens: [] },
  ];

  await t.test("coluna vazia mostra o aviso; a contagem bate com os cartões", () => {
    const html = texto(colunasKanban(colunas, "operador", { agora: AGORA }));
    assert.match(html, /kanban-column--a-fazer[\s\S]*kanban-column__count">1</);
    assert.match(html, /kanban-column--concluido[\s\S]*Nenhuma tarefa aqui/);
    assert.equal(html.match(/<article/g).length, 1);
  });

  await t.test("reordenar coluna: só com mais de uma na tela e fora do perfil Consulta", () => {
    assert.match(texto(colunasKanban(colunas, "operador")), /data-col-drag="true"/);
    assert.doesNotMatch(texto(colunasKanban(colunas, "consulta")), /data-col-drag/);
    assert.doesNotMatch(texto(colunasKanban([colunas[0]], "operador")), /data-col-drag/);
  });

  await t.test("o slug do status vira classe CSS sem acento nem espaço", () => {
    assert.equal(slugStatus("Em Andamento"), "em-andamento");
    assert.equal(slugStatus("Concluído"), "concluido");
    assert.equal(slugStatus("Sem resposta"), "sem-resposta");
  });
});

// ---------------------------------------------------------------- Atualizações

test("Atualizações - chips de filtro ativo", async (t) => {
  await t.test("sem filtro, sem chip ('Todos' não é filtro)", () => {
    assert.deepEqual(chipsFiltroAtualizacoes({ busca: "", responsavel: "Todos", desde: "", ate: "" }), []);
  });

  await t.test("um chip por filtro, na ordem busca, responsável, período", () => {
    const chips = chipsFiltroAtualizacoes({ busca: "mercado", responsavel: "Ana", desde: "01/09/2026", ate: "23/09/2026" });
    assert.deepEqual(chips, [
      { id: "busca", label: 'Busca: "mercado"' },
      { id: "responsavel", label: "Responsável: Ana" },
      { id: "periodo", label: "Período: 01/09/2026 a 23/09/2026" },
    ]);
  });

  await t.test("período com uma ponta só é dito por extenso", () => {
    assert.equal(chipsFiltroAtualizacoes({ desde: "01/09/2026" })[0].label, "Período: A partir de 01/09/2026");
    assert.equal(chipsFiltroAtualizacoes({ ate: "23/09/2026" })[0].label, "Período: Até 23/09/2026");
  });

  await t.test("o termo buscado aparece escapado no chip", () => {
    // A busca é repetida na tela literalmente -- é o texto livre mais fácil de
    // esquecer que passa por um innerHTML.
    const html = texto(htmlChips(chipsFiltroAtualizacoes({ busca: MALICIOSO })));
    semInjecao(html);
    assert.match(html, /data-chip="busca"/);
  });
});

// ---------------------------------------------------------------- Consultar Cliente

test("Consultar Cliente - separar sistemas de um registro combinado", () => {
  assert.deepEqual(splitSistemas("B_Vendas, B_NFe e B_Importa"), ["B_Vendas", "B_NFe", "B_Importa"]);
  assert.deepEqual(splitSistemas("B_Vendas E B_NFe"), ["B_Vendas", "B_NFe"]);
  assert.deepEqual(splitSistemas(""), []);
  assert.deepEqual(splitSistemas(null), []);
  // "e" dentro de um nome não é separador: só " e " com espaço dos dois lados.
  assert.deepEqual(splitSistemas("Estoque"), ["Estoque"]);
});

test("Consultar Cliente - matriz de versões", async (t) => {
  const painel = {
    ativas: [
      { sistema: "B_Vendas", versao: "2026.09.01" },
      { sistema: "B_NFe", versao: "3.2" },
    ],
    agentes: [],
  };

  await t.test("junta sistemas do cadastro, do histórico e do agente, em ordem alfabética", () => {
    const linhas = montarMatrizVersoes(
      { nome: "Mercado X", cnpj: "12.345.678/0001-90", sistemas: ["B_Vendas"] },
      [{ sistema: "B_NFe, B_Importa", versao: "3.1", data: "10/09/2026" }],
      { ...painel, agentes: [{ cnpj: "12345678000190", ultimoSistema: "B_Ordem", ultimaVersao: "1.0", situacao: "ok" }] }
    );
    assert.deepEqual(linhas.map((l) => l.sistema), ["B_Importa", "B_NFe", "B_Ordem", "B_Vendas"]);
  });

  await t.test("sem agente: compara a última versão registrada com a publicada", () => {
    const linhas = montarMatrizVersoes(
      { nome: "Mercado X", sistemas: ["B_Vendas", "B_Ordem", "B_NFe"] },
      [
        { sistema: "B_NFe", versao: "3.2", data: "20/09/2026" },
        { sistema: "B_Vendas", versao: "2026.08.01", data: "01/08/2026" },
      ],
      painel
    );
    const por = Object.fromEntries(linhas.map((l) => [l.sistema, l]));
    assert.equal(por.B_NFe.estadoLabel, "Atualizado");
    assert.equal(por.B_Vendas.estadoLabel, "Atrasado");
    assert.equal(por.B_Ordem.estadoLabel, "Sem publicação", "nada publicado não é 'atrasado'");
    assert.equal(por.B_NFe.contatoTexto, "20/09/2026");
  });

  await t.test("publicada mas nunca registrada: 'Não instalado'", () => {
    const [linha] = montarMatrizVersoes({ nome: "Y", sistemas: ["B_Vendas"] }, [], painel);
    assert.equal(linha.estadoLabel, "Não instalado");
    assert.equal(linha.instalada, null);
  });

  await t.test("o histórico vem do mais novo para o mais velho: vale o primeiro que cita o sistema", () => {
    const linha = montarMatrizVersoes(
      { nome: "Y", sistemas: ["B_Vendas"] },
      [
        {
          sistema: "B_Vendas, B_NFe",
          versao: "B_Vendas: 2026.09.01; B_NFe: 2026.09.01",
          versoes_sistemas: JSON.stringify({ B_Vendas: "2026.09.01", B_NFe: "2026.09.01" }),
          data: "15/09/2026",
        },
        { sistema: "B_Vendas", versao: "2026.01.01", data: "01/01/2026" },
      ],
      painel
    ).find((l) => l.sistema === "B_Vendas");
    assert.equal(linha.instalada, "2026.09.01");
    assert.equal(linha.estadoLabel, "Atualizado");
  });

  await t.test("registro com vários sistemas e SEM versoes_sistemas (legado): versão ambígua, não instalada", () => {
    const linha = montarMatrizVersoes(
      { nome: "Y", sistemas: ["B_Vendas"] },
      [{ sistema: "B_Vendas, B_NFe", versao: "2026.09.01", data: "15/09/2026" }],
      painel
    ).find((l) => l.sistema === "B_Vendas");
    assert.equal(linha.instalada, null, "não dá pra saber qual dos dois sistemas era essa versão");
    assert.equal(linha.estadoLabel, "Não instalado");
  });

  await t.test("com agente: a versão e o estado vêm dele, não do registro manual", () => {
    const [linha] = montarMatrizVersoes(
      { nome: "Mercado X", cnpj: "12.345.678/0001-90", sistemas: ["B_Vendas"] },
      [{ sistema: "B_Vendas", versao: "2026.09.01", data: "15/09/2026" }],
      { ...painel, agentes: [{ cnpj: "12345678000190", ultimoSistema: "B_Vendas", ultimaVersao: "2026.08.01", situacao: "erro" }] }
    );
    assert.equal(linha.instalada, "2026.08.01");
    assert.equal(linha.estadoLabel, "Erro");
    assert.equal(linha.estadoBadge, "badge--danger");
  });

  await t.test("situações do agente viram rótulos legíveis", () => {
    const rotulo = (situacao) =>
      montarMatrizVersoes({ nome: "Z", sistemas: [] }, [], {
        ativas: [],
        agentes: [{ empresa: "Z", ultimoSistema: "B_Vendas", situacao }],
      })[0].estadoLabel;
    assert.equal(rotulo("aguardando_autorizacao"), "Aguardando");
    assert.equal(rotulo("aguardando_autorizacao_demorada"), "Aguardando");
    assert.equal(rotulo("pausado"), "Pausado");
    assert.equal(rotulo("offline"), "Sem contato");
    assert.equal(rotulo(""), "Desconhecido");
  });

  await t.test("cliente SEM CNPJ não herda agente de outro cliente sem CNPJ", () => {
    // "" == "" casaria qualquer agente sem dígitos no identificador.
    const linhas = montarMatrizVersoes(
      { nome: "Sem Cnpj Ltda", sistemas: [] },
      [],
      { ativas: [], agentes: [{ cnpj: "C015823", empresa: "Outra Empresa", ultimoSistema: "B_Vendas", situacao: "ok" }] }
    );
    assert.deepEqual(linhas, []);
  });

  await t.test("casa o agente pelo nome da empresa, sem diferenciar maiúsculas", () => {
    const [linha] = montarMatrizVersoes(
      { nome: "  Mercado X ", sistemas: [] },
      [],
      { ativas: [], agentes: [{ empresa: "MERCADO X", ultimoSistema: "b_vendas", ultimaVersao: "1", situacao: "ok" }] }
    );
    assert.equal(linha.sistema, "b_vendas");
    assert.equal(linha.estadoLabel, "Atualizado");
  });

  await t.test("cliente sem sistema nenhum: matriz vazia (a tela mostra o aviso)", () => {
    assert.deepEqual(montarMatrizVersoes({ nome: "Novo" }, null, null), []);
  });
});

test("Consultar Cliente - marcação", async (t) => {
  await t.test("linha da matriz: '—' e 'Nenhuma' quando falta versão", () => {
    const html = texto(
      linhaMatrizVersoes({
        sistema: "B_Vendas", instalada: null, publicada: null,
        estadoLabel: "Sem publicação", estadoBadge: "badge--muted", contatoTexto: "—", contatoTitle: "",
      })
    );
    assert.match(html, /data-label="Instalada"[^>]*>\s*—\s*</);
    assert.match(html, /text-muted">Nenhuma</);
    assert.doesNotMatch(html, /version-chip/);
  });

  await t.test("versão e máquina reportadas pelo agente saem escapadas", () => {
    const html = texto(
      linhaMatrizVersoes({
        sistema: "B_Vendas", instalada: MALICIOSO, publicada: "1.0",
        estadoLabel: "Atualizado", estadoBadge: "badge--success", contatoTexto: `há 2 h (${MALICIOSO})`, contatoTitle: MALICIOSO,
      })
    );
    semInjecao(html);
    assert.equal(atributo(html, "title"), MALICIOSO);
  });

  await t.test("cartão de acesso remoto escapa o que foi digitado no cadastro", () => {
    const html = texto(cartaoAcesso({ maquina: MALICIOSO, anydesk: "123 456 789", suporte_bredas: "" }));
    semInjecao(html);
    assert.match(html, /<strong>123 456 789<\/strong>/);
    assert.match(html, /Suporte Bredas<\/span><strong>—</, "vazio vira travessão, não some");
  });

  await t.test("cartão de acesso aceita o campo em camelCase também", () => {
    assert.match(texto(cartaoAcesso({ maquina: "PC1", suporteBredas: "B-42" })), /<strong>B-42<\/strong>/);
  });
});

// ---------------------------------------------------------------- Resumo

test("Resumo - tendência do mês", async (t) => {
  const serie = (anterior, atual) => [
    { mes: "2026-08", total: anterior },
    { mes: "2026-09", total: atual },
  ];

  await t.test("alta, baixa e estável contra o mês anterior", () => {
    assert.deepEqual(tendenciaMensal(serie(10, 15), AGORA), { pct: 50, tendencia: "alta" });
    assert.deepEqual(tendenciaMensal(serie(10, 5), AGORA), { pct: -50, tendencia: "baixa" });
    assert.deepEqual(tendenciaMensal(serie(10, 10), AGORA), { pct: 0, tendencia: "neutra" });
  });

  await t.test("mês anterior zerado: nada a mostrar (null), não '0%' nem 'Infinity%'", () => {
    assert.equal(tendenciaMensal(serie(0, 12), AGORA), null);
    assert.equal(tendenciaMensal([], AGORA), null);
  });

  await t.test("mês atual sem linha na série conta como zero", () => {
    assert.deepEqual(tendenciaMensal([{ mes: "2026-08", total: 4 }], AGORA), { pct: -100, tendencia: "baixa" });
  });

  await t.test("em janeiro, o anterior é dezembro do ano passado", () => {
    const janeiro = new Date(2027, 0, 10);
    assert.deepEqual(
      tendenciaMensal([{ mes: "2026-12", total: 4 }, { mes: "2027-01", total: 6 }], janeiro),
      { pct: 50, tendencia: "alta" }
    );
  });
});

test("Resumo - datas e indicadores", async (t) => {
  await t.test("formatarMes e primeiroDiaDoMes", () => {
    assert.equal(formatarMes("2026-09"), "set/2026");
    assert.equal(formatarMes("2026-01"), "jan/2026");
    assert.equal(primeiroDiaDoMes(AGORA), "01/09/2026");
  });

  await t.test("indicador é um <button> com o destino por escrito", () => {
    const html = texto(statTile("mes", "calendario", "Atualizações Este Mês", "Ver o mês"));
    assert.match(html, /^\s*<button type="button" class="card stat-tile" data-stat="mes"/);
    assert.match(html, /Ver o mês <svg/);
  });

  await t.test("seta só quando há variação", () => {
    assert.equal(texto(deltaTendencia({ pct: 0, tendencia: "neutra" })), "0%");
    assert.match(texto(deltaTendencia({ pct: -12, tendencia: "baixa" })), /^<svg[\s\S]*<\/svg>12%$/);
  });
});

// ---------------------------------------------------------------- Sino de notificações

test("Notificações - itens do sino", async (t) => {
  const aviso = {
    chave: "agentes-erro",
    tom: "erro",
    icone: "alerta",
    titulo: "2 agentes com erro",
    detalhe: "Mercado X, Padaria Y",
    quantidade: 2,
    destino: "distribuicao",
    params: { situacao: "erro", busca: 'com "aspas"' },
  };

  await t.test("o filtro em data-params volta inteiro, mesmo sendo JSON cheio de aspas", () => {
    // Com o escape errado, o atributo fechava no primeiro `"` e o clique levava
    // para a tela SEM filtro -- sem erro nenhum.
    const html = texto(itemNotificacao(aviso));
    assert.deepEqual(JSON.parse(atributo(html, "data-params")), aviso.params);
    assert.equal(atributo(html, "data-destino"), "distribuicao");
  });

  await t.test("sem params, sem atributo; sem detalhe, sem <span> vazio", () => {
    const html = texto(itemNotificacao({ ...aviso, params: null, detalhe: "" }));
    assert.doesNotMatch(html, /data-params/);
    assert.doesNotMatch(html, /<span><\/span>/);
  });

  await t.test("nome de cliente no título ou no detalhe não vira HTML", () => {
    semInjecao(texto(itemNotificacao({ ...aviso, titulo: MALICIOSO, detalhe: MALICIOSO })));
  });

  await t.test("lista vazia diz 'nada pendente' em vez de abrir um menu vazio", () => {
    assert.match(texto(listaNotificacoes([])), /Nada pendente agora/);
    assert.equal(texto(listaNotificacoes([aviso, aviso])).match(/<button/g).length, 2);
  });
});

// ---------------------------------------------------------------- Administração

test("Administração - o que mudou num formulário de regras", async (t) => {
  const definicoes = {
    desatualizadoDias: { tipo: "inteiro" },
    discordWebhookUrl: { tipo: "url" },
    atualizadorHabilitado: { tipo: "booleano" },
  };
  const salvas = { desatualizadoDias: 60, discordWebhookUrl: "", atualizadorHabilitado: false };
  const nomes = Object.keys(definicoes);

  await t.test("nada mexido: nada a salvar (o botão fica apagado)", () => {
    // O <input type=number> devolve "60" -- texto. Sem normalizar, TODO
    // formulário aberto pareceria alterado.
    assert.deepEqual(alteracoesRegras(salvas, { desatualizadoDias: "60", discordWebhookUrl: "  ", atualizadorHabilitado: false }, definicoes, nomes), {});
  });

  await t.test("só o que mudou vai para o servidor, já no tipo certo", () => {
    assert.deepEqual(
      alteracoesRegras(salvas, { desatualizadoDias: "45", discordWebhookUrl: "", atualizadorHabilitado: true }, definicoes, nomes),
      { desatualizadoDias: 45, atualizadorHabilitado: true }
    );
  });

  await t.test("número inválido vai como texto, para o servidor recusar com a mensagem da regra", () => {
    assert.deepEqual(alteracoesRegras(salvas, { desatualizadoDias: "" }, definicoes, ["desatualizadoDias"]), { desatualizadoDias: "" });
    assert.deepEqual(alteracoesRegras(salvas, { desatualizadoDias: "4x" }, definicoes, ["desatualizadoDias"]), { desatualizadoDias: "4x" });
  });

  await t.test("regras fora da lista do formulário são ignoradas", () => {
    assert.deepEqual(alteracoesRegras(salvas, { desatualizadoDias: "10", atualizadorHabilitado: true }, definicoes, ["atualizadorHabilitado"]), {
      atualizadorHabilitado: true,
    });
  });
});

test("Administração - textos e formatos", async (t) => {
  await t.test("chave dos agentes: três situações, nunca o valor", () => {
    assert.deepEqual(descreverChaveAgentes({ situacao: "configurada", final: "9f3c" }), { texto: "Configurada, terminando em …9f3c", tom: "ok" });
    assert.equal(descreverChaveAgentes({ situacao: "exemplo" }).tom, "perigo");
    assert.equal(descreverChaveAgentes({ situacao: "ausente" }).tom, "alerta");
    assert.equal(descreverChaveAgentes(null).tom, "alerta");
  });

  await t.test("tempo no ar", () => {
    assert.equal(formatarTempoAtivo(30), "menos de 1m");
    assert.equal(formatarTempoAtivo(125 * 60), "2h 5m");
    assert.equal(formatarTempoAtivo(3 * 86400 + 60), "3d 0h 1m");
    assert.equal(formatarTempoAtivo(NaN), "menos de 1m");
  });

  await t.test("conta antiga com papel 'user' é operador", () => {
    assert.equal(papelNormalizado("user"), "operador");
    assert.equal(papelNormalizado(undefined), "operador");
    assert.equal(papelNormalizado("admin"), "admin");
  });
});

test("Administração - linha de usuário", async (t) => {
  const outro = { id: 2, nome: "Bia", usuario: "bia", role: "consulta", ultimo_login: null };

  await t.test("a própria conta: papel só como selo, sem remover", () => {
    const html = texto(linhaUsuario({ ...outro, id: 1, role: "admin" }, { ehVoce: true }));
    assert.match(html, /\(você\)/);
    assert.doesNotMatch(html, /<select|data-action="remover"/);
  });

  await t.test("outra conta: papel atual já selecionado, e o botão de remover", () => {
    const html = texto(linhaUsuario(outro, { ehVoce: false }));
    assert.match(html, /<option value="consulta" selected>/);
    assert.doesNotMatch(html, /<option value="admin" selected>/);
    assert.match(html, /data-action="remover" data-id="2"/);
    assert.match(html, /Nunca entrou/);
  });

  await t.test("último acesso começa com maiúscula sem perder a data completa", () => {
    const recente = texto(linhaUsuario({ ...outro, ultimo_login: new Date(Date.now() - 3 * 86400000).toISOString() }, { ehVoce: false }));
    assert.match(recente, /<span title="[^"]+">Há 3 dias<\/span>/);
  });

  await t.test("conta legada 'user' aparece como Operador selecionado", () => {
    assert.match(texto(linhaUsuario({ ...outro, role: "user" }, { ehVoce: false })), /<option value="operador" selected>/);
  });

  await t.test("nome e usuário digitados não viram HTML", () => {
    semInjecao(texto(linhaUsuario({ ...outro, nome: MALICIOSO, usuario: MALICIOSO }, { ehVoce: false })));
  });
});

test("Administração - linha de backup", async (t) => {
  await t.test("cópia corrompida: selo e restauração bloqueada", () => {
    const html = texto(linhaBackup({ arquivo: "gestao_1.db", label: "22/09 09:16", integro: false }));
    assert.match(html, />Corrompida</);
    assert.match(html, /data-action="restaurar"[^>]*disabled/);
  });

  await t.test("cópia íntegra pode ser restaurada; o nome do arquivo vai codificado na URL", () => {
    const html = texto(linhaBackup({ arquivo: "gestao antes&depois.db", label: "x", tamanhoBytes: 2048, integro: true }));
    assert.doesNotMatch(html, /disabled/);
    assert.match(html, /\/api\/backups\/gestao%20antes%26depois\.db\/download/);
  });
});

test("Administração - saúde do servidor", async (t) => {
  const dados = {
    statusGeral: "saudavel",
    banco: { integridade: "ok", caminho: "gestao.db", tamanhoBytes: 4096, journalMode: "wal" },
    servidor: { versao: "2.1.0", node: "v22", plataforma: "win32", uptimeSegundos: 3600, memoriaHeapUsadaMB: 18, memoriaHeapTotalMB: 21 },
    backups: { total: 0, ultimo: null },
    pacotes: { total: 0, tamanhoBytes: 0 },
    agentes: { total: 0, ok: 0, offline: 0, erro: 2 },
  };

  await t.test("com o Atualizador desligado, diz isso -- e não '0 agentes, sem incidentes'", () => {
    const html = texto(blocosSaude(dados, { atualizadorHabilitado: false }));
    assert.match(html, /badge--muted">Desligado</);
    assert.doesNotMatch(html, /Sem incidentes|com erro/);
  });

  await t.test("ligado, os erros de agente aparecem no selo", () => {
    assert.match(texto(blocosSaude(dados, { atualizadorHabilitado: true })), /2 com erro/);
  });

  await t.test("sem backup nenhum é aviso, não neutro", () => {
    assert.match(texto(blocosSaude(dados, { atualizadorHabilitado: false })), /badge--warning">Nenhuma cópia/);
  });
});

test("Administração - linha de regra numérica", () => {
  const html = texto(linhaRegraNumero({ nome: "desatualizadoDias", titulo: "T", ajuda: "A", unidade: "dias", valor: 60, min: 7, max: 730 }));
  assert.match(html, /data-regra="desatualizadoDias" value="60"\s+min="7" max="730"/);
  assert.match(html, /for="regra-desatualizadoDias"/);
});

// ---------------------------------------------------------------- Configurações

test("Configurações - cabeçalho de seção e título de cartão", async (t) => {
  await t.test("sem ações, não sobra uma div vazia no cabeçalho", () => {
    assert.doesNotMatch(texto(cabecalhoSecao({ titulo: "T", descricao: "D" })), /secao-head__acoes/);
    assert.doesNotMatch(texto(tituloCartao({ titulo: "T" })), /<p>|secao-card__acoes/);
  });

  await t.test("título e descrição são escapados", () => {
    semInjecao(texto(tituloCartao({ titulo: MALICIOSO, descricao: MALICIOSO })));
  });
});

test("Configurações - aparelho de cada sessão", async (t) => {
  const casos = [
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", "Chrome no Windows", false],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0", "Edge no Windows", false],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0", "Firefox no Linux", false],
    ["Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36", "Chrome no Android", true],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", "Safari no iOS", true],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", "Safari no macOS", false],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/113.0.0.0", "Opera no Windows", false],
  ];
  for (const [agente, rotulo, movel] of casos) {
    await t.test(rotulo, () => {
      const d = descreverAparelho(agente);
      // O mais específico vem antes: Edge e Opera também dizem "Chrome", o
      // Chrome também diz "Safari", o Android também diz "Linux" e o iPhone
      // também diz "Mac OS X".
      assert.equal(d.rotulo, rotulo);
      assert.equal(d.movel, movel);
    });
  }

  await t.test("sem User-Agent (sessão aberta antes desta versão)", () => {
    assert.equal(descreverAparelho("").rotulo, "Aparelho não identificado");
    assert.equal(descreverAparelho(undefined).rotulo, "Aparelho não identificado");
  });
});

test("Configurações - sessões abertas", async (t) => {
  const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36";
  const atual = { id: "aaaa", atual: true, agente: chrome, desde: AGORA.toISOString(), ultimoUso: AGORA.toISOString() };
  const outra = { id: "bbbb", atual: false, agente: "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Firefox/130.0", desde: AGORA.toISOString(), ultimoUso: AGORA.toISOString() };

  await t.test("a sessão atual tem o selo e NÃO tem botão de encerrar", () => {
    const html = texto(linhaSessao(atual));
    assert.match(html, /Este aparelho/);
    assert.doesNotMatch(html, /encerrar-sessao/);
  });

  await t.test("as outras têm o botão, apontando para o id público", () => {
    assert.equal(atributo(texto(linhaSessao(outra)), "data-id"), "bbbb");
  });

  await t.test("sessão sem dados do aparelho diz de onde veio, em vez de ficar em branco", () => {
    const html = texto(linhaSessao({ id: "c", atual: false, agente: "", desde: null, ultimoUso: null }));
    assert.match(html, /Aparelho não identificado/);
    assert.match(html, /antes desta versão/);
  });

  await t.test("o resumo diz se está tudo certo ou quantos aparelhos a mais", () => {
    assert.match(texto(listaSessoes([atual])), /só está aberta neste aparelho/);
    assert.match(texto(listaSessoes([atual, outra])), /em outro aparelho/);
    assert.match(texto(listaSessoes([atual, outra, { ...outra, id: "z" }])), /em 2 outros aparelhos/);
  });

  await t.test("um User-Agent forjado não vira HTML", () => {
    semInjecao(texto(linhaSessao({ ...outra, agente: MALICIOSO })));
  });
});

test("Configurações - perfil da conta", async (t) => {
  const perfil = { id: 1, nome: "Bianca Ferreira", usuario: "bia", role: "consulta", criado_em: "2026-03-10T12:00:00.000Z" };

  await t.test("mostra papel, o que ele pode e desde quando", () => {
    const html = texto(cartaoPerfil(perfil));
    assert.match(html, />Consulta</);
    assert.ok(html.includes(descricaoPapel("consulta")));
    assert.match(html, /10\/03\/2026/);
    assert.match(html, />BF</);
  });

  await t.test("o campo nasce com o nome atual e o Salvar desligado", () => {
    const html = texto(cartaoPerfil(perfil));
    assert.equal(atributo(html, "value"), "Bianca Ferreira");
    assert.match(html, /data-action="salvar-nome" disabled/);
  });

  await t.test("antes de a resposta chegar, sem data, mostra travessão", () => {
    assert.match(texto(cartaoPerfil({ ...perfil, criado_em: null })), /Membro desde<\/dt><dd>—/);
  });

  await t.test("um nome malicioso não vira HTML, nem no texto nem no value", () => {
    const html = texto(cartaoPerfil({ ...perfil, nome: MALICIOSO }));
    semInjecao(html);
    assert.equal(atributo(html, "value"), MALICIOSO);
  });

  await t.test("todo papel tem uma frase (e conta legada cai em Operador)", () => {
    for (const papel of ["admin", "operador", "consulta"]) assert.ok(descricaoPapel(papel).length > 10);
    assert.equal(descricaoPapel("user"), descricaoPapel("operador"));
  });
});

test("Configurações - prévia, atalhos e busca", async (t) => {
  await t.test("a prévia usa as classes da tabela de verdade (é o que faz a densidade valer nela)", () => {
    const html = texto(previaTabela());
    assert.match(html, /class="table-wrap/);
    assert.match(html, /class="data-table"/);
    assert.ok((html.match(/<tr>/g) || []).length >= 5);
  });

  await t.test("atalho com '+' vira uma tecla por <kbd>", () => {
    const html = texto(listaAtalhos([["Ctrl + K", "Abrir a paleta", "Global"]]));
    assert.match(html, /<kbd>Ctrl<\/kbd>/);
    assert.match(html, /<span>\+<\/span><kbd>K<\/kbd>/);
  });

  await t.test("resultado leva à aba e ao ajuste certos", () => {
    const html = texto(resultadosBusca([{ aba: "tabelas", id: "densidade", titulo: "Densidade", ajuda: "a", caminho: "Tabelas › Linhas", icone: "tabela" }], "dens"));
    assert.equal(atributo(html, "data-aba"), "tabelas");
    assert.equal(atributo(html, "data-ajuste"), "densidade");
    assert.match(html, /1 ajuste encontrado/);
  });

  await t.test("sem resultado, sugere palavras -- e o termo digitado é escapado", () => {
    const html = texto(resultadosBusca([], MALICIOSO));
    assert.match(html, /Nenhum ajuste/);
    semInjecao(html);
  });
});
