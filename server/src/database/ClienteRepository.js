const { BaseRepository } = require("./BaseRepository");
const { buildOrderBy } = require("./sortHelper");

/** Colunas que a tela pode pedir para ordenar, e a expressao SQL segura correspondente. */
const SORT_MAP = {
  id: "id",
  codigo: "codigo COLLATE NOCASE",
  nome: "nome COLLATE NOCASE",
  cidade: "cidade COLLATE NOCASE",
  sistemasTexto: "sistemas COLLATE NOCASE",
};

/**
 * Cadastro de clientes e os sistemas que cada um possui (aba Clientes).
 * Equivalente de "ClienteRepository" em gestor/database.py.
 */
class ClienteRepository extends BaseRepository {
  get table() {
    return "clientes";
  }

  /** Uma página de clientes. Devolve `{ rows, total, page, pageSize }`. */
  list(search = "", { page = 1, pageSize = 50, sortBy, sortDir } = {}) {
    const where = search ? "WHERE nome LIKE @like OR cidade LIKE @like OR sistemas LIKE @like" : "";
    const params = search ? { like: `%${search}%` } : {};

    const total = this.conn.prepare(`SELECT COUNT(*) AS total FROM clientes ${where}`).get(params).total;

    const offset = Math.max(0, (page - 1) * pageSize);
    const orderBy = buildOrderBy(SORT_MAP, sortBy, sortDir, "nome COLLATE NOCASE ASC");
    const rows = this.conn
      .prepare(`SELECT id, codigo, nome, cidade, sistemas FROM clientes ${where} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: pageSize, offset });
    return { rows, total, page, pageSize };
  }

  /** Lista simples de nomes, usada para preencher sugestoes de autocompletar. */
  names() {
    return this.conn.prepare("SELECT nome FROM clientes ORDER BY nome").all().map((r) => r.nome);
  }

  /** (codigo, nome, cidade) de todos os clientes -- usado no calculo de desatualizados. */
  allBasic() {
    return this.conn.prepare("SELECT codigo, nome, cidade FROM clientes").all();
  }

  /** Igual allBasic(), mas incluindo "sistemas" (texto separado por vírgula) -- usado no relatório por sistema. */
  allBasicComSistemas() {
    return this.conn.prepare("SELECT nome, cidade, sistemas FROM clientes").all();
  }

  getByNome(nome) {
    return (
      this.conn.prepare("SELECT id, codigo, nome, cidade, sistemas FROM clientes WHERE nome = ?").get(nome) || null
    );
  }

  getById(id) {
    return this.conn.prepare("SELECT id, codigo, nome, cidade, sistemas FROM clientes WHERE id = ?").get(id) || null;
  }

  /**
   * True se ja existe outro cliente com esse nome (sem diferenciar
   * maiusculas/minusculas). Usado para bloquear cadastro duplicado: como o
   * historico de atualizacoes/agendamentos liga ao cliente pelo NOME (nao
   * por id), dois clientes com o mesmo nome fariam a Consulta e o Resumo
   * enxergarem so um deles, escondendo o outro sem aviso.
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

  insert(codigo, nome, cidade, sistemas) {
    this.conn
      .prepare("INSERT INTO clientes (codigo, nome, cidade, sistemas) VALUES (?, ?, ?, ?)")
      .run(codigo, nome, cidade, sistemas);
  }

  /**
   * O historico de atualizacoes/agendamentos guarda o NOME do cliente como
   * texto, nao o id. Se o nome mudar aqui, e preciso propagar a mudanca
   * para essas duas tabelas tambem -- senao os registros antigos "perdem a
   * ligacao" com o cliente renomeado e somem da Consulta e das contagens
   * do Resumo.
   */
  update(id, codigo, nome, cidade, sistemas) {
    const antigo = this.conn.prepare("SELECT nome FROM clientes WHERE id = ?").get(id);
    this.conn
      .prepare("UPDATE clientes SET codigo = ?, nome = ?, cidade = ?, sistemas = ? WHERE id = ?")
      .run(codigo, nome, cidade, sistemas, id);
    if (antigo && antigo.nome !== nome) {
      this.conn.prepare("UPDATE atualizacoes SET cliente = ? WHERE cliente = ?").run(nome, antigo.nome);
      this.conn.prepare("UPDATE agendamentos SET cliente = ? WHERE cliente = ?").run(nome, antigo.nome);
    }
  }

  /**
   * Tira um nome de sistema da lista (texto "a, b, c") de todo cliente que o
   * tiver marcado. Chamado quando o próprio sistema é excluído do catálogo
   * (ver SistemaRepository.remove) -- sem isso, o cliente ficaria com uma
   * "tag" órfã que a tela de Clientes não teria mais como desmarcar: o
   * catálogo (`GET /sistemas`) não devolve mais esse nome, então o checkbox
   * correspondente simplesmente some do formulário, mas o texto salvo
   * continuaria lá, sobrevivendo a qualquer edição futura do cliente.
   *
   * Feito em JavaScript (não com um UPDATE + REPLACE em SQL) porque o valor
   * é uma lista separada por ", " -- um REPLACE de texto puro apagaria
   * errado se um sistema fosse prefixo de outro (ex.: remover "NFCe"
   * também apagaria pedaço de um hipotético "NFCe Contábil"). Comparando a
   * lista já dividida e recortada, a remoção é exata.
   *
   * @returns {number} quantos clientes tinham esse sistema marcado
   */
  removeSistemaDeTodos(nomeSistema) {
    const linhas = this.conn
      .prepare("SELECT id, sistemas FROM clientes WHERE sistemas IS NOT NULL AND sistemas != ''")
      .all();
    const update = this.conn.prepare("UPDATE clientes SET sistemas = ? WHERE id = ?");
    let afetados = 0;
    const emLote = this.conn.transaction((lista) => {
      for (const linha of lista) {
        const sistemas = linha.sistemas.split(",").map((s) => s.trim()).filter(Boolean);
        if (!sistemas.includes(nomeSistema)) continue;
        update.run(sistemas.filter((s) => s !== nomeSistema).join(", "), linha.id);
        afetados += 1;
      }
    });
    emLote(linhas);
    return afetados;
  }
}

module.exports = { ClienteRepository };
