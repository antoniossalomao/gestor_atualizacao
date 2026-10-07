const { BaseRepository } = require("./BaseRepository");

/**
 * Acessos remotos (AnyDesk / Suporte Bredas) cadastrados por máquina de cada
 * cliente -- aba Clientes, botão "Acessos".
 */
class ClienteAcessoRepository extends BaseRepository {
  get table() {
    return "cliente_acessos";
  }

  listarPorCliente(clienteId) {
    return this
      ._preparado(
        `SELECT id, cliente_id AS clienteId, maquina, anydesk, suporte_bredas AS suporteBredas, observacoes
           FROM cliente_acessos
          WHERE cliente_id = ?
          ORDER BY id`
      )
      .all(clienteId);
  }

  obterPorId(id) {
    return (
      this
        ._preparado(
          `SELECT id, cliente_id AS clienteId, maquina, anydesk, suporte_bredas AS suporteBredas, observacoes
             FROM cliente_acessos
            WHERE id = ?`
        )
        .get(id) || null
    );
  }

  insert(clienteId, maquina, anydesk, suporteBredas, observacoes) {
    const info = this
      ._preparado("INSERT INTO cliente_acessos (cliente_id, maquina, anydesk, suporte_bredas, observacoes) VALUES (?, ?, ?, ?, ?)")
      .run(clienteId, maquina, anydesk, suporteBredas, observacoes);
    return info.lastInsertRowid;
  }

  update(id, maquina, anydesk, suporteBredas, observacoes) {
    this
      ._preparado("UPDATE cliente_acessos SET maquina = ?, anydesk = ?, suporte_bredas = ?, observacoes = ? WHERE id = ?")
      .run(maquina, anydesk, suporteBredas, observacoes, id);
  }
}

module.exports = { ClienteAcessoRepository };
