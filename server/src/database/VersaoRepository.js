const { BaseRepository } = require("./BaseRepository");

/** Colunas devolvidas em toda leitura de versao -- uma lista so, para as
 *  quatro consultas nao sairem de sincronia quando uma coluna nova entra. */
const CAMPOS = `
  id, sistema, versao, status,
  script_url AS scriptUrl, pacotes_json AS pacotesJson, observacoes,
  tamanho_bytes AS tamanhoBytes,
  criado_em AS criadoEm, publicado_em AS publicadoEm,
  substituido_em AS substituidoEm, substituido_por AS substituidoPor
`;

/**
 * Repositorio da distribuicao do Atualizador.
 *
 * Esta classe concentra todo o SQL das versoes e dos retornos dos agentes.
 * A camada de servico nao conhece nomes de tabelas nem monta consultas:
 * ela apenas chama os metodos deste repositorio.
 */
class VersaoRepository extends BaseRepository {
  get table() {
    return "versoes_atualizador";
  }

  list() {
    return this.conn.prepare(`SELECT ${CAMPOS} FROM ${this.table} ORDER BY id DESC`).all();
  }

  find(id) {
    return this.conn.prepare(`SELECT ${CAMPOS} FROM ${this.table} WHERE id = ?`).get(id);
  }

  /**
   * Ultima versao publicada DE UM SISTEMA.
   *
   * Antes este metodo ignorava o sistema e devolvia a ultima publicada de
   * todas -- o que significa que o agente do B_NFE podia receber, e instalar,
   * o pacote do B_VENDAS. O parametro nao e opcional de proposito: obrigar a
   * dizer o sistema impede que a chamada errada volte a existir por descuido.
   */
  latestPublished(sistema) {
    return this.conn
      .prepare(`SELECT ${CAMPOS} FROM ${this.table} WHERE status = 'publicada' AND sistema = ? ORDER BY id DESC LIMIT 1`)
      .get(sistema);
  }

  /** Uma linha por sistema com versao no ar agora -- alimenta o painel. */
  publicadasPorSistema() {
    return this.conn.prepare(`SELECT ${CAMPOS} FROM ${this.table} WHERE status = 'publicada' ORDER BY sistema COLLATE NOCASE`).all();
  }

  /** Versoes publicadas do mesmo sistema, exceto a que acabou de subir. */
  publicadasDoSistemaExceto(sistema, id) {
    return this.conn
      .prepare(`SELECT ${CAMPOS} FROM ${this.table} WHERE status = 'publicada' AND sistema = ? AND id <> ?`)
      .all(sistema, id);
  }

  insert(data) {
    const result = this.conn
      .prepare(
        `INSERT INTO ${this.table} (sistema, versao, status, script_url, pacotes_json, observacoes, tamanho_bytes, criado_em, criado_por)
         VALUES (@sistema, @versao, 'rascunho', @scriptUrl, @pacotesJson, @observacoes, @tamanhoBytes, @criadoEm, @criadoPor)`
      )
      .run(data);
    return this.find(result.lastInsertRowid);
  }

  update(id, data) {
    this.conn
      .prepare(
        `UPDATE ${this.table}
         SET sistema = @sistema, versao = @versao, script_url = @scriptUrl,
             pacotes_json = @pacotesJson, observacoes = @observacoes
         WHERE id = @id`
      )
      .run({ ...data, id });
    return this.find(id);
  }

  publish(id, publicadoEm) {
    this.conn
      .prepare(`UPDATE ${this.table} SET status = 'publicada', publicado_em = @publicadoEm, substituido_em = NULL, substituido_por = NULL WHERE id = @id`)
      .run({ id, publicadoEm });
    return this.find(id);
  }

  /**
   * Tira de circulacao as versoes indicadas, anotando quando e por qual
   * versao elas foram substituidas.
   */
  substituir(ids, quando, porId) {
    if (ids.length === 0) return;
    const stmt = this.conn.prepare(
      `UPDATE ${this.table} SET status = 'substituida', substituido_em = @quando, substituido_por = @porId WHERE id = @id`
    );
    const emLote = this.conn.transaction((lista) => {
      for (const id of lista) stmt.run({ id, quando, porId });
    });
    emLote(ids);
  }

  remove(id) {
    this.conn.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
  }

  /**
   * Retornos dos agentes, com filtros opcionais.
   *
   * O `LEFT JOIN` normaliza CNPJ dos dois lados (tira ponto, barra, traco e
   * espaco) porque o cadastro de clientes guarda o codigo formatado e o
   * agente manda so os digitos -- sem isso nenhum retorno casaria com uma
   * empresa e o painel mostraria CNPJ cru em vez de nome.
   */
  logs({ limit = 50, sistema, status, cnpj, desde } = {}) {
    const where = ["1=1"];
    const params = {};
    if (sistema) {
      where.push("l.sistema = @sistema");
      params.sistema = sistema;
    }
    if (status) {
      where.push("UPPER(l.status) = UPPER(@status)");
      params.status = status;
    }
    if (cnpj) {
      where.push("l.cnpj = @cnpj");
      params.cnpj = cnpj;
    }
    if (desde) {
      where.push("l.criado_em >= @desde");
      params.desde = desde;
    }
    params.limit = limit;
    return this.conn
      .prepare(
        `SELECT l.id, l.cnpj, COALESCE(c.nome, c.codigo, l.cnpj) AS empresa, c.cidade AS cidade,
                l.hwid, l.maquina, l.sistema, l.versao, l.versao_anterior AS versaoAnterior,
                l.duracao_ms AS duracaoMs, l.status, l.detalhes, l.criado_em AS criadoEm
         FROM atualizador_logs l
         LEFT JOIN clientes c
           ON REPLACE(REPLACE(REPLACE(REPLACE(c.codigo, '.', ''), '/', ''), '-', ''), ' ', '')
            = REPLACE(REPLACE(REPLACE(REPLACE(l.cnpj, '.', ''), '/', ''), '-', ''), ' ', '')
         WHERE ${where.join(" AND ")}
         ORDER BY l.id DESC
         LIMIT @limit`
      )
      .all(params);
  }

