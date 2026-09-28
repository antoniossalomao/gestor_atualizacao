const { ValidationError } = require("../shared/errors");

// Teto de tamanho do conjunto de preferencias. Nao ha caso legitimo perto
// disso -- sao duas dezenas de escolhas curtas ("escuro", "compacta", 50) --
// e sem um teto qualquer conta poderia usar o banco como deposito.
const MAX_CHAVES = 60;
const MAX_TEXTO = 200;

/**
 * Nome de chave aceito: começa com letra e segue com letras, números e
 * `_ : . -` (as chaves do painel são "densidade", "sinoEscopo"...). Sem
 * isto, qualquer texto virava chave -- inclusive "__proto__", que num objeto
 * comum do JavaScript não é uma chave, é o protótipo.
 */
const NOME_CHAVE = /^[A-Za-z][A-Za-z0-9_:.-]{0,59}$/;

const HORA = /^([01]\d|2[0-3]):[03]0$/;
const SIM_NAO = (v) => typeof v === "boolean";

/**
 * Formato das chaves que o servidor conhece e cujo valor errado mudaria
 * comportamento (horário silencioso, o que o sino conta, como o relatório
 * abre -- planejamento 13.4). As demais continuam livres dentro das regras
 * gerais: o front-end valida as de aparência na importação (ver VALIDOS em
 * client/js/app/appearance.js), e uma preferência de aparência inválida só
 * cai no padrão.
 */
const FORMATOS = {
  sinoAtrasados: SIM_NAO,
  sinoHoje: SIM_NAO,
  sinoAgentes: SIM_NAO,
  sinoEscopo: (v) => v === "equipe" || v === "minhas",
  somAvisos: SIM_NAO,
  silencioAtivo: SIM_NAO,
  silencioInicio: (v) => typeof v === "string" && HORA.test(v),
  silencioFim: (v) => typeof v === "string" && HORA.test(v),
  silencioCriticos: SIM_NAO,
  relatorioAba: (v) => v === "atualizacao" || v === "cliente",
  relatorioFecharAoCopiar: SIM_NAO,
};

/**
 * Preferencias de apresentacao por conta (tema, cor de destaque, densidade
 * das tabelas, linhas por pagina, aba inicial...).
 *
 * Antes viviam so no localStorage do navegador, e o efeito colateral aparecia
 * na hora errada: trocar de maquina, usar outro navegador ou limpar os dados
 * do site devolvia o app aos padroes, e num computador compartilhado as
 * escolhas de uma pessoa recebiam a seguinte. Agora o servidor e a fonte da
 * verdade e o localStorage e so um cache -- ver client/js/app/prefs.js, que
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
   * Aceita chave nova sem cadastro, mas com nome no formato de preferencia
   * (NOME_CHAVE) e so valores simples; as chaves de FORMATOS, com o valor certo.
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
    const limpo = Object.create(null);
    for (const [chave, valor] of entradas) {
      if (!NOME_CHAVE.test(chave)) throw new ValidationError(`Nome de preferência inválido: "${String(chave).slice(0, 40)}".`);
      const formato = FORMATOS[chave];
      // Valor fora do formato é DESCARTADO (a opção volta ao padrão na tela),
      // e não motivo para recusar o conjunto: o cliente manda todas as
      // preferências juntas, e um valor velho ou corrompido numa delas
      // travaria em silêncio a sincronização de todas as outras.
      if (formato && !formato(valor)) continue;
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
    return { ...limpo };
  }
}

module.exports = { PreferenciaService };
