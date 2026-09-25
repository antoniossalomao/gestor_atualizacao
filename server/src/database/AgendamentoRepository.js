const { BaseRepository } = require("./BaseRepository");
const { DATE_SORT_EXPR, titleCase } = require("./AtualizacaoRepository");
const { buildOrderBy } = require("../shared/sortHelper");
const { FILTRO_ARQUIVADAS } = require("../config/constants");

const COLUMNS = ["tarefa", "cliente", "sistema", "responsavel", "prioridade", "data", "horario", "status", "obs"];

// A tarefa guarda o nome do cliente como foi digitado e, se ele tiver
// cadastro, o id -- mesma regra de vínculo de ClienteRepository.resolverNome
// (nome exato, senão ignorando caixa e espaço nas pontas).
const CLIENTE_ID_EXPR =
  "COALESCE((SELECT id FROM clientes WHERE nome = @cliente), (SELECT id FROM clientes WHERE lower(trim(nome)) = lower(trim(@cliente)) ORDER BY id LIMIT 1))";

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

// Urgente=0, Alta=1, Normal=2, Baixa=3: dentro de cada coluna de status,
// tarefas mais urgentes aparecem no topo.
const PRIORIDADE_ORDER_EXPR =
  "CASE prioridade WHEN 'Urgente' THEN 0 WHEN 'Alta' THEN 1 WHEN 'Normal' THEN 2 WHEN 'Baixa' THEN 3 ELSE 2 END";

