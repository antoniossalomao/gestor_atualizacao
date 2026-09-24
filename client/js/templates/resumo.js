import { html, plural } from "../utils/html.js";
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

/**
 * Corpo do card "Atualização dos Clientes": barra de distribuição, os três
 * totais clicáveis e os sistemas com mais clientes atrasados.
 *
 * Substituiu uma rosca de duas fatias ("Em dia" x "Desatualizados") em que
 * "em dia" era só quem teve algum atendimento nos últimos 60 dias -- não
 * dizia nada sobre versão. A barra é auxiliar: os números e os botões
 * funcionam sem ela, e ela some quando não há ninguém para dividir.
 *
 * @param {ReturnType<typeof import("../domain/situacao.js").totaisSituacao>} totais
 * @param {Array<{sistema: string, total: number}>} maisAtrasados
 */
export function corpoSituacao(totais, maisAtrasados) {
  if (totais.avaliados === 0) {
    // Nunca "100% em dia" de um conjunto vazio.
    return html`
      <p class="situacao__vazio">
        Nenhum cliente tem sistema com controle de versão para avaliar.
        Marque os sistemas de cada cliente em Clientes e cadastre a versão oficial em Sistemas.
      </p>`;
  }
  const descricaoBarra = totais.grupos.map((g) => `${g.rotulo}: ${g.pct}%`).join(", ");
  const top = maisAtrasados.slice(0, 3);
  return html`
    <div class="situacao__barra" role="img" aria-label="${descricaoBarra}">
      ${totais.grupos.filter((g) => g.total > 0).map((g) => html`<span class="situacao__parte is-${g.severidade}" style="flex-grow: ${g.total}"></span>`)}
    </div>
    <div class="situacao__totais">
      ${totais.grupos.map(
        (g) => html`
          <button type="button" class="situacao__total" data-grupo="${g.chave}" title="${g.descricao} Clique para ver a lista.">
            <span class="situacao__marca is-${g.severidade}" aria-hidden="true"></span>
            <span class="situacao__rotulo">${g.rotulo}</span>
            <strong class="situacao__valor">${g.total}</strong>
            <span class="situacao__pct">${g.pct}%</span>
          </button>`
      )}
    </div>
    <p class="situacao__nota">
      De ${plural(totais.avaliados, "cliente")} com sistema que controla versão.${totais.foraDaAvaliacao
        ? ` ${plural(totais.foraDaAvaliacao, "cliente")} fora da conta (só sistemas fixos ou nenhum).`
        : ""}
    </p>
    ${top.length
      ? html`
        <div class="situacao__sistemas">
          <h3 class="situacao__subtitulo">Sistemas com mais clientes atrasados</h3>
          <ul>
            ${top.map(
              (s) => html`
                <li><button type="button" class="situacao__sistema" data-sistema="${s.sistema}">
                  <span>${s.sistema}</span><span>${plural(s.total, "cliente")}</span>
                </button></li>`
            )}
          </ul>
          ${maisAtrasados.length > top.length ? html`<button type="button" class="btn btn--small" data-action="todos-sistemas">Ver todos (${maisAtrasados.length})</button>` : ""}
        </div>`
      : ""}`;
}
