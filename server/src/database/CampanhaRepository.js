const { BaseRepository } = require("./BaseRepository");

const CAMPOS = `c.id, c.titulo, c.descricao, c.sistema_id AS sistemaId, s.nome AS sistema,
  c.versao_alvo AS versaoAlvo, c.prazo, c.cidade, c.criada_em AS criadaEm, c.criada_por AS criadaPor,
  c.encerrada_em AS encerradaEm, c.encerrada_por AS encerradaPor,
  c.total_final AS totalFinal, c.atendidos_final AS atendidosFinal,
  CASE WHEN c.so_selecionados = 1 THEN 'escolhidos' ELSE 'todos' END AS publico`;

/**
 * Campanhas de atualização (aba Campanhas). Só a meta mora aqui; os
 * clientes e quem já foi atendido são calculados por CampanhaService a
 * partir de `cliente_sistemas` e das atualizações -- ver migracoes.js
 * (migração 4) e docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0009.
 */
class CampanhaRepository extends BaseRepository {
  get table() {
    return "campanhas";
  }

  /**
   * Ativas primeiro (prazo mais próximo no topo, sem prazo no fim), depois as
   * encerradas, da encerrada mais recentemente para a mais antiga. Os CASE
   * fazem o prazo valer SÓ para as ativas: aplicado a todas, ele passava na
   * frente da data de encerramento e as encerradas saíam por prazo.
   * @param {"ativas"|"encerradas"|"todas"} situacao
   */
  list(situacao = "ativas") {
    const where = situacao === "ativas" ? "WHERE c.encerrada_em IS NULL" : situacao === "encerradas" ? "WHERE c.encerrada_em IS NOT NULL" : "";
    return this.conn
      .prepare(
        `SELECT ${CAMPOS} FROM campanhas c JOIN sistemas s ON s.id = c.sistema_id ${where}
         ORDER BY (c.encerrada_em IS NOT NULL),
                  CASE WHEN c.encerrada_em IS NULL THEN (c.prazo = '') END,
                  CASE WHEN c.encerrada_em IS NULL THEN substr(c.prazo,7,4) || substr(c.prazo,4,2) || substr(c.prazo,1,2) END,
                  c.encerrada_em DESC, c.id DESC`
      )
      .all();
  }

  find(id) {
    return this._preparado(`SELECT ${CAMPOS} FROM campanhas c JOIN sistemas s ON s.id = c.sistema_id WHERE c.id = ?`).get(id);
  }

  insert({ titulo, descricao, sistemaId, versaoAlvo, prazo, cidade, criadaPor, publico = "todos", clienteIds = [] }) {
    return this.conn.transaction(() => {
      const info = this
        ._preparado(
          `INSERT INTO campanhas (titulo, descricao, sistema_id, versao_alvo, prazo, cidade, so_selecionados, criada_em, criada_por)
           VALUES (@titulo, @descricao, @sistemaId, @versaoAlvo, @prazo, @cidade, @soSelecionados, @criadaEm, @criadaPor)`
        )
        .run({ titulo, descricao, sistemaId, versaoAlvo, prazo, cidade, criadaPor, soSelecionados: publico === "escolhidos" ? 1 : 0, criadaEm: new Date().toISOString() });
      const id = Number(info.lastInsertRowid);
      this.definirClientes(id, clienteIds);
      return id;
    })();
  }

  /** Sistema e versão-alvo NÃO entram: são a meta, e a meta não muda depois de criada. */
  update(id, { titulo, descricao, prazo, cidade, publico = "todos", clienteIds = [] }) {
    return this.conn.transaction(() => {
      const mudou = this
        ._preparado("UPDATE campanhas SET titulo = @titulo, descricao = @descricao, prazo = @prazo, cidade = @cidade, so_selecionados = @soSelecionados WHERE id = @id")
        .run({ id, titulo, descricao, prazo, cidade, soSelecionados: publico === "escolhidos" ? 1 : 0 }).changes;
      this.definirClientes(id, clienteIds);
      return mudou;
    })();
  }

  /** Ids dos clientes escolhidos para a campanha (vazio quando ela vale para o sistema inteiro). */
  idsClientes(id) {
    return this._preparado("SELECT cliente_id FROM campanha_clientes WHERE campanha_id = ?").all(id).map((r) => r.cliente_id);
  }

  /** Acrescenta à lista de escolhidos; quem já está nela é ignorado. */
  adicionarClientes(id, clienteIds) {
    const ligar = this._preparado("INSERT OR IGNORE INTO campanha_clientes (campanha_id, cliente_id) VALUES (?, ?)");
    this.conn.transaction(() => {
      for (const clienteId of clienteIds) ligar.run(id, clienteId);
    })();
  }

  /** Tira um cliente da lista de escolhidos. Devolve quantas ligações saíram (0 = ele não estava). */
  removerCliente(id, clienteId) {
    return this._preparado("DELETE FROM campanha_clientes WHERE campanha_id = ? AND cliente_id = ?").run(id, clienteId).changes;
  }

  /** Troca a lista de escolhidos inteira: a tela sempre manda a lista final, não o que mudou. */
  definirClientes(id, clienteIds) {
    this._preparado("DELETE FROM campanha_clientes WHERE campanha_id = ?").run(id);
    const ligar = this._preparado("INSERT INTO campanha_clientes (campanha_id, cliente_id) VALUES (?, ?)");
    for (const clienteId of clienteIds) ligar.run(id, clienteId);
  }

  encerrar(id, { usuarioNome, total, atendidos }) {
    return this
      ._preparado(
        `UPDATE campanhas SET encerrada_em = @agora, encerrada_por = @usuarioNome, total_final = @total, atendidos_final = @atendidos
         WHERE id = @id AND encerrada_em IS NULL`
      )
      .run({ id, usuarioNome, total, atendidos, agora: new Date().toISOString() }).changes;
  }

  reabrir(id) {
    return this
      ._preparado("UPDATE campanhas SET encerrada_em = NULL, encerrada_por = NULL, total_final = NULL, atendidos_final = NULL WHERE id = ? AND encerrada_em IS NOT NULL")
      .run(id).changes;
  }
}

module.exports = { CampanhaRepository };
