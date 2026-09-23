import { html, confiavel } from "../utils/html.js";
import { iconHtml } from "../utils/icons.js";
import { todayBR } from "../utils/date.js";
import { STATUS_CONCLUIDO, estaAtrasada } from "../domain/agendamento.js";

/**
 * Marcação do quadro Kanban da aba Agendamentos. Saiu de AgendamentosView.js
 * para ser testável no Node: a view só troca o `innerHTML` do quadro e liga
 * os eventos.
 *
 * O título da tarefa e o nome do cliente são texto livre digitado por
 * qualquer operador, e aparecem aqui em três contextos (conteúdo, `title=` e
 * `aria-label=`). Antes cada um dependia de lembrar a função de escape certa,
 * e o `aria-label` usava a errada -- ver `escapeHtml` em utils/html.js.
 */

/**
 * @param {any} row agendamento como vem de /agendamentos
 * @param {string|undefined} role papel de quem está vendo
 * @param {{agora?: Date}} [opcoes] `agora` fixo para teste
 */
export function cartaoKanban(row, role, { agora = new Date() } = {}) {
  const vencida = row.status !== STATUS_CONCLUIDO && estaAtrasada(row.data, agora);
  const hoje = row.status !== STATUS_CONCLUIDO && row.data === todayBR(agora);
  const podeArrastar = role !== "consulta" && !row.arquivadoEm;
  const dataHora = [row.data, row.horario].filter(Boolean).join(" · ");
  const meta = [row.sistema, row.responsavel].filter(Boolean).join(" · ");
  const cliente = row.cliente || "Sem cliente";
  const classeTempo = vencida ? " is-vencida" : hoje ? " is-today" : "";

  // Classes de borda esquerda por prioridade (coexiste com is-overdue)
  const classePrioridade =
    row.prioridade === "Urgente" ? " is-urgente" :
    row.prioridade === "Alta"    ? " is-alta"    : "";

  // Badge de prioridade — só para Alta e Urgente (Normal/Baixa não poluem o card)
  const badgePrioridade =
    row.prioridade === "Urgente"
      ? html`<span class="badge badge--danger">🔴 Urgente</span>`
      : row.prioridade === "Alta"
      ? html`<span class="badge badge--warning">🟠 Alta</span>`
      : "";

  // Prévia de obs truncada (2 linhas via CSS)
  const obsPreview = row.obs ? html`<p class="kanban-card__obs">${row.obs}</p>` : "";

  return html`<article class="kanban-card${vencida ? " is-overdue" : ""}${classePrioridade}" ${podeArrastar && confiavel('draggable="true"')} data-id="${row.id}" data-status="${row.status}" tabindex="0" role="button" aria-label="Tarefa ${row.tarefa}">
    <div class="kanban-card__header">
      <strong class="kanban-card__client" title="${cliente}">${cliente}</strong>
      <div class="kanban-card__badges">
        ${badgePrioridade}
        ${vencida ? html`<span class="badge badge--danger">Vencida</span>` : hoje && html`<span class="badge badge--accent">Hoje</span>`}
      </div>
    </div>
    <p class="kanban-card__title">${row.tarefa}</p>
    ${obsPreview}
    <div class="kanban-card__footer">
      <span class="kanban-card__meta">${meta || "—"}</span>
      ${dataHora && html`<time class="kanban-card__time${classeTempo}">${dataHora}</time>`}
    </div>
    ${row.arquivadoEm && role !== "consulta" && html`
      <div class="kanban-card__actions">
        <button type="button" class="btn btn--small btn--ghost" data-row-action="reabrir" data-id="${row.id}">
          ${iconHtml("atualizar")} Reabrir
        </button>
      </div>`}
  </article>`;
}

/**
 * @typedef {{status: string, titulo: string, itens: any[]}} ColunaKanban
 */

/**
 * As colunas do quadro, cada uma com seus cartões.
 * @param {ColunaKanban[]} colunas
 * @param {string|undefined} role
 * @param {{agora?: Date}} [opcoes]
 */
export function colunasKanban(colunas, role, opcoes = {}) {
  // Reordenar colunas só faz sentido com mais de uma na tela, e só para quem
  // pode mexer no quadro.
  const podeArrastarCol = role !== "consulta" && colunas.length > 1;
  return html`${colunas.map((col) => {
    const cartoes = col.itens.map((r) => cartaoKanban(r, role, opcoes));

    // Alertas no header: urgentes e/ou vencidas na coluna (exceto Concluído)
    const agora = opcoes.agora || new Date();
    const naoArquivadas = col.itens.filter((r) => !r.arquivadoEm && r.status !== STATUS_CONCLUIDO);
    const urgentes = naoArquivadas.filter((r) => r.prioridade === "Urgente" || r.prioridade === "Alta").length;
    const vencidas = naoArquivadas.filter((r) => estaAtrasada(r.data, agora)).length;
    const alertas = html`
      ${vencidas > 0 ? html`<span class="badge badge--danger kanban-column__alert" title="${vencidas} vencida(s)">⚠ ${vencidas}</span>` : ""}
      ${urgentes > 0 && vencidas === 0 ? html`<span class="badge badge--warning kanban-column__alert" title="${urgentes} urgente(s)/alta(s)">! ${urgentes}</span>` : ""}
    `;

    return html`
      <section class="kanban-column kanban-column--${slugStatus(col.status)}" data-status="${col.status}">
        <header class="kanban-column__header" ${podeArrastarCol && confiavel('draggable="true" data-col-drag="true" title="Arraste para reordenar coluna"')}>
          <div class="kanban-column__header-top">
            <h3 class="kanban-column__title">${col.titulo}</h3>
            <div class="kanban-column__header-right">
              ${alertas}
              <span class="kanban-column__count">${col.itens.length}</span>
            </div>
          </div>
        </header>
        <div class="kanban-column__cards">${
          cartoes.length ? cartoes : html`<div class="kanban-empty-placeholder"><span>Nenhuma tarefa aqui</span></div>`
        }</div>
      </section>`;
  })}`;
}

/** "Em Andamento" -> "em-andamento", "Concluído" -> "concluido": vira sufixo de classe CSS. */
export function slugStatus(status) {
  return String(status)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}
