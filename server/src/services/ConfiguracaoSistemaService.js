const { ForbiddenError, ValidationError } = require("../shared/errors");
const { REGRAS, validarRegra, converterRegra } = require("../config/regrasEquipe");

/** O valor do .env.example. Chave igual a esta é o mesmo que não ter chave. */
const TOKEN_DE_EXEMPLO = "troque-por-um-token-longo-e-aleatorio";

/**
 * Regras da equipe inteira (não de uma conta) -- ver a lista e o porquê de
 * morarem no banco em config/regrasEquipe.js.
 *
 * Começou guardando só se o Atualizador está habilitado, e o nome ficou: o
 * serviço é o mesmo, só cresceu. Tudo vale na hora, sem reiniciar o servidor
 * -- quem depende de uma regra lê de novo a cada uso (`valor`) ou se inscreve
 * em `aoMudar` para reagir (o timer do alerta de agentes).
 *
 * Leitura em dois níveis:
 *  - `ler` (qualquer conta logada): só as regras marcadas `publica`, que as
 *    telas usam para explicar o que mostram ("parados há mais de N dias");
 *  - `completa` (só administrador): todas, com a definição de cada uma e a
 *    situação da chave dos agentes.
 */
class ConfiguracaoSistemaService {
  /**
   * @param {import('../database/Database').Database} db
   * @param {import('./HistoricoService').HistoricoService} [historico]
   * @param {{tokenAgentes?: string}} [opcoes] a AGENT_API_TOKEN do .env, só
   *   para dizer à tela se ela está configurada -- o valor em si nunca sai
   *   daqui.
   */
  constructor(db, historico, { tokenAgentes = "" } = {}) {
    this.db = db;
    this.historico = historico || null;
    this.tokenAgentes = tokenAgentes || "";
    /** @type {Array<(mudou: string[]) => void>} */
    this._ouvintes = [];
  }

  /** Valor atual de uma regra, já no tipo certo. */
  valor(nome) {
    if (!REGRAS[nome]) throw new Error(`Regra desconhecida: ${nome}`);
    return converterRegra(nome, this.db.configuracoesSistema.get(REGRAS[nome].chave));
  }

  /** Atalho usado em toda rota do Atualizador (ver requireAtualizadorHabilitado). */
  atualizadorHabilitado() {
    return this.valor("atualizadorHabilitado");
  }

  /** As regras que qualquer conta logada pode ver. */
  ler() {
    return this._valores((regra) => regra.publica);
  }

  /** Todas as regras, com a definição de cada uma. Só administrador. */
  completa(usuarioLogado) {
    this._exigirAdmin(usuarioLogado);
    const definicoes = Object.fromEntries(
      Object.entries(REGRAS).map(([nome, r]) => [
        nome,
        { tipo: r.tipo, rotulo: r.rotulo, padrao: r.padrao, min: r.min, max: r.max, protocolos: r.protocolos },
      ])
    );
    return { valores: this._valores(() => true), definicoes, chaveAgentes: this._situacaoChave() };
  }

  /**
   * Muda uma ou mais regras. Só as que vierem em `parcial`; as outras ficam.
   * Tudo ou nada: uma regra inválida recusa o pedido inteiro, antes de gravar.
   * @param {{id:number, nome:string, role:string}} usuarioLogado
   * @param {Record<string, unknown>} parcial
   */
  atualizar(usuarioLogado, parcial) {
    this._exigirAdmin(usuarioLogado);
    if (!parcial || typeof parcial !== "object" || Array.isArray(parcial)) {
      throw new ValidationError("Envie as regras a alterar.");
    }

    const novos = {};
    for (const [nome, valor] of Object.entries(parcial)) novos[nome] = validarRegra(nome, valor);

    const mudou = Object.keys(novos).filter((nome) => novos[nome] !== this.valor(nome));
    if (mudou.length === 0) return this.completa(usuarioLogado);

    const antes = {};
    const depois = {};
    for (const nome of mudou) {
      // O webhook é um segredo: o Histórico fica sabendo QUE mudou, não para o quê.
      antes[nome] = REGRAS[nome].sensivel ? "(oculto)" : this.valor(nome);
      depois[nome] = REGRAS[nome].sensivel ? "(alterado)" : novos[nome];
    }

    this.db.configuracoesSistema.setVarias(mudou.map((nome) => [REGRAS[nome].chave, String(novos[nome])]));
    this.historico?.registrar(
      usuarioLogado,
      "atualizar",
      "configuracao",
      this._descrever(mudou, novos),
      { antes, depois }
    );
    this._avisar(mudou);
    return this.completa(usuarioLogado);
  }

