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

  /** Invalida todas as sessões ativas de um usuário específico.
   *
   * Usa `json_extract` do SQLite para filtrar pelo `user.id` gravado dentro
   * do JSON de cada sessão -- mais cirúrgico que `clearAll` (que derruba
   * todos os usuários) e correto porque a estrutura do JSON é controlada por
   * nós (ver `set` acima e `AuthController._iniciarSessao`).
   * Chamado por `AuthService.changePassword` para revogar sessões abertas em
   * outros navegadores/dispositivos após uma troca de senha, e por
   * `updateUser`/`deleteUser` quando o papel muda ou a conta some -- o papel
   * que as rotas conferem é o copiado para a sessão no login.
   *
   * `userId` tem que chegar como NÚMERO: `json_extract` devolve inteiro, e
   * no SQLite `5 = '5'` é falso aqui (a expressão não tem afinidade de tipo).
   * Com um id em texto, a exclusão não casaria nada e nenhum erro apareceria.
   * @param {number} userId
   */
  clearByUserId(userId) {
    try {
      this.conn.prepare("DELETE FROM sessoes WHERE json_extract(dados, '$.user.id') = ?").run(userId);
    } catch {
      // Não impede a troca de senha se a limpeza falhar -- o pior caso é uma
      // sessão antiga sobreviver até expirar naturalmente (maxAge de 7 dias).
    }
  }

  /**
   * As sessões ainda válidas de um usuário, para Configurações > Conta mostrar
   * em que aparelhos a conta está aberta. Mesmo cuidado de `clearByUserId`
   * com o tipo do id: tem que chegar como número.
   * @param {number} userId
   * @returns {Array<{sid: string, dados: any, expiraEm: number}>}
   */
  listByUserId(userId) {
    return this.conn
      .prepare("SELECT sid, dados, expira_em FROM sessoes WHERE json_extract(dados, '$.user.id') = ? AND expira_em >= ?")
      .all(userId, Date.now())
      .map((row) => ({ sid: row.sid, dados: JSON.parse(row.dados), expiraEm: row.expira_em }));
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

  /**
   * Fecha o arquivo de sessoes. Chamado por Server.stop() -- sem isto, o
   * handle do SQLite fica aberto depois do servidor "parar": em producao
   * apenas atrasa a liberacao do arquivo, mas num teste que sobe e derruba
   * o servidor num diretorio temporario o Windows recusa apagar a pasta
   * com EBUSY (foi exatamente assim que a falta deste metodo apareceu).
   */
  close() {
    try {
      this.conn.close();
    } catch {
      /* ja fechado -- fechar duas vezes nao deve derrubar o encerramento */
    }
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
