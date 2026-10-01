import { html, plural } from "../utils/html.js";
import { iconeHtml } from "../utils/icones.js";

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
 * @param {Parameters<typeof iconeHtml>[0]} nomeIcone
 * @param {string} rotulo
 * @param {string} destino
 */
export function blocoDeNumero(chave, nomeIcone, rotulo, destino) {
  return html`
    <button type="button" class="card stat-tile" data-stat="${chave}" data-destino="${destino}">
      <div class="stat-tile__label">
        <span class="stat-tile__icon">${iconeHtml(nomeIcone)}</span>
        <span data-role="rotulo">${rotulo}</span>
      </div>
      <div class="stat-tile__value-row">
        <div class="stat-tile__value">—</div>
        <span class="stat-tile__delta" data-role="delta" hidden></span>
      </div>
      <span class="stat-tile__go">${destino} ${iconeHtml("seta")}</span>
    </button>`;
}

/**
 * O "+12%" ao lado do número do mês. Seta só quando há variação: "0%" com
 * seta para cima ou para baixo diria uma direção que não existe.
 * @param {{pct: number, tendencia: "alta"|"baixa"|"neutra"}} tendencia
 */
export function deltaTendencia(tendencia) {
  const pct = `${Math.abs(tendencia.pct)}%`;
  return tendencia.tendencia === "neutra" ? html`${pct}` : html`${iconeHtml("seta")}${pct}`;
}

/**
 * Corpo do card "Atualização dos Clientes": o percentual em dia em destaque,
 * a barra de distribuição, os três totais clicáveis e onde estão os atrasos
 * (cada sistema com a proporção dos seus clientes que está atrasada).
 *
 * Substituiu uma rosca de duas fatias ("Em dia" x "Desatualizados") em que
 * "em dia" era só quem teve alguma atualização nos últimos 60 dias -- não
 * dizia nada sobre versão. A barra é auxiliar: os números e os botões
 * funcionam sem ela, e ela some quando não há ninguém para dividir.
 *
 * @param {ReturnType<typeof import("../domain/situacao.js").totaisSituacao>} totais
 * @param {Array<{sistema: string, total: number, clientes?: number}>} maisAtrasados clientes = quantos avaliados usam o sistema
 * @param {number|null} [prazoDias] prazo da equipe depois da versão oficial (A07)
 */
export function corpoSituacao(totais, maisAtrasados, prazoDias = null) {
  if (totais.avaliados === 0) {
    // Nunca "100% em dia" de um conjunto vazio; o próximo passo depende
    // de já haver clientes cadastrados ou não.
    return html`
      <p class="situacao__vazio">
        ${totais.foraDaAvaliacao
          ? `${plural(totais.foraDaAvaliacao, "cliente")} fora da avaliação. Vincule um sistema atualizável no cadastro em Clientes. A classificação dos sistemas fica em Administração.`
          : "Nenhum cliente cadastrado para avaliar. Cadastre clientes e seus sistemas na tela Clientes."}
      </p>`;
  }
  const descricaoBarra = totais.grupos.map((g) => `${g.rotulo}: ${g.total} (${g.pct}%)`).join(", ");
  const emDia = totais.grupos.find((g) => g.chave === "em_dia");
  const top = maisAtrasados.slice(0, 3);
  return html`
    <div class="situacao__destaque">
      <strong class="situacao__hero">${emDia?.pct ?? 0}%</strong>
      <span class="situacao__hero-texto">
        <span>dos clientes em dia</span>
        <small>${emDia?.total ?? 0} de ${plural(totais.avaliados, "cliente")}${prazoDias != null ? ` · desatualizado ${prazoDias === 0 ? "logo depois da" : `${plural(prazoDias, "dia")} depois da`} versão oficial` : ""}</small>
      </span>
    </div>
    <div class="situacao__barra" role="img" aria-label="${descricaoBarra}">
      ${totais.grupos.filter((g) => g.total > 0).map((g) => html`<span class="situacao__parte is-${g.severidade}" style="flex-grow: ${g.total}" title="${g.rotulo}: ${g.total} (${g.pct}%)"></span>`)}
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
    ${totais.foraDaAvaliacao
      ? html`<p class="situacao__nota">${plural(totais.foraDaAvaliacao, "cliente")} fora da conta (sem sistema que controle versão).</p>`
      : ""}
    ${top.length
      ? html`
        <div class="situacao__sistemas">
          <h3 class="situacao__subtitulo">Onde estão os atrasos</h3>
          <ul>
            ${top.map((s) => {
              // Proporção DENTRO do sistema: 196 atrasados de 250 clientes que o
              // usam. A contagem sozinha não dizia se era quase todos ou poucos.
              const base = s.clientes || s.total;
              const pct = base > 0 ? Math.round((s.total / base) * 100) : 0;
              return html`
                <li><button type="button" class="situacao__sistema" data-sistema="${s.sistema}" title="${s.sistema}: ${s.total} de ${plural(base, "cliente")} atrasados (${pct}%). Clique para abrir em Sistemas.">
                  <span class="situacao__sistema-nome">${s.sistema}</span>
                  <span class="situacao__sistema-conta">${s.total} de ${base}</span>
                  <span class="situacao__sistema-trilho" aria-hidden="true"><span class="situacao__sistema-barra" style="width: ${pct}%"></span></span>
                  <span class="situacao__sistema-pct">${pct}%</span>
                </button></li>`;
            })}
          </ul>
          ${maisAtrasados.length > top.length ? html`<button type="button" class="btn btn--small" data-action="todos-sistemas">Ver todos (${maisAtrasados.length})</button>` : ""}
        </div>`
      : ""}`;
}
