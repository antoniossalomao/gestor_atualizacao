const CHAVE_ATUALIZADOR_HABILITADO = "atualizador_habilitado";

/**
 * Liga/desliga, para o painel inteiro (não por conta), as telas de
 * Distribuição e Versões, o alerta automático de agente offline e as rotas
 * usadas pelo agente C# (`/api/update/*`, `/api/versoes/*`).
 *
 * Existe porque o Atualizador (agente local em C#) ainda está em pré-piloto
 * -- ver `atualizador/RISCOS-CONHECIDOS.md` -- e enquanto nenhum agente real
 * está em produção, deixar essas telas e o alerta ligados só produz ruído
 * (alarme falso de "agente offline" no Discord) e ocupa espaço na navegação
 * sem servir a nada.
 *
 * Gravado no banco (tabela `configuracoes_sistema`), não no `.env`: ao
 * contrário de `ConfiguracaoApiService`, o efeito precisa valer na hora, sem
 * reiniciar o servidor -- é o mesmo motivo pelo qual `PreferenciaService`
 * (preferências por conta) também não usa arquivo.
 */
class ConfiguracaoSistemaService {
  /**
   * @param {import('../database/Database').Database} db
   * @param {import('./HistoricoService').HistoricoService} [historico]
   */
  constructor(db, historico) {
    this.db = db;
    this.historico = historico || null;
  }

  /** Sem linha gravada ainda = habilitado (comportamento de antes desta funcionalidade existir). */
  atualizadorHabilitado() {
    const valor = this.db.configuracoesSistema.get(CHAVE_ATUALIZADOR_HABILITADO);
    return valor === null ? true : valor === "true";
  }

  /** @param {{id:number, nome:string}|null} usuarioLogado */
  ler(usuarioLogado) {
    return { atualizadorHabilitado: this.atualizadorHabilitado() };
  }

  /**
   * @param {{id:number, nome:string}|null} usuarioLogado
   * @param {boolean} habilitado
   */
  definir(usuarioLogado, habilitado) {
    const valor = Boolean(habilitado);
    this.db.configuracoesSistema.set(CHAVE_ATUALIZADOR_HABILITADO, String(valor));
    this.historico?.registrar(
      usuarioLogado,
      "atualizar",
      "configuracao",
      valor
        ? "Atualizador reativado (Distribuição, Versões e alerta de agentes voltaram a aparecer)"
        : "Atualizador desativado temporariamente (Distribuição, Versões e alerta de agentes escondidos)"
    );
    return this.ler(usuarioLogado);
  }
}

module.exports = { ConfiguracaoSistemaService };
