const { BaseRepository } = require("./BaseRepository");
const { DATE_SORT_EXPR, titleCase } = require("./AtualizacaoRepository");
const { buildOrderBy } = require("./sortHelper");

const COLUMNS = ["tarefa", "cliente", "responsavel", "data", "horario", "status"];

// "horario" fica vazio em tarefas sem hora marcada -- esse CASE joga essas
// para o fim de cada dia, em vez de aparecerem antes de "08:00" so porque
// "" < "08:00" na comparacao de texto.
const HORARIO_SORT_EXPR = "(CASE WHEN horario = '' OR horario IS NULL THEN 1 ELSE 0 END), horario ASC";

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
  horario: "horario",
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
    const orderBy = buildOrderBy(
      SORT_MAP,
      sortBy,
      sortDir,
      `${STATUS_ORDER_EXPR}, ${DATE_SORT_EXPR} ASC, ${HORARIO_SORT_EXPR}, id DESC`
    );
    const sql = `
      SELECT id, ${COLUMNS.join(", ")} FROM ${this.table}
      ${where}
      ORDER BY ${orderBy}
      LIMIT @limit OFFSET @offset
    `;
    const rows = this.conn.prepare(sql).all({ ...params, limit: pageSize, offset });
    return { rows, total, page, pageSize };
  }

  /** Uma tarefa por id, incluindo criado_em/concluido_em (que list() nao devolve). */
  find(id) {
    return this.conn
      .prepare(`SELECT id, ${COLUMNS.join(", ")}, criado_em AS criadoEm, concluido_em AS concluidoEm FROM ${this.table} WHERE id = ?`)
      .get(id);
  }

  insert(data) {
    const columns = [...COLUMNS, "criado_em"].join(", ");
    const placeholders = [...COLUMNS.map((c) => `@${c}`), "@criadoEm"].join(", ");
    this.conn.prepare(`INSERT INTO ${this.table} (${columns}) VALUES (${placeholders})`).run({ ...data, criadoEm: new Date().toISOString() });
  }

  /**
   * Devolve quantas linhas mudaram -- 0 quer dizer que o id nao existe
   * (mais). "concluidoEm" e decidido por AgendamentoService (que sabe o
   * status anterior) -- este metodo so grava o que recebe: string ISO
   * quando a tarefa acabou de ser concluida, ou null quando nao esta (mais)
   * concluida ou nunca esteve.
   */
  update(id, data) {
    const assignments = [...COLUMNS.map((c) => `${c} = @${c}`), "concluido_em = @concluidoEm"].join(", ");
    return this.conn
      .prepare(`UPDATE ${this.table} SET ${assignments} WHERE id = @id`)
      .run({ ...data, id, concluidoEm: data.concluidoEm ?? null }).changes;
  }

  /** Atalho para marcar rapidamente uma tarefa como concluida agora. */
  markDone(id, doneLabel) {
    return this.conn
      .prepare(`UPDATE ${this.table} SET status = @status, concluido_em = @concluidoEm WHERE id = @id`)
      .run({ id, status: doneLabel, concluidoEm: new Date().toISOString() }).changes;
  }

  /**
   * Tempo medio (em dias) entre a tarefa ser criada e ser concluida, por
   * responsavel -- so entra no calculo quem tem as duas datas (tarefas
   * criadas antes desta coluna existir ficam de fora, em vez de contar com
   * uma data inventada). Agrupa ignorando maiusculas/espacos, mesma regra
   * de AtualizacaoRepository.countsByResponsavel, e combina a media das
   * variações de nome ponderada pela quantidade de cada uma.
   */
  tempoMedioResolucaoPorResponsavel() {
    const raw = this.conn
      .prepare(
        `SELECT responsavel,
                AVG(julianday(concluido_em) - julianday(criado_em)) AS dias,
                COUNT(*) AS total
         FROM ${this.table}
         WHERE concluido_em IS NOT NULL AND criado_em IS NOT NULL AND responsavel != ''
         GROUP BY responsavel`
      )
      .all();
    const merged = new Map();
    for (const { responsavel, dias, total } of raw) {
      const key = responsavel.trim().toLowerCase();
      const atual = merged.get(key);
      const label = atual ? atual.label : titleCase(responsavel.trim());
      const totalNovo = (atual ? atual.total : 0) + total;
      const diasNovo = ((atual ? atual.dias * atual.total : 0) + dias * total) / totalNovo;
      merged.set(key, { label, total: totalNovo, dias: diasNovo });
    }
    return [...merged.values()]
      .map((item) => ({ label: item.label, total: item.total, diasMedios: Math.round(item.dias * 10) / 10 }))
      .sort((a, b) => a.diasMedios - b.diasMedios);
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
      ORDER BY ${DATE_SORT_EXPR} ASC, ${HORARIO_SORT_EXPR}
    `;
    return this.conn.prepare(sql).all({ cutoff });
  }
}

module.exports = { AgendamentoRepository };
