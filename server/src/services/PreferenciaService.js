const { ValidationError } = require("./errors");

// Teto de tamanho do conjunto de preferencias. Nao ha caso legitimo perto
// disso -- sao duas dezenas de escolhas curtas ("escuro", "compacta", 50) --
// e sem um teto qualquer conta poderia usar o banco como deposito.
const MAX_CHAVES = 60;
const MAX_TEXTO = 200;

/**
 * Preferencias de apresentacao por conta (tema, cor de destaque, densidade
 * das tabelas, linhas por pagina, aba inicial...).
 *
 * Antes viviam so no localStorage do navegador, e o efeito colateral aparecia
 * na hora errada: trocar de maquina, usar outro navegador ou limpar os dados
 * do site devolvia o app aos padroes, e num computador compartilhado as
 * escolhas de uma pessoa recebiam a seguinte. Agora o servidor e a fonte da
 * verdade e o localStorage e so um cache -- ver client/js/core/prefs.js, que
 * explica por que o cache continua existindo.
 *
 * O conjunto e gravado inteiro, nunca chave a chave: e assim que a tela
 * aplica (tudo junto, no arranque), e assim acrescentar uma preferencia nova
 * nao mexe em nada aqui.
 */
class PreferenciaService {
  /** @param {import('../database/Database').Database} db */
  constructor(db) {
    this.db = db;
  }

  ler(usuario) {
    return this.db.usuarios.preferencias(this._exigirId(usuario));
  }

  salvar(usuario, prefs) {
    const limpo = this._validar(prefs);
    this.db.usuarios.salvarPreferencias(this._exigirId(usuario), limpo);
    return limpo;
  }

  _exigirId(usuario) {
    const id = Number(usuario?.id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Sessão sem usuário identificado.");
    return id;
  }

  /**
   * Aceita qualquer chave, mas so valores simples.
   *
   * Nao ha lista fixa de preferencias de proposito: quem acrescenta uma opcao
   * nova no painel de Configuracoes nao deveria precisar mexer no backend
   * para ela passar a acompanhar a conta. O que o backend garante e que o que
   * entra e pequeno e simples -- texto curto, numero ou booleano --, nunca um
   * objeto aninhado que crescesse sem limite.
   */
  _validar(prefs) {
    if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) {
      throw new ValidationError("Preferências precisam vir como um objeto.");
    }
    const entradas = Object.entries(prefs);
    if (entradas.length > MAX_CHAVES) {
      throw new ValidationError(`Preferências demais (máximo ${MAX_CHAVES}).`);
    }
    const limpo = {};
    for (const [chave, valor] of entradas) {
      if (typeof valor === "string") {
        if (valor.length > MAX_TEXTO) throw new ValidationError(`Valor de "${chave}" é longo demais.`);
        limpo[chave] = valor;
      } else if (typeof valor === "number" && Number.isFinite(valor)) {
        limpo[chave] = valor;
      } else if (typeof valor === "boolean" || valor === null) {
        limpo[chave] = valor;
      } else {
        throw new ValidationError(`Valor de "${chave}" precisa ser texto, número ou sim/não.`);
      }
    }
    return limpo;
  }
}

module.exports = { PreferenciaService };
