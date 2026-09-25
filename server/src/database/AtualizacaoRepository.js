const { BaseRepository } = require("./BaseRepository");
const { buildOrderBy } = require("../shared/sortHelper");

// Datas sao guardadas como texto "dd/mm/aaaa"; esta expressao SQL as
// converte para "aaaammdd" para permitir ordenacao cronologica (ordenar o
// texto "dd/mm/aaaa" direto colocaria "01/12/2020" antes de "15/01/2021",
// o que estaria errado).
const DATE_SORT_EXPR = "(substr(data,7,4) || substr(data,4,2) || substr(data,1,2))";

/**
 * "15/01/2026" -> "20260115", a mesma forma que DATE_SORT_EXPR produz no SQL.
 * Devolve null para qualquer coisa que nao seja uma data dd/mm/aaaa completa:
 * um filtro meio digitado ("15/01/") nao deve virar um recorte silencioso que
 * some com registros sem a pessoa entender por que.
 */
function paraOrdenavel(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto || "").trim());
  return m ? `${m[3]}${m[2]}${m[1]}` : null;
}

/**
 * Campos de um atendimento como a API os entrega. "sistema" não é mais
 * coluna da tabela: vem montado pela visão `atualizacoes_v` a partir de
 * `atualizacao_sistemas` (ver migracoes.js).
 */
const COLUMNS = ["cliente", "sistema", "versao", "responsavel", "data", "motivo", "maquinas", "obs"];

/** Colunas gravadas na tabela `atualizacoes` em si. */
const COLUNAS_DA_TABELA = ["cliente", "cliente_id", "versao", "responsavel", "data", "motivo", "maquinas", "obs", "versoes_por_sistema"];

// Sem cliente_id informado, o vínculo sai do nome -- nome exato, senão
// ignorando caixa e espaço nas pontas (a regra de ClienteRepository.
// resolverNome). Assim nenhum caminho de gravação deixa um atendimento de um
// cliente cadastrado sem vínculo só por não ter resolvido o id antes.
const VALOR = {
  cliente_id:
    "COALESCE(@cliente_id, (SELECT id FROM clientes WHERE nome = @cliente), (SELECT id FROM clientes WHERE lower(trim(nome)) = lower(trim(@cliente)) ORDER BY id LIMIT 1))",
};
const valorDe = (c) => VALOR[c] || `@${c}`;

const LEITURA = `id, ${COLUMNS.join(", ")}, versoes_sistemas, revisao, atualizado_em AS atualizadoEm, atualizado_por AS atualizadoPor`;

/** Colunas que a tela pode pedir para ordenar, e a expressao SQL segura correspondente. */
const SORT_MAP = {
  id: "id",
  cliente: "cliente COLLATE NOCASE",
  sistema: "sistema COLLATE NOCASE",
  versao: "versao COLLATE NOCASE",
  responsavel: "responsavel COLLATE NOCASE",
  data: DATE_SORT_EXPR,
  motivo: "motivo COLLATE NOCASE",
  maquinas: "maquinas COLLATE NOCASE",
  obs: "obs COLLATE NOCASE",
};

// Um atendimento pertence a um cliente pelo id; o nome só decide quando não
// há vínculo (cliente excluído, ou atendimento lançado para um nome sem
// cadastro) -- sem esse segundo caso, o relatório de um desses atendimentos
// na tela de Atualizações voltaria vazio.
const DO_CLIENTE = "(a.cliente_id = (SELECT id FROM clientes WHERE nome = @nome) OR (a.cliente_id IS NULL AND a.cliente = @nome))";

/**
 * Historico de atualizacoes de sistemas por cliente (aba Atualizacoes).
 * Le da visao `atualizacoes_v`; grava em `atualizacoes` + `atualizacao_sistemas`.
 */
class AtualizacaoRepository extends BaseRepository {
  get table() {
    return "atualizacoes";
  }

