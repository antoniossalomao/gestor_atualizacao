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

/**
 * Chaves duradouras que NÃO acompanham a conta.
 *
 * "notificarFalhas" depende da permissão de notificação, que o navegador
 * concede por aparelho. Sincronizá-la faria o painel dizer "ativado" numa
 * máquina onde a permissão nunca foi pedida -- ligado na aparência, desligado
 * no efeito.
 */
const SO_DESTE_APARELHO = new Set(["notificarFalhas"]);

/** De quem são as preferências que estão no cache local agora. */
const CHAVE_DONO = "prefsDe";

// Instalados por `conectarPreferencias`. Antes do login (e se o servidor não
// responder) são no-ops: o app segue funcionando só com o cache local.
let enviarAoServidor = () => {};
let enviarAgora = async () => {};

/** Preferências duradouras (tema, cor de destaque, sidebar recolhida). */
export const settings = {
  get: (chave, padrao = null) => ler(localStorage, chave, padrao),
  set: (chave, valor) => {
    gravar(localStorage, chave, valor);
    if (!SO_DESTE_APARELHO.has(chave)) enviarAoServidor();
  },
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
    if (!SO_DESTE_APARELHO.has(chave)) enviarAoServidor();
  },
};

/**
 * Envia as preferências ao servidor JÁ, sem esperar o agrupamento.
 *
 * Existe para quem vai recarregar a página logo em seguida ("Restaurar
 * padrões"): o envio normal espera alguns décimos de segundo para não fazer
 * uma viagem por clique, e um `location.reload()` no meio desse intervalo
 * mataria a requisição antes de ela sair -- as preferências voltariam aos
 * padrões aqui e continuariam as antigas na conta, reaparecendo no próximo
 * login.
 */
export function salvarPreferenciasAgora() {
  return enviarAgora();
}

/**
 * Tudo que deve acompanhar a conta, lido do cache local.
 *
 * Varre o localStorage em vez de ter uma lista fixa de chaves: acrescentar
 * uma opção nova no painel de Configurações passa a valer aqui sozinho, sem
 * ninguém lembrar de registrá-la em dois lugares -- que é exatamente o tipo
 * de passo que se esquece e só aparece como "essa opção não me acompanha".
 */
function coletarDuradouras() {
  const tudo = {};
  try {
    for (const bruta of Object.keys(localStorage)) {
      if (!bruta.startsWith(PREFIXO)) continue;
      const chave = bruta.slice(PREFIXO.length);
      if (SO_DESTE_APARELHO.has(chave) || chave === CHAVE_DONO) continue;
      tudo[chave] = ler(localStorage, chave, null);
    }
  } catch {
    /* localStorage bloqueado: manda o que der, que é nada */
  }
  return tudo;
}

/** Apaga do cache tudo que pertence a uma conta -- usado ao trocar de usuário. */
function limparDuradouras() {
  try {
    for (const bruta of Object.keys(localStorage)) {
      if (!bruta.startsWith(PREFIXO)) continue;
      const chave = bruta.slice(PREFIXO.length);
      if (SO_DESTE_APARELHO.has(chave) || chave === CHAVE_DONO) continue;
      localStorage.removeItem(bruta);
    }
  } catch {
    /* idem */
  }
}

/**
 * Liga o cache local à conta: o servidor passa a ser a fonte da verdade.
 *
 * O localStorage continua existindo, e não é redundância. `theme-init.js`
 * roda no `<head>`, antes do primeiro pixel, e precisa de uma resposta
 * SÍNCRONA -- esperar uma requisição ali significaria a página nascer no tema
 * errado e trocar na cara de quem está olhando. Então: o cache pinta na hora,
 * o servidor chega alguns milissegundos depois e corrige se divergir.
 *
 * Trocar de usuário no mesmo navegador limpa o cache antes de aplicar o que
 * veio: sem isso, a segunda pessoa a entrar herdaria o tema e a densidade da
 * primeira até a resposta chegar.
 *
 * @param {{get: Function, put: Function}} api
 * @param {{id: number}} usuario
 * @param {() => void} aoAplicar chamado quando o que veio do servidor muda o
 *   cache -- é quem manda a tela se redesenhar com as preferências certas.
 */
export async function conectarPreferencias(api, usuario, aoAplicar = () => {}) {
  const dono = ler(localStorage, CHAVE_DONO, null);
  const trocouDeConta = dono != null && dono !== usuario?.id;
  if (trocouDeConta) limparDuradouras();
  gravar(localStorage, CHAVE_DONO, usuario?.id ?? null);

  // Agrupado: mudar a cor de destaque no painel dispara um `set` por clique, e
  // cada um deles não precisa de uma viagem própria até o servidor.
  let pendente = null;
  // Falhar aqui não pode atrapalhar quem está mexendo nas opções: a escolha já
  // valeu na tela e já está no cache. Ela se perde só se a pessoa nunca mais
  // salvar nada E trocar de máquina.
  enviarAgora = () => {
    clearTimeout(pendente);
    return api.put("/preferencias", coletarDuradouras()).catch(() => {});
  };
  enviarAoServidor = () => {
    clearTimeout(pendente);
    pendente = setTimeout(enviarAgora, 400);
  };

  let doServidor;
  try {
    doServidor = await api.get("/preferencias");
  } catch {
    return; // servidor fora do ar: segue com o cache local, que já está pintado
  }
  if (!doServidor || typeof doServidor !== "object") return;

  // Conta que nunca salvou nada: em vez de zerar o que a pessoa acabou de
  // escolher neste navegador, sobe o que existe aqui. É o que torna a
  // migração de quem já usava o app invisível -- as preferências que estavam
  // só no localStorage viram as preferências da conta no primeiro login.
  if (Object.keys(doServidor).length === 0) {
    const local = coletarDuradouras();
    if (Object.keys(local).length > 0) api.put("/preferencias", local).catch(() => {});
    return;
  }

  let mudou = trocouDeConta;
  for (const [chave, valor] of Object.entries(doServidor)) {
    if (JSON.stringify(ler(localStorage, chave, null)) === JSON.stringify(valor)) continue;
    gravar(localStorage, chave, valor);
    mudou = true;
  }
  if (mudou) aoAplicar();
}
