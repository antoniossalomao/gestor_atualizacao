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
  const atualizacoes = new AtualizacaoService(db, historico, { notifyAtualizacao: async () => {} });
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

test("Campanhas - cidade limita público, placar e exportação", async () => {
  const env = ambiente();
  try {
    env.cliente("Loja Marília", ["B_NFe"]);
    env.db.clientes.insert("", "Loja Bauru", "Bauru", [env.db.sistemas.resolver("B_NFe").id], "");
    const campanha = env.campanhas.create({ titulo: "Local", sistema: "B_NFe", versaoAlvo: "25/09/2026", cidade: "marília" }, USUARIO);
    assert.equal(campanha.cidade, "Marília");
    assert.deepEqual(campanha.clientes.map((c) => c.nome), ["Loja Marília"]);
    assert.equal(env.campanhas.list()[0].totalClientes, 1);
    const exportado = await env.campanhas.exportarPendentesXlsx(campanha.id);
    const ExcelJS = require("exceljs");
    const planilha = new ExcelJS.Workbook();
    await planilha.xlsx.load(exportado.buffer);
    assert.equal(planilha.getWorksheet("Pendentes").rowCount, 2);
    const editada = env.campanhas.update(campanha.id, { titulo: "Local", cidade: "Bauru" }, USUARIO);
    assert.deepEqual(editada.clientes.map((c) => c.nome), ["Loja Bauru"]);
    assert.throws(() => env.campanhas.create({ titulo: "Inválida", sistema: "B_NFe", versaoAlvo: "25/09/2026", cidade: "Inexistente" }, USUARIO), /cidade cadastrada/);
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
      env.agenda.markDone(id, USUARIO);
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
  await t.test("exportação devolve planilha com nome identificável", async () => {
    const r = await pedir(`/campanhas/${id}/export`, { cookie: consulta });
    assert.equal(r.status, 200);
    assert.match(r.tipo, /spreadsheetml/);
    assert.match(r.disposicao, /campanha-pendentes-B_NFe-25-09-2026\.xlsx/);
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
