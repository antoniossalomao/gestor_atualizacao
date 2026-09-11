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

/**
 * "Lembrar filtros ao trocar de aba" (Configurações > Comportamento).
 *
 * Lido direto do localStorage, e não via `aparencia.lembrarFiltros()`, de
 * propósito: `appearance.js` importa ESTE arquivo, e o caminho de volta
 * fecharia um ciclo de importação -- que o navegador até resolve, mas
 * deixando um dos dois módulos pela metade durante o arranque, que é
 * justamente quando o primeiro filtro é lido. Um `JSON.parse` de uma chave é
 * barato demais para valer esse risco.
 */
function lembrando() {
  return ler(localStorage, "lembrarFiltros", true) !== false;
}

/**
 * Preferências de sessão (filtros de tela).
 *
 * Com "lembrar filtros" desligado, `get` devolve sempre o padrão e `set` não
 * grava: a tela continua funcionando igual (ela nunca soube que havia
 * memória), só volta a nascer limpa. Desligar SÓ a leitura deixaria lixo
 * acumulando no storage para nunca ser lido.
 */
export const prefs = {
  get: (chave, padrao = null) => (lembrando() ? ler(sessionStorage, chave, padrao) : padrao),
  set: (chave, valor) => {
    if (lembrando()) gravar(sessionStorage, chave, valor);
  },
  remove: (chave) => {
    try {
      sessionStorage.removeItem(PREFIXO + chave);
    } catch {
      /* idem */
    }
  },
  /** Esquece todos os filtros guardados nesta sessão, de todas as telas. */
  limparTudo() {
    try {
      for (const chave of Object.keys(sessionStorage)) {
        if (chave.startsWith(PREFIXO)) sessionStorage.removeItem(chave);
      }
    } catch {
      /* idem */
    }
  },
};

/** Preferências duradouras (tema, cor de destaque, sidebar recolhida). */
export const settings = {
  get: (chave, padrao = null) => ler(localStorage, chave, padrao),
  set: (chave, valor) => gravar(localStorage, chave, valor),
  /**
   * Apaga a chave, que NÃO é o mesmo que gravar `null` nela.
   *
   * `set(chave, null)` grava o texto "null", e a partir daí `get` devolve
   * `null` em vez do padrão que quem chamou passou -- porque só a AUSÊNCIA da
   * chave dispara o padrão. Cada leitor acabava tendo que se defender disso
   * por conta própria, e "restaurar padrões" só funcionava porque recarrega a
   * página inteira em seguida. Apagando de verdade, a preferência volta a não
   * existir, que é o que restaurar quer dizer.
   */
  remove: (chave) => {
    try {
      localStorage.removeItem(PREFIXO + chave);
    } catch {
      /* idem */
    }
  },
};
