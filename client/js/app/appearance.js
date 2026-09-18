import { settings } from "./prefs.js";

/**
 * Preferências de apresentação que valem para o app inteiro: cor, tamanho do
 * texto, quão apertadas ficam as linhas das tabelas, quantos registros cabem
 * numa página, onde os avisos aparecem.
 *
 * São irmãs do `theme.js` -- mesma ideia, mesmo armazenamento (o localStorage
 * como cache e a conta no servidor como fonte da verdade; ver prefs.js),
 * mesma forma de avisar o resto do app (um evento no `document`). O tema ficou
 * num arquivo próprio porque tem uma terceira via que nenhuma destas tem
 * ("seguir o sistema", que obriga a ouvir o `matchMedia` para sempre); aqui
 * todas as escolhas são valores fechados que só o usuário muda.
 *
 * TODAS saem daqui do mesmo jeito: um atributo no `<html>` e o CSS faz o
 * resto. Nenhuma tela precisa saber que a opção existe -- elas só usam os
 * tokens (`--linha-pad-y`, `--txt-base`, `--cor-accent`). A única exceção é
 * `linhasPorPagina`, que muda o que as telas PEDEM ao servidor e por isso
 * viaja no evento.
 */

/** Valores aceitos, em ordem de "cabe mais" para "respira mais". */
export const DENSIDADES = [
  { valor: "compacta", rotulo: "Compacta", ajuda: "Mais linhas na tela" },
  { valor: "padrao", rotulo: "Padrão", ajuda: "O equilíbrio de sempre" },
  { valor: "confortavel", rotulo: "Confortável", ajuda: "Mais espaço para ler" },
];

/**
 * O teto de 200 não é escolhido no olho: é o `PAGE_SIZE_MAXIMO` do
 * servidor (server/src/shared/pagination.js). Oferecer 500 aqui só
 * produziria uma opção que o backend recorta em silêncio, e a pessoa ficaria
 * sem entender por que a lista não cresceu.
 */
export const LINHAS_OPCOES = [25, 50, 100, 200];

/** Altura máxima da caixa rolável de uma tabela, como fração da tela. */
export const ALTURAS = [
  { valor: "media", rotulo: "Média", vh: "45vh" },
  { valor: "alta", rotulo: "Alta", vh: "60vh" },
  { valor: "cheia", rotulo: "Cheia", vh: "82vh" },
];

/** De quanto em quanto tempo a aba Distribuição se atualiza sozinha (0 = nunca). */
export const RITMOS = [
  { valor: 15000, rotulo: "15 s" },
  { valor: 30000, rotulo: "30 s" },
  { valor: 60000, rotulo: "1 min" },
  { valor: 0, rotulo: "Nunca" },
];

/**
 * Cores de destaque. O `hex` de cada uma é só para desenhar a bolinha de
 * escolha no painel -- quem pinta o app de verdade é o `[data-realce]` no
 * CSS, que carrega o par escuro/claro de cada variante (ver theme.css).
 * Repetir aqui só o tom escuro é aceitável porque a bolinha é um rótulo
 * visual, não a cor aplicada.
 */
export const REALCES = [
  { valor: "azul", rotulo: "Azul", hex: "#4a9eff" },
  { valor: "violeta", rotulo: "Violeta", hex: "#a78bfa" },
  { valor: "turquesa", rotulo: "Turquesa", hex: "#2dd4bf" },
  { valor: "verde", rotulo: "Verde", hex: "#4ade80" },
  { valor: "ambar", rotulo: "Âmbar", hex: "#fbbf24" },
  { valor: "rosa", rotulo: "Rosa", hex: "#f472b6" },
  { valor: "grafite", rotulo: "Grafite", hex: "#a8b8cf" },
];

/** Multiplicador da escala tipográfica inteira. */
export const ESCALAS = [
  { valor: "pequeno", rotulo: "Pequeno" },
  { valor: "padrao", rotulo: "Padrão" },
  { valor: "grande", rotulo: "Grande" },
  { valor: "maior", rotulo: "Maior" },
];

