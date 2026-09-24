const { BaseRepository } = require("./BaseRepository");
const { buildOrderBy } = require("../shared/sortHelper");

/** Colunas que a tela pode pedir para ordenar, e a expressao SQL segura correspondente. */
const SORT_MAP = {
  id: "id",
  codigo: "codigo COLLATE NOCASE",
  nome: "nome COLLATE NOCASE",
  cidade: "cidade COLLATE NOCASE",
  sistemasTexto: "sistemas COLLATE NOCASE",
};

const LEITURA = "id, codigo, nome, cidade, sistemas, grupo, revisao, atualizado_em AS atualizadoEm, atualizado_por AS atualizadoPor";

/**
 * Cadastro de clientes e os sistemas que cada um possui (aba Clientes).
 * Le da visao `clientes_v`, que devolve os sistemas como texto "a, b" (o
 * formato de sempre da API); grava em `clientes` + `cliente_sistemas`.
 */
class ClienteRepository extends BaseRepository {
  get table() {
    return "clientes";
  }

  /** Uma página de clientes. Devolve `{ rows, total, page, pageSize }`. */
  list(search = "", { page = 1, pageSize = 50, sortBy, sortDir } = {}) {
    const where = search ? "WHERE nome LIKE @like OR cidade LIKE @like OR sistemas LIKE @like OR grupo LIKE @like" : "";
    const params = search ? { like: `%${search}%` } : {};

    const total = this.conn.prepare(`SELECT COUNT(*) AS total FROM clientes_v ${where}`).get(params).total;

    const offset = Math.max(0, (page - 1) * pageSize);
    const orderBy = buildOrderBy(SORT_MAP, sortBy, sortDir, "nome COLLATE NOCASE ASC");
    const rows = this.conn
      .prepare(`SELECT ${LEITURA} FROM clientes_v ${where} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: pageSize, offset });
    return { rows, total, page, pageSize };
  }

  /** Lista simples de nomes, usada para preencher sugestoes de autocompletar. */
  names() {
    return this.conn.prepare("SELECT nome FROM clientes ORDER BY nome").all().map((r) => r.nome);
  }

  /** Opções enxutas para seletores que identificam o cliente pelo código. */
  opcoesPorCodigo() {
    return this.conn
      .prepare("SELECT codigo, nome, cidade FROM clientes WHERE codigo IS NOT NULL AND trim(codigo) != '' ORDER BY nome COLLATE NOCASE")
      .all();
  }

  codigosExistentes(codigos = []) {
    const lista = [...new Set(codigos.map((codigo) => String(codigo).trim()).filter(Boolean))];
    if (!lista.length) return [];
    const marcadores = lista.map(() => "?").join(", ");
    return this.conn
      .prepare(`SELECT codigo FROM clientes WHERE upper(codigo) IN (${marcadores})`)
      .all(...lista.map((codigo) => codigo.toUpperCase()))
      .map((row) => row.codigo);
  }

  /** Nomes de grupo/rede já usados, para sugestão de autocompletar (mesmo padrão de "names"). */
  grupos() {
    return this.conn
      .prepare("SELECT DISTINCT grupo FROM clientes WHERE grupo IS NOT NULL AND grupo != '' ORDER BY grupo")
      .all()
      .map((r) => r.grupo);
  }

  /** (id, codigo, nome, cidade) de todos os clientes -- usado no calculo de desatualizados. */
  allBasic() {
    return this.conn.prepare("SELECT id, codigo, nome, cidade FROM clientes").all();
  }

  /** Clientes que têm um sistema marcado no cadastro -- relatório por sistema. */
  clientesDoSistema(sistemaId) {
    return this.conn
      .prepare("SELECT c.id, c.nome, c.cidade FROM clientes c JOIN cliente_sistemas x ON x.cliente_id = c.id WHERE x.sistema_id = ?")
      .all(sistemaId);
  }

  /** Todas as marcações cliente x sistema do cadastro: [{ cliente_id, sistema_id }] -- Resumo. */
  sistemasDeTodos() {
    return this.conn.prepare("SELECT cliente_id, sistema_id FROM cliente_sistemas").all();
  }

  /** Ids dos sistemas marcados num cliente, na ordem do cadastro. */
  sistemasDoCliente(clienteId) {
    return this.conn.prepare("SELECT sistema_id FROM cliente_sistemas WHERE cliente_id = ? ORDER BY ordem").all(clienteId).map((r) => r.sistema_id);
  }

  getByNome(nome) {
    return this.conn.prepare(`SELECT ${LEITURA} FROM clientes_v WHERE nome = ?`).get(nome) || null;
  }

  /** O cliente de um nome digitado, sem diferenciar caixa nem espaço nas pontas: { id, nome } ou null. */
  resolverNome(nome) {
    const limpo = String(nome || "").trim();
    if (!limpo) return null;
    return (
      this.conn.prepare("SELECT id, nome FROM clientes WHERE nome = ?").get(limpo) ||
      this.conn.prepare("SELECT id, nome FROM clientes WHERE lower(trim(nome)) = lower(?) ORDER BY id LIMIT 1").get(limpo) ||
      null
    );
  }

  getById(id) {
    return this.conn.prepare(`SELECT ${LEITURA} FROM clientes_v WHERE id = ?`).get(id) || null;
  }

  /** Os registros completos de uma lista de ids -- usado pelas ações em lote (excluir, adicionar sistema). */
  findByIds(ids) {
    const limpos = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
    if (limpos.length === 0) return [];
    const marcadores = limpos.map(() => "?").join(", ");
    return this.conn
      .prepare(`SELECT id, codigo, nome, cidade, sistemas, grupo FROM clientes_v WHERE id IN (${marcadores})`)
      .all(...limpos);
  }

  /**
   * True se ja existe outro cliente com esse nome (sem diferenciar
   * maiusculas/minusculas). Dois clientes com o mesmo nome seriam
   * indistinguiveis em toda tela que lista por nome -- e o vinculo de um
   * atendimento lancado pelo nome (ver resolverNome) escolheria um deles
   * sem ninguem saber qual.
   * @param {number|null} excludeId ignora este id (usado ao validar uma edicao)
   */
  nameExists(nome, excludeId = null) {
    if (excludeId != null) {
      const row = this.conn
        .prepare("SELECT COUNT(*) AS total FROM clientes WHERE lower(nome) = lower(?) AND id != ?")
        .get(nome, excludeId);
      return row.total > 0;
    }
    const row = this.conn.prepare("SELECT COUNT(*) AS total FROM clientes WHERE lower(nome) = lower(?)").get(nome);
    return row.total > 0;
  }

  /** @param {number[]} sistemaIds na ordem marcada @returns {number} o id criado */
  insert(codigo, nome, cidade, sistemaIds, grupo) {
    return this.conn.transaction(() => {
      const id = Number(
        this.conn.prepare("INSERT INTO clientes (codigo, nome, cidade, grupo) VALUES (?, ?, ?, ?)").run(codigo, nome, cidade, grupo).lastInsertRowid
      );
      this._gravarSistemas(id, sistemaIds);
      this._adotarAtendimentosSemVinculo(id, nome);
      return id;
    })();
  }

  /**
   * O nome também fica copiado em cada atendimento/agendamento (ver
   * migracoes.js): é o que aparece se o cliente for excluído um dia. Por
   * isso um rename acompanha nos registros ligados a ele -- senão, depois
   * de uma exclusão, o histórico mostraria um nome que ele não usa há anos.
   */
  update(id, codigo, nome, cidade, sistemaIds, grupo, revisaoEsperada = null, usuarioNome = "") {
    return this.conn.transaction(() => {
      const resultado = this.conn
        .prepare("UPDATE clientes SET codigo = @codigo, nome = @nome, cidade = @cidade, grupo = @grupo, revisao = revisao + 1, atualizado_em = @atualizadoEm, atualizado_por = @atualizadoPor WHERE id = @id AND (@revisaoEsperada IS NULL OR revisao = @revisaoEsperada)")
        .run({ codigo, nome, cidade, grupo, id, revisaoEsperada, atualizadoEm: new Date().toISOString(), atualizadoPor: usuarioNome });
      if (resultado.changes) {
        this._gravarSistemas(id, sistemaIds);
        this.conn.prepare("UPDATE atualizacoes SET cliente = ? WHERE cliente_id = ?").run(nome, id);
        this.conn.prepare("UPDATE agendamentos SET cliente = ? WHERE cliente_id = ?").run(nome, id);
        this._adotarAtendimentosSemVinculo(id, nome);
      }
      return resultado.changes;
    })();
  }

  /**
   * Atendimentos e tarefas lançados para um nome que ainda não tinha
   * cadastro passam a pertencer ao cliente quando ele é criado (ou
   * renomeado) com esse nome -- era o que acontecia de graça quando a
   * ligação era só pelo texto, e sem isto a importação de uma planilha
   * antes do cadastro deixaria o histórico dele solto para sempre.
   */
  _adotarAtendimentosSemVinculo(id, nome) {
    for (const tabela of ["atualizacoes", "agendamentos"]) {
      this.conn
        .prepare(`UPDATE ${tabela} SET cliente_id = ?, cliente = ? WHERE cliente_id IS NULL AND lower(trim(cliente)) = lower(trim(?))`)
        .run(id, nome, nome);
    }
  }

  _gravarSistemas(clienteId, sistemaIds) {
    this.conn.prepare("DELETE FROM cliente_sistemas WHERE cliente_id = ?").run(clienteId);
    const ligar = this.conn.prepare("INSERT OR IGNORE INTO cliente_sistemas (cliente_id, sistema_id, ordem) VALUES (?, ?, ?)");
    sistemaIds.forEach((sistemaId, i) => ligar.run(clienteId, sistemaId, i));
  }

  /**
   * Marca um sistema em UM cliente, pelo nome -- usado para marcar "Suporte
   * Bredas" sozinho quando uma atualizacao registra essa observacao (ver
   * AtualizacaoService). Idempotente.
   * @returns {boolean} true se encontrou o cliente e marcou (false se nao existe ou ja tinha)
   */
  adicionarSistema(nomeCliente, sistemaId) {
    const cliente = this.resolverNome(nomeCliente);
    if (!cliente) return false;
    return this._marcar(cliente.id, sistemaId);
  }

  /**
   * Variante em lote: acrescenta um sistema a VÁRIOS clientes de uma vez,
   * pelos ids (a ação em lote da tela de Clientes). Quem já tiver o sistema
   * marcado não é tocado nem entra na contagem.
   * @returns {number} quantos clientes foram de fato alterados
   */
  addSistemaToMany(ids, sistemaId) {
    const limpos = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
    return this.conn.transaction(() => limpos.filter((id) => this._marcar(id, sistemaId)).length)();
  }

  _marcar(clienteId, sistemaId) {
    return (
      this.conn
        .prepare(
          `INSERT OR IGNORE INTO cliente_sistemas (cliente_id, sistema_id, ordem)
           SELECT @cliente, @sistema, coalesce(MAX(ordem) + 1, 0) FROM cliente_sistemas WHERE cliente_id = @cliente`
        )
        .run({ cliente: clienteId, sistema: sistemaId }).changes > 0
    );
  }
}

module.exports = { ClienteRepository };
