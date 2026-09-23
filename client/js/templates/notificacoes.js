import { html } from "../utils/html.js";
import { iconHtml } from "../utils/icons.js";

/**
 * Marcação da lista do sino de notificações (ver MenuNotificacoes). O que
 * entra na lista e em que ordem é decidido em domain/notificacoes.js.
 */

/**
 * @param {Array<import("../domain/notificacoes.js").Notificacao>} notificacoes
 */
export function listaNotificacoes(notificacoes) {
  // Dizer "nada pendente" em vez de abrir um menu vazio: menu vazio parece
  // defeito, e a pessoa clica de novo para conferir.
  if (notificacoes.length === 0) return html`<p class="app-menu__vazio">${iconHtml("check")} Nada pendente agora.</p>`;
  return html`${notificacoes.map(itemNotificacao)}`;
}

/**
 * `data-params` carrega o filtro que o clique aplica na tela de destino, como
 * JSON -- que é feito de aspas duplas. Com o escape errado (o `escapeHtml`
 * antigo não escapava aspas), o atributo fecharia no primeiro `"` e o resto
 * do JSON viraria atributo solto no botão. Nada quebraria visivelmente: só o
 * clique passaria a levar para a tela sem filtro nenhum. A tag `html` escapa
 * aspas, e o teste deste arquivo confere o JSON voltando inteiro.
 *
 * @param {import("../domain/notificacoes.js").Notificacao} n
 */
export function itemNotificacao(n) {
  return html`
    <button type="button" class="app-menu__aviso app-menu__aviso--${n.tom}" role="menuitem"
            data-destino="${n.destino}"${n.params && html` data-params="${JSON.stringify(n.params)}"`}>
      <span class="app-menu__aviso-icone">${iconHtml(/** @type {any} */ (n.icone))}</span>
      <span class="app-menu__aviso-texto">
        <strong>${n.titulo}</strong>
        ${n.detalhe && html`<span>${n.detalhe}</span>`}
      </span>
      <span class="app-menu__aviso-seta">${iconHtml("seta")}</span>
    </button>`;
}