/** Canto da tela onde os avisos nascem. */
export const POSICOES_AVISO = [
  { valor: "rodape", rotulo: "Embaixo" },
  { valor: "topo", rotulo: "Em cima" },
];

/**
 * Contraste reforçado: bordas fortes, texto de apoio na cor do texto normal,
 * nenhum véu translúcido. Não é um terceiro tema -- é um ajuste que vale POR
 * CIMA do tema escolhido (ver o bloco `[data-contraste]` em theme.css), e essa
 * é justamente a diferença que importa: quem precisa enxergar melhor não
 * precisa abrir mão do tema que prefere para conseguir isso.
 */
export const CONTRASTES = [
  { valor: "normal", rotulo: "Normal" },
  { valor: "alto", rotulo: "Alto" },
];

/**
 * As superfícies translúcidas (a barra lateral desfocada, o véu das tabelas, o
 * fundo dos modais). Desligá-las tira o `backdrop-filter`, que é de longe o
 * efeito mais caro desta interface: numa máquina de escritório sem placa de
 * vídeo dedicada -- que é a máquina em que este app roda -- ele cobra alguns
 * quadros a cada rolagem de tabela longa.
 */
export const TRANSPARENCIAS = [
  { valor: "normal", rotulo: "Com profundidade" },
  { valor: "reduzida", rotulo: "Sólidas" },
];

/** Linhas alternadas nas tabelas: ajuda a seguir a linha, atrapalha a leitura de valores tingidos. */
export const ZEBRAS = [
  { valor: "sim", rotulo: "Alternadas" },
  { valor: "nao", rotulo: "Lisas" },
];

/**
 * Valor de fábrica de CADA preferência, num lugar só.
 *
 * Antes eram sete constantes soltas (`PADRAO_DENSIDADE`, `PADRAO_LINHAS`…)
 * mais uma lista `CHAVES` escrita à mão para o "Restaurar padrões". Duas
 * listas para a mesma coisa é uma a mais do que se consegue manter em dia: a
 * `CHAVES` era o lugar clássico de esquecer a preferência recém-criada, e o
 * esquecimento só apareceria no dia em que alguém restaurasse os padrões e uma
 * opção ficasse para trás, sem nenhum aviso.
 *
 * Com um mapa só, quatro perguntas diferentes passam a ter a mesma resposta:
 * qual é o padrão de X, quais são todas as chaves, o que o usuário já mexeu
 * (o selo "alterado" do painel) e o que sai num arquivo de exportação.
 */
const PADROES = {
  // -- aparência --
  tema: "sistema",
  realce: "azul",
  escalaTexto: "padrao",
  movimento: "normal",
  fundoTela: "grade",
  contraste: "normal",
  transparencia: "normal",
  // -- tabelas --
  densidade: "padrao",
  alturaTabela: "alta",
  linhasPorPagina: 50,
  zebra: "sim",
  // -- comportamento --
  abaInicial: "",
  sidebarRecolhida: false,
  lembrarFiltros: true,
  ritmoPainel: 30000,
  // -- avisos --
  posicaoAvisos: "rodape",
};

/**
 * Preferências que NÃO acompanham a conta (ver `SO_DESTE_APARELHO` em
 * prefs.js) e por isso ficam fora do mapa de padrões -- mas que "Restaurar
 * padrões" ainda precisa limpar, senão a permissão de notificação continuaria
 * marcada depois de um reset que prometeu zerar tudo.
 */
const CHAVES_DESTE_APARELHO = ["notificarFalhas"];

/**
 * Valores aceitos por chave, para a IMPORTAÇÃO de um arquivo de preferências.
 * `null` significa "qualquer texto curto" -- o caso da aba inicial, cuja lista
 * de valores válidos mora no App, não aqui.
 *
 * Importar é o único caminho pelo qual um valor chega sem ter passado por um
 * controle da tela. Um arquivo editado à mão, ou exportado de uma versão
 * futura do app, não pode deixar o Gestor num estado que a própria interface
 * não consiga desfazer.
 */
