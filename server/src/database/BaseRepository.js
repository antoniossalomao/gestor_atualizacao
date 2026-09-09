/**
 * Comportamento comum a todos os repositorios (excluir, contar).
 *
 * Cada tabela tem sua propria classe (ClienteRepository, etc.) que herda
 * desta e acrescenta as consultas especificas dela. Nenhuma outra parte do
 * programa deveria montar SQL diretamente -- sempre atraves de um metodo
 * de um repositorio, para que toda regra de acesso a uma tabela fique
 * concentrada num unico lugar, facil de achar e de revisar.
 *
 * Usa "better-sqlite3", que e SINCRONO (nao usa "await" pra ler/escrever
 * no banco) -- diferente da maioria das bibliotecas Node, mas e o mesmo
 * jeito de programar que o "sqlite3" do Python original usava, o que deixa
 * o codigo mais direto de ler e evita uma camada de complexidade (Promises
 * encadeadas) que aqui nao traz beneficio nenhum: o SQLite le do disco tao
 * rapido que "esperar de forma assincrona" nao ajudaria em nada.
 */
class BaseRepository {
  /** @param {import('better-sqlite3').Database} conn conexao aberta com o banco */
  constructor(conn) {
    this.conn = conn;
  }

  /** Nome da tabela no banco -- cada subclasse deve sobrescrever isto. */
  get table() {
    throw new Error("Subclasse de BaseRepository precisa definir 'table'.");
  }

  /**
   * Apaga o registro cujo id bate com o informado e devolve quantas linhas
   * foram afetadas -- 0 significa "esse id nao existe (mais)".
   *
   * Quem chama precisa desse numero para nao responder "excluido com
   * sucesso" a uma exclusao que nao aconteceu: com varias pessoas usando o
   * app ao mesmo tempo, o registro pode ter sido apagado por outra pessoa
   * entre a tela ser carregada e o botao ser clicado.
   */
  delete(id) {
    return this.conn.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id).changes;
  }

  /**
   * Apaga varios registros de uma vez e devolve quantos sairam de fato.
   *
   * Numa transacao: ou todos somem, ou nenhum some. Sem isso, um erro no meio
   * de uma exclusao de trinta registros deixaria dezessete apagados e treze
   * no lugar, sem ninguem saber onde parou -- e o "Desfazer" da tela, que
   * recadastra o que foi excluido, recriaria duplicatas dos que sobreviveram.
   *
   * Os ids entram como parametros posicionais (`?`), um por id, e nao
   * interpolados no texto do SQL: e' o mesmo cuidado do resto dos
   * repositorios, e aqui a lista vem direto do que o navegador mandou.
   */
  deleteMany(ids) {
    const limpos = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
    if (limpos.length === 0) return 0;
    const marcadores = limpos.map(() => "?").join(", ");
    const stmt = this.conn.prepare(`DELETE FROM ${this.table} WHERE id IN (${marcadores})`);
    return this.conn.transaction(() => stmt.run(...limpos).changes)();
  }

  /** Quantos registros existem na tabela. */
  count() {
    const row = this.conn.prepare(`SELECT COUNT(*) AS total FROM ${this.table}`).get();
    return row.total;
  }
}

module.exports = { BaseRepository };
