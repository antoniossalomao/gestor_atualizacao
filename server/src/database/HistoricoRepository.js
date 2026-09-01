const { buildOrderBy } = require("./sortHelper");

/** Colunas que a tela pode pedir para ordenar, e a expressao SQL segura correspondente. */
const SORT_MAP = {
  usuario_nome: "usuario_nome COLLATE NOCASE",
  acao: "acao COLLATE NOCASE",
  entidade: "entidade COLLATE NOCASE",
  descricao: "descricao COLLATE NOCASE",
  criado_em: "criado_em",
};

/**
 * Histórico de ações (quem criou/editou/excluiu o quê, e quando).
 * Tabela nova, sem equivalente no app Python original -- lá o uso era
 * individual, então "quem fez" era sempre a mesma pessoa e não precisava
 * ser registrado.
 *
 * Diferente dos outros repositórios, este não herda de BaseRepository:
 * histórico é um registro de fatos que já aconteceram -- não faz sentido
 * "editar" ou "excluir" uma entrada dele pela aplicação (só inserir e
 * listar), então os métodos genéricos delete/count de lá não se aplicam
 * aqui.
 */
class HistoricoRepository {
  /** @param {import('better-sqlite3').Database} conn */
  constructor(conn) {
    this.conn = conn;
  }

  /**
   * Registra uma ação. `usuarioId` pode ser null (ex.: ação automática do
   * próprio sistema, sem usuário associado).
   */
  registrar({ usuarioId, usuarioNome, acao, entidade, descricao }) {
    this.conn
      .prepare(
        `INSERT INTO historico (usuario_id, usuario_nome, acao, entidade, descricao, criado_em)
         VALUES (@usuarioId, @usuarioNome, @acao, @entidade, @descricao, @criadoEm)`
      )
      .run({ usuarioId: usuarioId ?? null, usuarioNome, acao, entidade, descricao, criadoEm: new Date().toISOString() });
  }

  /**
   * Página de entradas, mais recentes primeiro. `entidade` filtra por tipo
   * de registro ("cliente", "atualizacao", ...); "Todos" (padrão) não filtra.
   */
  list({ page = 1, pageSize = 50, entidade = "Todos", search = "", sortBy, sortDir } = {}) {
    const clauses = [];
    const params = {};
    if (entidade !== "Todos") {
      clauses.push("entidade = @entidade");
      params.entidade = entidade;
    }
    if (search) {
      clauses.push("(usuario_nome LIKE @like OR descricao LIKE @like)");
      params.like = `%${search}%`;
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const total = this.conn.prepare(`SELECT COUNT(*) AS total FROM historico ${where}`).get(params).total;

    const offset = Math.max(0, (page - 1) * pageSize);
    const orderBy = buildOrderBy(SORT_MAP, sortBy, sortDir, "id DESC");
    const rows = this.conn
      .prepare(`SELECT * FROM historico ${where} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: pageSize, offset });

    return { rows, total, page, pageSize };
  }
}

module.exports = { HistoricoRepository };