const VALIDOS = {
  tema: ["sistema", "claro", "escuro"],
  realce: REALCES.map((r) => r.valor),
  escalaTexto: ESCALAS.map((e) => e.valor),
  movimento: ["normal", "reduzido"],
  fundoTela: ["grade", "liso"],
  contraste: CONTRASTES.map((c) => c.valor),
  transparencia: TRANSPARENCIAS.map((t) => t.valor),
  densidade: DENSIDADES.map((d) => d.valor),
  alturaTabela: ALTURAS.map((a) => a.valor),
  linhasPorPagina: LINHAS_OPCOES,
  zebra: ZEBRAS.map((z) => z.valor),
  abaInicial: null,
  sidebarRecolhida: [true, false],
  lembrarFiltros: [true, false],
  ritmoPainel: RITMOS.map((r) => r.valor),
  posicaoAvisos: POSICOES_AVISO.map((p) => p.valor),
};

/**
 * Perfis: um clique que arruma VÁRIAS preferências de uma vez.
 *
 * O painel passou a ter dezesseis ajustes, e quase ninguém quer decidir
 * dezesseis coisas -- quer dizer "preciso caber mais linha na tela" ou
 * "preciso enxergar melhor" e voltar ao trabalho. Cada perfil é uma dessas
 * frases traduzida para o conjunto de valores que a realiza.
 *
 * Nenhum deles é um modo especial do app: depois de aplicado, cada ajuste
 * continua visível e individualmente mutável logo abaixo. É um ponto de
 * partida bom, não uma gaiola.
 *
 * O `valores` usa os MESMOS nomes de chave do mapa de padrões, e é por isso
 * que "Equilibrado" não precisa listar nada de especial: ele é o mapa inteiro.
 */
export const PERFIS = [
  {
    valor: "padrao",
    rotulo: "Equilibrado",
    descricao: "Os padrões de fábrica.",
    valores: { ...PADROES },
  },
  {
    valor: "operacao",
    rotulo: "Operação",
    descricao: "O máximo de linhas por tela, para quem passa o dia nas tabelas.",
    valores: {
      densidade: "compacta",
      alturaTabela: "cheia",
      linhasPorPagina: 100,
      escalaTexto: "pequeno",
      sidebarRecolhida: true,
      fundoTela: "liso",
      posicaoAvisos: "topo",
    },
  },
  {
    valor: "leitura",
    rotulo: "Leitura",
    descricao: "Linhas espaçadas e texto maior, para conferir registro a registro.",
    valores: {
      densidade: "confortavel",
      alturaTabela: "media",
      linhasPorPagina: 25,
      escalaTexto: "grande",
      zebra: "sim",
    },
  },
  {
    valor: "acessivel",
    rotulo: "Alto contraste",
    descricao: "Bordas fortes, texto grande, sem animação nem transparência.",
    valores: {
      contraste: "alto",
      escalaTexto: "maior",
      movimento: "reduzido",
      transparencia: "reduzida",
      fundoTela: "liso",
      densidade: "confortavel",
    },
  },
];

/** Lê uma preferência restrita a uma lista fechada de valores. */
function umDe(chave, opcoes, padrao) {
  const salvo = settings.get(chave, padrao);
  return opcoes.some((o) => o.valor === salvo) ? salvo : padrao;
}

