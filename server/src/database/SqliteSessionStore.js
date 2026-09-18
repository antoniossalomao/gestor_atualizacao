const Sqlite3 = require("better-sqlite3");
const session = require("express-session");

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Guarda as sessoes de login num arquivo SQLite proprio (sessions.sqlite,
 * ao lado do gestao.db), usando "better-sqlite3" -- a mesma biblioteca ja
 * usada pelo resto do app.
 *
 * Existe um pacote pronto para isso ("connect-sqlite3"), mas ele depende
 * por baixo do driver "sqlite3" (que precisa compilar codigo C++ na
 * instalacao via node-gyp) e essa cadeia de dependencias tinha
 * vulnerabilidades conhecidas nas ferramentas de build (`tar`,
 * `make-fetch-happen`) no momento em que este projeto foi criado. Como o
 * app ja depende de "better-sqlite3" (que tem binarios pre-compilados,
 * sem precisar de ferramentas de compilacao no Windows) e a logica de um
 * "cofre de sessoes" e simples (guardar/ler/apagar um texto por chave),
 * escrever esta classe propria e mais seguro e mais leve do que trazer
 * mais uma dependencia externa so para isso.
 *
 * Estende `session.Store` (do proprio express-session) e implementa os tres
 * metodos que ele exige: get, set e destroy -- e' o "contrato" que
 * qualquer session store precisa seguir para o express-session conseguir
 * usa-lo.
 */
class SqliteSessionStore extends session.Store {
  /** @param {{filePath: string}} options caminho do arquivo sessions.sqlite */
  constructor({ filePath }) {
    super();
    this.conn = new Sqlite3(filePath);
    this.conn.pragma("journal_mode = WAL");
    this.conn.exec(`
      CREATE TABLE IF NOT EXISTS sessoes (
        sid TEXT PRIMARY KEY,
        dados TEXT NOT NULL,
        expira_em INTEGER NOT NULL
      )
    `);
    // Limpa sessoes ja expiradas de execucoes anteriores do servidor, para
    // o arquivo nao crescer para sempre com "lixo" de sessoes vencidas.
    this._limparExpiradas();
  }

  /** Le a sessao gravada para `sid`; devolve null se nao existir ou ja tiver expirado. */
  get(sid, callback) {
    try {
      const row = this.conn.prepare("SELECT dados, expira_em FROM sessoes WHERE sid = ?").get(sid);
      if (!row || row.expira_em < Date.now()) {
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.dados));
    } catch (err) {
      callback(err);
    }
  }

  /** Grava (cria ou substitui) os dados da sessao `sid`. */
  set(sid, sessionData, callback) {
    try {
      const maxAge = sessionData.cookie && sessionData.cookie.maxAge ? sessionData.cookie.maxAge : UM_DIA_MS;
      const expiraEm = Date.now() + maxAge;
      this.conn
        .prepare(
          `INSERT INTO sessoes (sid, dados, expira_em) VALUES (@sid, @dados, @expiraEm)
           ON CONFLICT(sid) DO UPDATE SET dados = excluded.dados, expira_em = excluded.expira_em`
        )
        .run({ sid, dados: JSON.stringify(sessionData), expiraEm });
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  /** Apaga a sessao (logout, ou sessao expirada). */
  destroy(sid, callback) {
    try {
      this.conn.prepare("DELETE FROM sessoes WHERE sid = ?").run(sid);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  /** Invalida todas as sessões ativas (usado após restauração do banco de dados). */
  clearAll(callback) {
    try {
      this.conn.prepare("DELETE FROM sessoes").run();
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  /** Renova o prazo de expiracao quando o usuario continua ativo (chamado pelo express-session). */
  touch(sid, sessionData, callback) {
    this.set(sid, sessionData, callback);
  }

  _limparExpiradas() {
    try {
      this.conn.prepare("DELETE FROM sessoes WHERE expira_em < ?").run(Date.now());
    } catch {
      // nao impede o servidor de subir por causa de uma limpeza que falhou
    }
  }
}

module.exports = { SqliteSessionStore };
