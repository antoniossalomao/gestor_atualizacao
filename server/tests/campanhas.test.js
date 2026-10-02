/*
 * Campanhas de atualização (services/CampanhaService.js).
 *
 * Tudo aqui erra em silêncio: uma campanha que conta errado não quebra tela
 * nenhuma, só diz à equipe que terminou quando não terminou. Os casos são
 * os que a regra precisa segurar -- baixa automática pela atualização, meta
 * que não anda quando a oficial muda, "já agendado" só com tarefa do mesmo
 * sistema, sistemas fixos recusados, placar congelado no encerramento -- e
 * as permissões das rotas.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { BancoDeDados } = require("../src/database/BancoDeDados");
const { Servidor } = require("../src/Servidor");
const { HistoricoService } = require("../src/services/HistoricoService");
const { AtualizacaoService } = require("../src/services/AtualizacaoService");
const { AgendamentoService } = require("../src/services/AgendamentoService");
const { CampanhaService } = require("../src/services/CampanhaService");

const USUARIO = { id: 1, nome: "Teste" };

function ambiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-campanhas-"));
  const db = new BancoDeDados(path.join(tmpDir, "gestao.db"));
  const historico = new HistoricoService(db);
  const atualizacoes = new AtualizacaoService(db, historico, { avisarAtualizacao: async () => {} });
  const agenda = new AgendamentoService(db, historico);
  const campanhas = new CampanhaService(db, historico);
  const id = (nome) => db.sistemas.resolver(nome).id;
  const cliente = (nome, sistemas) => db.clientes.insert("", nome, "Marília", sistemas.map(id), "");
  const atender = (nome, sistema, data) => atualizacoes.create({ cliente: nome, sistema, data }, USUARIO);
  const situacao = (campanhaId, nome) => campanhas.detalhe(campanhaId).clientes.find((c) => c.nome === nome)?.situacao;
  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, atualizacoes, agenda, campanhas, cliente, atender, situacao, cleanup };
}

test("Campanhas - cidade limita público e placar", async () => {
  const env = ambiente();
  try {
    env.cliente("Loja Marília", ["B_NFe"]);
    env.db.clientes.insert("", "Loja Bauru", "Bauru", [env.db.sistemas.resolver("B_NFe").id], "");
    const campanha = env.campanhas.create({ titulo: "Local", sistema: "B_NFe", versaoAlvo: "25/09/2026", cidade: "marília" }, USUARIO);
    assert.equal(campanha.cidade, "Marília");
    assert.deepEqual(campanha.clientes.map((c) => c.nome), ["Loja Marília"]);
    assert.equal(env.campanhas.list()[0].totalClientes, 1);
    const editada = env.campanhas.update(campanha.id, { titulo: "Local", cidade: "Bauru" }, USUARIO);
    assert.deepEqual(editada.clientes.map((c) => c.nome), ["Loja Bauru"]);
    assert.throws(() => env.campanhas.create({ titulo: "Inválida", sistema: "B_NFe", versaoAlvo: "25/09/2026", cidade: "Inexistente" }, USUARIO), /cidade cadastrada/);
  } finally {
    env.cleanup();
  }
});

test("Campanhas - só para clientes escolhidos", async (t) => {
  const env = ambiente();
  try {
    const nfe = env.db.sistemas.resolver("B_NFe").id;
    const [a, b, c] = ["Loja A", "Loja B", "Loja C"].map((nome) => Number(env.cliente(nome, ["B_NFe"])));
    const semNfe = Number(env.cliente("Sem NFe", ["B_Vendas"]));
    const base = { titulo: "Piloto", sistema: "B_NFe", versaoAlvo: "25/09/2026" };

    await t.test("só os escolhidos entram, e a cidade é ignorada", () => {
      const campanha = env.campanhas.create({ ...base, publico: "escolhidos", clientes: [a, c], cidade: "Marília" }, USUARIO);
      assert.equal(campanha.publico, "escolhidos");
      assert.equal(campanha.cidade, "", "a lista é o filtro: a cidade não soma com ela");
      assert.deepEqual(campanha.clientes.map((x) => x.nome), ["Loja A", "Loja C"]);
      assert.equal(campanha.totalClientes, 2);
      assert.equal(env.campanhas.list()[0].totalClientes, 2, "a lista de campanhas conta igual ao detalhe");
    });

    await t.test("baixa automática vale para o escolhido; quem ficou de fora não conta", () => {
      const campanha = env.campanhas.list()[0];
      env.atender("Loja A", "B_NFe", "26/09/2026");
      env.atender("Loja B", "B_NFe", "26/09/2026");
      const d = env.campanhas.detalhe(campanha.id);
      assert.equal(env.situacao(campanha.id, "Loja A"), "concluido");
      assert.equal(env.situacao(campanha.id, "Loja B"), undefined);
      assert.deepEqual([d.totalClientes, d.atendidos, d.pendentes, d.percentual], [2, 1, 1, 50]);
    });

    await t.test("exigir pelo menos um cliente, e só de quem usa o sistema", () => {
      assert.throws(() => env.campanhas.create({ ...base, publico: "escolhidos", clientes: [] }, USUARIO), /pelo menos um cliente/);
      assert.throws(() => env.campanhas.create({ ...base, publico: "escolhidos" }, USUARIO), /pelo menos um cliente/);
      assert.throws(() => env.campanhas.create({ ...base, publico: "escolhidos", clientes: [a, semNfe] }, USUARIO), /não usa o sistema "B_NFe"/);
      assert.throws(() => env.campanhas.create({ ...base, publico: "escolhidos", clientes: [a, 99999] }, USUARIO), /não usa o sistema/);
      assert.throws(() => env.campanhas.create({ ...base, publico: "escolhidos", clientes: ["x"] }, USUARIO), /não usa o sistema/);
      assert.throws(() => env.campanhas.create({ ...base, publico: "qualquer" }, USUARIO), /Público/);
    });

    await t.test("repetidos entram uma vez só", () => {
      const campanha = env.campanhas.create({ ...base, titulo: "Repetidos", publico: "escolhidos", clientes: [a, a, String(a)] }, USUARIO);
      assert.equal(campanha.totalClientes, 1);
    });

    await t.test("editar sem mandar o público mantém quem estava; editar a lista troca", () => {
      const campanha = env.campanhas.create({ ...base, titulo: "Edição", publico: "escolhidos", clientes: [a] }, USUARIO);
      const titulo = env.campanhas.update(campanha.id, { titulo: "Edição 2" }, USUARIO);
      assert.deepEqual(titulo.clientes.map((x) => x.nome), ["Loja A"]);
      const trocada = env.campanhas.update(campanha.id, { titulo: "Edição 2", publico: "escolhidos", clientes: [b, c] }, USUARIO);
      assert.deepEqual(trocada.clientes.map((x) => x.nome), ["Loja B", "Loja C"]);
      assert.throws(() => env.campanhas.update(campanha.id, { titulo: "x", publico: "escolhidos", clientes: [] }, USUARIO), /pelo menos um cliente/);
    });

    await t.test("voltar para 'todos' solta a lista, e a campanha passa a valer para o sistema inteiro", () => {
      const campanha = env.campanhas.create({ ...base, titulo: "Volta", publico: "escolhidos", clientes: [a] }, USUARIO);
      const todos = env.campanhas.update(campanha.id, { titulo: "Volta", publico: "todos" }, USUARIO);
      assert.equal(todos.publico, "todos");
      assert.equal(todos.totalClientes, 3);
      assert.deepEqual(env.db.campanhas.idsClientes(campanha.id), []);
    });

    await t.test("escolhido que perdeu o sistema sai da lista e não derruba a edição", () => {
      const campanha = env.campanhas.create({ ...base, titulo: "Perdeu", publico: "escolhidos", clientes: [b, c] }, USUARIO);
      env.db.conn.prepare("DELETE FROM cliente_sistemas WHERE cliente_id = ? AND sistema_id = ?").run(c, nfe);
      assert.deepEqual(env.campanhas.detalhe(campanha.id).clientes.map((x) => x.nome), ["Loja B"]);
      const editada = env.campanhas.update(campanha.id, { titulo: "Perdeu 2" }, USUARIO);
      assert.deepEqual(editada.clientes.map((x) => x.nome), ["Loja B"]);
    });

    await t.test("escolhidos todos excluídos: a campanha fica vazia, não vira 'todos'", () => {
      const campanha = env.campanhas.create({ ...base, titulo: "Esvaziada", publico: "escolhidos", clientes: [b] }, USUARIO);
      env.db.conn.prepare("DELETE FROM clientes WHERE id = ?").run(b);
      const d = env.campanhas.detalhe(campanha.id);
      assert.equal(d.publico, "escolhidos");
      assert.equal(d.totalClientes, 0);
      assert.equal(d.percentual, null);
    });

    await t.test("excluir a campanha leva só as ligações, não os clientes", () => {
      const campanha = env.campanhas.create({ ...base, titulo: "Some", publico: "escolhidos", clientes: [a] }, USUARIO);
      env.campanhas.remove(campanha.id, USUARIO);
      assert.equal(env.db.conn.prepare("SELECT COUNT(*) AS n FROM campanha_clientes WHERE campanha_id = ?").get(campanha.id).n, 0);
      assert.equal(env.db.conn.prepare("SELECT COUNT(*) AS n FROM clientes WHERE id = ?").get(a).n, 1);
    });

    await t.test("clientesDoSistema lista só quem tem o sistema, em ordem de nome", () => {
      const nomes = env.campanhas.clientesDoSistema("B_NFe").map((x) => x.nome);
      assert.ok(!nomes.includes("Sem NFe"));
      assert.deepEqual(nomes, [...nomes].sort((x, y) => x.localeCompare(y, "pt-BR")));
      assert.throws(() => env.campanhas.clientesDoSistema("Inexistente"), /catálogo/);
    });
  } finally {
    env.cleanup();
  }
});

test("Campanhas - acrescentar e retirar cliente direto no detalhe", async (t) => {
  const env = ambiente();
  try {
    const [a, b, c] = ["Loja A", "Loja B", "Loja C"].map((nome) => Number(env.cliente(nome, ["B_NFe"])));
    const semNfe = Number(env.cliente("Sem NFe", ["B_Vendas"]));
    const base = { titulo: "Lista viva", sistema: "B_NFe", versaoAlvo: "25/09/2026" };
    const escolhida = env.campanhas.create({ ...base, publico: "escolhidos", clientes: [a] }, USUARIO);
    const nomes = (id) => env.campanhas.detalhe(id).clientes.map((x) => x.nome);

    await t.test("acrescenta sem reenviar a lista, e repetido não duplica", () => {
      const depois = env.campanhas.adicionarClientes(escolhida.id, [b, a, b], USUARIO);
      assert.deepEqual(depois.clientes.map((x) => x.nome), ["Loja A", "Loja B"]);
      assert.equal(depois.totalClientes, 2);
      assert.equal(env.db.campanhas.idsClientes(escolhida.id).length, 2);
    });

    await t.test("só cliente que usa o sistema, e pelo menos um", () => {
      assert.throws(() => env.campanhas.adicionarClientes(escolhida.id, [semNfe], USUARIO), /não usa o sistema "B_NFe"/);
      assert.throws(() => env.campanhas.adicionarClientes(escolhida.id, [99999], USUARIO), /não usa o sistema/);
      assert.throws(() => env.campanhas.adicionarClientes(escolhida.id, [], USUARIO), /pelo menos um cliente/);
      assert.throws(() => env.campanhas.adicionarClientes(escolhida.id, undefined, USUARIO), /pelo menos um cliente/);
      assert.deepEqual(nomes(escolhida.id), ["Loja A", "Loja B"], "o pedido recusado não deixa nada pela metade");
    });

    await t.test("retira um cliente; a atualização dele continua no histórico", () => {
      env.atender("Loja B", "B_NFe", "26/09/2026");
      const antes = env.db.atualizacoes.count();
      const depois = env.campanhas.removerCliente(escolhida.id, b, USUARIO);
      assert.deepEqual(depois.clientes.map((x) => x.nome), ["Loja A"]);
      assert.equal(env.db.atualizacoes.count(), antes);
      assert.throws(() => env.campanhas.removerCliente(escolhida.id, b, USUARIO), /não está na campanha/);
    });

    await t.test("não deixa a campanha sem nenhum cliente", () => {
      assert.throws(() => env.campanhas.removerCliente(escolhida.id, a, USUARIO), /pelo menos um cliente/);
      assert.deepEqual(nomes(escolhida.id), ["Loja A"]);
    });

    await t.test("campanha de 'todos' não tem lista para mexer", () => {
      const todos = env.campanhas.create({ ...base, titulo: "Todos" }, USUARIO);
      assert.throws(() => env.campanhas.adicionarClientes(todos.id, [a], USUARIO), /todos os clientes do sistema/);
      assert.throws(() => env.campanhas.removerCliente(todos.id, a, USUARIO), /todos os clientes do sistema/);
    });

    await t.test("encerrada congela a lista; reabrir libera", () => {
      env.campanhas.encerrar(escolhida.id, USUARIO);
      assert.throws(() => env.campanhas.adicionarClientes(escolhida.id, [c], USUARIO), /Reabra a campanha/);
      assert.throws(() => env.campanhas.removerCliente(escolhida.id, a, USUARIO), /Reabra a campanha/);
      env.campanhas.reabrir(escolhida.id, USUARIO);
      assert.deepEqual(env.campanhas.adicionarClientes(escolhida.id, [c], USUARIO).clientes.map((x) => x.nome), ["Loja A", "Loja C"]);
    });

    await t.test("quem perdeu o sistema não conta como escolhido na hora de retirar", () => {
      env.db.conn.prepare("DELETE FROM cliente_sistemas WHERE cliente_id = ? AND sistema_id = ?").run(c, env.db.sistemas.resolver("B_NFe").id);
      assert.throws(() => env.campanhas.removerCliente(escolhida.id, c, USUARIO), /não está na campanha/);
      assert.throws(() => env.campanhas.removerCliente(escolhida.id, a, USUARIO), /pelo menos um cliente/, "Loja C saiu da lista: Loja A é a última");
    });
  } finally {
    env.cleanup();
  }
});

test("Campanhas - candidatos trazem grupo, regime e quem já cumpre a versão-alvo", async (t) => {
  const env = ambiente();
  try {
    const nfe = env.db.sistemas.resolver("B_NFe").id;
    env.db.clientes.insert("10", "Loja Rede", "Marília", [nfe], "Rede Sul", "Simples Nacional");
    env.db.clientes.insert("11", "Loja Solta", "Bauru", [nfe], "", "Lucro Presumido");
    env.atender("Loja Rede", "B_NFe", "26/09/2026");

    await t.test("com a versão-alvo, cada candidato diz se já cumpre", () => {
      const lista = env.campanhas.clientesDoSistema("B_NFe", "25/09/2026");
      const rede = lista.find((x) => x.nome === "Loja Rede");
      assert.deepEqual([rede.grupo, rede.regime, rede.cidade, rede.codigo], ["Rede Sul", "Simples Nacional", "Marília", "10"]);
      assert.equal(rede.atendido, true);
      assert.equal(lista.find((x) => x.nome === "Loja Solta").atendido, false);
    });

    await t.test("atualização anterior à meta não cumpre", () => {
      assert.equal(env.campanhas.clientesDoSistema("B_NFe", "28/09/2026").find((x) => x.nome === "Loja Rede").atendido, false);
    });

    await t.test("sem versão-alvo válida não há como dizer: null, e não 'pendente'", () => {
      for (const alvo of [undefined, "", "31/02/2026", "texto"]) {
        assert.ok(env.campanhas.clientesDoSistema("B_NFe", alvo).every((x) => x.atendido === null), String(alvo));
      }
    });
  } finally {
    env.cleanup();
  }
});

test("Campanhas - meta, baixa automática e placar", async (t) => {
  const env = ambiente();
  try {
    env.db.sistemas.salvarVersao("B_NFe", "20/09/2026");
    env.cliente("Loja Atendida", ["B_NFe"]);
    env.cliente("Loja Antiga", ["B_NFe"]);
    env.cliente("Loja Agendada", ["B_NFe"]);
    env.cliente("Loja Outro Sistema Agendado", ["B_NFe", "B_Vendas"]);
    env.cliente("Sem NFe", ["B_Vendas"]);
    env.atender("Loja Antiga", "B_NFe", "21/09/2026"); // antes da data da meta

    const campanha = env.campanhas.create({ titulo: "NT 2026.001", sistema: "nfe", versaoAlvo: "25/09/2026", prazo: "30/09/2026" }, USUARIO);

    await t.test("só entram os clientes que têm o sistema no cadastro", () => {
      assert.equal(campanha.sistema, "B_NFe", "o nome digitado é resolvido no catálogo");
      assert.deepEqual(campanha.clientes.map((c) => c.nome).sort(), ["Loja Agendada", "Loja Antiga", "Loja Atendida", "Loja Outro Sistema Agendado"]);
      assert.equal(campanha.totalClientes, 4);
      assert.equal(campanha.pendentes, 4);
      assert.equal(campanha.percentual, 0);
    });

    await t.test("atualização anterior à versão-alvo não conclui", () => {
      assert.equal(env.situacao(campanha.id, "Loja Antiga"), "pendente");
    });

    await t.test("registrar a atualização na data da meta ou depois dá baixa sozinho", () => {
      env.db.sistemas.salvarVersao("B_NFe", "25/09/2026");
      env.atender("Loja Atendida", "B_NFe", "26/09/2026");
      assert.equal(env.situacao(campanha.id, "Loja Atendida"), "concluido");
      const linha = env.campanhas.detalhe(campanha.id).clientes.find((c) => c.nome === "Loja Atendida");
      assert.equal(linha.versaoRecebida, "25/09/2026");
    });

    await t.test("tarefa em aberto do MESMO sistema vira 'já agendado'; de outro sistema, não", () => {
      env.agenda.create({ tarefa: "Atualizar", cliente: "Loja Agendada", sistema: "B_NFe", data: "29/09/2026" }, USUARIO);
      env.agenda.create({ tarefa: "Instalar", cliente: "Loja Outro Sistema Agendado", sistema: "B_Vendas" }, USUARIO);
      assert.equal(env.situacao(campanha.id, "Loja Agendada"), "agendado");
      assert.equal(env.situacao(campanha.id, "Loja Outro Sistema Agendado"), "pendente");
      const d = env.campanhas.detalhe(campanha.id);
      assert.equal(d.clientes.find((c) => c.nome === "Loja Agendada").agendamento.data, "29/09/2026");
      assert.deepEqual([d.atendidos, d.agendados, d.pendentes], [1, 1, 2]);
      assert.equal(d.atendidos + d.agendados + d.pendentes, d.totalClientes, "os grupos somam o total");
      assert.equal(d.percentual, 25);
    });

    await t.test("tarefa 'Sem resposta' não conta como agendada: o cliente continua pendente", () => {
      const { id } = env.db.conn.prepare("SELECT id FROM agendamentos WHERE cliente = 'Loja Agendada'").get();
      const tarefa = env.db.agendamentos.find(id);
      env.agenda.update(id, { ...tarefa, status: "Sem resposta" }, USUARIO);
      assert.equal(env.situacao(campanha.id, "Loja Agendada"), "pendente");
      env.agenda.update(id, { ...env.db.agendamentos.find(id), status: "A Fazer" }, USUARIO);
      assert.equal(env.situacao(campanha.id, "Loja Agendada"), "agendado");
    });

    await t.test("tarefa concluída não conta como agendada", () => {
      const { id } = env.db.conn.prepare("SELECT id FROM agendamentos WHERE cliente = 'Loja Agendada'").get();
      env.agenda.marcarConcluida(id, USUARIO);
      assert.equal(env.situacao(campanha.id, "Loja Agendada"), "pendente");
    });

    await t.test("oficial nova em Sistemas não muda a meta nem desfaz a baixa", () => {
      env.db.sistemas.salvarVersao("B_NFe", "28/09/2026");
      const d = env.campanhas.detalhe(campanha.id);
      assert.equal(d.versaoAlvo, "25/09/2026");
      assert.equal(env.situacao(campanha.id, "Loja Atendida"), "concluido");
    });

    await t.test("editar muda título e prazo, nunca sistema ou versão-alvo", () => {
      const editada = env.campanhas.update(campanha.id, { titulo: "NT revisada", prazo: "", sistema: "B_Vendas", versaoAlvo: "01/01/2030" }, USUARIO);
      assert.equal(editada.titulo, "NT revisada");
      assert.equal(editada.prazo, "");
      assert.equal(editada.sistema, "B_NFe");
      assert.equal(editada.versaoAlvo, "25/09/2026");
    });

    await t.test("encerrar congela o placar", () => {
      const encerrada = env.campanhas.encerrar(campanha.id, USUARIO);
      assert.ok(encerrada.encerradaEm);
      assert.deepEqual([encerrada.totalClientes, encerrada.atendidos], [4, 1]);
      env.atender("Loja Antiga", "B_NFe", "28/09/2026");
      const depois = env.campanhas.detalhe(campanha.id);
      assert.equal(depois.atendidos, 1, "atualização depois do encerramento não muda o resultado");
      assert.equal(env.campanhas.list("ativas").length, 0);
      assert.equal(env.campanhas.list("encerradas").length, 1);
      assert.throws(() => env.campanhas.encerrar(campanha.id, USUARIO), /já está encerrada/);
    });

    await t.test("reabrir volta a contar ao vivo", () => {
      const reaberta = env.campanhas.reabrir(campanha.id, USUARIO);
      assert.equal(reaberta.encerradaEm, null);
      assert.equal(reaberta.atendidos, 2);
    });

    await t.test("excluir a campanha não mexe em atualizações nem tarefas", () => {
      const antes = [env.db.atualizacoes.count(), env.db.agendamentos.count()];
      env.campanhas.remove(campanha.id, USUARIO);
      assert.deepEqual([env.db.atualizacoes.count(), env.db.agendamentos.count()], antes);
      assert.throws(() => env.campanhas.detalhe(campanha.id), /não existe mais/);
    });
  } finally {
    env.cleanup();
  }
});

test("Campanhas - vale a data da atualização, com ou sem versão recebida (ADR-0008)", () => {
  const env = ambiente();
  try {
    env.cliente("Loja Legada", ["B_Vendas"]);
    env.cliente("Loja Legada Velha", ["B_Vendas"]);
    // Sem oficial cadastrada: a atualização não grava versão nenhuma.
    env.atender("Loja Legada", "B_Vendas", "26/09/2026");
    env.atender("Loja Legada Velha", "B_Vendas", "01/09/2026");
    const c = env.campanhas.create({ titulo: "Vendas", sistema: "B_Vendas", versaoAlvo: "25/09/2026" }, USUARIO);
    const loja = c.clientes.find((x) => x.nome === "Loja Legada");
    assert.equal(loja.situacao, "concluido");
    assert.equal(c.clientes.find((x) => x.nome === "Loja Legada Velha").situacao, "pendente");
    // Com versão recebida ANTERIOR à meta, mas atendido depois dela: conclui.
    // Até 29/09/2026 a versão recebida mandava e isto ficava pendente.
    env.db.sistemas.salvarVersao("B_Vendas", "20/09/2026");
    env.cliente("Loja Versão Velha", ["B_Vendas"]);
    env.atender("Loja Versão Velha", "B_Vendas", "27/09/2026");
    const depois = env.campanhas.detalhe(c.id).clientes.find((x) => x.nome === "Loja Versão Velha");
    assert.equal(depois.versaoRecebida, "20/09/2026");
    assert.equal(depois.situacao, "concluido");
  } finally {
    env.cleanup();
  }
});

test("Campanhas - validação", async (t) => {
  const env = ambiente();
  try {
    const base = { titulo: "X", sistema: "B_NFe", versaoAlvo: "25/09/2026" };
    await t.test("sistema fixo não pode ter campanha", () => {
      assert.throws(() => env.campanhas.create({ ...base, sistema: "Suporte Bredas" }, USUARIO), /não controla versão/);
    });
    await t.test("sistema fora do catálogo é recusado", () => {
      assert.throws(() => env.campanhas.create({ ...base, sistema: "Inexistente" }, USUARIO), /catálogo/);
    });
    await t.test("versão-alvo e prazo precisam ser datas reais", () => {
      assert.throws(() => env.campanhas.create({ ...base, versaoAlvo: "" }, USUARIO), /Versão-alvo/);
      assert.throws(() => env.campanhas.create({ ...base, versaoAlvo: "31/02/2026" }, USUARIO), /Versão-alvo/);
      assert.throws(() => env.campanhas.create({ ...base, prazo: "2026-09-30" }, USUARIO), /Prazo/);
    });
    await t.test("título obrigatório", () => {
      assert.throws(() => env.campanhas.create({ ...base, titulo: "  " }, USUARIO), /título/);
    });
    await t.test("campanha sem clientes não mostra 100%", () => {
      const vazia = env.campanhas.create(base, USUARIO);
      assert.equal(vazia.totalClientes, 0);
      assert.equal(vazia.percentual, null);
    });
  } finally {
    env.cleanup();
  }
});

test("Campanhas - rotas e permissões", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-campanhas-http-"));
  const server = new Servidor({ port: 0, dbPath: path.join(tmpDir, "gestao.db"), sessionSecret: "segredo-de-teste", sessionSecure: false, agentApiToken: "token-de-teste" });
  await server.start();
  const base = `http://127.0.0.1:${server.httpServer.address().port}/api`;
  t.after(async () => {
    await server.stop().catch(() => {});
    try { server.db.close(); } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  // O navegador guarda o token CSRF que vem com cada sessão e o devolve nas
  // escritas (ver middlewares/protecaoCsrf.js); aqui, por cookie.
  const tokens = new Map();
  const pedir = async (caminho, { metodo = "GET", corpo, cookie } = {}) => {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie, "x-csrf-token": tokens.get(cookie) ?? "" } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    const novoCookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    if (r.headers.get("x-csrf-token")) tokens.set(novoCookie || cookie, r.headers.get("x-csrf-token"));
    const tipo = r.headers.get("content-type") || "";
    const corpoResp = tipo.includes("json") ? await r.json() : null;
    return { status: r.status, corpo: corpoResp, tipo, disposicao: r.headers.get("content-disposition"), cookie: r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
  };
  const SENHA = "senha-de-teste-123";
  const admin = (await pedir("/auth/setup", { metodo: "POST", corpo: { nome: "Admin", usuario: "admin", senha: SENHA } })).cookie;
  const logar = async (role) => {
    await pedir("/usuarios", { metodo: "POST", cookie: admin, corpo: { nome: role, usuario: role, senha: SENHA, role } });
    return (await pedir("/auth/login", { metodo: "POST", corpo: { usuario: role, senha: SENHA } })).cookie;
  };
  const operador = await logar("operador");
  const consulta = await logar("consulta");
  const nova = { titulo: "NT", sistema: "B_NFe", versaoAlvo: "25/09/2026" };

  await t.test("anônimo não lê", async () => {
    assert.equal((await pedir("/campanhas")).status, 401);
  });
  await t.test("consulta lê mas não cria", async () => {
    assert.equal((await pedir("/campanhas", { metodo: "POST", cookie: consulta, corpo: nova })).status, 403);
    assert.equal((await pedir("/campanhas", { cookie: consulta })).status, 200);
  });
  let id;
  await t.test("operador cria, encerra e reabre, mas não exclui", async () => {
    const criada = await pedir("/campanhas", { metodo: "POST", cookie: operador, corpo: nova });
    assert.equal(criada.status, 201);
    id = criada.corpo.id;
    assert.equal((await pedir(`/campanhas/${id}/encerrar`, { metodo: "PATCH", cookie: operador })).status, 200);
    assert.equal((await pedir(`/campanhas/${id}/reabrir`, { metodo: "PATCH", cookie: operador })).status, 200);
    assert.equal((await pedir(`/campanhas/${id}`, { metodo: "DELETE", cookie: operador })).status, 403);
  });
  await t.test("candidatos de uma campanha de escolhidos: rota própria, antes do :id", async () => {
    const lista = await pedir("/campanhas/clientes-do-sistema?sistema=B_NFe", { cookie: consulta });
    assert.equal(lista.status, 200);
    assert.ok(Array.isArray(lista.corpo));
    assert.equal((await pedir("/campanhas/clientes-do-sistema?sistema=Inexistente", { cookie: consulta })).status, 400);
    assert.equal((await pedir("/campanhas", { metodo: "POST", cookie: operador, corpo: { ...nova, publico: "escolhidos", clientes: [] } })).status, 400);
  });
  await t.test("acrescentar e retirar cliente: Consulta não pode, Operador pode", async () => {
    const lista = (await pedir("/campanhas/clientes-do-sistema?sistema=B_NFe", { cookie: operador })).corpo;
    assert.equal((await pedir(`/campanhas/${id}/clientes`, { metodo: "POST", cookie: consulta, corpo: { clientes: [] } })).status, 403);
    assert.equal((await pedir(`/campanhas/${id}/clientes/1`, { metodo: "DELETE", cookie: consulta })).status, 403);
    assert.equal((await pedir(`/campanhas/${id}/clientes`, { metodo: "POST", cookie: operador, corpo: { clientes: lista.map((x) => x.id) } })).status, 400, "a campanha do teste vale para todos: não tem lista");
  });
  await t.test("admin exclui; depois disso é 404", async () => {
    assert.equal((await pedir(`/campanhas/${id}`, { metodo: "DELETE", cookie: admin })).status, 204);
    assert.equal((await pedir(`/campanhas/${id}`, { cookie: admin })).status, 404);
  });
});

test("Campanhas - encerradas saem da mais recente para a mais antiga, sem olhar o prazo", () => {
  const env = ambiente();
  try {
    const a = env.campanhas.create({ titulo: "A", sistema: "B_NFe", versaoAlvo: "01/01/2026", prazo: "01/01/2026" }, USUARIO);
    const b = env.campanhas.create({ titulo: "B", sistema: "B_NFe", versaoAlvo: "01/01/2026", prazo: "30/06/2026" }, USUARIO);
    const c = env.campanhas.create({ titulo: "C", sistema: "B_NFe", versaoAlvo: "01/01/2026" }, USUARIO);
    env.campanhas.encerrar(b.id, USUARIO);
    env.campanhas.encerrar(c.id, USUARIO);
    env.campanhas.encerrar(a.id, USUARIO);
    // Mesma data de encerramento no mesmo milissegundo é possível num teste:
    // força a ordem pelo carimbo.
    const set = env.db.conn.prepare("UPDATE campanhas SET encerrada_em = ? WHERE id = ?");
    set.run("2026-09-01T10:00:00.000Z", b.id);
    set.run("2026-09-02T10:00:00.000Z", c.id);
    set.run("2026-09-03T10:00:00.000Z", a.id);
    assert.deepEqual(env.campanhas.list("encerradas").map((x) => x.titulo), ["A", "C", "B"]);
  } finally {
    env.cleanup();
  }
});