  /**
   * Liga/desliga o Atualizador. Mantido com a assinatura de antes (a tela
   * antiga e os testes do alerta chamam assim); por baixo é `atualizar`.
   * `usuarioLogado` null é o caminho interno (testes), sem checagem de papel.
   */
  definir(usuarioLogado, habilitado) {
    const valor = Boolean(habilitado);
    if (usuarioLogado) {
      this.atualizar(usuarioLogado, { atualizadorHabilitado: valor });
    } else if (valor !== this.atualizadorHabilitado()) {
      this.db.configuracoesSistema.set(REGRAS.atualizadorHabilitado.chave, String(valor));
      this._avisar(["atualizadorHabilitado"]);
    }
    return this.ler();
  }

  /**
   * Na primeira subida depois de as regras irem para o banco, traz do `.env`
   * o que a instalação já tinha configurado ali -- senão o webhook do Discord
   * e a URL pública "sumiriam" na atualização. Só grava regra que ainda NÃO
   * existe no banco: numa segunda subida, o que foi mudado pela tela ganha
   * do `.env`, que deixou de valer para essas regras.
   *
   * Valor inválido no `.env` é ignorado (fica o padrão) em vez de impedir o
   * servidor de subir: o .env antigo não era validado por ninguém.
   *
   * @param {Record<string, string|undefined>} ambiente normalmente process.env
   * @returns {string[]} as regras importadas
   */
  importarValoresIniciais(ambiente) {
    const importadas = [];
    for (const [nome, regra] of Object.entries(REGRAS)) {
      if (!regra.env) continue;
      const bruto = ambiente?.[regra.env];
      if (bruto === undefined || String(bruto).trim() === "") continue;
      if (this.db.configuracoesSistema.get(regra.chave) !== null) continue;
      try {
        this.db.configuracoesSistema.set(regra.chave, String(validarRegra(nome, bruto)));
        importadas.push(nome);
      } catch {
        /* inválido no .env: fica o padrão */
      }
    }
    if (importadas.length) {
      this.historico?.registrar(
        null,
        "atualizar",
        "configuracao",
        `Regras da equipe trazidas do .env para o banco: ${importadas.map((n) => REGRAS[n].rotulo).join("; ")}`
      );
    }
    return importadas;
  }

  /** Valida uma URL de webhook sem gravar -- para o botão de teste da tela. */
  validarWebhook(url) {
    return validarRegra("discordWebhookUrl", url);
  }

  /** @param {(mudou: string[]) => void} ouvinte */
  aoMudar(ouvinte) {
    this._ouvintes.push(ouvinte);
  }

  // ==========================================================================

  _valores(filtro) {
    return Object.fromEntries(
      Object.entries(REGRAS)
        .filter(([, regra]) => filtro(regra))
        .map(([nome]) => [nome, this.valor(nome)])
    );
  }

  /**
   * A chave dos agentes continua no .env (é segredo de infraestrutura, e
   * trocá-la exige mexer também em cada cliente). A tela só precisa saber se
   * ela existe e reconhecê-la pelo final -- o valor inteiro chegava ao
   * navegador antes, num campo de senha que qualquer "inspecionar elemento"
   * revelava.
   */
  _situacaoChave() {
    const token = this.tokenAgentes;
    if (!token) return { situacao: "ausente" };
    if (token === TOKEN_DE_EXEMPLO) return { situacao: "exemplo" };
    return { situacao: "configurada", final: token.slice(-4) };
  }

  _descrever(mudou, novos) {
    if (mudou.length === 1 && mudou[0] === "atualizadorHabilitado") {
      return novos.atualizadorHabilitado
        ? "Atualizador reativado (Distribuição, Versões e alerta de agentes voltaram a aparecer)"
        : "Atualizador desativado temporariamente (Distribuição, Versões e alerta de agentes escondidos)";
    }
    return `Regras da equipe alteradas: ${mudou.map((n) => REGRAS[n].rotulo).join("; ")}`;
  }

  _avisar(mudou) {
    for (const ouvinte of this._ouvintes) {
      try {
        ouvinte(mudou);
      } catch (err) {
        // Um ouvinte com defeito não pode desfazer um salvamento que já foi
        // gravado nem impedir os outros de saberem da mudança.
        // eslint-disable-next-line no-console
        console.error("Falha ao reagir a mudança de regra:", err);
      }
    }
  }

  _exigirAdmin(usuarioLogado) {
    if (!usuarioLogado || usuarioLogado.role !== "admin") {
      throw new ForbiddenError("Apenas administradores podem ver ou alterar as regras da equipe.");
    }
  }
}

module.exports = { ConfiguracaoSistemaService, TOKEN_DE_EXEMPLO };
