import { html } from "../utils/html.js";
import { iconHtml } from "../utils/icons.js";

/**
 * Um indicador do topo do Resumo. O `data-stat` é como a view o encontra
 * depois para preencher o número.
 *
 * É um `<button>`, não uma `<div>`: os quatro números eram becos sem saída --
 * viam-se "37 clientes parados" e a única continuação possível era ir procurar
 * a tela certa e refazer o filtro na mão. Agora cada um leva à lista que ele
 * conta. Sendo botão de verdade, isso vale também para teclado e leitor de
 * tela, que é o que uma `<div onclick>` não daria.
 *
 * @param {string} chave
 * @param {Parameters<typeof iconHtml>[0]} nomeIcone
 * @param {string} rotulo
 * @param {string} destino
 */
export function statTile(chave, nomeIcone, rotulo, destino) {
  return html`
    <button type="button" class="card stat-tile" data-stat="${chave}" data-destino="${destino}">
      <div class="stat-tile__label">
        <span class="stat-tile__icon">${iconHtml(nomeIcone)}</span>
        <span data-role="rotulo">${rotulo}</span>
      </div>
      <div class="stat-tile__value-row">
        <div class="stat-tile__value">—</div>
        <span class="stat-tile__delta" data-role="delta" hidden></span>
      </div>
      <span class="stat-tile__go">${destino} ${iconHtml("seta")}</span>
    </button>`;
}

/**
 * O "+12%" ao lado do número do mês. Seta só quando há variação: "0%" com
 * seta para cima ou para baixo diria uma direção que não existe.
 * @param {{pct: number, tendencia: "alta"|"baixa"|"neutra"}} tendencia
 */
export function deltaTendencia(tendencia) {
  const pct = `${Math.abs(tendencia.pct)}%`;
  return tendencia.tendencia === "neutra" ? html`${pct}` : html`${iconHtml("seta")}${pct}`;
}
