/*
 * Testes do ClienteService contra um banco SQLite de verdade, descartavel.
 *
 * O cliente e' a entidade que mais coisa depende: atualizacoes, agendamentos e
 * acessos remotos ligam a ele -- e as atualizacoes/agendamentos ligam **pelo
 * NOME**, nao por id. Isso torna duas regras criticas, e as duas erram em
 * silencio se quebrarem:
 *
 *  - **nome duplicado e' bloqueado.** Dois clientes com o mesmo nome fariam a
 *    Consulta e o Resumo enxergarem so um deles, sem erro nenhum.
 *  - **renomear propaga.** Sem a propagacao, o historico do cliente
 *    simplesmente desaparece da tela dele -- os registros continuam no banco,
 *    apontando para um nome que nao existe mais.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Database } = require("../src/database/Database");
const { HistoricoService } = require("../src/services/HistoricoService");
const { ClienteService } = require("../src/services/ClienteService");

const USUARIO = { id: 1, nome: "Teste" };

function ambiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-cli-"));
  const db = new Database(path.join(tmpDir, "gestao.db"));
  const service = new ClienteService(db, new HistoricoService(db));
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

test("ClienteService - cadastro", async (t) => {
  const env = ambiente();
  try {
    await t.test("nome é obrigatório", () => {
      assert.throws(() => env.service.create({ nome: "   " }, USUARIO), /Cliente/);
      assert.throws(() => env.service.create({}, USUARIO), /Cliente/);
    });

    await t.test("cria e devolve o cliente com sistemas como array", () => {
      const c = env.service.create(
        { nome: "Mercado Central", codigo: "C001", cidade: "Uberaba", sistemas: ["B_Vendas", "B_NFe"] },
        USUARIO
      );
      assert.equal(c.nome, "Mercado Central");
      assert.equal(c.codigo, "C001");
      assert.deepEqual(c.sistemas, ["B_Vendas", "B_NFe"], "a API entrega array, o banco guarda texto");
    });

    await t.test("nome duplicado é recusado", () => {
      // Se passasse, a Consulta e o Resumo enxergariam só um dos dois -- sem
      // erro, sem aviso, e sem ninguém entender por que faltam atendimentos.
      assert.throws(() => env.service.create({ nome: "Mercado Central" }, USUARIO), /Já existe um cliente/);
    });

    await t.test("campos opcionais vazios não viram 'undefined'", () => {
      const c = env.service.create({ nome: "Só o nome" }, USUARIO);
      assert.equal(c.codigo, "");
      assert.equal(c.cidade, "");
      assert.deepEqual(c.sistemas, []);
    });

    await t.test("bordas do nome são aparadas", () => {
      const c = env.service.create({ nome: "  Com Espaço  " }, USUARIO);
      assert.equal(c.nome, "Com Espaço");
    });
  } finally {
    env.cleanup();
  }
});

test("ClienteService - renomear propaga para o histórico", async (t) => {
  const env = ambiente();
  try {
    const cliente = env.service.create({ nome: "Padaria Antiga" }, USUARIO);

    env.db.atualizacoes.insert({
      cliente: "Padaria Antiga",
      sistema: "B_Vendas",
      versao: "1.0",
      responsavel: "Camila",
      data: "01/01/2026",
      motivo: "",
      maquinas: 2,
      obs: "",
    });
    env.db.agendamentos.insert({
      tarefa: "Atualizar",
      cliente: "Padaria Antiga",
      sistema: "",
      responsavel: "Camila",
      prioridade: "Normal",
      data: "02/01/2026",
      horario: "09:00",
      status: "A Fazer",
      obs: "",
    });

    await t.test("atualizações e agendamentos seguem o novo nome", () => {
      // Esta é a regra crítica de integridade: o vínculo é pelo NOME. Sem a
      // propagação, o histórico não some do banco -- some da TELA do cliente,
      // que é pior, porque parece que nunca existiu.
      env.service.update(cliente.id, { nome: "Padaria Nova" }, USUARIO);

      const atu = env.db.conn.prepare("SELECT cliente FROM atualizacoes").all();
      assert.deepEqual(atu.map((r) => r.cliente), ["Padaria Nova"]);

      const agd = env.db.conn.prepare("SELECT cliente FROM agendamentos").all();
      assert.deepEqual(agd.map((r) => r.cliente), ["Padaria Nova"]);
    });

    await t.test("o histórico registra o rename com os dois nomes", () => {
      const eventos = env.db.historico.list({ page: 1, pageSize: 50 }).rows;
      assert.ok(
        eventos.some((e) => /Padaria Antiga.*renomeado.*Padaria Nova/.test(e.descricao)),
        "quem lê o histórico precisa conseguir seguir o rastro do nome antigo"
      );
    });

    await t.test("renomear para um nome já usado é recusado", () => {
      const outro = env.service.create({ nome: "Outro Cliente" }, USUARIO);
      assert.throws(() => env.service.update(outro.id, { nome: "Padaria Nova" }, USUARIO), /Já existe um cliente/);
    });

    await t.test("manter o próprio nome não é 'duplicado'", () => {
      // O teste de duplicidade tem que ignorar o próprio registro, senão
      // corrigir só a cidade de um cliente seria impossível.
      assert.doesNotThrow(() => env.service.update(cliente.id, { nome: "Padaria Nova", cidade: "Uberaba" }, USUARIO));
    });

    await t.test("id inexistente dá 404, não 500", () => {
      assert.throws(() => env.service.update(999999, { nome: "X" }, USUARIO), /não encontrado/i);
      assert.throws(() => env.service.delete(999999, USUARIO), /não encontrado/i);
    });
  } finally {
    env.cleanup();
  }
});

test("ClienteService - catálogo de sistemas", async (t) => {
  const env = ambiente();
  try {
    await t.test("nome vazio é recusado", () => {
      assert.throws(() => env.service.addSistema("  ", USUARIO), /Informe um nome/);
    });

    await t.test("sistema duplicado é recusado", () => {
      env.service.addSistema("B_Teste", USUARIO);
      assert.throws(() => env.service.addSistema("B_Teste", USUARIO), /já existe/);
    });

    await t.test("remover tira o sistema dos clientes que o tinham", () => {
      env.service.create({ nome: "Cliente A", sistemas: ["B_Teste", "B_Vendas"] }, USUARIO);
      env.service.create({ nome: "Cliente B", sistemas: ["B_Teste"] }, USUARIO);

      const r = env.service.removeSistema("B_Teste", USUARIO);
      assert.equal(r.removed, true);
      assert.equal(r.clientesAfetados, 2);

      const a = env.db.clientes.getByNome("Cliente A");
      assert.ok(!a.sistemas.includes("B_Teste"), "saiu da lista do cliente");
      assert.ok(a.sistemas.includes("B_Vendas"), "os outros continuam");
    });

    await t.test("remover NÃO reescreve atualizações já registradas", () => {
      // Regra deliberada: uma atualização feita ano passado no "Sped" continua
      // tendo sido, de fato, no "Sped", mesmo que hoje ele não seja mais
      // oferecido. Apagar esse rastro seria reescrever histórico, não limpar
      // cadastro.
      env.service.addSistema("B_Extinto", USUARIO);
      env.db.atualizacoes.insert({
        cliente: "Cliente A",
        sistema: "B_Extinto",
        versao: "1.0",
        responsavel: "",
        data: "01/01/2026",
        motivo: "",
        maquinas: 1,
        obs: "",
      });

      env.service.removeSistema("B_Extinto", USUARIO);

      const restou = env.db.conn
        .prepare("SELECT COUNT(*) AS n FROM atualizacoes WHERE sistema = 'B_Extinto'")
        .get().n;
      assert.equal(restou, 1, "o registro do que JÁ aconteceu não pode ser reescrito");
    });

    await t.test("remover sistema inexistente dá 404", () => {
      assert.throws(() => env.service.removeSistema("Nunca Existiu", USUARIO), /não está cadastrado/);
    });

    await t.test("addSistemaMany marca vários de uma vez", () => {
      env.service.addSistema("B_NFCe", USUARIO);
      const a = env.db.clientes.getByNome("Cliente A");
      const b = env.db.clientes.getByNome("Cliente B");

      const r = env.service.addSistemaMany([a.id, b.id], "B_NFCe", USUARIO);
      assert.equal(r.total, 2);
      assert.ok(env.db.clientes.getById(a.id).sistemas.includes("B_NFCe"));
      assert.ok(env.db.clientes.getById(b.id).sistemas.includes("B_NFCe"));
    });

    await t.test("addSistemaMany com ids que não existem dá 404 explicativo", () => {
      assert.throws(() => env.service.addSistemaMany([999998], "B_NFCe", USUARIO), /lista pode estar desatualizada/);
    });
  } finally {
    env.cleanup();
  }
});

test("ClienteService - acessos remotos", async (t) => {
  const env = ambiente();
  try {
    const cliente = env.service.create({ nome: "Com Acessos" }, USUARIO);

    await t.test("máquina é obrigatória", () => {
      assert.throws(() => env.service.addAcesso(cliente.id, { maquina: " " }, USUARIO), /Máquina/);
    });

    await t.test("grava e devolve o acesso", () => {
      const a = env.service.addAcesso(
        cliente.id,
        { maquina: "Caixa 1", anydesk: "123 456 789", suporteBredas: "SB-42", observacoes: "" },
        USUARIO
      );
      assert.equal(a.maquina, "Caixa 1");
      assert.equal(a.anydesk, "123 456 789");
      assert.equal(env.service.listAcessos(cliente.id).length, 1);
    });

    await t.test("acesso em cliente inexistente dá 404", () => {
      assert.throws(() => env.service.addAcesso(999999, { maquina: "X" }, USUARIO), /não encontrado/i);
    });

    await t.test("excluir o cliente leva os acessos junto (ON DELETE CASCADE)", () => {
      // É por causa disto que a exclusão em lote de clientes NÃO oferece
      // "Desfazer": recriar o cliente perderia as credenciais de acesso
      // remoto de todas as máquinas dele. Um "desfazer" que finge ter voltado
      // tudo, mas silenciosamente perdeu senha, seria pior que não ter.
      const antes = env.db.conn.prepare("SELECT COUNT(*) AS n FROM cliente_acessos").get().n;
      assert.ok(antes > 0);

      env.service.delete(cliente.id, USUARIO);

      const depois = env.db.conn.prepare("SELECT COUNT(*) AS n FROM cliente_acessos").get().n;
      assert.equal(depois, 0, "os acessos não podem ficar órfãos apontando para um cliente que não existe");
    });

    await t.test("mexer em acesso inexistente dá 404", () => {
      assert.throws(() => env.service.updateAcesso(999999, { maquina: "X" }, USUARIO), /não encontrado/i);
      assert.throws(() => env.service.removeAcesso(999999, USUARIO), /não encontrado/i);
    });
  } finally {
    env.cleanup();
  }
});
