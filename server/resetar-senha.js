/**
 * Redefine a senha de uma conta existente direto no banco, sem passar pelo
 * login -- o caminho de recuperação para quando ninguém mais consegue
 * entrar (ex.: o único administrador esqueceu a senha). Não existia
 * nenhum jeito de recuperar acesso antes deste script: a tela de Usuários
 * só deixa trocar senha de quem já está logado.
 *
 * Só funciona com acesso ao arquivo do banco (rodando no próprio servidor,
 * ou com uma cópia do gestao.db em mãos) -- de propósito: sem um serviço de
 * e-mail configurado (este projeto não tem SMTP nem nada parecido), "quem
 * consegue chegar no arquivo do banco" é o único fator de recuperação que
 * faz sentido pra um sistema interno de rede local.
 *
 * Uso (a partir da pasta web/server):
 *   node resetar-senha.js <usuario> "<nova senha>"
 *
 * Exemplo:
 *   node resetar-senha.js admin "uma-senha-nova-com-pelo-menos-8-chars"
 */
require("dotenv").config({ quiet: true });
const path = require("path");
const Sqlite3 = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 10;
// Mantido em sincronia com AuthService.js -- ambos precisam refletir o mesmo
// mínimo para que o script de recuperação de emergência não aceite senhas que
// a API rejeitaria de qualquer forma.
const SENHA_MIN_LENGTH = 8;

const [, , usuarioArg, senhaArg] = process.argv;

if (!usuarioArg || !senhaArg) {
  console.error('Uso: node resetar-senha.js <usuario> "<nova senha>"');
  process.exit(1);
}
if (senhaArg.length < SENHA_MIN_LENGTH) {
  console.error(`A nova senha precisa ter pelo menos ${SENHA_MIN_LENGTH} caracteres.`);
  process.exit(1);
}

const dbPath = path.resolve(__dirname, process.env.DB_PATH || "./data/gestao.db");
const conn = new Sqlite3(dbPath);

try {
  const usuario = conn.prepare("SELECT id, nome, usuario FROM usuarios WHERE usuario = ?").get(usuarioArg);
  if (!usuario) {
    const existentes = conn.prepare("SELECT usuario FROM usuarios ORDER BY usuario").all().map((u) => u.usuario);
    console.error(`Nenhuma conta encontrada com o usuário "${usuarioArg}".`);
    console.error(existentes.length ? `Contas existentes: ${existentes.join(", ")}` : "Não há nenhuma conta cadastrada ainda.");
    process.exit(1);
  }

  const hash = bcrypt.hashSync(senhaArg, SALT_ROUNDS);
  conn.prepare("UPDATE usuarios SET senha_hash = ? WHERE id = ?").run(hash, usuario.id);
  console.log(`Senha de "${usuario.nome}" (@${usuario.usuario}) redefinida com sucesso.`);
  console.log("Já dá para entrar no sistema com a senha nova.");
} finally {
  conn.close();
}
