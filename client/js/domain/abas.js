/**
 * Nomes antigos das abas das telas Configurações e Administração, e a aba de
 * hoje que cada um quer dizer.
 *
 * As abas mudaram de nome e de agrupamento mais de uma vez ("Tabelas" e
 * "Navegação" viraram "Trabalho diário"; "Saúde" virou "Diagnóstico"), e o
 * nome antigo continua vivo em dois lugares que ninguém atualiza: a última
 * aba guardada nas preferências de cada pessoa e os links internos
 * (`navigate("configuracoes", { aba: "tabelas" })`). Sem a tradução, a tela
 * abria na primeira aba como se o link estivesse quebrado.
 *
 * A tabela das Configurações estava escrita duas vezes dentro da view (na
 * migração da preferência e em `aplicarParams`); bastava acrescentar um nome
 * numa só para as duas se desencontrarem.
 */

/** @type {Readonly<Record<string, string>>} */
export const ALIASES_CONFIGURACOES = Object.freeze({
  conta: "conta",
  navegacao: "trabalho",
  tabelas: "trabalho",
  rotina: "trabalho",
  trabalho: "trabalho",
  aparencia: "interface",
  acessibilidade: "interface",
  interface: "interface",
  notificacoes: "notificacoes",
  regras: "regras-equipe",
  "regras-equipe": "regras-equipe",
  atalhos: "ajuda",
  sobre: "ajuda",
  ajuda: "ajuda",
});

/** @type {Readonly<Record<string, string>>} */
export const ALIASES_ADMINISTRACAO = Object.freeze({
  usuarios: "pessoas",
  pessoas: "pessoas",
  operacao: "operacao",
  regras: "operacao",
  classificacao: "operacao",
  dados: "dados",
  integracoes: "integracoes",
  notificacoes: "integracoes",
  atualizador: "integracoes",
  backups: "backups",
  auditoria: "auditoria",
  historico: "auditoria",
  diagnostico: "diagnostico",
  saude: "diagnostico",
});

/**
 * A aba de hoje para um nome antigo; um nome que não está na tabela passa
 * como veio (a tela decide se ele existe).
 * @param {Readonly<Record<string, string>>} aliases
 * @param {string} nome
 */
export function abaAtual(aliases, nome) {
  return Object.hasOwn(aliases, nome) ? aliases[nome] : nome;
}