  /**
   * Uma linha por agente (CNPJ), ja agregada NO BANCO.
   *
   * Antes essa contagem era feita no navegador, em cima dos 30 ultimos
   * registros que a listagem devolvia -- ou seja, "total de execucoes" e
   * "quantidade de erros" eram, na verdade, "quantos dos ultimos 30". Com
   * mais de trinta retornos no dia, os numeros do painel simplesmente nao
   * batiam com a realidade. Agregar em SQL le a tabela inteira e ainda e
   * mais rapido.
   */
  agentes() {
    return this.conn
      .prepare(
        // ROW_NUMBER em vez de MAX(id): "ultimo contato" e um conceito de
        // TEMPO, e id so coincide com ordem cronologica enquanto os retornos
        // chegam perfeitamente em ordem. Basta um agente com relogio atrasado,
        // uma reentrega da fila ou uma importacao de logs antigos para o
        // MAX(id) apontar para uma execucao mais velha -- e o painel passaria
        // a mostrar a versao errada como "instalada". O id fica so como
        // desempate, para o resultado ser estavel quando dois registros tem o
        // mesmo horario.
        `WITH ordenados AS (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY cnpj ORDER BY criado_em DESC, id DESC) AS rn
           FROM atualizador_logs
         ),
         ultimo AS (SELECT * FROM ordenados WHERE rn = 1)
         SELECT
           l.cnpj,
           COALESCE(c.nome, c.codigo, l.cnpj) AS empresa,
           c.cidade AS cidade,
           u2.status        AS ultimoStatus,
           u2.sistema       AS ultimoSistema,
           u2.versao        AS ultimaVersao,
           u2.detalhes      AS ultimoDetalhe,
           u2.maquina       AS maquina,
           u2.hwid          AS hwid,
           u2.criado_em     AS ultimaComunicacao,
           COUNT(*)                                                          AS total,
           SUM(CASE WHEN UPPER(l.status) IN ('ERRO','FALHA') THEN 1 ELSE 0 END) AS falhas,
           SUM(CASE WHEN UPPER(l.status) IN ('OK','SUCESSO','ATUALIZADO') THEN 1 ELSE 0 END) AS sucessos,
           MIN(l.criado_em)                                                  AS primeiraComunicacao
         FROM atualizador_logs l
         JOIN ultimo u2 ON u2.cnpj = l.cnpj
         LEFT JOIN clientes c
           ON REPLACE(REPLACE(REPLACE(REPLACE(c.codigo, '.', ''), '/', ''), '-', ''), ' ', '')
            = REPLACE(REPLACE(REPLACE(REPLACE(l.cnpj, '.', ''), '/', ''), '-', ''), ' ', '')
         GROUP BY l.cnpj
         ORDER BY u2.criado_em DESC`
      )
      .all();
  }

  /** Distribuicao de retornos por status, para os indicadores do topo. */
  contagemPorStatus(desde) {
    return this.conn
      .prepare(
        `SELECT UPPER(status) AS status, COUNT(*) AS total
         FROM atualizador_logs
         WHERE (@desde IS NULL OR criado_em >= @desde)
         GROUP BY UPPER(status)
         ORDER BY total DESC`
      )
      .all({ desde: desde || null });
  }

  addLog(data) {
    this.conn
      .prepare(
        `INSERT INTO atualizador_logs (cnpj, hwid, maquina, sistema, versao, versao_anterior, duracao_ms, status, detalhes, criado_em)
         VALUES (@cnpj, @hwid, @maquina, @sistema, @versao, @versaoAnterior, @duracaoMs, @status, @detalhes, @criadoEm)`
      )
      .run(data);
  }

  /**
   * Situação (offline/erro) em que este agente estava na última vez que
   * alertamos o Discord sobre ele -- null quando não está em alerta agora.
   * Ver AlertaAgenteService: evita reenviar o mesmo aviso todo ciclo
   * enquanto o problema continua.
   */
  situacaoAlertada(cnpj) {
    const row = this.conn.prepare("SELECT situacao FROM agente_alertas WHERE cnpj = ?").get(cnpj);
    return row ? row.situacao : null;
  }

  /** Marca (ou atualiza) que este agente está em alerta por causa desta situação. */
  marcarSituacaoAlertada(cnpj, situacao) {
    this.conn
      .prepare(
        `INSERT INTO agente_alertas (cnpj, situacao, atualizado_em) VALUES (@cnpj, @situacao, @agora)
         ON CONFLICT(cnpj) DO UPDATE SET situacao = excluded.situacao, atualizado_em = excluded.atualizado_em`
      )
      .run({ cnpj, situacao, agora: new Date().toISOString() });
  }

  /** Tira o agente do alerta -- chamado quando ele normaliza. */
  limparSituacaoAlertada(cnpj) {
    this.conn.prepare("DELETE FROM agente_alertas WHERE cnpj = ?").run(cnpj);
  }
}

module.exports = { VersaoRepository };
