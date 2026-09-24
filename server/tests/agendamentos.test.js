/*
 * Testes do AgendamentoService contra um banco SQLite de verdade, descartavel.
 *
 * O foco esta nas regras que erram em SILENCIO -- as que nao levantam excecao
 * nem somem da tela, so produzem um numero errado semanas depois:
 *
 *  - `concluido_em` e' o que alimenta o "tempo medio de resolucao" do Resumo.
 *    Se editar uma tarefa ja concluida resetasse essa data, a metrica cairia
 *    sozinha e ninguem saberia por que.
 *  - o arquivamento tira tarefa da lista sem apagar nada. Arquivar cedo demais
 *    (ou de menos) muda o que a equipe ve todo dia.
 *  - o responsavel e' canonizado a partir das ATUALIZACOES, nao dos
 *    agendamentos: e' assim que as duas abas nao divergem.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Database } = require("../src/database/Database");
const { HistoricoService } = require("../src/services/HistoricoService");
const { AgendamentoService } = require("../src/services/AgendamentoService");
const { STATUS_OPTIONS } = require("../src/config/constants");

const A_FAZER = STATUS_OPTIONS[0];
const CONCLUIDO = STATUS_OPTIONS[STATUS_OPTIONS.length - 1];
const USUARIO = { id: 1, nome: "Teste" };

function ambiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-agenda-"));
  const db = new Database(path.join(tmpDir, "gestao.db"));
  const service = new AgendamentoService(db, new HistoricoService(db));
  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, service, cleanup };
}

/**
 * Cria uma tarefa e devolve a linha COMPLETA (via find), nao a de list().
 *
 * Duas armadilhas que este helper evita, e que custaram uma rodada de testes
 * vermelhos ate aparecerem:
 *
 *  - `list()` nao devolve `concluido_em` nem `criado_em` (so `find()` devolve),
 *    entao conferir data de conclusao a partir de list() compara com undefined
 *    e passa/falha pelo motivo errado;
 *  - `list()` NAO ordena por id: a ordem e' por status, depois data, depois
 *    horario. "A ultima linha" nao e' "a que acabou de ser criada".
 */
function criar(service, db, campos = {}) {
  service.create({ tarefa: "Atualizar cliente X", ...campos }, USUARIO);
  const { id } = db.conn.prepare("SELECT MAX(id) AS id FROM agendamentos").get();
  return db.agendamentos.find(id);
}

test("AgendamentoService - validação de entrada", async (t) => {
  const env = ambiente();
  try {
    await t.test("tarefa vazia é recusada", () => {
      assert.throws(() => env.service.create({ tarefa: "   " }, USUARIO), /Tarefa/);
      assert.throws(() => env.service.create({}, USUARIO), /Tarefa/);
    });

    await t.test("data fora de dd/mm/aaaa é recusada", () => {
      assert.throws(() => env.service.create({ tarefa: "X", data: "2026-01-01" }, USUARIO), /Data/);
      // Inclui a data que o Date "consertaria" sozinho para 03/03.
      assert.throws(() => env.service.create({ tarefa: "X", data: "31/02/2026" }, USUARIO), /Data/);
    });

    await t.test("horário fora de hh:mm é recusado", () => {
      assert.throws(() => env.service.create({ tarefa: "X", horario: "25:00" }, USUARIO), /Horário/);
      assert.throws(() => env.service.create({ tarefa: "X", horario: "9:30" }, USUARIO), /Horário/);
    });

    await t.test("data e horário vazios são permitidos", () => {
      // Nem toda tarefa nasce com data marcada.
      assert.doesNotThrow(() => env.service.create({ tarefa: "Sem data" }, USUARIO));
    });

    await t.test("status desconhecido vira o primeiro da lista, não erro", () => {
      // A tela só oferece os status válidos; um valor estranho aqui é sinal de
      // requisição montada à mão, e cair no padrão é mais útil que recusar.
      const criada = criar(env.service, env.db, { tarefa: "Status torto", status: "Inventado" });
      assert.equal(criada.status, A_FAZER);
    });
  } finally {
    env.cleanup();
  }
});

test("AgendamentoService - concorrência otimista e geração em lote", () => {
  const env = ambiente();
  try {
    const tarefa = criar(env.service, env.db, { cliente: "Loja 1" });
    env.service.update(tarefa.id, { ...tarefa, tarefa: "Primeira edição", revisao: tarefa.revisao }, { id: 2, nome: "Camila" });
    assert.throws(
      () => env.service.update(tarefa.id, { ...tarefa, tarefa: "Edição atrasada", revisao: tarefa.revisao }, USUARIO),
      (erro) => erro.statusCode === 409 && /Camila/.test(erro.message)
    );

    const lote = env.service.gerarLote({ clientes: ["Loja 1", "Loja 2", "Loja 1"], sistema: "B_Vendas", responsavel: "Teste" }, USUARIO);
    assert.equal(lote.criados, 2, "remove clientes duplicados antes da transação");
    assert.equal(env.db.agendamentos.list("Atualizar B_Vendas").total, 2);
  } finally { env.cleanup(); }
});

