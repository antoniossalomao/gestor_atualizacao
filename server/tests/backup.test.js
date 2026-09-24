/*
 * Testes do BackupService -- o unico caminho do sistema que SUBSTITUI o banco
 * inteiro, e o unico que a tela nao deixa desfazer.
 *
 * O que esta sob teste aqui nao e' a copia de arquivo em si (isso e' do
 * Database), e sim as quatro travas que existem para que ninguem restaure um
 * backup por engano:
 *
 *   1. so administrador;
 *   2. a palavra "RESTAURAR", digitada exatamente assim;
 *   3. a senha da propria conta, conferida contra o hash;
 *   4. todas as sessoes ativas invalidadas depois.
 *
 * As tres primeiras protegem contra engano e contra sessao esquecida aberta.
 * A quarta protege contra INCONSISTENCIA: uma sessao criada depois do backup
 * aponta para um usuario que pode nao existir no banco restaurado.
 *
 * `security.test.js` ja cobre parte disso pelo angulo de permissao; aqui o
 * foco e' o efeito no disco e a ordem em que as travas sao aplicadas.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Database } = require("../src/database/Database");
const { HistoricoService } = require("../src/services/HistoricoService");
const { AuthService } = require("../src/services/AuthService");
const { BackupService } = require("../src/services/BackupService");

const SENHA = "senha-de-teste-123";

function ambiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-bkp-"));
  const db = new Database(path.join(tmpDir, "gestao.db"));
  const historico = new HistoricoService(db);
  const auth = new AuthService(db, historico);
  const admin = { ...auth.setupAdmin({ nome: "Admin", usuario: "admin", senha: SENHA }), usuario: "admin" };

  const sessoesLimpas = { vezes: 0 };
  const sessionStore = { clearAll: () => void (sessoesLimpas.vezes += 1) };
  const service = new BackupService(db, historico, sessionStore);

  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, service, auth, admin, sessoesLimpas, tmpDir, cleanup };
}

/** Cria um backup de verdade e devolve o nome do arquivo. */
function criarBackup(env) {
  env.db._backup();
  const lista = env.service.list();
  assert.ok(lista.length > 0, "o backup deveria ter sido criado");
  return lista[0].arquivo;
}

test("BackupService - listar e localizar", async (t) => {
  const env = ambiente();
  try {
    await t.test("banco recém-criado ainda não tem backup", () => {
      // O Database só copia ao abrir um banco que JÁ EXISTIA (`if (jaExistia)`):
      // não há sentido em guardar cópia de um arquivo vazio recém-criado.
      assert.deepEqual(env.service.list(), []);
    });

    await t.test("depois de uma cópia, ela aparece na lista", () => {
      criarBackup(env);
      const lista = env.service.list();
      assert.equal(lista.length, 1);
      assert.ok(lista[0].arquivo.endsWith(".db"));
      assert.equal(typeof lista[0].tamanhoBytes, "number");
      assert.match(lista[0].label, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/);
    });

    await t.test("duas cópias no mesmo segundo não viram uma só", () => {
      // Regressão: o carimbo do nome tem resolução de segundos, e
      // `copyFileSync` sobrescreve sem avisar. O caminho perigoso é o
      // `restoreFrom`, que faz uma cópia de segurança logo antes de restaurar
      // -- ela podia apagar, em silêncio, um backup do mesmo segundo.
      const antes = env.service.list().length;
      env.db._backup();
      env.db._backup();
      const depois = env.service.list();
      assert.equal(depois.length, antes + 2, "cada cópia é um arquivo próprio");
      assert.equal(new Set(depois.map((b) => b.arquivo)).size, depois.length, "nomes distintos");
      assert.ok(
        depois.every((b) => /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}( \(\d+\))?$/.test(b.label)),
        "e o rótulo continua legível, com (2)/(3) para desempatar"
      );
    });

    await t.test("baixar um backup que não existe dá 404", () => {
      // O nome vem da URL. Sem a checagem contra a lista, seria um jeito de
      // pedir qualquer arquivo do servidor pelo nome.
      for (const ruim of ["nao-existe.db", "../gestao.db", "../../.env", ""]) {
        assert.throws(() => env.service.getBackupPath(ruim), /não encontrado/i, ruim);
      }
    });

    await t.test("baixar um backup que existe devolve o caminho", () => {
      const arquivo = criarBackup(env);
      const caminho = env.service.getBackupPath(arquivo);
      assert.ok(fs.existsSync(caminho));
      assert.equal(path.basename(caminho), arquivo);
    });

    await t.test("o banco atual também pode ser baixado", () => {
      // É o "baixe antes de mexer" que o runbook manda fazer.
      assert.ok(fs.existsSync(env.service.getCurrentDbPath()));
    });
  } finally {
    env.cleanup();
  }
});

