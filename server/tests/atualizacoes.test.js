/*
 * Testes do AtualizacaoService -- o registro central do sistema.
 *
 * Tres comportamentos aqui erram em silencio, e sao o foco:
 *
 *  - **normalizacao na gravacao.** E' o que impede o campo "Sistema" de voltar
 *    a ter 144 grafias. Se parar de funcionar, nada quebra: o relatorio da aba
 *    Sistemas so passa a mentir, semanas depois.
 *  - **"zero linhas afetadas" precisa virar 404.** Um UPDATE que nao acha o id
 *    nao e' erro no SQLite -- volta calado. Sem a checagem, a tela confirma uma
 *    edicao que nunca aconteceu.
 *  - **o relatorio por sistema** decide quem esta "Desatualizado". Uma
 *    comparacao de data errada ali manda a equipe atender o cliente errado.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Database } = require("../src/database/Database");
const { HistoricoService } = require("../src/services/HistoricoService");
const { AtualizacaoService } = require("../src/services/AtualizacaoService");
const { ClienteService } = require("../src/services/ClienteService");

const USUARIO = { id: 1, nome: "Teste" };

function salvarOficial(clientes, nome, data) {
  const esperada = clientes.db.sistemas.resolver(nome)?.ultima_versao || "";
  return clientes.salvarVersaoSistema(nome, data, USUARIO, esperada);
}

function ambiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-atu-"));
  const db = new Database(path.join(tmpDir, "gestao.db"));
  const historico = new HistoricoService(db);
  // `notifications` de propósito ausente: o serviço chama `this.notifications?.`
  // com encadeamento opcional justamente para que uma notificação (ou a falta
  // dela) nunca derrube o cadastro.
  const service = new AtualizacaoService(db, historico, null);
  const clientes = new ClienteService(db, historico);
  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, service, clientes, cleanup };
}

/** Id da atualização recém-criada (list() não ordena por id). */
function ultimoId(db) {
  return db.conn.prepare("SELECT MAX(id) AS id FROM atualizacoes").get().id;
}

test("AtualizacaoService - validação", async (t) => {
  const env = ambiente();
  try {
    await t.test("cliente é obrigatório", () => {
      assert.throws(() => env.service.create({ cliente: "  " }, USUARIO), /Cliente/);
    });

    await t.test("data fora de dd/mm/aaaa é recusada", () => {
      assert.throws(() => env.service.create({ cliente: "X", data: "2026-01-01" }, USUARIO), /Data/);
      assert.throws(() => env.service.create({ cliente: "X", data: "31/02/2026" }, USUARIO), /Data/);
    });

    await t.test("data vazia é permitida", () => {
      // Nem todo registro importado de planilha tem data.
      assert.doesNotThrow(() => env.service.create({ cliente: "Sem data" }, USUARIO));
    });
  } finally {
    env.cleanup();
  }
});

test("AtualizacaoService - normalização na gravação", async (t) => {
  const env = ambiente();
  try {
    // B_NFe e B_Vendas ja vem no catalogo semeado na criacao do banco
    // (SISTEMAS_INICIAIS em config/constants.js) -- nao precisam ser criados,
    // e tentar criar de novo seria recusado como duplicata.

    await t.test("o sistema é gravado na grafia canônica", () => {
      // O ponto: o campo é texto livre, e sem isto "B_NFE" e "B_NFe" viram
      // dois sistemas diferentes para o relatório da aba Sistemas.
      const r = env.service.create({ cliente: "Cliente A", sistema: "B_NFE", data: "01/01/2026" }, USUARIO);
      assert.equal(r.sistema, "B_NFe");
    });

    await t.test("vários sistemas no mesmo campo são separados e canonizados", () => {
      const r = env.service.create({ cliente: "Cliente B", sistema: "b_vendas e B_NFE", data: "01/01/2026" }, USUARIO);
      assert.equal(r.sistema, "B_Vendas, B_NFe");
    });

    await t.test("o responsável adota a grafia já usada pela equipe", () => {
      env.service.create({ cliente: "Cliente C", responsavel: "Camila", data: "01/01/2026" }, USUARIO);
      const r = env.service.create({ cliente: "Cliente D", responsavel: "CAMILA", data: "01/01/2026" }, USUARIO);
      assert.equal(r.responsavel, "Camila");
    });

    await t.test("sistema desconhecido é mantido como veio", () => {
      // Deliberado: inventar destino para o desconhecido estragaria em
      // silêncio a primeira atualização de um sistema novo -- justamente
      // quando ninguém está olhando.
      const r = env.service.create({ cliente: "Cliente E", sistema: "B_Novo Em Folha", data: "01/01/2026" }, USUARIO);
      assert.equal(r.sistema, "B_Novo Em Folha");
    });

    await t.test("a normalização vale também na edição, não só na criação", () => {
      const id = ultimoId(env.db);
      const r = env.service.update(id, { cliente: "Cliente E", sistema: "B_NFE", data: "01/01/2026" }, USUARIO);
      assert.equal(r.sistema, "B_NFe");
    });
  } finally {
    env.cleanup();
  }
});

