/*
 * Testes do HistoricoService (trilha de auditoria) e do PreferenciaService.
 *
 * **Historico** e' o unico registro de quem fez o que. Se ele parar de gravar,
 * nada quebra: as telas continuam funcionando e so a auditoria fica vazia --
 * o que so se descobre no dia em que alguem precisa dela. O detalhe que mais
 * importa e' o registro de acao feita SEM usuario logado (o agente C#, uma
 * rotina interna): tem que virar "Sistema", nao sumir nem quebrar.
 *
 * **Preferencias** aceitam CHAVE livre de proposito -- quem acrescenta uma
 * opcao nova no painel nao deveria mexer no backend. O backend garante so que
 * o que entra e' pequeno e simples. Sem esse limite, a tabela de preferencias
 * vira deposito de qualquer coisa que uma conta queira guardar.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Database } = require("../src/database/Database");
const { HistoricoService } = require("../src/services/HistoricoService");
const { PreferenciaService } = require("../src/services/PreferenciaService");
const { AuthService } = require("../src/services/AuthService");

function ambiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-hist-"));
  const db = new Database(path.join(tmpDir, "gestao.db"));
  const historico = new HistoricoService(db);
  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, historico, prefs: new PreferenciaService(db), auth: new AuthService(db, historico), cleanup };
}

test("HistoricoService - registrar", async (t) => {
  const env = ambiente();
  try {
    await t.test("grava quem, o quê e sobre o quê", () => {
      env.historico.registrar({ id: 7, nome: "Camila" }, "criar", "cliente", 'Cliente "Acme"');
      const linha = env.db.historico.list({ page: 1, pageSize: 1 }).rows[0];
      assert.equal(linha.usuario_id, 7);
      assert.equal(linha.usuario_nome, "Camila");
      assert.equal(linha.acao, "criar");
      assert.equal(linha.entidade, "cliente");
      assert.match(linha.descricao, /Acme/);
    });

    await t.test("ação sem usuário logado vira 'Sistema', não some", () => {
      // Acontece de verdade: rotinas internas e ações disparadas pelo agente
      // C# não têm sessão de navegador. Registrar como "Sistema" mantém a
      // trilha completa -- deixar em branco (ou pular) abriria um buraco
      // exatamente nas ações automáticas, que são as menos observadas.
      for (const semUsuario of [null, undefined]) {
        env.historico.registrar(semUsuario, "atualizar", "agente", "Rotina automática");
        const linha = env.db.historico.list({ page: 1, pageSize: 1 }).rows[0];
        assert.equal(linha.usuario_nome, "Sistema");
        assert.equal(linha.usuario_id, null);
      }
    });

    await t.test("vem do mais recente para o mais antigo", () => {
      // A auditoria é lida de trás para frente: "o que aconteceu agora há
      // pouco?" é a pergunta de quem abre a tela.
      env.historico.registrar({ id: 1, nome: "A" }, "criar", "cliente", "Primeiro");
      env.historico.registrar({ id: 1, nome: "A" }, "criar", "cliente", "Segundo");
      const linhas = env.db.historico.list({ page: 1, pageSize: 2 }).rows;
      assert.equal(linhas[0].descricao, "Segundo");
    });

    await t.test("filtra por entidade", () => {
      const env2 = ambiente();
      try {
        env2.historico.registrar({ id: 1, nome: "A" }, "criar", "cliente", "Um cliente");
        env2.historico.registrar({ id: 1, nome: "A" }, "criar", "atualizacao", "Uma atualização");

        const so = env2.historico.list({ page: 1, pageSize: 50, entidade: "cliente" });
        assert.equal(so.total, 1);
        assert.equal(so.rows[0].entidade, "cliente");

        assert.equal(env2.historico.list({ page: 1, pageSize: 50 }).total, 2, "'Todos' é o padrão");
      } finally {
        env2.cleanup();
      }
    });

    await t.test("busca por texto da descrição", () => {
      const r = env.historico.list({ page: 1, pageSize: 50, search: "Acme" });
      assert.ok(r.total >= 1);
      assert.ok(r.rows.every((l) => /Acme/i.test(l.descricao) || /Acme/i.test(l.usuario_nome)));
    });

    await t.test("registra a data em ISO, para ordenar sem ambiguidade", () => {
      const linha = env.db.historico.list({ page: 1, pageSize: 1 }).rows[0];
      assert.ok(linha.criado_em, "toda linha tem quando");
      assert.ok(!Number.isNaN(Date.parse(linha.criado_em)), "e é uma data que o JS entende");
    });
  } finally {
    env.cleanup();
  }
});

test("PreferenciaService - identificação da conta", async (t) => {
  const env = ambiente();
  try {
    await t.test("sessão sem usuário identificado é recusada", () => {
      // Sem isto, uma requisição sem sessão gravaria preferências "do usuário
      // undefined" -- que ninguém consegue ler de volta, e que ficam no banco
      // para sempre.
      for (const ruim of [null, undefined, {}, { id: 0 }, { id: -1 }, { id: "abc" }, { id: 1.5 }]) {
        assert.throws(() => env.prefs.ler(ruim), /Sessão sem usuário/, JSON.stringify(ruim));
      }
    });
  } finally {
    env.cleanup();
  }
});

test("PreferenciaService - o que pode ser guardado", async (t) => {
  const env = ambiente();
  try {
    const usuario = env.auth.setupAdmin({
      nome: "Admin",
      usuario: "admin",
      senha: "senha-de-teste-123",
    });

    await t.test("guarda e devolve texto, número, booleano e nulo", () => {
      const salvo = env.prefs.salvar(usuario, {
        tema: "escuro",
        linhasPorPagina: 50,
        animacoes: false,
        abaInicial: null,
      });
      assert.deepEqual(salvo, { tema: "escuro", linhasPorPagina: 50, animacoes: false, abaInicial: null });
      assert.deepEqual(env.prefs.ler(usuario), salvo, "o que foi salvo é o que volta");
    });

    await t.test("aceita chave que o backend nunca viu", () => {
      // De propósito: quem acrescenta uma opção nova no painel de
      // Configurações não deveria precisar mexer no servidor para ela passar
      // a acompanhar a conta.
      const salvo = env.prefs.salvar(usuario, { opcaoInventadaHoje: "sim" });
      assert.equal(salvo.opcaoInventadaHoje, "sim");
    });

    await t.test("grava o conjunto INTEIRO, não mescla", () => {
      // A tela aplica tudo junto no arranque, então salvar é substituir. Se
      // mesclasse, uma preferência removida da interface ficaria no banco
      // para sempre, sem jeito de apagar.
      env.prefs.salvar(usuario, { tema: "claro" });
      assert.deepEqual(env.prefs.ler(usuario), { tema: "claro" });
    });

    await t.test("recusa o que não é objeto", () => {
      for (const ruim of [null, undefined, "texto", 42, [1, 2, 3]]) {
        assert.throws(() => env.prefs.salvar(usuario, ruim), /precisam vir como um objeto/, JSON.stringify(ruim));
      }
    });

    await t.test("recusa valor aninhado, que cresceria sem limite", () => {
      assert.throws(() => env.prefs.salvar(usuario, { x: { y: 1 } }), /texto, número ou sim\/não/);
      assert.throws(() => env.prefs.salvar(usuario, { x: [1, 2] }), /texto, número ou sim\/não/);
      assert.throws(() => env.prefs.salvar(usuario, { x: NaN }), /texto, número ou sim\/não/);
      assert.throws(() => env.prefs.salvar(usuario, { x: Infinity }), /texto, número ou sim\/não/);
    });

    await t.test("recusa texto longo demais", () => {
      assert.throws(() => env.prefs.salvar(usuario, { x: "a".repeat(201) }), /longo demais/);
      assert.doesNotThrow(() => env.prefs.salvar(usuario, { x: "a".repeat(200) }), "o limite em si passa");
    });

    await t.test("recusa chaves demais: a tabela não é depósito", () => {
      const demais = Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`k${i}`, 1]));
      assert.throws(() => env.prefs.salvar(usuario, demais), /Preferências demais/);
    });

    await t.test("conta sem preferências devolve vazio, não erro", () => {
      const outro = env.auth.createUser(
        { nome: "Outro", usuario: "outro", senha: "senha-de-teste-123", role: "operador" },
        { ...usuario, role: "admin" }
      );
      assert.deepEqual(env.prefs.ler(outro), {});
    });

    await t.test("as preferências de uma conta não vazam para outra", () => {
      const outro = env.db.usuarios.findByUsuario("outro");
      env.prefs.salvar({ id: outro.id }, { tema: "escuro" });
      assert.deepEqual(env.prefs.ler(usuario), { x: "a".repeat(200) }, "a do admin continua a dele");
    });
  } finally {
    env.cleanup();
  }
});