  /**
   * Uma página de registros, mais recentes primeiro; filtra por texto
   * livre e por responsavel. Devolve `{ rows, total, page, pageSize }` --
   * "total" é a contagem SEM o limite de página, usada pela tela para
   * desenhar os controles de paginação (quantas páginas existem no total).
   * @param {string} search texto livre buscado em cliente/sistema/responsavel/motivo
   * @param {string} responsavel "Todos" ou um nome exato
   * @param {{page?: number, pageSize?: number, sortBy?: string, sortDir?: "asc"|"desc"}} paginacao
   */
  list(search = "", responsavel = "Todos", { page = 1, pageSize = 50, sortBy, sortDir, desde, ate } = {}) {
    // As clausulas vivem em `_filtros` porque a exportacao precisa exatamente
    // das mesmas -- ver o comentario em `exportAll`. A comparacao de
    // responsavel ignora maiusculas/minusculas e espacos nas pontas: o filtro
    // mostra nomes ja normalizados (ver distinctResponsaveis), entao "Camila"
    // escolhido ali precisa achar tambem os salvos como "CAMILA" ou " camila ".
    const { where, params } = this._filtros(search, responsavel, { desde, ate });

    const total = this.conn.prepare(`SELECT COUNT(*) AS total FROM atualizacoes_v ${where}`).get(params).total;

    const offset = Math.max(0, (page - 1) * pageSize);
    const orderBy = buildOrderBy(SORT_MAP, sortBy, sortDir, `${DATE_SORT_EXPR} DESC, id DESC`);
    const sql = `SELECT ${LEITURA} FROM atualizacoes_v ${where} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`;
    const rows = this.conn.prepare(sql).all({ ...params, limit: pageSize, offset });
    return { rows, total, page, pageSize };
  }