test("AtualizacaoService - 'zero linhas' vira 404", async (t) => {
  const env = ambiente();
  try {
    await t.test("editar id que não existe mais dá 404 com mensagem útil", () => {
      // A mensagem diz o que provavelmente aconteceu ("excluída por outra
      // pessoa") porque, com várias pessoas usando, isso é rotina -- não um
      // caso exótico.
      assert.throws(
        () => env.service.update(999999, { cliente: "X", data: "01/01/2026" }, USUARIO),
        /não existe mais.*outra pessoa/s
      );
    });

    await t.test("excluir id que não existe mais dá 404", () => {
      assert.throws(() => env.service.delete(999999, USUARIO), /não existe mais/);
    });

    await t.test("exclusão em lote sem nenhum id válido dá 404 explicativo", () => {
      assert.throws(() => env.service.deleteMany([999998, 999999], USUARIO), /lista pode estar desatualizada/);
    });
  } finally {
    env.cleanup();
  }
});

test("AtualizacaoService - exclusão em lote", async (t) => {
  const env = ambiente();
  try {
    env.service.create({ cliente: "Lote 1", sistema: "B_Vendas", data: "01/01/2026" }, USUARIO);
    const id1 = ultimoId(env.db);
    env.service.create({ cliente: "Lote 2", sistema: "B_Vendas", data: "02/01/2026" }, USUARIO);
    const id2 = ultimoId(env.db);

    await t.test("devolve os registros de antes, para o 'Desfazer' da tela", () => {
      const r = env.service.deleteMany([id1, id2], USUARIO);
      assert.equal(r.excluidos, 2);
      assert.equal(r.registros.length, 2);
      assert.ok(r.registros.every((x) => x.cliente), "sem os dados não dá para recriar nada");
    });

    await t.test("o histórico ganha UMA linha, não uma por registro", () => {
      // Trinta linhas dizendo "excluiu #12", "excluiu #13" afogariam o
      // histórico e esconderiam o evento que alguém vai querer achar depois:
      // a exclusão em massa.
      const eventos = env.db.historico.list({ page: 1, pageSize: 100 }).rows;
      const emMassa = eventos.filter((e) => /excluídas de uma vez/.test(e.descricao));
      assert.equal(emMassa.length, 1);
      assert.match(emMassa[0].descricao, /Lote 1/, "e nomeia os clientes afetados");
    });
  } finally {
    env.cleanup();
  }
});

test("AtualizacaoService - 'Suporte Bredas' detectado na observação", async (t) => {
  const env = ambiente();
  try {
    env.clientes.create({ nome: "Com Suporte" }, USUARIO);

    await t.test("marca o sistema no cadastro do cliente automaticamente", () => {
      // Sem isso, quem digita a obs precisaria lembrar de repetir a mesma
      // informação à mão na aba Clientes.
      env.service.create(
        { cliente: "Com Suporte", data: "01/01/2026", obs: "Adicionado o Suporte Bredas na máquina do caixa" },
        USUARIO
      );
      const cliente = env.db.clientes.getByNome("Com Suporte");
      assert.ok(cliente.sistemas.includes("Suporte Bredas"));
    });

    await t.test("reconhece independente de caixa", () => {
      env.clientes.create({ nome: "Outro Com Suporte" }, USUARIO);
      env.service.create(
        { cliente: "Outro Com Suporte", data: "01/01/2026", obs: "ADICIONADO O SUPORTE BREDAS" },
        USUARIO
      );
      assert.ok(env.db.clientes.getByNome("Outro Com Suporte").sistemas.includes("Suporte Bredas"));
    });

    await t.test("é idempotente: não suja o histórico na segunda vez", () => {
      const antes = env.db.historico.list({ page: 1, pageSize: 200 }).total;
      env.service.create(
        { cliente: "Com Suporte", data: "02/01/2026", obs: "Adicionado o Suporte Bredas de novo" },
        USUARIO
      );
      const depois = env.db.historico.list({ page: 1, pageSize: 200 }).total;
      // Uma linha nova (a da própria atualização), não duas.
      assert.equal(depois - antes, 1, "a marcação do sistema não deveria ser registrada de novo");
    });

    await t.test("observação comum não marca nada", () => {
      env.clientes.create({ nome: "Sem Suporte" }, USUARIO);
      env.service.create({ cliente: "Sem Suporte", data: "01/01/2026", obs: "Reiniciado o servidor" }, USUARIO);
      assert.ok(!env.db.clientes.getByNome("Sem Suporte").sistemas.includes("Suporte Bredas"));
    });
  } finally {
    env.cleanup();
  }
});