/** Colunas que a tela pode pedir para ordenar, e a expressao SQL segura correspondente. */
const SORT_MAP = {
  id: "id",
  tarefa: "tarefa COLLATE NOCASE",
  cliente: "cliente COLLATE NOCASE",
  responsavel: "responsavel COLLATE NOCASE",
  data: DATE_SORT_EXPR,
  horario: "horario",
  status: "status COLLATE NOCASE",
  prioridade: PRIORIDADE_ORDER_EXPR,
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
  list(search = "", status = "Todos", { page = 1, pageSize = 50, sortBy, sortDir, prioridade, filtroRapido, usuarioNome } = {}) {
    const clauses = [];
    const params = {};
    if (search) {
      clauses.push("(tarefa LIKE @like OR cliente LIKE @like OR responsavel LIKE @like OR data LIKE @like OR sistema LIKE @like OR obs LIKE @like)");
      params.like = `%${search}%`;
    }
    if (filtroRapido === "hoje") {
      const hoje = new Date();
      const dd = String(hoje.getDate()).padStart(2, "0");
      const mm = String(hoje.getMonth() + 1).padStart(2, "0");
      const yyyy = hoje.getFullYear();
      clauses.push("data = @filtroHoje");
      params.filtroHoje = `${dd}/${mm}/${yyyy}`;
    } else if (filtroRapido === "atrasadas") {
      const hoje = new Date();
      const cutoff = `${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, "0")}${String(hoje.getDate()).padStart(2, "0")}`;
      clauses.push("status NOT IN ('Concluído', 'Sem resposta') AND data != '' AND " + DATE_SORT_EXPR + " < @filtroAtrasadasCutoff");
      params.filtroAtrasadasCutoff = cutoff;
    } else if (filtroRapido === "minhas" && usuarioNome) {
      clauses.push("lower(responsavel) = lower(@usuarioNome)");
      params.usuarioNome = usuarioNome;
    }

    // "Arquivadas" nao e um status -- e o pedido de ver justamente o que sai
    // da lista. Por isso ele SUBSTITUI o recorte por status em vez de se
    // somar a ele: pedir "Arquivadas" e pedir todas as arquivadas.
    if (status === FILTRO_ARQUIVADAS || filtroRapido === "arquivadas") {
      clauses.push("arquivado_em IS NOT NULL");
    } else {
      clauses.push("arquivado_em IS NULL");
      if (status !== "Todos") {
        clauses.push("status = @status");
        params.status = status;
      }
    }
    if (prioridade && prioridade !== "Todas") {
      clauses.push("prioridade = @prioridade");
      params.prioridade = prioridade;
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const total = this.conn.prepare(`SELECT COUNT(*) AS total FROM ${this.table} ${where}`).get(params).total;

    const offset = Math.max(0, (page - 1) * pageSize);
    const orderBy = buildOrderBy(
      SORT_MAP,
      sortBy,
      sortDir,
      `${STATUS_ORDER_EXPR}, ${PRIORIDADE_ORDER_EXPR}, ${DATE_SORT_EXPR} ASC, ${HORARIO_SORT_EXPR}, id DESC`
    );
    const sql = `
      SELECT id, ${COLUMNS.join(", ")}, arquivado_em AS arquivadoEm, revisao, atualizado_em AS atualizadoEm, atualizado_por AS atualizadoPor FROM ${this.table}
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
      .prepare(`SELECT id, ${COLUMNS.join(", ")}, criado_em AS criadoEm, concluido_em AS concluidoEm, revisao, atualizado_em AS atualizadoEm, atualizado_por AS atualizadoPor FROM ${this.table} WHERE id = ?`)
      .get(id);
  }

  insert(data) {
    const columns = [...COLUMNS, "criado_em", "cliente_id"].join(", ");
    const placeholders = [...COLUMNS.map((c) => `@${c}`), "@criadoEm", CLIENTE_ID_EXPR].join(", ");
    this.conn.prepare(`INSERT INTO ${this.table} (${columns}) VALUES (${placeholders})`).run({ ...data, criadoEm: new Date().toISOString() });
  }

  insertMany(lista) {
    const columns = [...COLUMNS, "criado_em", "cliente_id"].join(", ");
    const placeholders = [...COLUMNS.map((c) => `@${c}`), "@criadoEm", CLIENTE_ID_EXPR].join(", ");
    const stmt = this.conn.prepare(`INSERT INTO ${this.table} (${columns}) VALUES (${placeholders})`);
    const agora = new Date().toISOString();
    return this.conn.transaction((itens) => {
      let criados = 0;
      for (const item of itens) criados += stmt.run({ ...item, criadoEm: agora }).changes;
      return criados;
    })(lista);
  }

  /**
   * Devolve quantas linhas mudaram -- 0 quer dizer que o id nao existe
   * (mais). "concluidoEm" e decidido por AgendamentoService (que sabe o
   * status anterior) -- este metodo so grava o que recebe: string ISO
   * quando a tarefa acabou de ser concluida, ou null quando nao esta (mais)
   * concluida ou nunca esteve.
   */
  update(id, data, revisaoEsperada = null, usuarioNome = "") {
    const assignments = [...COLUMNS.map((c) => `${c} = @${c}`), `cliente_id = ${CLIENTE_ID_EXPR}`, "concluido_em = @concluidoEm", "revisao = revisao + 1", "atualizado_em = @atualizadoEm", "atualizado_por = @atualizadoPor"].join(", ");
    return this.conn
      .prepare(`UPDATE ${this.table} SET ${assignments} WHERE id = @id AND (@revisaoEsperada IS NULL OR revisao = @revisaoEsperada)`)
      .run({ ...data, id, concluidoEm: data.concluidoEm ?? null, revisaoEsperada, atualizadoEm: new Date().toISOString(), atualizadoPor: usuarioNome }).changes;
  }

  /** Atalho para marcar rapidamente uma tarefa como concluida agora. */
  markDone(id, doneLabel) {
    return this.conn
      .prepare(`UPDATE ${this.table} SET status = @status, concluido_em = @concluidoEm WHERE id = @id`)
      .run({ id, status: doneLabel, concluidoEm: new Date().toISOString() }).changes;
  }

  /**
   * Os registros completos (mesmas colunas de list(), sem criado_em/
   * concluido_em) de uma lista de ids -- usado pelo "Desfazer" das ações em
   * lote (exclusão e conclusão), que precisam do estado ANTES da ação para
   * poder recriar/restaurar exatamente o que havia.
   */
  findByIds(ids) {
    const limpos = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
    if (limpos.length === 0) return [];
    const marcadores = limpos.map(() => "?").join(", ");
    return this.conn.prepare(`SELECT id, ${COLUMNS.join(", ")} FROM ${this.table} WHERE id IN (${marcadores})`).all(...limpos);
  }

  /** Variante em lote de markDone -- só toca as tarefas informadas, todas com o mesmo instante de conclusão. */
  markDoneMany(ids, doneLabel) {
    const limpos = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
    if (limpos.length === 0) return 0;
    const marcadores = limpos.map(() => "?").join(", ");
    const stmt = this.conn.prepare(`UPDATE ${this.table} SET status = ?, concluido_em = ? WHERE id IN (${marcadores})`);
    const concluidoEm = new Date().toISOString();
    return this.conn.transaction(() => stmt.run(doneLabel, concluidoEm, ...limpos).changes)();
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
   * Tira da lista as tarefas concluidas ha mais de `dias`.
   *
   * So toca quem tem `concluido_em` preenchido: tarefas marcadas como
   * concluidas antes dessa coluna existir nao tem como saber HA QUANTO
   * TEMPO foram concluidas, e some-las por um prazo que ninguem consegue
   * calcular seria arquivar no escuro. Elas continuam na lista ate alguem
   * mexer nelas.
   *
   * @returns {number} quantas foram arquivadas agora
   */
  arquivarConcluidasAntigas(dias, statusConcluido) {
    const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
    return this.conn
      .prepare(
        `UPDATE ${this.table} SET arquivado_em = @agora
         WHERE arquivado_em IS NULL
           AND status = @status
           AND concluido_em IS NOT NULL
           AND concluido_em < @corte`
      )
      .run({ agora: new Date().toISOString(), status: statusConcluido, corte }).changes;
  }

  /**
   * Arquiva uma tarefa na hora, sem esperar a varredura automatica alcancar
   * o prazo do .env. So toca quem ainda nao esta arquivado.
   */
  arquivar(id) {
    return this.conn
      .prepare(`UPDATE ${this.table} SET arquivado_em = @agora WHERE id = @id AND arquivado_em IS NULL`)
      .run({ id, agora: new Date().toISOString() }).changes;
  }

  /** Quantas tarefas estao arquivadas -- o contador ao lado do filtro. */
  contarArquivadas() {
    return this.conn.prepare(`SELECT COUNT(*) AS total FROM ${this.table} WHERE arquivado_em IS NOT NULL`).get().total;
  }

  /**
   * Traz uma tarefa arquivada de volta para a lista.
   *
   * Desarquivar REABRE a tarefa (volta ao primeiro status e esquece a
   * conclusao) em vez de so limpar `arquivado_em`. O motivo e pratico: a
   * varredura roda a cada listagem, entao uma tarefa concluida ha meses que
   * apenas "desarquivasse" sumiria de novo no mesmo instante. E quem traz
   * uma tarefa de volta quer justamente fazer algo com ela.
   */
  reabrir(id, statusInicial) {
    return this.conn
      .prepare(
        `UPDATE ${this.table} SET arquivado_em = NULL, concluido_em = NULL, status = @status
         WHERE id = @id AND arquivado_em IS NOT NULL`
      )
      .run({ id, status: statusInicial }).changes;
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
