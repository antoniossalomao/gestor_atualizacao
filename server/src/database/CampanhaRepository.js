const { BaseRepository } = require("./BaseRepository");

const CAMPOS = `c.id, c.titulo, c.descricao, c.sistema_id AS sistemaId, s.nome AS sistema,
  c.versao_alvo AS versaoAlvo, c.prazo, c.criada_em AS criadaEm, c.criada_por AS criadaPor,
  c.encerrada_em AS encerradaEm, c.encerrada_por AS encerradaPor,
  c.total_final AS totalFinal, c.atendidos_final AS atendidosFinal`;

/**
 * Campanhas de atualização (aba Campanhas). Só a meta mora aqui; os
 * clientes e quem já foi atendido são calculados por CampanhaService a
 * partir de `cliente_sistemas` e dos atendimentos -- ver migracoes.js
 * (migração 4) e docs/adr/0009-campanhas-de-atualizacao.md.
 */
class CampanhaRepository extends BaseRepository {
  get table() {
    return "campanhas";
  }

  /**
   * Ativas primeiro (prazo mais próximo no topo, sem prazo no fim), depois as
   * encerradas, da mais recente para a mais antiga.
   * @param {"ativas"|"encerradas"|"todas"} situacao
   */
  list(situacao = "ativas") {
    const where = situacao === "ativas" ? "WHERE c.encerrada_em IS NULL" : situacao === "encerradas" ? "WHERE c.encerrada_em IS NOT NULL" : "";
    return this.conn
      .prepare(
        `SELECT ${CAMPOS} FROM campanhas c JOIN sistemas s ON s.id = c.sistema_id ${where}
         ORDER BY (c.encerrada_em IS NOT NULL),
                  (c.prazo = ''), substr(c.prazo,7,4) || substr(c.prazo,4,2) || substr(c.prazo,1,2),
                  c.encerrada_em DESC, c.id DESC`
      )
      .all();
  }

  find(id) {
    return this.conn.prepare(`SELECT ${CAMPOS} FROM campanhas c JOIN sistemas s ON s.id = c.sistema_id WHERE c.id = ?`).get(id);
  }

  insert({ titulo, descricao, sistemaId, versaoAlvo, prazo, criadaPor }) {
    const info = this.conn
      .prepare(
        `INSERT INTO campanhas (titulo, descricao, sistema_id, versao_alvo, prazo, criada_em, criada_por)
         VALUES (@titulo, @descricao, @sistemaId, @versaoAlvo, @prazo, @criadaEm, @criadaPor)`
      )
      .run({ titulo, descricao, sistemaId, versaoAlvo, prazo, criadaPor, criadaEm: new Date().toISOString() });
    return Number(info.lastInsertRowid);
  }

  /** Sistema e versão-alvo NÃO entram: são a meta, e a meta não muda depois de criada. */
  update(id, { titulo, descricao, prazo }) {
    return this.conn.prepare("UPDATE campanhas SET titulo = @titulo, descricao = @descricao, prazo = @prazo WHERE id = @id").run({ id, titulo, descricao, prazo }).changes;
  }

  encerrar(id, { usuarioNome, total, atendidos }) {
    return this.conn
      .prepare(
        `UPDATE campanhas SET encerrada_em = @agora, encerrada_por = @usuarioNome, total_final = @total, atendidos_final = @atendidos
         WHERE id = @id AND encerrada_em IS NULL`
      )
      .run({ id, usuarioNome, total, atendidos, agora: new Date().toISOString() }).changes;
  }

  reabrir(id) {
    return this.conn
      .prepare("UPDATE campanhas SET encerrada_em = NULL, encerrada_por = NULL, total_final = NULL, atendidos_final = NULL WHERE id = ? AND encerrada_em IS NOT NULL")
      .run(id).changes;
  }
}

module.exports = { CampanhaRepository };