  /**
   * Nomes distintos já usados no campo Responsável, para o filtro da tela
   * e para as sugestões de autocompletar. Agrupa ignorando maiúsculas/
   * minúsculas e espaços nas bordas -- mesma regra de countsByResponsavel
   * (sem isso, "Camila", "CAMILA" e "camila" apareciam como três opções
   * diferentes no filtro, em vez de uma só).
   */
  distinctResponsaveis() {
    const rows = this.conn
      .prepare(`SELECT DISTINCT responsavel FROM ${this.table} WHERE responsavel != ''`)
      .all();
    const vistos = new Map();
    for (const { responsavel } of rows) {
      const key = responsavel.trim().toLowerCase();
      if (key && !vistos.has(key)) vistos.set(key, titleCase(responsavel.trim()));
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  /**
   * @param {Record<string, any>} data campos de COLUNAS_DA_TABELA
   * @param {{id: number, versao: string|null}[]} sistemas na ordem informada
   * @returns {number} o id criado
   */
  insert(data, sistemas) {
    const colunas = COLUNAS_DA_TABELA.join(", ");
    const valores = COLUNAS_DA_TABELA.map(valorDe).join(", ");
    return this.conn.transaction(() => {
      const id = Number(this.conn.prepare(`INSERT INTO ${this.table} (${colunas}) VALUES (${valores})`).run(this._valores(data)).lastInsertRowid);
      this._gravarSistemas(id, sistemas);
      return id;
    })();
  }

  find(id) {
    return this.conn.prepare(`SELECT ${LEITURA}, versoes_por_sistema FROM atualizacoes_v WHERE id = ?`).get(id);
  }

  /** Versão recebida em cada sistema de um atendimento: [{ id, versao }] na ordem gravada. */
  sistemasDe(id) {
    return this.conn
      .prepare("SELECT sistema_id AS id, versao FROM atualizacao_sistemas WHERE atualizacao_id = ? ORDER BY ordem")
      .all(id);
  }

  /** Devolve quantas linhas mudaram -- 0 quer dizer que o id nao existe (mais). */
  update(id, data, sistemas, revisaoEsperada = null, usuarioNome = "") {
    const assignments = [...COLUNAS_DA_TABELA.map((c) => `${c} = ${valorDe(c)}`), "revisao = revisao + 1", "atualizado_em = @atualizadoEm", "atualizado_por = @atualizadoPor"].join(", ");
    return this.conn.transaction(() => {
      const changes = this.conn
        .prepare(`UPDATE ${this.table} SET ${assignments} WHERE id = @id AND (@revisaoEsperada IS NULL OR revisao = @revisaoEsperada)`)
        .run({ ...this._valores(data), id, revisaoEsperada, atualizadoEm: new Date().toISOString(), atualizadoPor: usuarioNome }).changes;
      if (changes) this._gravarSistemas(id, sistemas);
      return changes;
    })();
  }

  _valores(data) {
    return Object.fromEntries(COLUNAS_DA_TABELA.map((c) => [c, data[c] ?? (c === "versoes_por_sistema" ? 0 : c === "cliente_id" ? null : "")]));
  }

  _gravarSistemas(id, sistemas) {
    this.conn.prepare("DELETE FROM atualizacao_sistemas WHERE atualizacao_id = ?").run(id);
    const ligar = this.conn.prepare("INSERT INTO atualizacao_sistemas (atualizacao_id, sistema_id, ordem, versao) VALUES (?, ?, ?, ?)");
    sistemas.forEach((s, i) => ligar.run(id, s.id, i, s.versao ?? null));
  }

  /**
   * Os registros completos de uma lista de ids.
   *
   * Existe por causa do "Desfazer" da exclusao em lote: para poder recriar o
   * que foi apagado, a tela precisa dos dados ANTES de eles sumirem, e ela so
   * tem em maos as linhas da pagina atual (que podem nem estar todas visiveis
   * depois de um "selecionar tudo"). Ler aqui, no mesmo instante da exclusao,
   * e' o unico jeito de o que volta ser exatamente o que saiu.
   */
  findByIds(ids) {
    const limpos = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
    if (limpos.length === 0) return [];
    const marcadores = limpos.map(() => "?").join(", ");
    return this.conn
      .prepare(`SELECT id, ${COLUMNS.join(", ")}, versoes_sistemas FROM atualizacoes_v WHERE id IN (${marcadores})`)
      .all(...limpos);
  }

  /**
   * Linhas para a exportacao .xlsx, com os MESMOS filtros da listagem.
   *
   * Antes este metodo ignorava qualquer filtro e devolvia a tabela inteira:
   * quem filtrava doze registros na tela e clicava em "Exportar" recebia um
   * arquivo com todos os quatro mil -- exatamente o oposto do que pediu ao
   * filtrar. As clausulas sao montadas pelo mesmo helper de `list`, para as
   * duas nunca divergirem.
   */
  exportAll(search = "", responsavel = "Todos", periodo = {}) {
    const { where, params } = this._filtros(search, responsavel, periodo);
    const sql = `SELECT ${COLUMNS.join(", ")}, versoes_sistemas FROM atualizacoes_v ${where} ORDER BY ${DATE_SORT_EXPR} DESC, id DESC`;
    return this.conn.prepare(sql).all(params);
  }

  /** Clausula WHERE + parametros compartilhados por `list` e `exportAll`. */
  _filtros(search, responsavel, { desde = "", ate = "" } = {}) {
    const clauses = [];
    const params = {};
    if (search) {
      clauses.push("(cliente LIKE @like OR sistema LIKE @like OR responsavel LIKE @like OR motivo LIKE @like)");
      params.like = `%${search}%`;
    }
    if (responsavel && responsavel !== "Todos") {
      clauses.push("lower(trim(responsavel)) = lower(trim(@responsavel))");
      params.responsavel = responsavel;
    }

    // Intervalo de datas. Comparar "dd/mm/aaaa" como texto daria errado
    // ("01/12/2025" < "15/01/2026" e' falso nessa forma), entao os dois lados
    // passam pela MESMA normalizacao para "aaaammdd" que a ordenacao ja usa --
    // e' o unico jeito de o >= e o <= significarem o que aparentam.
    const inicio = paraOrdenavel(desde);
    if (inicio) {
      clauses.push(`${DATE_SORT_EXPR} >= @desde`);
      params.desde = inicio;
    }
    const fim = paraOrdenavel(ate);
    if (fim) {
      clauses.push(`${DATE_SORT_EXPR} <= @ate`);
      params.ate = fim;
    }

    return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
  }

  /** @param {string} monthStr formato "mm/aaaa", ex.: "08/2026" */
  countForMonth(monthStr) {
    const row = this.conn
      .prepare(`SELECT COUNT(*) AS total FROM ${this.table} WHERE substr(data, 4, 7) = ?`)
      .get(monthStr);
    return row.total;
  }

  /**
   * Quantidade de atualizacoes por mes, do mais antigo para o mais recente
   * -- usado pelo grafico de tendencia do Resumo. "mes" sai como "aaaa-mm"
   * (ordenavel como texto) porque "data" e guardada como "dd/mm/aaaa" e
   * ordenar esse formato direto colocaria "01/2026" antes de "12/2025".
   * @param {number} quantidadeMeses quantos meses trazer, do mais recente pra tras
   */
  porMes(quantidadeMeses = 12) {
    const rows = this.conn
      .prepare(
        `SELECT (substr(data,7,4) || '-' || substr(data,4,2)) AS mes, COUNT(*) AS total
         FROM ${this.table}
         WHERE data != ''
         GROUP BY mes
         ORDER BY mes DESC
         LIMIT ?`
      )
      .all(quantidadeMeses);
    return rows.reverse();
  }

  /** Mapa { id do cliente: data da atualizacao mais recente }, usado para achar quem esta parado. */
  ultimaDataPorCliente() {
    const rows = this.conn
      .prepare(
        `SELECT cliente_id, data FROM (
           SELECT cliente_id, data, ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY ${DATE_SORT_EXPR} DESC, id DESC) AS n
             FROM ${this.table} WHERE cliente_id IS NOT NULL AND data != ''
         ) WHERE n = 1`
      )
      .all();
    return new Map(rows.map((r) => [r.cliente_id, r.data]));
  }

  /**
   * Mapa { id do cliente: quantidade de máquinas }, lido do campo "maquinas"
   * (texto livre, mas por convenção sempre um número) da atualização mais
   * recente de cada cliente. Cliente sem nenhuma atualização, ou cujo campo
   * "maquinas" está vazio/não é um número, não aparece no mapa -- quem chama
   * trata isso como 0 (ver ClienteService).
   */
  maquinasPorCliente() {
    const rows = this.conn
      .prepare(
        `SELECT cliente_id, maquinas FROM (
           SELECT cliente_id, maquinas, ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY ${DATE_SORT_EXPR} DESC, id DESC) AS n
             FROM ${this.table} WHERE cliente_id IS NOT NULL AND data != ''
         ) WHERE n = 1`
      )
      .all();
    const mapa = new Map();
    for (const { cliente_id: id, maquinas } of rows) {
      const n = parseInt(maquinas, 10);
      if (!Number.isNaN(n)) mapa.set(id, n);
    }
    return mapa;
  }

  /** Quantidade de máquinas (ver maquinasPorCliente) de um único cliente. */
  maquinasDoCliente(clienteId) {
    const row = this.conn
      .prepare(`SELECT maquinas FROM ${this.table} WHERE cliente_id = ? AND data != '' ORDER BY ${DATE_SORT_EXPR} DESC, id DESC LIMIT 1`)
      .get(clienteId);
    const n = row ? parseInt(row.maquinas, 10) : NaN;
    return Number.isNaN(n) ? 0 : n;
  }

  /** Registro mais recente de um cliente especifico (aba Consultar Cliente). */
  lastUpdateForClient(nome) {
    const sql = `
      SELECT a.data, a.versao, a.motivo, a.responsavel, a.maquinas, a.obs FROM ${this.table} a
      WHERE ${DO_CLIENTE} ORDER BY ${DATE_SORT_EXPR} DESC, a.id DESC LIMIT 1
    `;
    return this.conn.prepare(sql).get({ nome }) || null;
  }

  /**
   * As últimas N atualizações de um cliente específico (aba Consultar
   * Cliente, seção "Histórico recente") -- variante de lastUpdateForClient
   * que devolve uma lista em vez de um registro só, para dar noção de
   * frequência/padrão ao longo do tempo, não só o instante mais recente.
   */
  recentUpdatesForClient(nome, limit = 5) {
    const sql = `
      SELECT a.id, a.data, a.sistema, a.versao, a.motivo, a.responsavel, a.maquinas, a.obs, a.versoes_sistemas FROM atualizacoes_v a
      WHERE ${DO_CLIENTE} ORDER BY ${DATE_SORT_EXPR} DESC, a.id DESC LIMIT @limit
    `;
    return this.conn.prepare(sql).all({ nome, limit });
  }

  /**
   * Último atendimento de cada cliente EM UM sistema, com a versão que ele
   * recebeu ali: [{ cliente_id, data, versao }]. É o que decide a situação
   * na tela Sistemas.
   */
  ultimaPorClienteNoSistema(sistemaId) {
    return this.conn
      .prepare(
        `SELECT cliente_id, data, versao FROM (
           SELECT a.cliente_id, a.data, x.versao,
                  ROW_NUMBER() OVER (PARTITION BY a.cliente_id ORDER BY ${DATE_SORT_EXPR} DESC, a.id DESC) AS n
             FROM ${this.table} a JOIN atualizacao_sistemas x ON x.atualizacao_id = a.id
            WHERE x.sistema_id = ? AND a.cliente_id IS NOT NULL
         ) WHERE n = 1`
      )
      .all(sistemaId);
  }

  /**
   * Último atendimento de TODOS os clientes em cada sistema, de uma vez só:
   * [{ cliente_id, sistema_id, data, versao }]. É a mesma escolha de
   * ultimaPorClienteNoSistema, para o Resumo classificar os clientes sem
   * uma consulta por sistema.
   */
  ultimaPorClienteESistema() {
    return this.conn
      .prepare(
        `SELECT cliente_id, sistema_id, data, versao FROM (
           SELECT a.cliente_id, x.sistema_id, a.data, x.versao,
                  ROW_NUMBER() OVER (PARTITION BY a.cliente_id, x.sistema_id ORDER BY ${DATE_SORT_EXPR} DESC, a.id DESC) AS n
             FROM ${this.table} a JOIN atualizacao_sistemas x ON x.atualizacao_id = a.id
            WHERE a.cliente_id IS NOT NULL
         ) WHERE n = 1`
      )
      .all();
  }

  /**
   * Último atendimento de um cliente em cada sistema que já passou por ele:
   * [{ sistema_id, sistema, data, versao }]. Usado na situação do cliente.
   */
  ultimaPorSistemaDoCliente(nome) {
    return this.conn
      .prepare(
        `SELECT sistema_id, sistema, data, versao FROM (
           SELECT x.sistema_id, s.nome AS sistema, a.data, x.versao,
                  ROW_NUMBER() OVER (PARTITION BY x.sistema_id ORDER BY ${DATE_SORT_EXPR} DESC, a.id DESC) AS n
             FROM ${this.table} a
             JOIN atualizacao_sistemas x ON x.atualizacao_id = a.id
             JOIN sistemas s ON s.id = x.sistema_id
            WHERE ${DO_CLIENTE}
         ) WHERE n = 1`
      )
      .all({ nome });
  }

  /**
   * A atualização mais recente de cada sistema do catálogo ativo, com a
   * versão registrada nela para aquele sistema.
   */
  latestVersionBySystem() {
    return this.conn
      .prepare(
        `SELECT s.nome AS sistema, coalesce(u.versao, 'Não informada') AS versao, coalesce(u.data, 'Não registrada') AS data
           FROM sistemas s
           LEFT JOIN (
             SELECT sistema_id, versao, data FROM (
               SELECT x.sistema_id, x.versao, a.data,
                      ROW_NUMBER() OVER (PARTITION BY x.sistema_id ORDER BY ${DATE_SORT_EXPR} DESC, a.id DESC) AS n
                 FROM ${this.table} a JOIN atualizacao_sistemas x ON x.atualizacao_id = a.id
                WHERE a.data != ''
             ) WHERE n = 1
           ) u ON u.sistema_id = s.id
           WHERE s.ativo = 1 AND s.controla_versao = 1
           ORDER BY s.nome`
      )
      .all()
      .map((r) => ({ ...r, versao: r.versao || "Não informada" }));
  }

  /**
   * Quantos clientes (de cada sistema do catálogo ativo) tiveram a ÚLTIMA
   * atualização daquele sistema neste mês -- só contando quem tem o sistema
   * marcado no cadastro. Contar linhas pelo texto de "sistema" dava uma sopa
   * de combinações ("B_Vendas, B_NFe") em vez de um total por sistema.
   * @param {string} mesStr formato "mm/aaaa"
   */
  atualizadosNoMesPorSistema(mesStr) {
    return this.conn
      .prepare(
        `SELECT s.nome AS label, COUNT(u.cliente_id) AS total
           FROM sistemas s
           LEFT JOIN (
             SELECT cliente_id, sistema_id, data FROM (
               SELECT a.cliente_id, x.sistema_id, a.data,
                      ROW_NUMBER() OVER (PARTITION BY a.cliente_id, x.sistema_id ORDER BY ${DATE_SORT_EXPR} DESC, a.id DESC) AS n
                 FROM ${this.table} a JOIN atualizacao_sistemas x ON x.atualizacao_id = a.id
                WHERE a.cliente_id IS NOT NULL AND a.data != ''
             ) WHERE n = 1 AND substr(data, 4, 7) = @mes
           ) u ON u.sistema_id = s.id
              AND EXISTS (SELECT 1 FROM cliente_sistemas cs WHERE cs.cliente_id = u.cliente_id AND cs.sistema_id = s.id)
           WHERE s.ativo = 1 AND s.controla_versao = 1
           GROUP BY s.id
          ORDER BY total DESC, s.nome`
      )
      .all({ mes: mesStr });
  }

  /**
   * Quantidade de atualizacoes por responsavel, agrupando ignorando
   * maiusculas/minusculas e espacos nas bordas (para "Camila", "CAMILA" e
   * " camila " contarem como a mesma pessoa).
   */
  countsByResponsavel() {
    const raw = this.conn
      .prepare(`SELECT responsavel, COUNT(*) AS qtde FROM ${this.table} WHERE responsavel != '' GROUP BY responsavel`)
      .all();
    const merged = new Map();
    for (const { responsavel, qtde } of raw) {
      const key = responsavel.trim().toLowerCase();
      const atual = merged.get(key);
      const label = atual ? atual.label : titleCase(responsavel.trim());
      const total = (atual ? atual.total : 0) + qtde;
      merged.set(key, { label, total });
    }
    return [...merged.values()].sort((a, b) => b.total - a.total);
  }
}

/** "a, b, c" -> ["a", "b", "c"] -- o texto de sistemas que a visão monta. */
function splitSystems(text) {
  return String(text || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** "camila silva" -> "Camila Silva" (equivalente simples de str.title() do Python). */
function titleCase(text) {
  return text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

module.exports = { AtualizacaoRepository, DATE_SORT_EXPR, COLUMNS, titleCase, splitSystems };
