const { BaseRepository } = require("./BaseRepository");
const { DATE_SORT_EXPR } = require("./AtualizacaoRepository");
const { buildOrderBy } = require("./sortHelper");

const COLUMNS = ["tarefa", "cliente", "responsavel", "data", "status"];

// "CASE...WHEN...THEN...ELSE...END" e um "se/senao" dentro do proprio SQL:
// transforma cada status num numero (0..3) para poder ordenar as tarefas
// colocando "A Fazer" primeiro, depois "Em Andamento", "Sem resposta", e
// por ultimo "Concluido".
const STATUS_ORDER_EXPR =
  "CASE status WHEN 'A Fazer' THEN 0 WHEN 'Em Andamento' THEN 1 WHEN 'Sem resposta' THEN 2 WHEN 'Concluído' THEN 3 ELSE 4 END";

/** Colunas que a tela pode pedir para ordenar, e a expressao SQL segura correspondente. */
const SORT_MAP = {
  id: "id",
  tarefa: "tarefa COLLATE NOCASE",
  cliente: "cliente COLLATE NOCASE",
  responsavel: "responsavel COLLATE NOCASE",
  data: DATE_SORT_EXPR,
  status: "status COLLATE NOCASE",
};

/**
 * Agenda de tarefas internas (aba Agendamentos).
 * Equivalente de "AgendamentoRepository" em gestor/database.py.
 */
class AgendamentoRepository extends BaseRepository {
  get table() {
    return "agendamentos";
  }

  /**
   * Uma página de tarefas, pendentes primeiro (ordenadas por data),
   * concluidas no final. Devolve `{ rows, total, page, pageSize }`.
   */
  list(search = "", status = "Todos", { page = 1, pageSize = 50, sortBy, sortDir } = {}) {
    const clauses = [];
    const params = {};
    if (search) {
      clauses.push("(tarefa LIKE @like OR cliente LIKE @like OR responsavel LIKE @like)");
      params.like = `%${search}%`;
    }
    if (status !== "Todos") {
      clauses.push("status = @status");
      params.status = status;
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const total = this.conn.prepare(`SELECT COUNT(*) AS total FROM ${this.table} ${where}`).get(params).total;

    const offset = Math.max(0, (page - 1) * pageSize);
    const orderBy = buildOrderBy(SORT_MAP, sortBy, sortDir, `${STATUS_ORDER_EXPR}, ${DATE_SORT_EXPR} ASC, id DESC`);
    const sql = `
      SELECT id, ${COLUMNS.join(", ")} FROM ${this.table}
      ${where}
      ORDER BY ${orderBy}
      LIMIT @limit OFFSET @offset
    `;
    const rows = this.conn.prepare(sql).all({ ...params, limit: pageSize, offset });
    return { rows, total, page, pageSize };
  }

  insert(data) {
    const columns = COLUMNS.join(", ");
    const placeholders = COLUMNS.map((c) => `@${c}`).join(", ");
    this.conn.prepare(`INSERT INTO ${this.table} (${columns}) VALUES (${placeholders})`).run(data);
  }

  /** Devolve quantas linhas mudaram -- 0 quer dizer que o id nao existe (mais). */
  update(id, data) {
    const assignments = COLUMNS.map((c) => `${c} = @${c}`).join(", ");
    return this.conn.prepare(`UPDATE ${this.table} SET ${assignments} WHERE id = @id`).run({ ...data, id }).changes;
  }

  /** Atalho para marcar rapidamente uma tarefa como concluida. */
  markDone(id, doneLabel) {
    return this.conn.prepare(`UPDATE ${this.table} SET status = ? WHERE id = ?`).run(doneLabel, id).changes;
  }

  /**
   * Tarefas pendentes (nem "Concluído" nem "Sem resposta") com data de hoje
   * ou anterior -- usadas pelo banner de lembrete que aparece ao abrir o app.
   */
  dueSoon() {
    const hoje = new Date();
    const cutoff =
      `${hoje.getFullYear()}` +
      `${String(hoje.getMonth() + 1).padStart(2, "0")}` +
      `${String(hoje.getDate()).padStart(2, "0")}`;
    const sql = `
      SELECT id, ${COLUMNS.join(", ")} FROM ${this.table}
      WHERE status NOT IN ('Concluído', 'Sem resposta') AND data != '' AND ${DATE_SORT_EXPR} <= @cutoff
      ORDER BY ${DATE_SORT_EXPR} ASC
    `;
    return this.conn.prepare(sql).all({ cutoff });
  }
}

module.exports = { AgendamentoRepository };