export const aparencia = {
  densidade() {
    return umDe("densidade", DENSIDADES, PADROES.densidade);
  },

  linhasPorPagina() {
    const salvo = Number(settings.get("linhasPorPagina", PADROES.linhasPorPagina));
    return LINHAS_OPCOES.includes(salvo) ? salvo : PADROES.linhasPorPagina;
  },

  altura() {
    return umDe("alturaTabela", ALTURAS, PADROES.alturaTabela);
  },

  /** Milissegundos entre atualizações automáticas da Distribuição; 0 desliga. */
  ritmoPainel() {
    const salvo = Number(settings.get("ritmoPainel", PADROES.ritmoPainel));
    return RITMOS.some((r) => r.valor === salvo) ? salvo : PADROES.ritmoPainel;
  },

  /** Aba que abre ao entrar. Vazio = a primeira da lista. */
  abaInicial() {
    return settings.get("abaInicial", "") || "";
  },

  realce() {
    return umDe("realce", REALCES, PADROES.realce);
  },

  escalaTexto() {
    return umDe("escalaTexto", ESCALAS, PADROES.escalaTexto);
  },

  /** "normal" (segue só o sistema) ou "reduzido" (corta as animações aqui). */
  movimento() {
    return settings.get("movimento", "normal") === "reduzido" ? "reduzido" : "normal";
  },

  /** "grade" (padrão, com a textura e o halo) ou "liso". */
  fundoTela() {
    return settings.get("fundoTela", "grade") === "liso" ? "liso" : "grade";
  },

  /** "normal" ou "alto" -- reforço de bordas e texto por cima do tema atual. */
  contraste() {
    return umDe("contraste", CONTRASTES, PADROES.contraste);
  },

  /** "normal" (com desfoque e véus) ou "reduzida" (superfícies sólidas). */
  transparencia() {
    return umDe("transparencia", TRANSPARENCIAS, PADROES.transparencia);
  },

  /** Se as tabelas tingem uma linha sim, outra não. */
  zebra() {
    return umDe("zebra", ZEBRAS, PADROES.zebra);
  },

  posicaoAvisos() {
    return umDe("posicaoAvisos", POSICOES_AVISO, PADROES.posicaoAvisos);
  },

  /**
   * Se busca, filtro e ordenação sobrevivem à troca de aba. Ligado por padrão
   * -- é o comportamento que o app já tinha, e desligá-lo é o caso raro (a
   * máquina compartilhada do balcão, onde quem senta depois não quer herdar o
   * filtro de quem usou antes). Ver prefs.js, que é quem obedece.
   */
  lembrarFiltros() {
    return settings.get("lembrarFiltros", true) !== false;
  },

  /** O valor de fábrica de uma chave (ou o mapa inteiro, sem argumento). */
  padrao(chave) {
    return chave === undefined ? { ...PADROES } : PADROES[chave];
  },

  /**
   * Quais preferências estão diferentes do padrão de fábrica.
   *
   * É o que alimenta o selo "alterado" de cada linha do painel e a contagem ao
   * lado do nome de cada seção. A pergunta que isso responde -- "o que aqui
   * dentro fui eu que mexi?" -- era, até agora, impossível de responder sem
   * lembrar de cada escolha feita meses atrás.
   *
   * @returns {Set<string>}
   */
  diferencas() {
    const mudadas = new Set();
    for (const [chave, padrao] of Object.entries(PADROES)) {
      const atual = settings.get(chave, padrao);
      if (JSON.stringify(atual) !== JSON.stringify(padrao)) mudadas.add(chave);
    }
    return mudadas;
  },

  /** Volta ao estado de fábrica. Com uma lista de chaves, só elas. */
  restaurarPadroes(chaves) {
    const alvo = chaves || [...Object.keys(PADROES), ...CHAVES_DESTE_APARELHO];
    for (const chave of alvo) settings.remove(chave);
  },

  /**
   * O conjunto atual, pronto para virar arquivo.
   *
   * Sai TUDO, não só o que foi alterado: um arquivo com o estado inteiro faz
   * da importação uma cópia fiel ("deixe aquela máquina igual a esta"),
   * enquanto um arquivo só com as diferenças dependeria de o destino já estar
   * nos padrões para dar o mesmo resultado -- e não há como saber disso na
   * hora de importar.
   */
  exportar() {
    const preferencias = {};
    for (const chave of Object.keys(PADROES)) preferencias[chave] = settings.get(chave, PADROES[chave]);
    return { app: "gestor-atualizacoes", versao: 1, geradoEm: new Date().toISOString(), preferencias };
  },

  /**
   * Aplica um arquivo exportado.
   *
   * Ignora em silêncio o que não reconhece -- chave de uma versão mais nova,
   * valor inventado à mão -- em vez de recusar o arquivo inteiro: quem exportou
   * de uma versão diferente ainda merece receber as quinze preferências que as
   * duas versões têm em comum, e o painel informa quantas ficaram de fora.
   *
   * @param {unknown} dados o conteúdo do JSON, já parseado
   * @returns {{aplicadas: number, ignoradas: number}}
   */
  importar(dados) {
    const bruto = dados && typeof dados === "object" ? dados.preferencias ?? dados : null;
    if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) {
      throw new Error("Este arquivo não parece um arquivo de preferências do Gestor.");
    }

    const aceitas = {};
    let ignoradas = 0;
    for (const [chave, valor] of Object.entries(bruto)) {
      if (!(chave in PADROES) || !valorValido(chave, valor)) {
        ignoradas += 1;
        continue;
      }
      aceitas[chave] = valor;
    }
    if (Object.keys(aceitas).length === 0) {
      throw new Error("Nenhuma preferência reconhecida neste arquivo.");
    }

    // Grava direto pelo `settings`, sem passar pelo `aplicar()`: as chaves aqui
    // já são as do armazenamento (é o que o arquivo carrega), enquanto
    // `aplicar()` fala o vocabulário do painel, onde `altura` vira
    // `alturaTabela`. Traduzir de um para o outro só para voltar ao mesmo lugar
    // seria uma volta sem ganho nenhum.
    for (const [chave, valor] of Object.entries(aceitas)) settings.set(chave, valor);
    return { aplicadas: Object.keys(aceitas).length, ignoradas };
  },

  /**
   * Aplica um perfil inteiro (ver `PERFIS`).
   *
   * As chaves que o perfil NÃO menciona voltam ao padrão, em vez de ficarem
   * como estavam: um perfil é um destino, não um remendo. "Operação" aplicado
   * por cima de um tamanho de texto "Maior" que sobrou de outro dia entregaria
   * uma tela que não é nem o perfil nem o que havia antes -- e a pessoa
   * concluiria, com razão, que o botão não funciona direito.
   *
   * @param {string} valor
   * @returns {boolean} se o perfil existia
   */
  aplicarPerfil(valor) {
    const perfil = PERFIS.find((p) => p.valor === valor);
    if (!perfil) return false;
    for (const [chave, padrao] of Object.entries(PADROES)) {
      const escolhido = perfil.valores[chave];
      if (escolhido === undefined || JSON.stringify(escolhido) === JSON.stringify(padrao)) settings.remove(chave);
      else settings.set(chave, escolhido);
    }
    reaplicarAparencia();
    return true;
  },

  /**
   * Qual perfil descreve o estado atual, se algum.
   *
   * Um perfil "está ativo" quando TODAS as preferências batem com as dele --
   * não quando foi o último a ser clicado. A diferença aparece no segundo
   * seguinte: quem aplica "Operação" e depois aumenta o texto não está mais em
   * Operação, e a marca de escolhido não pode continuar dizendo que sim.
   *
   * @returns {string|null}
   */
  perfilAtivo() {
    const perfil = PERFIS.find((candidato) =>
      Object.keys(PADROES).every((chave) => {
        const esperado = candidato.valores[chave] ?? PADROES[chave];
        return JSON.stringify(settings.get(chave, PADROES[chave])) === JSON.stringify(esperado);
      })
    );
    return perfil ? perfil.valor : null;
  },

  aplicar(mudancas = {}) {
    const { densidade, linhasPorPagina, altura, ritmoPainel, abaInicial } = mudancas;
    const { realce, escalaTexto, movimento, fundoTela, posicaoAvisos, lembrarFiltros } = mudancas;
    const { contraste, transparencia, zebra } = mudancas;

    if (densidade) settings.set("densidade", densidade);
    if (linhasPorPagina) settings.set("linhasPorPagina", Number(linhasPorPagina));
    if (altura) settings.set("alturaTabela", altura);
    if (ritmoPainel !== undefined) settings.set("ritmoPainel", Number(ritmoPainel));
    if (abaInicial !== undefined) settings.set("abaInicial", abaInicial);
    if (realce) settings.set("realce", realce);
    if (escalaTexto) settings.set("escalaTexto", escalaTexto);
    if (movimento) settings.set("movimento", movimento);
    if (fundoTela) settings.set("fundoTela", fundoTela);
    if (contraste) settings.set("contraste", contraste);
    if (transparencia) settings.set("transparencia", transparencia);
    if (zebra) settings.set("zebra", zebra);
    if (posicaoAvisos) settings.set("posicaoAvisos", posicaoAvisos);
    if (lembrarFiltros !== undefined) settings.set("lembrarFiltros", Boolean(lembrarFiltros));

    reaplicarAparencia();
  },
};

