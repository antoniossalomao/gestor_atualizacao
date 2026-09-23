import { html } from "../utils/html.js";

/**
 * Peças de marcação comuns às telas com abas (Administração e Configurações):
 * o cabeçalho de cada aba e o título de um cartão. Moravam em
 * templates/administracao.js; saíram de lá quando as Configurações viraram
 * tela e passaram a usar exatamente as mesmas.
 */

/**
 * @param {{titulo: string, descricao: string, acoes?: import("../utils/html.js").HtmlSeguro | false | null}} opcoes
 */
export function cabecalhoSecao({ titulo, descricao, acoes }) {
  return html`
    <header class="secao-head">
      <div class="secao-head__titulos">
        <h2>${titulo}</h2>
        <p>${descricao}</p>
      </div>
      ${acoes && html`<div class="secao-head__acoes">${acoes}</div>`}
    </header>`;
}

/**
 * O título de um cartão dentro de uma aba ("Tema e cores", "Sessões
 * abertas"). Um cartão sem título, numa aba com três deles, obriga a ler as
 * linhas para descobrir do que ele trata.
 * @param {{titulo: string, descricao?: string, acoes?: import("../utils/html.js").HtmlSeguro | false | null}} opcoes
 */
export function tituloCartao({ titulo, descricao, acoes }) {
  return html`
    <header class="secao-card__head">
      <div class="secao-card__titulos">
        <h3>${titulo}</h3>
        ${descricao && html`<p>${descricao}</p>`}
      </div>
      ${acoes && html`<div class="secao-card__acoes">${acoes}</div>`}
    </header>`;
}
