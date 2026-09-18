/*
 * Testes do fluxo de autenticacao: primeiro acesso, login e troca de senha.
 *
 * `security.test.js` cobre este servico pelo angulo das PERMISSOES (quem pode
 * criar conta, quem pode rebaixar quem). Aqui o foco e' o outro lado: a porta
 * de entrada em si.
 *
 * Duas propriedades merecem teste explicito porque sao faceis de quebrar sem
 * que nada pareca errado:
 *
 *  - **a mensagem de erro do login nao diz o que estava errado.** Se ela
 *    passar a distinguir "usuario nao existe" de "senha incorreta", vira um
 *    oraculo: da para descobrir quais contas existem so testando nomes. O
 *    login continuaria funcionando perfeitamente, e ninguem notaria.
 *  - **trocar a senha exige a senha ATUAL**, nao basta estar logado. A sessao
 *    pode ter ficado aberta num computador que nao e' o da pessoa, e trocar a
 *    senha sem confirmar trancaria o dono de verdade para fora.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const bcrypt = require("bcryptjs");

const { Database } = require("../src/database/Database");
const { HistoricoService } = require("../src/services/HistoricoService");
const { AuthService } = require("../src/services/AuthService");

const SENHA = "senha-de-teste-123";

function ambiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-auth-"));
  const db = new Database(path.join(tmpDir, "gestao.db"));
  const auth = new AuthService(db, new HistoricoService(db));
  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, auth, cleanup };
}

test("AuthService - primeiro acesso", async (t) => {
  const env = ambiente();
  try {
    await t.test("banco vazio pede configuração inicial", () => {
      assert.equal(env.auth.needsSetup(), true);
    });

    await t.test("o primeiro usuário nasce administrador", () => {
      // Sem isso, o banco ficaria sem nenhum admin e a tela de Usuários seria
      // inalcançável -- a única saída seria mexer no banco à mão.
      const admin = env.auth.setupAdmin({ nome: "Admin", usuario: "admin", senha: SENHA });
      assert.equal(admin.role, "admin");
      assert.equal(env.auth.needsSetup(), false);
    });

    await t.test("o setup já registra o primeiro acesso", () => {
      // `setupAdmin` cria a sessão direto, sem passar por `login()` -- que é
      // onde `ultimo_login` normalmente é gravado. Sem isto, a tela de
      // Usuários mostraria "Nunca acessou" para quem está olhando a tela
      // naquele exato momento.
      assert.ok(env.db.usuarios.findByUsuario("admin").ultimo_login);
    });

    await t.test("rodar o setup de novo é recusado", () => {
      assert.throws(
        () => env.auth.setupAdmin({ nome: "Outro", usuario: "outro", senha: SENHA }),
        /use a tela de login/
      );
    });

    await t.test("a senha nunca é guardada em texto", () => {
      const linha = env.db.usuarios.findByUsuario("admin");
      assert.equal(linha.senha, undefined, "não existe coluna de senha em claro");
      assert.notEqual(linha.senha_hash, SENHA);
      assert.match(linha.senha_hash, /^\$2[aby]\$/, "é bcrypt");
    });
  } finally {
    env.cleanup();
  }
});

test("AuthService - login", async (t) => {
  const env = ambiente();
  try {
    env.auth.setupAdmin({ nome: "Admin", usuario: "admin", senha: SENHA });

    await t.test("credenciais corretas devolvem a conta, sem o hash", () => {
      const u = env.auth.login("admin", SENHA);
      assert.equal(u.usuario, "admin");
      assert.equal(u.nome, "Admin");
      assert.equal(u.role, "admin");
      assert.equal(u.senha_hash, undefined, "o hash não pode ir para a sessão nem para a resposta");
    });

    await t.test("a MESMA mensagem para usuário inexistente e senha errada", () => {
      // Este é o ponto: mensagens diferentes transformariam o login num
      // oráculo de "quais contas existem aqui". As duas têm que ser idênticas,
      // caractere por caractere.
      let erroUsuario, erroSenha;
      try {
        env.auth.login("nao-existe", SENHA);
      } catch (e) {
        erroUsuario = e.message;
      }
      try {
        env.auth.login("admin", "senha-errada");
      } catch (e) {
        erroSenha = e.message;
      }
      assert.equal(erroUsuario, erroSenha);
      assert.match(erroUsuario, /Usuário ou senha inválidos/);
    });

    await t.test("senha vazia, nula ou ausente não passa", () => {
      for (const ruim of ["", null, undefined]) {
        assert.throws(() => env.auth.login("admin", ruim), /inválidos/, JSON.stringify(ruim));
      }
    });

    await t.test("usuário vazio ou nulo não passa", () => {
      for (const ruim of ["", "   ", null, undefined]) {
        assert.throws(() => env.auth.login(ruim, SENHA), /inválidos/, JSON.stringify(ruim));
      }
    });

    await t.test("espaço em volta do usuário é tolerado", () => {
      // Erro de digitação (ou preenchimento automático do navegador), não
      // tentativa de burlar nada.
      assert.doesNotThrow(() => env.auth.login("  admin  ", SENHA));
    });

    await t.test("o nome de usuário diferencia maiúsculas", () => {
      // Comportamento atual, fixado aqui de propósito: se um dia passar a ser
      // insensível a caixa, este teste avisa -- é a diferença entre "ADMIN" e
      // "admin" serem a mesma conta ou duas.
      assert.throws(() => env.auth.login("ADMIN", SENHA), /inválidos/);
    });

    await t.test("o login registra quando aconteceu", () => {
      const antes = env.db.usuarios.findByUsuario("admin").ultimo_login;
      env.auth.login("admin", SENHA);
      const depois = env.db.usuarios.findByUsuario("admin").ultimo_login;
      assert.ok(depois >= antes);
    });

    await t.test("tentativa falha NÃO atualiza o último acesso", () => {
      // Senão a tela de Usuários mostraria "acessou agora há pouco" para uma
      // conta que ninguém conseguiu abrir -- exatamente ao contrário do que
      // interessa a quem está investigando.
      const antes = env.db.usuarios.findByUsuario("admin").ultimo_login;
      assert.throws(() => env.auth.login("admin", "errada"));
      assert.equal(env.db.usuarios.findByUsuario("admin").ultimo_login, antes);
    });
  } finally {
    env.cleanup();
  }
});

test("AuthService - troca de senha", async (t) => {
  const env = ambiente();
  try {
    const admin = env.auth.setupAdmin({ nome: "Admin", usuario: "admin", senha: SENHA });
    const logado = { ...admin, usuario: "admin" };

    await t.test("exige a senha ATUAL, não basta estar logado", () => {
      // A sessão pode ter ficado aberta num computador que não é o da pessoa.
      assert.throws(() => env.auth.changePassword(logado, "errada", "nova-senha-123"), /Senha atual incorreta/);
      assert.throws(() => env.auth.changePassword(logado, "", "nova-senha-123"), /Senha atual incorreta/);
      assert.throws(() => env.auth.changePassword(logado, null, "nova-senha-123"), /Senha atual incorreta/);
    });

    await t.test("a nova senha tem tamanho mínimo", () => {
      for (const curta of ["", "abc", "12345", null, undefined]) {
        assert.throws(() => env.auth.changePassword(logado, SENHA, curta), /pelo menos/, JSON.stringify(curta));
      }
    });

    await t.test("troca funcionando: a nova entra, a antiga sai", () => {
      const NOVA = "uma-senha-nova-123";
      env.auth.changePassword(logado, SENHA, NOVA);

      assert.doesNotThrow(() => env.auth.login("admin", NOVA), "a nova senha entra");
      assert.throws(() => env.auth.login("admin", SENHA), /inválidos/, "a antiga não entra mais");
    });

    await t.test("a nova senha também é guardada como hash", () => {
      const linha = env.db.usuarios.findByUsuario("admin");
      assert.notEqual(linha.senha_hash, "uma-senha-nova-123");
      assert.ok(bcrypt.compareSync("uma-senha-nova-123", linha.senha_hash));
    });

    await t.test("a troca fica registrada no histórico", () => {
      const eventos = env.db.historico.list({ page: 1, pageSize: 50 }).rows;
      const troca = eventos.find((e) => /Senha de .* alterada/.test(e.descricao));
      assert.ok(troca, "quem investiga um acesso indevido precisa ver isto");
      assert.equal(troca.entidade, "usuario");
    });

    await t.test("conta excluída no meio do caminho dá erro claro", () => {
      // Acontece se outra pessoa apagou a conta entre a sessão abrir e o
      // pedido chegar. Sem a checagem, o bcrypt receberia null e o erro seria
      // um 500 sem explicação.
      assert.throws(
        () => env.auth.changePassword({ id: 999, usuario: "fantasma" }, SENHA, "outra-senha-123"),
        /Faça login novamente/
      );
    });
  } finally {
    env.cleanup();
  }
});