/** Um valor cabe na chave? Usado só pela importação (ver `VALIDOS`). */
function valorValido(chave, valor) {
  const aceitos = VALIDOS[chave];
  if (aceitos === null) return typeof valor === "string" && valor.length <= 40;
  if (!aceitos) return false;
  return aceitos.some((aceito) => aceito === valor);
}

/**
 * Redesenha tudo que depende das preferências e avisa quem precisa recarregar.
 *
 * Serve a dois momentos: quem acabou de mexer no painel de Configurações, e a
 * chegada das preferências da conta vindas do servidor (ver
 * `conectarPreferencias` em prefs.js), que pode trazer valores diferentes dos
 * que o cache local pintou alguns milissegundos antes.
 */
export function reaplicarAparencia() {
  pintar();

  // Quem mudou foi só o CSS quando a densidade muda -- mas o número de
  // linhas por página muda o que as telas precisam PEDIR ao servidor, e elas
  // não têm como adivinhar sozinhas que a preferência virou outra. O evento
  // avisa; quem se importa, escuta (ver App._ligarAparencia).
  document.dispatchEvent(
    new CustomEvent("aparencia:mudou", {
      detail: {
        densidade: aparencia.densidade(),
        linhasPorPagina: aparencia.linhasPorPagina(),
        altura: aparencia.altura(),
        ritmoPainel: aparencia.ritmoPainel(),
      },
    })
  );
}

