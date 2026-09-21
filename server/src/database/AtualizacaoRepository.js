const { BaseRepository } = require("./BaseRepository");
const { buildOrderBy } = require("../shared/sortHelper");
const { SISTEMA_APELIDOS } = require("../config/constants");

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

/** Colunas de verdade da tabela (sem contar o "id", que e automatico). */
const COLUMNS = ["cliente", "sistema", "versao", "responsavel", "data", "motivo", "maquinas", "obs"];

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

/**
 * Historico de atualizacoes de sistemas por cliente (aba Atualizacoes).
 * Equivalente de "AtualizacaoRepository" em gestor/database.py.
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

    const total = this.conn.prepare(`SELECT COUNT(*) AS total FROM ${this.table} ${where}`).get(params).total;

    const offset = Math.max(0, (page - 1) * pageSize);
    const orderBy = buildOrderBy(SORT_MAP, sortBy, sortDir, `${DATE_SORT_EXPR} DESC, id DESC`);
    const sql = `
      SELECT id, ${COLUMNS.join(", ")}, revisao, atualizado_em AS atualizadoEm, atualizado_por AS atualizadoPor FROM ${this.table}
      ${where}
      ORDER BY ${orderBy}
      LIMIT @limit OFFSET @offset
    `;
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

  /** @param {Record<string, string>} data um valor por chave em COLUMNS */
  insert(data) {
    const columns = COLUMNS.join(", ");
    const placeholders = COLUMNS.map((c) => `@${c}`).join(", ");
    this.conn.prepare(`INSERT INTO ${this.table} (${columns}) VALUES (${placeholders})`).run(data);
  }

  find(id) {
    return this.conn.prepare(`SELECT id, ${COLUMNS.join(", ")}, revisao, atualizado_em AS atualizadoEm, atualizado_por AS atualizadoPor FROM ${this.table} WHERE id = ?`).get(id);
  }

  /** Devolve quantas linhas mudaram -- 0 quer dizer que o id nao existe (mais). */
  update(id, data, revisaoEsperada = null, usuarioNome = "") {
    const assignments = [...COLUMNS.map((c) => `${c} = @${c}`), "revisao = revisao + 1", "atualizado_em = @atualizadoEm", "atualizado_por = @atualizadoPor"].join(", ");
    return this.conn.prepare(`UPDATE ${this.table} SET ${assignments} WHERE id = @id AND (@revisaoEsperada IS NULL OR revisao = @revisaoEsperada)`)
      .run({ ...data, id, revisaoEsperada, atualizadoEm: new Date().toISOString(), atualizadoPor: usuarioNome }).changes;
  }

  /** Todos os registros, na ordem de exportacao (botao Exportar .xlsx). */
  /**
   * Linhas para a exportacao .xlsx, com os MESMOS filtros da listagem.
   *
   * Antes este metodo ignorava qualquer filtro e devolvia a tabela inteira:
   * quem filtrava doze registros na tela e clicava em "Exportar" recebia um
   * arquivo com todos os quatro mil -- exatamente o oposto do que pediu ao
   * filtrar. As clausulas sao montadas pelo mesmo helper de `list`, para as
   * duas nunca divergirem.
   */
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
      .prepare(`SELECT id, ${COLUMNS.join(", ")} FROM ${this.table} WHERE id IN (${marcadores})`)
      .all(...limpos);
  }

  exportAll(search = "", responsavel = "Todos", periodo = {}) {
    const { where, params } = this._filtros(search, responsavel, periodo);
    const sql = `SELECT ${COLUMNS.join(", ")} FROM ${this.table} ${where} ORDER BY ${DATE_SORT_EXPR} DESC`;
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

  /** Mapa { cliente: data da atualizacao mais recente }, usado para achar quem esta parado. */
  lastDateByClient() {
    const rows = this.conn
      .prepare(`SELECT cliente, data FROM ${this.table} WHERE data != '' ORDER BY ${DATE_SORT_EXPR} DESC`)
      .all();
    const ultimas = {};
    for (const { cliente, data } of rows) {
      // So guarda a primeira ocorrencia de cada cliente: como a consulta ja
      // vem da mais recente para a mais antiga, a primeira e a data mais
      // recente dele -- as ocorrencias seguintes (mais antigas) sao ignoradas.
      if (!(cliente in ultimas)) ultimas[cliente] = data;
    }
    return ultimas;
  }

  /**
   * Mapa { cliente: quantidade de máquinas }, lido do campo "maquinas" (texto
   * livre, mas por convenção sempre um número) da atualização mais recente
   * de cada cliente. Cliente sem nenhuma atualização, ou cujo campo
   * "maquinas" está vazio/não é um número, não aparece no mapa -- quem
   * chama trata isso como 0 (ver ClienteService).
   */
  lastMaquinasByClient() {
    const rows = this.conn
      .prepare(`SELECT cliente, maquinas FROM ${this.table} WHERE data != '' ORDER BY ${DATE_SORT_EXPR} DESC`)
      .all();
    const vistos = new Set();
    const maquinas = {};
    for (const { cliente, maquinas: valor } of rows) {
      if (vistos.has(cliente)) continue;
      vistos.add(cliente);
      const n = parseInt(valor, 10);
      if (!Number.isNaN(n)) maquinas[cliente] = n;
    }
    return maquinas;
  }

  /** Quantidade de máquinas (ver lastMaquinasByClient) de um único cliente -- usado pela Consulta/edição de cliente. */
  lastMaquinasForClient(nome) {
    const row = this.conn
      .prepare(`SELECT maquinas FROM ${this.table} WHERE cliente = ? AND data != '' ORDER BY ${DATE_SORT_EXPR} DESC LIMIT 1`)
      .get(nome);
    const n = row ? parseInt(row.maquinas, 10) : NaN;
    return Number.isNaN(n) ? 0 : n;
  }

  /**
   * Mapa { cliente: data da atualizacao mais recente } filtrado por um
   * sistema especifico -- variante de lastDateByClient() usada pelo
   * relatorio "por sistema" (ex.: quais clientes de NFCe estao atrasados).
   *
   * O campo "sistema" NAO guarda um valor único por registro -- na prática
   * as pessoas anotam ali a lista inteira de sistemas tocados naquela
   * atualização (ex.: "B_Vendas, NFCe, B_NFE, B_Importa"), do mesmo jeito
   * que "clientes.sistemas" -- confirmado direto no banco: nenhum registro
   * tem "sistema" igual a exatamente "NFCe", mas dezenas têm "NFCe" como um
   * dos itens da lista. Por isso o filtro aqui não é "sistema = X", e sim
   * "X está entre os itens separados por vírgula" (mesma lógica usada em
   * AtualizacaoService.relatorioPorSistema para clientes.sistemas). Também
   * aceita apelidos/variações antigas de nome (SISTEMA_APELIDOS) -- ex.:
   * uma atualização anotada como "B_NFCe" conta pra quem pede "NFCe".
   */
  lastDateByClientAndSistema(sistema) {
    const alvo = new Set([sistema, ...(SISTEMA_APELIDOS[sistema] || [])]);
    const rows = this.conn
      .prepare(`SELECT cliente, sistema, data FROM ${this.table} WHERE data != '' ORDER BY ${DATE_SORT_EXPR} DESC`)
      .all();
    const ultimas = {};
    for (const { cliente, sistema: sistemaTexto, data } of rows) {
      if (cliente in ultimas) continue;
      const tokens = sistemaTexto.split(",").map((s) => s.trim());
      if (tokens.some((t) => alvo.has(t))) ultimas[cliente] = data;
    }
    return ultimas;
  }

  /** Registro mais recente de um cliente especifico (aba Consultar Cliente). */
  lastUpdateForClient(nome) {
    const sql = `
      SELECT data, versao, motivo, responsavel, maquinas, obs FROM ${this.table}
      WHERE cliente = ? ORDER BY ${DATE_SORT_EXPR} DESC, id DESC LIMIT 1
    `;
    return this.conn.prepare(sql).get(nome) || null;
  }

  /**
   * As últimas N atualizações de um cliente específico (aba Consultar
   * Cliente, seção "Histórico recente") -- variante de lastUpdateForClient
   * que devolve uma lista em vez de um registro só, para dar noção de
   * frequência/padrão ao longo do tempo, não só o instante mais recente.
   */
  recentUpdatesForClient(nome, limit = 5) {
    const sql = `
      SELECT id, data, sistema, versao, motivo, responsavel, maquinas, obs FROM ${this.table}
      WHERE cliente = @nome ORDER BY ${DATE_SORT_EXPR} DESC, id DESC LIMIT @limit
    `;
    return this.conn.prepare(sql).all({ nome, limit });
  }

  /**
   * Retorna a atualização mais recente de cada sistema.
   * O campo sistema pode conter vários nomes separados por vírgula, então
   * cada registro é expandido antes de comparar suas datas.
   */
  latestVersionBySystem() {
    const rows = this.conn
      .prepare(`SELECT sistema, versao, data FROM ${this.table} WHERE sistema != '' AND data != '' ORDER BY ${DATE_SORT_EXPR} DESC, id DESC`)
      .all();
    const latest = new Map();
    const sistemasConhecidos = this.conn.prepare("SELECT nome FROM sistemas ORDER BY nome").all().map((row) => row.nome);
    for (const row of rows) {
      for (const sistema of splitSystems(row.sistema)) {
        const canonical = sistemasConhecidos.find((known) => sameSystem(sistema, known));
        if (canonical && !latest.has(canonical)) {
          latest.set(canonical, { sistema: canonical, versao: row.versao || "Não informada", data: row.data });
        }
      }
    }
    return sistemasConhecidos.map((sistema) => latest.get(sistema) || {
      sistema,
      versao: "Não informada",
      data: "Não registrada",
    });
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

/** Divide registros antigos que listam mais de um sistema no mesmo campo. */
function splitSystems(text) {
  return String(text || "")
    .split(/,|\s+e\s+/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Compara nomes de sistema sem diferença de caixa, acentos ou prefixo B_. */
function sameSystem(left, right) {
  const normalize = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const a = normalize(left);
  const b = normalize(right);
  return a === b || (a.startsWith("b") && a.slice(1) === b) || (b.startsWith("b") && b.slice(1) === a);
}

/** "camila silva" -> "Camila Silva" (equivalente simples de str.title() do Python). */
function titleCase(text) {
  return text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

module.exports = { AtualizacaoRepository, DATE_SORT_EXPR, COLUMNS, titleCase };