test("BackupService - as quatro travas da restauração", async (t) => {
  const env = ambiente();
  try {
    const arquivo = criarBackup(env);

    await t.test("1. quem não é admin não restaura", () => {
      for (const quem of [null, undefined, { role: "operador" }, { role: "consulta" }, {}]) {
        assert.throws(
          () => env.service.restore(arquivo, quem, { senha: SENHA, confirmacao: "RESTAURAR" }),
          /Apenas administradores/
        );
      }
    });

    await t.test("2. a confirmação tem que ser exatamente RESTAURAR", () => {
      // Maiúsculas e palavra exata de propósito: a ideia é que seja
      // impossível fazer por reflexo, sem ler a tela.
      for (const ruim of ["restaurar", "Restaurar", "RESTAURAR!", "SIM", "", undefined]) {
        assert.throws(
          () => env.service.restore(arquivo, env.admin, { senha: SENHA, confirmacao: ruim }),
          /Confirmação inválida/,
          JSON.stringify(ruim)
        );
      }
      // Espaço em volta é tolerado: é erro de digitação, não falta de intenção.
      assert.doesNotThrow(() =>
        env.service.restore(arquivo, env.admin, { senha: SENHA, confirmacao: "  RESTAURAR  " })
      );
    });

    await t.test("3. a senha da própria conta é exigida e conferida", () => {
      assert.throws(
        () => env.service.restore(arquivo, env.admin, { confirmacao: "RESTAURAR" }),
        /Informe sua senha atual/
      );
      assert.throws(
        () => env.service.restore(arquivo, env.admin, { senha: "senha-errada", confirmacao: "RESTAURAR" }),
        /Senha de administrador incorreta/
      );
    });

    await t.test("a senha é conferida contra o HASH, não contra o texto", () => {
      // Sanidade: se a comparação fosse de texto puro, a senha estaria
      // gravada em claro no banco -- e este teste passaria por acidente.
      const linha = env.db.usuarios.findByUsuario("admin");
      assert.notEqual(linha.senha_hash, SENHA);
      assert.match(linha.senha_hash, /^\$2[aby]\$/, "é um hash bcrypt");
    });

    await t.test("4. sessões ativas são invalidadas ao restaurar", () => {
      // Uma sessão criada depois do backup aponta para um usuário que pode
      // não existir no banco restaurado. Manter a sessão viva daria uma tela
      // funcionando "por cima" de dados que não a conhecem.
      const antes = env.sessoesLimpas.vezes;
      env.service.restore(arquivo, env.admin, { senha: SENHA, confirmacao: "RESTAURAR" });
      assert.equal(env.sessoesLimpas.vezes, antes + 1);
    });

    await t.test("backup inexistente é recusado mesmo com tudo certo", () => {
      assert.throws(
        () => env.service.restore("nao-existe.db", env.admin, { senha: SENHA, confirmacao: "RESTAURAR" }),
        /não encontrado/i
      );
    });
  } finally {
    env.cleanup();
  }
});

test("BackupService - efeito da restauração", async (t) => {
  const env = ambiente();
  try {
    await t.test("os dados voltam ao estado do backup", () => {
      // O teste de ponta a ponta: grava, faz backup, grava mais, restaura, e
      // confere que o segundo registro sumiu e o primeiro ficou.
      env.db.clientes.insert("C001", "Antes do backup", "", [], "");
      const arquivo = criarBackup(env);

      env.db.clientes.insert("C002", "Depois do backup", "", [], "");
      assert.ok(env.db.clientes.getByNome("Depois do backup"), "existe antes de restaurar");

      env.service.restore(arquivo, env.admin, { senha: SENHA, confirmacao: "RESTAURAR" });

      assert.ok(env.db.clientes.getByNome("Antes do backup"), "o que estava no backup continua");
      assert.equal(env.db.clientes.getByNome("Depois do backup"), null, "o que veio depois foi descartado");
    });

    await t.test("uma cópia de segurança do estado ANTERIOR é guardada", () => {
      // Restaurar é o que a tela não deixa desfazer -- então o próprio serviço
      // guarda uma cópia do que existia antes, para dar para voltar atrás na
      // mão se a restauração tiver sido a errada.
      const nomes = env.service.list().map((b) => b.arquivo);
      assert.ok(nomes.length >= 2, "além do backup restaurado, há a cópia pré-restauração");
    });

    await t.test("a restauração fica registrada no histórico", () => {
      // Gravado no banco JÁ restaurado: é a primeira coisa que alguém procura
      // ao investigar "por que os dados de ontem sumiram?".
      const eventos = env.db.historico.list({ page: 1, pageSize: 50 }).rows;
      const restauracao = eventos.find((e) => e.acao === "restaurar_backup");
      assert.ok(restauracao, "tem que existir");
      assert.equal(restauracao.usuario_nome, "Admin", "e dizer quem fez");
      assert.match(restauracao.descricao, /confirmação de segurança/);
    });

    await t.test("o banco continua utilizável depois de restaurar", () => {
      // A conexão é fechada e reaberta no meio do processo. Se a reabertura
      // falhasse, o servidor ficaria de pé respondendo erro em tudo.
      assert.doesNotThrow(() => env.db.clientes.insert("C003", "Depois de restaurar", "", [], ""));
      assert.ok(env.db.clientes.getByNome("Depois de restaurar"));
    });
  } finally {
    env.cleanup();
  }
});

test("BackupService - sem session store configurado", async (t) => {
  await t.test("restaurar não quebra se o store não tiver sido ligado", () => {
    // O store é injetado depois da construção (setSessionStore, chamado pelo
    // Server). Um caminho que construa o serviço sem ele -- um script, um
    // teste -- não pode explodir na hora de restaurar.
    const env = ambiente();
    try {
      const semStore = new BackupService(env.db, new HistoricoService(env.db));
      const arquivo = criarBackup(env);
      assert.doesNotThrow(() => semStore.restore(arquivo, env.admin, { senha: SENHA, confirmacao: "RESTAURAR" }));
    } finally {
      env.cleanup();
    }
  });
});
