const { BaseRepository } = require("./BaseRepository");

/**
 * Lista de sistemas que um cliente pode ter (checkboxes na aba Clientes).
 * Vive no banco (nao mais fixa no codigo) para poder crescer pela propria
 * tela, em "+ Novo Sistema". Equivalente de "SistemaRepository" em
 * gestor/database.py.
 */
class SistemaRepository extends BaseRepository {
  get table() {
    return "sistemas";
  }

  versoes() {
    return this.conn.prepare("SELECT nome, ultima_versao AS data FROM sistemas ORDER BY nome").all();
  }

  salvarVersao(nome, data) {
    return this.conn.prepare("UPDATE sistemas SET ultima_versao = ? WHERE lower(nome) = lower(?)").run(data, nome).changes;
  }

  list() {
    return this.conn.prepare("SELECT nome FROM sistemas ORDER BY nome").all().map((r) => r.nome);
  }

  /** Adiciona um sistema novo; devolve false se ja existir (sem diferenciar maiusculas). */
  add(nome) {
    const existe = this.conn
      .prepare("SELECT COUNT(*) AS total FROM sistemas WHERE lower(nome) = lower(?)")
      .get(nome).total > 0;
    if (existe) return false;
    this.conn.prepare("INSERT INTO sistemas (nome) VALUES (?)").run(nome);
    return true;
  }

  /**
   * Remove um sistema do catalogo pelo nome (sem diferenciar maiusculas, pelo
   * mesmo motivo de `add`: o formulario nao deixa cadastrar "nfce" e "NFCe"
   * como coisas diferentes, entao excluir tambem nao deve exigir bater a
   * grafia exata). Devolve false se nao existia -- quem chama decide se isso
   * e' erro (ver ClienteService.removeSistema).
   */
  remove(nome) {
    const result = this.conn.prepare("DELETE FROM sistemas WHERE lower(nome) = lower(?)").run(nome);
    return result.changes > 0;
  }
}

module.exports = { SistemaRepository };
