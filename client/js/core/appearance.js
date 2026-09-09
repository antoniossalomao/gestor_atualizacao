import { settings } from "./prefs.js";

/**
 * Preferências de apresentação que valem para o app inteiro: quão apertadas
 * ficam as linhas das tabelas e quantos registros cabem numa página.
 *
 * São irmãs do `theme.js` -- mesma ideia, mesmo armazenamento (localStorage,
 * porque é escolha que deve durar), mesma forma de avisar o resto do app
 * (um evento no `document`). Ficam num arquivo separado porque tema é sobre
 * COR e estas duas são sobre ESPAÇO e QUANTIDADE; misturar tudo num
 * "preferências" genérico deixaria de dizer o que cada coisa faz.
 *
 * A densidade sai daqui como um atributo no `<html>` (`data-densidade`) e o
 * CSS faz o resto -- exatamente como o tema. Nenhuma tela precisa saber que
 * a opção existe: elas só usam os tokens `--linha-pad-y` / `--linha-txt`.
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

const PADRAO_DENSIDADE = "padrao";
const PADRAO_LINHAS = 50;
const PADRAO_ALTURA = "alta";
const PADRAO_RITMO = 30000;

export const aparencia = {
  densidade() {
    const salva = settings.get("densidade", PADRAO_DENSIDADE);
    return DENSIDADES.some((d) => d.valor === salva) ? salva : PADRAO_DENSIDADE;
  },

  linhasPorPagina() {
    const salvo = Number(settings.get("linhasPorPagina", PADRAO_LINHAS));
    return LINHAS_OPCOES.includes(salvo) ? salvo : PADRAO_LINHAS;
  },

  altura() {
    const salva = settings.get("alturaTabela", PADRAO_ALTURA);
    return ALTURAS.some((a) => a.valor === salva) ? salva : PADRAO_ALTURA;
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

  /** Volta tudo ao estado de fábrica -- inclusive tema e menu, que moram fora daqui. */
  restaurarPadroes() {
    for (const chave of ["densidade", "linhasPorPagina", "alturaTabela", "ritmoPainel", "abaInicial", "tema", "sidebarRecolhida", "notificarFalhas"]) {
      settings.set(chave, null);
    }
  },

  aplicar({ densidade, linhasPorPagina, altura, ritmoPainel, abaInicial } = {}) {
    if (densidade) settings.set("densidade", densidade);
    if (linhasPorPagina) settings.set("linhasPorPagina", Number(linhasPorPagina));
    if (altura) settings.set("alturaTabela", altura);
    if (ritmoPainel !== undefined) settings.set("ritmoPainel", Number(ritmoPainel));
    if (abaInicial !== undefined) settings.set("abaInicial", abaInicial);

    document.documentElement.setAttribute("data-densidade", this.densidade());
    document.documentElement.setAttribute("data-altura", this.altura());

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

/** Aplica o que estava salvo. Chamado no arranque, junto com o tema. */
export function iniciarAparencia() {
  const raiz = document.documentElement;
  raiz.setAttribute("data-densidade", aparencia.densidade());
  raiz.setAttribute("data-altura", aparencia.altura());
}