/**
 * Escreve no `<html>` o estado atual de tudo que o CSS lê.
 *
 * Os valores padrão são REMOVIDOS em vez de escritos ("padrao", "azul",
 * "normal"): o CSS já traz o padrão no `:root`, e um atributo a menos é uma
 * regra a menos para o navegador casar -- além de deixar o inspetor mostrando
 * só o que de fato foi escolhido, que é o que ajuda na hora de depurar.
 */
function pintar() {
  const raiz = document.documentElement;
  const atributos = {
    "data-densidade": aparencia.densidade(),
    "data-altura": aparencia.altura(),
    "data-realce": aparencia.realce() === PADROES.realce ? null : aparencia.realce(),
    "data-escala": aparencia.escalaTexto() === PADROES.escalaTexto ? null : aparencia.escalaTexto(),
    "data-movimento": aparencia.movimento() === "normal" ? null : "reduzido",
    "data-fundo": aparencia.fundoTela() === "grade" ? null : "liso",
    "data-contraste": aparencia.contraste() === "normal" ? null : "alto",
    "data-transparencia": aparencia.transparencia() === "normal" ? null : "reduzida",
    "data-zebra": aparencia.zebra() === "sim" ? null : "nao",
    "data-avisos": aparencia.posicaoAvisos() === PADROES.posicaoAvisos ? null : aparencia.posicaoAvisos(),
  };
  for (const [nome, valor] of Object.entries(atributos)) {
    if (valor == null) raiz.removeAttribute(nome);
    else raiz.setAttribute(nome, valor);
  }
}

/** Aplica o que estava salvo. Chamado no arranque, junto com o tema. */
export function iniciarAparencia() {
  pintar();
}