test("AgendamentoService - concluido_em", async (t) => {
  const env = ambiente();
  try {
    await t.test("marcar como concluída grava a data", () => {
      const t1 = criar(env.service, env.db, { tarefa: "Vira concluída" });
      assert.equal(t1.concluidoEm, null, "nasce sem data de conclusão");

      env.service.update(t1.id, { tarefa: "Vira concluída", status: CONCLUIDO }, USUARIO);
      const depois = env.db.agendamentos.find(t1.id);
      assert.equal(depois.status, CONCLUIDO);
      assert.ok(depois.concluidoEm, "deveria ter gravado a hora da conclusão");
    });

    await t.test("editar tarefa JÁ concluída preserva a data original", () => {
      // Esta é a regra que erra em silêncio: sem ela, corrigir o responsável de
      // uma tarefa fechada há um mês "resetaria" o relógio dela, e o tempo
      // médio de resolução do Resumo cairia sem explicação.
      const t2 = criar(env.service, env.db, { tarefa: "Já fechada" });
      env.service.update(t2.id, { tarefa: "Já fechada", status: CONCLUIDO }, USUARIO);
      const original = env.db.agendamentos.find(t2.id).concluidoEm;
      assert.ok(original);

      env.service.update(t2.id, { tarefa: "Já fechada", status: CONCLUIDO, responsavel: "Camila" }, USUARIO);
      assert.equal(env.db.agendamentos.find(t2.id).concluidoEm, original, "a data não pode ter mudado");
    });

    await t.test("reabrir limpa a data de conclusão", () => {
      const t3 = criar(env.service, env.db, { tarefa: "Reaberta" });
      env.service.update(t3.id, { tarefa: "Reaberta", status: CONCLUIDO }, USUARIO);
      assert.ok(env.db.agendamentos.find(t3.id).concluidoEm);

      env.service.update(t3.id, { tarefa: "Reaberta", status: A_FAZER }, USUARIO);
      const depois = env.db.agendamentos.find(t3.id);
      assert.equal(depois.status, A_FAZER);
      assert.equal(depois.concluidoEm, null, "tarefa reaberta não tem data de conclusão");
    });
  } finally {
    env.cleanup();
  }
});

test("AgendamentoService - arquivar e reabrir", async (t) => {
  const env = ambiente();
  try {
    await t.test("só arquiva tarefa concluída", () => {
      const pendente = criar(env.service, env.db, { tarefa: "Ainda pendente" });
      assert.throws(() => env.service.arquivar(pendente.id, USUARIO), /Concluíd/);
    });

    await t.test("arquiva concluída e some da lista, sem apagar", () => {
      const t1 = criar(env.service, env.db, { tarefa: "Para arquivar" });
      env.service.update(t1.id, { tarefa: "Para arquivar", status: CONCLUIDO }, USUARIO);
      env.service.arquivar(t1.id, USUARIO);

      const lista = env.service.list("", "Todos", { page: 1, pageSize: 100 });
      assert.ok(!lista.rows.some((i) => i.id === t1.id), "não pode aparecer na lista normal");
      assert.ok(env.db.agendamentos.find(t1.id), "mas continua existindo no banco");
      assert.equal(lista.arquivadas, 1, "a tela precisa saber quantas existem");
    });

    await t.test("arquivar duas vezes é recusado com mensagem própria", () => {
      const t2 = criar(env.service, env.db, { tarefa: "Dupla" });
      env.service.update(t2.id, { tarefa: "Dupla", status: CONCLUIDO }, USUARIO);
      env.service.arquivar(t2.id, USUARIO);
      assert.throws(() => env.service.arquivar(t2.id, USUARIO), /já está arquivada/);
    });

    await t.test("reabrir traz de volta como 'A Fazer'", () => {
      const t3 = criar(env.service, env.db, { tarefa: "Volta" });
      env.service.update(t3.id, { tarefa: "Volta", status: CONCLUIDO }, USUARIO);
      env.service.arquivar(t3.id, USUARIO);

      const reaberta = env.service.reabrir(t3.id, USUARIO);
      assert.equal(reaberta.status, A_FAZER);
      assert.equal(reaberta.concluidoEm, null);

      const lista = env.service.list("", "Todos", { page: 1, pageSize: 100 });
      assert.ok(lista.rows.some((i) => i.id === t3.id), "voltou para a lista");
    });

    await t.test("reabrir o que não está arquivado é recusado", () => {
      const t4 = criar(env.service, env.db, { tarefa: "Nunca arquivada" });
      assert.throws(() => env.service.reabrir(t4.id, USUARIO), /não está arquivada/);
    });

    await t.test("arquivar/reabrir id inexistente dá 404, não 500", () => {
      assert.throws(() => env.service.arquivar(999999, USUARIO), /não existe mais/);
      assert.throws(() => env.service.reabrir(999999, USUARIO), /não existe mais/);
    });

    await t.test("a listagem informa o prazo de arquivamento em vigor", () => {
      // A tela explica a regra para o usuário usando este número, em vez de ter
      // o texto escrito na mão -- assim mudar o .env muda o comportamento E o
      // texto juntos, sem os dois se contradizerem.
      const lista = env.service.list("", "Todos", { page: 1, pageSize: 100 });
      assert.equal(typeof lista.arquivarDias, "number");
      assert.ok(lista.arquivarDias > 0);
    });
  } finally {
    env.cleanup();
  }
});

