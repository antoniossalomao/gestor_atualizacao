/**
 * Guarda pequenas preferências de tela (filtros, busca, ordenação, tema).
 *
 * Antes, sair de uma aba e voltar zerava a busca, o filtro e a página -- e
 * como o app faz o usuário pular entre abas o tempo todo (achar o nome do
 * cliente em "Clientes", voltar para "Atualizações"), isso significava
 * redigitar o mesmo filtro várias vezes por dia.
 *
 * Filtros usam `sessionStorage`: valem enquanto a aba do navegador estiver
 * aberta, e somem depois. É o comportamento certo para um filtro -- ninguém
 * espera que a busca de ontem ainda esteja aplicada amanhã. O tema usa
 * `localStorage`, porque esse é justamente o tipo de escolha que deve durar.
 *
 * Todo acesso é protegido: em janela anônima, com cookies de site bloqueados
 * ou em alguns modos corporativos, `sessionStorage` LANÇA exceção só de ser
 * lido. Um app que quebra inteiro por causa de um filtro não salvo seria um
 * péssimo negócio.
 */
const PREFIXO = "gestor:";

function ler(store, chave, padrao) {
  try {
    const bruto = store.getItem(PREFIXO + chave);
    return bruto == null ? padrao : JSON.parse(bruto);
  } catch {
    return padrao;
  }
}

function gravar(store, chave, valor) {
  try {
    store.setItem(PREFIXO + chave, JSON.stringify(valor));
  } catch {
    // Sem espaço ou sem permissão: seguir sem persistir é melhor que quebrar.
  }
}

/** Preferências de sessão (filtros de tela). */
export const prefs = {
  get: (chave, padrao = null) => ler(sessionStorage, chave, padrao),
  set: (chave, valor) => gravar(sessionStorage, chave, valor),
  remove: (chave) => {
    try {
      sessionStorage.removeItem(PREFIXO + chave);
    } catch {
      /* idem */
    }
  },
};

/** Preferências duradouras (tema, sidebar recolhida). */
export const settings = {
  get: (chave, padrao = null) => ler(localStorage, chave, padrao),
  set: (chave, valor) => gravar(localStorage, chave, valor),
};
