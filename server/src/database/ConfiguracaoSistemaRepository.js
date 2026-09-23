const { BaseRepository } = require("./BaseRepository");

/**
 * Configurações do sistema como um todo (não da conta de quem está logado --
 * ver `usuario_preferencias`/PreferenciaService para isso). Chave-valor
 * simples: hoje só guarda se o Atualizador (agentes C# + distribuição de
 * versão) está habilitado, mas o formato aguenta mais chaves no futuro sem
 * migração nova.
 */
class ConfiguracaoSistemaRepository extends BaseRepository {
  get table() {
    return "configuracoes_sistema";
  }

  /** @returns {string|null} o valor gravado, ou null se a chave nunca foi definida. */
  get(chave) {
    const row = this.conn.prepare("SELECT valor FROM configuracoes_sistema WHERE chave = ?").get(chave);
    return row ? row.valor : null;
  }

  /** Grava (ou substitui) o valor de uma chave. */
  set(chave, valor) {
    this.conn
      .prepare(
        `INSERT INTO configuracoes_sistema (chave, valor, atualizado_em) VALUES (?, ?, datetime('now'))
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`
      )
      .run(chave, valor);
  }

  /**
   * Grava várias chaves numa transação só: salvar a tela de regras é uma
   * decisão, e metade dela gravada (a outra metade recusada por erro no meio)
   * deixaria a equipe com uma combinação que ninguém escolheu.
   * @param {Array<[string, string]>} pares chave e valor
   */
  setVarias(pares) {
    this.conn.transaction(() => {
      for (const [chave, valor] of pares) this.set(chave, valor);
    })();
  }
}

module.exports = { ConfiguracaoSistemaRepository };