test("AgendamentoService - operações em lote", async (t) => {
  const env = ambiente();
  try {
    await t.test("markDoneMany só toca as que ainda não estavam concluídas", () => {
      const a = criar(env.service, env.db, { tarefa: "Lote A" });
      const b = criar(env.service, env.db, { tarefa: "Lote B" });
      env.service.update(b.id, { tarefa: "Lote B", status: CONCLUIDO }, USUARIO);

      const r = env.service.markDoneMany([a.id, b.id], USUARIO);
      assert.equal(r.concluidos, 1, "só a que estava pendente conta");
      assert.equal(r.registros.length, 1, "e só ela entra no 'Desfazer'");
      assert.equal(r.registros[0].id, a.id);
    });

    await t.test("markDoneMany com tudo já concluído não suja o histórico", () => {
      const c = criar(env.service, env.db, { tarefa: "Lote C" });
      env.service.update(c.id, { tarefa: "Lote C", status: CONCLUIDO }, USUARIO);
      const antes = env.db.historico.list({ page: 1, pageSize: 200 }).total;

      const r = env.service.markDoneMany([c.id], USUARIO);
      assert.equal(r.concluidos, 0);
      assert.equal(env.db.historico.list({ page: 1, pageSize: 200 }).total, antes, "nada novo no histórico");
    });

    await t.test("deleteMany devolve os registros para o 'Desfazer'", () => {
      const d = criar(env.service, env.db, { tarefa: "Some D" });
      const e = criar(env.service, env.db, { tarefa: "Some E" });

      const r = env.service.deleteMany([d.id, e.id], USUARIO);
      assert.equal(r.excluidos, 2);
      assert.equal(r.registros.length, 2, "os dados de antes de sumirem");
      assert.ok(r.registros.every((x) => x.tarefa));
      assert.equal(env.db.agendamentos.find(d.id), undefined);
    });

    await t.test("lote com ids que não existem mais dá 404 explicativo", () => {
      assert.throws(() => env.service.deleteMany([999998, 999999], USUARIO), /lista pode estar desatualizada/);
      assert.throws(() => env.service.markDoneMany([999998], USUARIO), /lista pode estar desatualizada/);
    });
  } finally {
    env.cleanup();
  }
});

test("AgendamentoService - responsável canônico", async (t) => {
  const env = ambiente();
  try {
    await t.test("adota a grafia já usada nas ATUALIZAÇÕES, não nos agendamentos", () => {
      // De propósito buscada lá: é a mesma equipe, e é nas Atualizações que
      // está o volume que define qual grafia vale ("Camila", não "CAMILA").
      // Sem isso, o campo Responsável de uma aba divergia do da outra.
      env.db.atualizacoes.insert({
        cliente: "Cliente Teste",
        versao: "1.0",
        data: "01/01/2026",
        responsavel: "Camila",
        maquinas: 1,
        motivo: "",
        obs: "",
      }, env.db.sistemas.resolverOuCriar(["B_Vendas"]));

      const criada = criar(env.service, env.db, { tarefa: "Com responsável", responsavel: "CAMILA" });
      assert.equal(criada.responsavel, "Camila");
    });

    await t.test("pessoa nova passa como digitada", () => {
      const criada = criar(env.service, env.db, { tarefa: "Gente nova", responsavel: "  Fulano  " });
      assert.equal(criada.responsavel, "Fulano");
    });
  } finally {
    env.cleanup();
  }
});
