const { BaseRepository } = require("./BaseRepository");

/**
 * Acessos remotos (AnyDesk / Suporte Bredas) cadastrados por máquina de cada
 * cliente -- aba Clientes, botão "Acessos". Tabela nova, sem equivalente no
 * app Python original.
 */
class ClienteAcessoRepository extends BaseRepository {
  get table() {
    return "cliente_acessos";
  }

  listByCliente(clienteId) {
    return this.conn
      .prepare(
        `SELECT id, cliente_id AS clienteId, maquina, anydesk, suporte_bredas AS suporteBredas, observacoes
           FROM cliente_acessos
          WHERE cliente_id = ?
          ORDER BY id`
      )
      .all(clienteId);
  }

  getById(id) {
    return (
      this.conn
        .prepare(
          `SELECT id, cliente_id AS clienteId, maquina, anydesk, suporte_bredas AS suporteBredas, observacoes
             FROM cliente_acessos
            WHERE id = ?`
        )
        .get(id) || null
    );
  }

  insert(clienteId, maquina, anydesk, suporteBredas, observacoes) {
    const info = this.conn
      .prepare("INSERT INTO cliente_acessos (cliente_id, maquina, anydesk, suporte_bredas, observacoes) VALUES (?, ?, ?, ?, ?)")
      .run(clienteId, maquina, anydesk, suporteBredas, observacoes);
    return info.lastInsertRowid;
  }

  update(id, maquina, anydesk, suporteBredas, observacoes) {
    this.conn
      .prepare("UPDATE cliente_acessos SET maquina = ?, anydesk = ?, suporte_bredas = ?, observacoes = ? WHERE id = ?")
      .run(maquina, anydesk, suporteBredas, observacoes, id);
  }
}

module.exports = { ClienteAcessoRepository };
