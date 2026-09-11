import { settings } from "./prefs.js";

/**
 * Preferências de apresentação que valem para o app inteiro: cor, tamanho do
 * texto, quão apertadas ficam as linhas das tabelas, quantos registros cabem
 * numa página, onde os avisos aparecem.
 *
 * São irmãs do `theme.js` -- mesma ideia, mesmo armazenamento (localStorage,
 * porque é escolha que deve durar), mesma forma de avisar o resto do app
 * (um evento no `document`). O tema ficou num arquivo próprio porque tem uma
 * terceira via que nenhuma destas tem ("seguir o sistema", que obriga a ouvir
 * o `matchMedia` para sempre); aqui todas as escolhas são valores fechados
 * que só o usuário muda.
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
 * servidor (server/src/controllers/pagination.js). Oferecer 500 aqui só
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

const PADRAO_DENSIDADE = "padrao";
const PADRAO_LINHAS = 50;
const PADRAO_ALTURA = "alta";
const PADRAO_RITMO = 30000;
const PADRAO_REALCE = "azul";
const PADRAO_ESCALA = "padrao";
const PADRAO_AVISOS = "rodape";

/** Chaves tocadas por "Restaurar padrões" -- inclui as que moram fora daqui. */
const CHAVES = [
  "densidade",
  "linhasPorPagina",
  "alturaTabela",
  "ritmoPainel",
  "abaInicial",
  "realce",
  "escalaTexto",
  "movimento",
  "fundoTela",
  "posicaoAvisos",
  "lembrarFiltros",
  "tema",
  "sidebarRecolhida",
  "notificarFalhas",
];

/** Lê uma preferência restrita a uma lista fechada de valores. */
function umDe(chave, opcoes, padrao) {
  const salvo = settings.get(chave, padrao);
  return opcoes.some((o) => o.valor === salvo) ? salvo : padrao;
}

export const aparencia = {
  densidade() {
    return umDe("densidade", DENSIDADES, PADRAO_DENSIDADE);
  },

  linhasPorPagina() {
    const salvo = Number(settings.get("linhasPorPagina", PADRAO_LINHAS));
    return LINHAS_OPCOES.includes(salvo) ? salvo : PADRAO_LINHAS;
  },

  altura() {
    return umDe("alturaTabela", ALTURAS, PADRAO_ALTURA);
  },

  /** Milissegundos entre atualizações automáticas da Distribuição; 0 desliga. */
  ritmoPainel() {
    const salvo = Number(settings.get("ritmoPainel", PADRAO_RITMO));
    return RITMOS.some((r) => r.valor === salvo) ? salvo : PADRAO_RITMO;
  },

  /** Aba que abre ao entrar. Vazio = a primeira da lista. */
  abaInicial() {
    return settings.get("abaInicial", "") || "";
  },

  realce() {
    return umDe("realce", REALCES, PADRAO_REALCE);
  },

  escalaTexto() {
    return umDe("escalaTexto", ESCALAS, PADRAO_ESCALA);
  },

  /** "normal" (segue só o sistema) ou "reduzido" (corta as animações aqui). */
  movimento() {
    return settings.get("movimento", "normal") === "reduzido" ? "reduzido" : "normal";
  },

  /** "grade" (padrão, com a textura e o halo) ou "liso". */
  fundoTela() {
    return settings.get("fundoTela", "grade") === "liso" ? "liso" : "grade";
  },

  posicaoAvisos() {
    return umDe("posicaoAvisos", POSICOES_AVISO, PADRAO_AVISOS);
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

  /** Volta tudo ao estado de fábrica -- inclusive tema e menu, que moram fora daqui. */
  restaurarPadroes() {
    for (const chave of CHAVES) settings.remove(chave);
  },

  aplicar(mudancas = {}) {
    const { densidade, linhasPorPagina, altura, ritmoPainel, abaInicial } = mudancas;
    const { realce, escalaTexto, movimento, fundoTela, posicaoAvisos, lembrarFiltros } = mudancas;

    if (densidade) settings.set("densidade", densidade);
    if (linhasPorPagina) settings.set("linhasPorPagina", Number(linhasPorPagina));
    if (altura) settings.set("alturaTabela", altura);
    if (ritmoPainel !== undefined) settings.set("ritmoPainel", Number(ritmoPainel));
    if (abaInicial !== undefined) settings.set("abaInicial", abaInicial);
    if (realce) settings.set("realce", realce);
    if (escalaTexto) settings.set("escalaTexto", escalaTexto);
    if (movimento) settings.set("movimento", movimento);
    if (fundoTela) settings.set("fundoTela", fundoTela);
    if (posicaoAvisos) settings.set("posicaoAvisos", posicaoAvisos);
    if (lembrarFiltros !== undefined) settings.set("lembrarFiltros", Boolean(lembrarFiltros));

    pintar();

    // Quem mudou foi só o CSS quando a densidade muda -- mas o número de
    // linhas por página muda o que as telas precisam PEDIR ao servidor, e elas
    // não têm como adivinhar sozinhas que a preferência virou outra. O evento
    // avisa; quem se importa, escuta (ver App._ligarAparencia).
    document.dispatchEvent(
      new CustomEvent("aparencia:mudou", {
        detail: {
          densidade: this.densidade(),
          linhasPorPagina: this.linhasPorPagina(),
          altura: this.altura(),
          ritmoPainel: this.ritmoPainel(),
        },
      })
    );
  },
};

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
    "data-realce": aparencia.realce() === PADRAO_REALCE ? null : aparencia.realce(),
    "data-escala": aparencia.escalaTexto() === PADRAO_ESCALA ? null : aparencia.escalaTexto(),
    "data-movimento": aparencia.movimento() === "normal" ? null : "reduzido",
    "data-fundo": aparencia.fundoTela() === "grade" ? null : "liso",
    "data-avisos": aparencia.posicaoAvisos() === PADRAO_AVISOS ? null : aparencia.posicaoAvisos(),
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