test("AtualizacaoService - relatório por sistema", async (t) => {
  const env = ambiente();
  try {
    env.clientes.create({ nome: "Em Dia", cidade: "Uberaba", sistemas: ["B_Vendas"] }, USUARIO);
    env.clientes.create({ nome: "Atrasado", cidade: "Araxá", sistemas: ["B_Vendas"] }, USUARIO);
    env.clientes.create({ nome: "Nunca", sistemas: ["B_Vendas"] }, USUARIO);
    env.clientes.create({ nome: "Não Usa", sistemas: [] }, USUARIO);

    env.service.create({ cliente: "Em Dia", sistema: "B_Vendas", data: "10/09/2026" }, USUARIO);
    env.service.create({ cliente: "Atrasado", sistema: "B_Vendas", data: "01/01/2026" }, USUARIO);

    await t.test("sistema vazio é recusado", () => {
      assert.throws(() => env.service.relatorioPorSistema("  "), /Informe o sistema/);
    });

    await t.test("data de atendimento inválida é recusada", () => {
      assert.throws(() => env.service.relatorioPorSistema("B_Vendas", "2026-01-01"), /Último atendimento antes de/);
    });

    await t.test("lista só quem usa o sistema", () => {
      const r = env.service.relatorioPorSistema("B_Vendas");
      const nomes = r.map((x) => x.cliente);
      assert.ok(!nomes.includes("Não Usa"), "quem não tem o sistema não entra no relatório");
      assert.equal(nomes.length, 3);
    });

    await t.test("data filtra só atendimentos anteriores, sem alterar a situação de versão", () => {
      const r = env.service.relatorioPorSistema("B_Vendas", "01/06/2026");
      const por = Object.fromEntries(r.map((x) => [x.cliente, x.situacao]));
      assert.equal(por["Em Dia"], undefined, "atendimento posterior não entra no filtro");
      assert.equal(por["Atrasado"], "Sem referência", "data não substitui a versão oficial ausente");
      assert.equal(por["Nunca"], undefined, "sem atendimento não satisfaz o filtro de data");
    });

    await t.test("sem referência oficial, não presume que o cliente está em dia", () => {
      const r = env.service.relatorioPorSistema("B_Vendas");
      const por = Object.fromEntries(r.map((x) => [x.cliente, x.situacao]));
      assert.equal(por["Em Dia"], "Sem referência");
      assert.equal(por["Atrasado"], "Sem referência", "sem oficial não há como estar atrasado por versão");
      assert.equal(por["Nunca"], "Nunca atualizado");
    });

    await t.test("vem ordenado por cliente, com acento tratado", () => {
      const r = env.service.relatorioPorSistema("B_Vendas");
      const nomes = r.map((x) => x.cliente);
      assert.deepEqual(nomes, [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")));
    });

    await t.test("cidade ausente vira travessão, não vazio", () => {
      const r = env.service.relatorioPorSistema("B_Vendas");
      const nunca = r.find((x) => x.cliente === "Nunca");
      assert.equal(nunca.cidade, "—");
      assert.equal(nunca.ultima, "Nunca");
    });
  } finally {
    env.cleanup();
  }
});

test("Referência oficial não atribui versões retroativamente", () => {
  const { db, service, clientes, cleanup } = ambiente();
  try {
    for (const [nome, data] of [["Anterior", "08/09/2026"], ["Igual", "09/09/2026"], ["Posterior", "10/09/2026"], ["Sem registro", ""]]) {
      clientes.create({ nome, sistemas: ["B_Vendas"] }, USUARIO);
      if (data) service.create({ cliente: nome, sistema: "B_Vendas", data }, USUARIO);
    }
    salvarOficial(clientes, "B_Vendas", "09/09/2026");
    salvarOficial(clientes, "B_NFe", "22/09/2026");
    const rows = service.relatorioPorSistema("B_Vendas");
    const linha = (cliente) => rows.find((r) => r.cliente === cliente);
    // O que não pode acontecer: a oficial salva hoje virar a versão que
    // esses atendimentos antigos "receberam".
    for (const cliente of ["Anterior", "Igual", "Posterior"]) assert.equal(linha(cliente).instalada, "Não informada");
    // A situação, sem versão registrada, sai pela data do atendimento -- e
    // marcada `pelaData`, para a tela não apresentar como comprovada
    // (decisão da equipe, ver services/situacaoVersao.js).
    assert.deepEqual([linha("Anterior").situacao, linha("Anterior").pelaData], ["Desatualizado", true]);
    assert.deepEqual([linha("Igual").situacao, linha("Igual").pelaData], ["Em dia", true]);
    assert.deepEqual([linha("Posterior").situacao, linha("Posterior").pelaData], ["Em dia", true]);
    assert.equal(linha("Sem registro").situacao, "Nunca atualizado");
    assert.equal(db.sistemas.versoes().find((s) => s.nome === "B_NFe").data, "22/09/2026");
    assert.throws(() => salvarOficial(clientes, "B_Vendas", "31/02/2026"));
    assert.throws(() => salvarOficial(clientes, "B_Vendas", 123));
    assert.throws(() => salvarOficial(clientes, "Inexistente", "09/09/2026"));
    salvarOficial(clientes, "B_Vendas", "");
    assert.equal(service.relatorioPorSistema("B_Vendas").find((r) => r.cliente === "Anterior").situacao, "Sem referência");
  } finally { cleanup(); }
});

test("Relatório por sistema - data filtra atendimentos sem substituir a oficial", () => {
  const { service, clientes, cleanup } = ambiente();
  try {
    clientes.create({ nome: "Sem Versão Capturada", sistemas: ["B_Vendas"] }, USUARIO);
    service.create({ cliente: "Sem Versão Capturada", sistema: "B_Vendas", data: "05/09/2026" }, USUARIO);
    salvarOficial(clientes, "B_Vendas", "09/09/2026");
    service.create({ cliente: "Sem Versão Capturada", sistema: "B_Vendas", data: "15/09/2026" }, USUARIO);

    // Sem data explícita: usa a referência oficial e compara por versão --
    // como o registro mais recente já carrega "versoes_sistemas", entra
    // "Em dia" (a versão capturada bate com a oficial).
    assert.equal(service.relatorioPorSistema("B_Vendas").find((r) => r.cliente === "Sem Versão Capturada").situacao, "Em dia");

    // O último atendimento de 15/09 não entra no filtro "antes de 09/09".
    assert.equal(service.relatorioPorSistema("B_Vendas", "09/09/2026").length, 0);

    // O filtro 20/09 inclui o atendimento, mas a situação segue pela oficial.
    assert.equal(
      service.relatorioPorSistema("B_Vendas", "20/09/2026").find((r) => r.cliente === "Sem Versão Capturada").situacao,
      "Em dia"
    );
    assert.throws(() => service.relatorioPorSistema("B_Vendas", "31/02/2026"));
  } finally { cleanup(); }
});

test("Versões recebidas permanecem após nova oficial, edição e desfazer", () => {
  const { db, service, clientes, cleanup } = ambiente();
  try {
    clientes.create({ nome: "Loja", sistemas: ["B_NFe", "B_Vendas"] }, USUARIO);
    salvarOficial(clientes, "B_NFe", "22/09/2026");
    salvarOficial(clientes, "B_Vendas", "09/09/2026");
    const criado = service.create({ cliente: "Loja", sistema: "B_NFe, B_Vendas", data: "24/09/2026", responsavel: "Teste" }, USUARIO);
    assert.deepEqual(JSON.parse(criado.versoes_sistemas), { B_NFe: "22/09/2026", B_Vendas: "09/09/2026" });
    const id = ultimoId(db);
    assert.equal(service.situacaoCliente("Loja").find((s) => s.sistema === "B_NFe").situacao, "Em dia");
    salvarOficial(clientes, "B_NFe", "24/09/2026");
    assert.equal(service.situacaoCliente("Loja").find((s) => s.sistema === "B_NFe").situacao, "Desatualizado");
    assert.equal(service.relatorioPorSistema("B_NFe")[0].instalada, "22/09/2026");
    service.update(id, { ...criado, obs: "Corrigida" }, USUARIO);
    assert.equal(db.atualizacoes.find(id).versoes_sistemas, criado.versoes_sistemas);
    const { registros } = service.deleteMany([id], USUARIO);
    service.create({ ...registros[0], restaurarVersoes: true }, USUARIO);
    assert.equal(service.situacaoCliente("Loja").find((s) => s.sistema === "B_NFe").instalada, "22/09/2026");
    service.create({ cliente: "Loja", sistema: "B_NFe", data: "24/09/2026" }, USUARIO);
    assert.equal(service.situacaoCliente("Loja").find((s) => s.sistema === "B_NFe").instalada, "24/09/2026");
    assert.equal(service.relatorioPorSistema("B_NFe")[0].situacao, "Em dia");
    assert.equal(service.situacaoCliente("Loja").find((s) => s.sistema === "B_Vendas").instalada, "09/09/2026");
    const antigo = service.create({ cliente: "Antigo", sistema: "B_NFe", data: "01/09/2026" }, USUARIO);
    assert.equal(JSON.parse(antigo.versoes_sistemas).B_NFe, null);
  } finally { cleanup(); }
});

test("Gráfico mensal e referências recentes ignoram componentes fixos sem apagar atendimentos", () => {
  const { db, service, clientes, cleanup } = ambiente();
  try {
    clientes.create({ nome: "Loja Mista", sistemas: ["B_Vendas", "B_Atualizador"] }, USUARIO);
    clientes.create({ nome: "Loja Fixa", sistemas: ["Suporte Bredas"] }, USUARIO);
    service.create({ cliente: "Loja Mista", sistema: "B_Vendas, B_Atualizador", data: "25/09/2026" }, USUARIO);
    service.create({ cliente: "Loja Fixa", sistema: "Suporte Bredas", data: "25/09/2026" }, USUARIO);
    const grafico = db.atualizacoes.atualizadosNoMesPorSistema("09/2026");
    assert.equal(grafico.find((s) => s.label === "B_Vendas").total, 1);
    assert.ok(!grafico.some((s) => s.label === "B_Atualizador" || s.label === "Suporte Bredas"));
    assert.ok(!service.latestVersionBySystem().some((s) => s.nome === "B_Atualizador" || s.nome === "Suporte Bredas"));
    assert.equal(db.atualizacoes.count(), 2, "ambos os atendimentos continuam no histórico");
  } finally { cleanup(); }
});

test("Relatório por período e Excel respeitam filtros e contam clientes distintos", async () => {
  const { service, clientes, cleanup } = ambiente();
  try {
    salvarOficial(clientes, "B_NFe", "22/09/2026");
    service.create({ cliente: "Loja", sistema: "B_NFe, B_Vendas", data: "24/09/2026", responsavel: "Ana" }, USUARIO);
    service.create({ cliente: "Loja", sistema: "B_NFe", data: "25/09/2026", responsavel: "Ana" }, USUARIO);
    service.create({ cliente: "Outra", sistema: "B_NFe", data: "01/08/2026", responsavel: "Bia" }, USUARIO);
    const periodo = { desde: "01/09/2026", ate: "30/09/2026" };
    const r = service.relatorioPeriodo("", "Ana", periodo);
    assert.equal(r.total, 2);
    assert.equal(r.clientes, 1);
    assert.equal(r.porSistema.find((s) => s.nome === "B_NFe").total, 2);
    assert.equal(r.porSistema.find((s) => s.nome === "B_Vendas").total, 1);
    assert.throws(() => service.relatorioPeriodo("", "Todos", { desde: "30/09/2026", ate: "01/09/2026" }));
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await service.exportXlsxBuffer("", "Ana", periodo));
    assert.equal(workbook.worksheets[0].rowCount, 3);
    assert.ok(workbook.worksheets[0].autoFilter);
    assert.equal(workbook.getWorksheet("Resumo").getCell("B6").value, 2);
  } finally { cleanup(); }
});
