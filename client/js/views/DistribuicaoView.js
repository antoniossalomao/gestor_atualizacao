import { View } from "../app/View.js";
import { icon } from "../utils/icons.js";
import { toast } from "../components/Toast.js";
import { Modal } from "../components/Modal.js";
import { emptyState } from "../components/EmptyState.js";
import { copyToClipboard, escapeAttr, escapeHtml, plural } from "../utils/html.js";
import { formatarDataHora, tempoRelativo } from "../utils/date.js";
import { notificacoes } from "../app/notify.js";
import { aparencia } from "../app/appearance.js";
import { faseLabel } from "../domain/agenteLabels.js";
import { relatorioRetornosTexto } from "../domain/agenteReport.js";
import { classificarRetorno, agruparRetornos } from "../domain/agenteStatus.js";
import { AgenteDetalheModal } from "./AgenteDetalheModal.js";
import { ApiError } from "../api/ApiClient.js";

const RESULTADOS = {
  sucesso: "badge--success", erro: "badge--danger", pendencias: "badge--warning",
  aguardando: "badge--accent", andamento: "badge--accent", desconhecido: "badge--muted",
};

const SITUACOES = {
  ok: { label: "Em dia", badge: "badge--success" },
  desatualizado: { label: "Desatualizado", badge: "badge--warning" },
  erro: { label: "Com erro", badge: "badge--danger" },
  pendencias: { label: "Com pendências", badge: "badge--warning" },
  offline: { label: "Sem contato", badge: "badge--muted" },
  pausado: { label: "Pausado", badge: "badge--muted" },
  pendente: { label: "Em andamento", badge: "badge--accent" },
  aguardando_autorizacao: { label: "Aguardando autorização", badge: "badge--accent" },
  aguardando_autorizacao_demorada: { label: "Autorização demorada", badge: "badge--danger" },
};

/** Painel operacional: acompanha agentes e os resultados das atualizações. */
export class DistribuicaoView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.systems = [];
    this.painel = null;
    this.logs = [];
    this.filtroSituacao = "todos";
    this.filtroSistema = "";
    this.buscaAgente = "";
    this.filtroRetorno = "todos";
    this.filtroSistemaRetorno = "";
    this.buscaRetorno = "";
    this._timer = null;
    this._ultimaAtualizacao = null;
    this._buildDom();
  }

  _buildDom() {
    this.container.classList.add("distribution-dashboard");
    this.container.innerHTML = `
      <div class="distribution-topbar">
        <p>Visão geral dos agentes</p>
        <div class="distribution-topbar__actions">
        <span class="distribution-live" data-role="freshness" hidden>
          <span class="distribution-live__dot"></span>
          <span data-role="freshness-text"></span>
        </span>
        <button type="button" class="btn btn--small btn--ghost" data-action="refresh">${icon("atualizar")} Atualizar</button>
        </div>
      </div>

      <div class="distribution-metrics" data-role="indicators"></div>

      <section class="card distribution-section">
        <div class="section-heading">
          <div><h2 class="card__title">Retornos recentes</h2><p class="distribution-section__description">Um resumo por agente. Erros e mensagens ficam nos detalhes.</p></div>
          <div class="distribution-section__actions">
            <span class="result-count" data-role="logs-count" aria-live="polite"></span>
            <button type="button" class="btn btn--small btn--ghost" data-action="copy-report">${icon("copiar")} Copiar relatório</button>
          </div>
        </div>
        <div class="toolbar distribution-report-filters">
          <div class="field">
            <label class="field__label" for="dist-log-search">Buscar</label>
            <input type="search" class="input" id="dist-log-search" data-role="log-search" placeholder="Empresa, script ou mensagem..." />
          </div>
          <div class="field">
            <label class="field__label" for="dist-log-status">Último resultado</label>
            <select class="input" id="dist-log-status" data-role="log-status">
              <option value="todos">Todos</option>
              <option value="erro">Com erro</option>
              <option value="pendencias">Com pendências</option>
              <option value="sucesso">Concluídos</option>
              <option value="andamento">Em andamento</option>
              <option value="aguardando">Aguardando autorização</option>
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="dist-log-system">Sistema</label>
            <select class="input" id="dist-log-system" data-role="log-system"><option value="">Todos</option></select>
          </div>
        </div>
        <div class="distribution-report-list" data-role="logs"></div>
        <p class="distribution-section__footnote" data-role="logs-note"></p>
      </section>

      <section class="card distribution-section">
        <div class="section-heading">
          <div><h2 class="card__title">Situação dos agentes</h2><p class="distribution-section__description">Estado atual e versão do último sistema informado por cada agente.</p></div>
          <span class="result-count" data-role="agents-count"></span>
        </div>
        <div class="toolbar distribution-report-filters">
          <div class="field">
            <label class="field__label" for="dist-search">Buscar</label>
            <input type="search" class="input" id="dist-search" data-role="search" placeholder="Empresa, identificador ou máquina..." />
          </div>
          <div class="field">
            <label class="field__label" for="dist-situation">Situação</label>
            <select class="input" id="dist-situation" data-role="situation-filter">
              <option value="todos">Todas</option>
              <option value="desatualizado">Desatualizados</option>
              <option value="erro">Com erro</option>
              <option value="pendencias">Com pendências</option>
              <option value="offline">Sem contato</option>
              <option value="pausado">Pausados</option>
              <option value="ok">Em dia</option>
              <option value="pendente">Em andamento</option>
              <option value="aguardando_autorizacao">Aguardando autorização</option>
              <option value="aguardando_autorizacao_demorada">Autorização demorada</option>
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="dist-system">Sistema</label>
            <select class="input" id="dist-system" data-role="system-filter"><option value="">Todos</option></select>
          </div>
        </div>
        <div class="table-wrap distribution-agent-table-wrap">
          <table class="data-table distribution-agent-table">
            <thead><tr>
              <th scope="col">Empresa</th><th scope="col">Situação</th><th scope="col">Sistema</th>
              <th scope="col">Versão informada</th><th scope="col">Publicada</th><th scope="col">Último contato</th>
              <th scope="col">Ações</th>
            </tr></thead>
            <tbody data-role="agents"></tbody>
          </table>
        </div>
      </section>
    `;

    this.freshnessBox = this.container.querySelector('[data-role="freshness"]');
    this.freshnessText = this.container.querySelector('[data-role="freshness-text"]');
    this.searchInput = this.container.querySelector('[data-role="search"]');
    this.situationFilter = this.container.querySelector('[data-role="situation-filter"]');
    this.systemFilter = this.container.querySelector('[data-role="system-filter"]');
    this.logSearch = this.container.querySelector('[data-role="log-search"]');
    this.logStatus = this.container.querySelector('[data-role="log-status"]');
    this.logSystem = this.container.querySelector('[data-role="log-system"]');

    this.container.querySelector('[data-action="refresh"]').addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      this.cache?.invalidar("distribuicao:");
      try { await this.refresh(true); }
      catch { toast.error("Não foi possível atualizar o painel. Tente novamente."); }
      finally { button.disabled = false; }
    });
    this.container.querySelector('[data-action="copy-report"]').addEventListener("click", () => this._copyReport());
    this.searchInput.addEventListener("input", () => {
      this.buscaAgente = this.searchInput.value.trim().toLowerCase();
      this._renderAgents();
    });
    this.situationFilter.addEventListener("change", () => {
      this.filtroSituacao = this.situationFilter.value;
      this._renderAgents();
    });
    this.systemFilter.addEventListener("change", () => {
      this.filtroSistema = this.systemFilter.value;
      this._renderAgents();
    });
    this.logSearch.addEventListener("input", () => {
      this.buscaRetorno = this.logSearch.value.trim().toLowerCase();
      this._renderLogs();
    });
    this.logStatus.addEventListener("change", () => {
      this.filtroRetorno = this.logStatus.value;
      this._renderLogs();
    });
    this.logSystem.addEventListener("change", () => {
      this.filtroSistemaRetorno = this.logSystem.value;
      this._renderLogs();
    });

    this.on(document, "visibilitychange", () => {
      if (document.visibilityState === "visible" && this.visivel) this._startPolling();
      else this._stopPolling();
    });
  }

  aplicarParams(params) {
    if (!params) return;
    if (params.situacao !== undefined) {
      this.filtroSituacao = params.situacao;
      if (this.situationFilter) this.situationFilter.value = params.situacao;
    }
    if (params.sistema !== undefined) {
      this.filtroSistema = params.sistema;
      if (this.systemFilter) this.systemFilter.value = params.sistema;
    }
    if (params.busca !== undefined) {
      this.buscaAgente = params.busca.trim().toLowerCase();
      if (this.searchInput) this.searchInput.value = params.busca;
    }
    if (this.painel) {
      this._renderAgents();
    }
  }

  async refresh(manual = false) {
    const systems = await this.swr("sistemas", () => this.api.get("/sistemas", null, { key: "dist:sistemas" }), (list) => {
      this.systems = list || [];
      this._fillSystems();
    });
    this.systems = systems || [];

    await this.swr(
      "distribuicao:painel",
      () => this.api.get("/versoes/painel", null, { key: "dist:painel" }),
      (data, { doCache }) => {
        this.painel = data;
        this._renderIndicators();
        this._renderAgents();
        if (!doCache) {
          this._ultimaAtualizacao = new Date();
          this._renderFreshness();
        }
      }
    );

    await this.swr(
      "distribuicao:logs",
      () => this.api.get("/versoes/logs", { limit: 300 }, { key: "dist:logs" }),
      (logs) => {
        this.logs = logs || [];
        this._renderLogs();
        notificacoes.sincronizar(this.logs);
      }
    );

    this._startPolling();
    if (manual) toast.info("Painel atualizado.");
  }

  _fillSystems() {
    for (const select of [this.systemFilter, this.logSystem]) {
      const current = select.value;
      select.innerHTML = `<option value="">Todos</option>` + this.systems.map((s) => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("");
      select.value = this.systems.includes(current) ? current : "";
    }
  }

  _renderIndicators() {
    const agents = this.painel?.agentes || [];
    const attention = agents.filter((agent) => ["erro", "pendencias", "desatualizado", "aguardando_autorizacao", "aguardando_autorizacao_demorada"].includes(agent.situacao)).length;
    const aligned = agents.filter((agent) => agent.versaoAlvo && agent.ultimaVersao === agent.versaoAlvo).length;
    const offline = agents.filter((agent) => agent.situacao === "offline").length;
    const metrics = [
      { label: "Agentes monitorados", value: agents.length, hint: "Clientes que já enviaram retornos", icon: "distribuicao", tone: "neutral" },
      { label: "Precisam de atenção", value: attention, hint: "Erros, pendências ou atualização aguardando", icon: "alerta", tone: attention ? "warning" : "neutral" },
      { label: "Na versão publicada", value: aligned, hint: "Versão informada igual à publicada", icon: "versoes", tone: "neutral" },
      { label: "Sem contato", value: offline, hint: "Sem comunicação há mais de 26 horas", icon: "relogio", tone: offline ? "danger" : "neutral" },
    ];
    this.container.querySelector('[data-role="indicators"]').innerHTML = `
      ${metrics.map((metric) => `<div class="card distribution-metric distribution-metric--${metric.tone}">
        <div class="distribution-metric__head"><span>${metric.label}</span>${icon(metric.icon)}</div>
        <strong>${metric.value}</strong><small>${metric.hint}</small>
      </div>`).join("")}`;
  }

  _filteredLogGroups() {
    const logs = this.filtroSistemaRetorno ? this.logs.filter((log) => log.sistema === this.filtroSistemaRetorno) : this.logs;
    return agruparRetornos(logs).filter((group) => {
      if (this.filtroRetorno !== "todos" && group.resultado.tipo !== this.filtroRetorno) return false;
      return !this.buscaRetorno || group.logs.some((log) =>
        `${log.empresa || ""} ${log.cnpj || ""} ${log.maquina || ""} ${log.sistema || ""} ${log.detalhes || ""}`.toLowerCase().includes(this.buscaRetorno)
      );
    });
  }

  _renderLogs() {
    const list = this.container.querySelector('[data-role="logs"]');
    const groups = this._filteredLogGroups();
    list.replaceChildren();
    this.container.querySelector('[data-role="logs-count"]').textContent =
      plural(groups.length, "agente");
    this.container.querySelector('[data-role="logs-note"]').textContent = this.logs.length
      ? `${this.logs.length >= 300 ? "Exibindo as 300 mensagens mais recentes." : `${plural(this.logs.length, "mensagem", "mensagens")} no histórico recente.`} Cada mensagem representa uma etapa ou um resultado da atualização.`
      : "";

    if (!groups.length) {
      list.appendChild(
        emptyState({
          titulo: this.logs.length ? "Nenhum retorno com esse filtro" : "Nenhum retorno ainda",
          descricao: this.logs.length ? "Tente mudar a busca ou o último resultado." : "As mensagens aparecerão quando um agente se comunicar.",
          icone: this.logs.length ? "busca" : "historico",
        })
      );
      return;
    }

    for (const group of groups) {
      const log = group.ultimo;
      const result = group.resultado;
      const hasIssues = group.erros.length > 0 || group.avisos.length > 0;
      const item = document.createElement("article");
      item.className = `distribution-return distribution-return--${result.tipo}`;
      const context = [
        log.sistema,
        log.versaoAnterior && log.versao ? `${log.versaoAnterior} → ${log.versao}` : log.versao,
      ].filter(Boolean).join(" · ");
      const summary = result.tipo === "pendencias"
        ? `${plural(result.scriptsPulados || 0, "script")} com falha na última atualização. Confira os detalhes antes de considerar o processo concluído.`
        : result.tipo === "erro" ? "O último retorno indica uma falha. Abra os detalhes para conferir o motivo."
        : result.tipo === "sucesso" ? "Última atualização concluída sem pendências informadas."
        : result.tipo === "aguardando" ? "A atualização aguarda autorização para continuar."
        : result.tipo === "desconhecido" ? "O agente enviou um retorno sem resultado reconhecido."
        : `Atualização em andamento${log.fase ? ` · ${faseLabel(log.fase)}` : ""}.`;
      item.innerHTML = `
        <div class="distribution-return__icon">${icon(result.tipo === "sucesso" ? "check" : ["erro", "pendencias"].includes(result.tipo) ? "alerta" : "relogio")}</div>
        <div class="distribution-return__body">
          <div class="distribution-return__heading">
            <h3>${escapeHtml(log.empresa || log.cnpj)}</h3>
            <span class="badge ${RESULTADOS[result.tipo] || "badge--muted"}">${escapeHtml(result.label)}</span>
          </div>
          <p class="distribution-return__context">Último retorno${context ? ` · ${escapeHtml(context)}` : ""}</p>
          <p class="distribution-return__summary">${escapeHtml(summary)}</p>
          <p class="distribution-return__history">${plural(group.logs.length, "mensagem", "mensagens")}${group.erros.length ? ` · ${plural(group.erros.length, "registro")} de erro no histórico recente` : ""}${group.sistemas.length > 1 ? ` · ${plural(group.sistemas.length, "sistema")}` : ""}</p>
        </div>
        <div class="distribution-return__actions">
          <time data-role="when"></time>
          <button type="button" class="btn btn--small" data-action="details">Detalhes ${icon("seta")}</button>
        </div>
      `;
      const when = item.querySelector('[data-role="when"]');
      when.textContent = tempoRelativo(log.criadoEm);
      when.title = formatarDataHora(log.criadoEm);
      item.querySelector('[data-action="details"]').addEventListener("click", () =>
        new AgenteDetalheModal(this.api, log, { somenteErros: hasIssues, sistema: this.filtroSistemaRetorno }).open()
      );
      list.appendChild(item);
    }
  }

  async _copyReport() {
    const logs = this._filteredLogGroups().flatMap((group) => group.logs);
    if (!logs.length) {
      toast.info("Não há retornos nesse filtro para copiar.");
      return;
    }
    const classificados = logs.map((log) => ({ ...log, status: classificarRetorno(log).label }));
    if (await copyToClipboard(relatorioRetornosTexto(classificados))) toast.success("Relatório copiado.");
    else toast.error("Não foi possível copiar o relatório.");
  }

  _renderAgents() {
    const body = this.container.querySelector('[data-role="agents"]');
    const all = this.painel?.agentes || [];
    const filtered = all.filter((agent) => {
      if (this.filtroSituacao !== "todos" && agent.situacao !== this.filtroSituacao) return false;
      if (this.filtroSistema && agent.ultimoSistema !== this.filtroSistema) return false;
      if (this.buscaAgente) {
        const target = `${agent.empresa} ${agent.cnpj} ${agent.maquina || ""} ${agent.cidade || ""}`.toLowerCase();
        if (!target.includes(this.buscaAgente)) return false;
      }
      return true;
    });

    // Ordenação por severidade: incidentes (erro, demorado, offline, pendências) primeiro
    const SEVERIDADE_RANK = {
      erro: 0,
      aguardando_autorizacao_demorada: 1,
      offline: 2,
      pendencias: 3,
      desatualizado: 4,
      pendente: 5,
      aguardando_autorizacao: 6,
      pausado: 7,
      ok: 8,
    };

    filtered.sort((a, b) => {
      const rankA = SEVERIDADE_RANK[a.situacao] ?? 99;
      const rankB = SEVERIDADE_RANK[b.situacao] ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      // `.getTime()` explicito em vez de subtrair as datas direto: subtrair
      // dois Date funciona (o JS converte por valueOf), mas so por coercao
      // implicita -- qualquer verificacao estatica marca como erro, e quem le
      // precisa lembrar da regra. O resultado e' identico.
      return new Date(a.ultimaComunicacao || 0).getTime() - new Date(b.ultimaComunicacao || 0).getTime();
    });

    body.replaceChildren();
    this.container.querySelector('[data-role="agents-count"]').textContent =
      filtered.length === all.length ? plural(all.length, "agente") : `${filtered.length} de ${plural(all.length, "agente")}`;

    if (!filtered.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.className = "table-empty";
      cell.appendChild(
        emptyState({
          titulo: all.length ? "Nenhum agente com esse filtro" : "Nenhum agente comunicou ainda",
          descricao: all.length ? "Tente mudar a busca ou os filtros." : "Assim que o Atualizador rodar num cliente, ele aparecerá aqui.",
          icone: all.length ? "busca" : "distribuicao",
        })
      );
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    for (const agent of filtered) {
      const situation = SITUACOES[agent.situacao] || SITUACOES.pendente;
      const row = document.createElement("tr");
      const isErro = agent.situacao === "erro" || agent.situacao === "aguardando_autorizacao_demorada";
      const isAlerta = agent.situacao === "offline" || agent.situacao === "pendencias";
      row.className = `is-readonly ${isErro ? "row--incident-erro" : isAlerta ? "row--incident-alerta" : ""}`;
      row.innerHTML = `
        <td data-label="Empresa"><div class="distribution-agent-identity"><strong>${escapeHtml(agent.empresa)}</strong><small class="table-subtext">${escapeHtml(agent.cnpj)}${agent.maquina ? ` · ${escapeHtml(agent.maquina)}` : ""}</small></div></td>
        <td data-label="Situação"><span class="badge ${situation.badge}">${situation.label}</span></td>
        <td data-label="Sistema">${escapeHtml(agent.ultimoSistema || "—")}</td>
        <td data-label="Versão informada">${agent.ultimaVersao ? `<span class="version-chip">${escapeHtml(agent.ultimaVersao)}</span>` : "—"}</td>
        <td data-label="Publicada">${escapeHtml(agent.versaoAlvo || "—")}</td>
        <td data-label="Último contato" data-role="contact"></td>
        <td data-label="Ações"><div class="distribution-row-actions" data-role="actions"></div></td>
      `;
      const contact = row.querySelector('[data-role="contact"]');
      contact.textContent = tempoRelativo(agent.ultimaComunicacao);
      const phase = faseLabel(agent.ultimaFase);
      contact.title = `${formatarDataHora(agent.ultimaComunicacao)}${phase ? `\nFase: ${phase}` : ""}`;

      const details = document.createElement("button");
      details.type = "button";
      details.className = "btn btn--small btn--ghost";
      details.textContent = "Histórico";
      details.addEventListener("click", () => new AgenteDetalheModal(this.api, agent).open());
      const actions = row.querySelector('[data-role="actions"]');
      actions.appendChild(details);

      const diagBtn = document.createElement("button");
      diagBtn.type = "button";
      diagBtn.className = "btn btn--small btn--ghost";
      diagBtn.textContent = "Diagnóstico";
      diagBtn.title = "Copiar dados de diagnóstico deste agente";
      diagBtn.addEventListener("click", async () => {
        const textoDiag = [
          `Empresa: ${agent.empresa}`,
          `CNPJ: ${agent.cnpj}`,
          agent.maquina ? `Máquina: ${agent.maquina}` : null,
          `Sistema: ${agent.ultimoSistema || "N/D"}`,
          `Versão Atual: ${agent.ultimaVersao || "N/D"}`,
          `Versão Publicada: ${agent.versaoAlvo || "N/D"}`,
          `Situação: ${situation.label}`,
          `Último Contato: ${formatarDataHora(agent.ultimaComunicacao)} (${tempoRelativo(agent.ultimaComunicacao)})`,
        ]
          .filter(Boolean)
          .join("\n");

        if (await copyToClipboard(textoDiag)) {
          toast.success(`Diagnóstico de ${agent.empresa} copiado.`);
        } else {
          toast.error("Não foi possível copiar o diagnóstico.");
        }
      });
      actions.appendChild(diagBtn);

      const pause = document.createElement("button");
      pause.type = "button";
      pause.className = "btn btn--small btn--ghost";
      pause.textContent = agent.pausado ? "Retomar" : "Pausar";
      pause.setAttribute("aria-label", `${agent.pausado ? "Retomar" : "Pausar"} agente ${agent.empresa}`);
      pause.addEventListener("click", () => this._toggleAgentPause(agent, pause));
      actions.appendChild(pause);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn--small btn--danger";
      remove.textContent = "Excluir";
      remove.setAttribute("aria-label", `Excluir agente ${agent.empresa}`);
      remove.addEventListener("click", () => this._removeAgent(agent, remove));
      actions.appendChild(remove);
      body.appendChild(row);
    }
  }

  async _removeAgent(agent, button) {
    const confirmed = await Modal.confirm(
      "Excluir agente",
      `Excluir o agente ${agent.empresa}?\n\nTodo o histórico de retornos desse CNPJ será apagado. Se o agente voltar a se comunicar, ele aparecerá novamente no painel.`,
      { confirmLabel: "Excluir" }
    );
    if (!confirmed) return;

    button.disabled = true;
    try {
      const identificador = encodeURIComponent(String(agent.cnpj || "").trim());
      const result = await this.api.delete(`/versoes/agentes/${identificador}`);
      const total = Number(result?.retornosExcluidos) || 0;
      if (total === 0) throw new ApiError("O servidor não removeu nenhum retorno. Reinicie o serviço web e tente novamente.", 409);
      toast.success(`Agente excluído (${plural(total, "retorno")} removido${total === 1 ? "" : "s"}).`);
      this.cache?.invalidar("distribuicao:");
      await this.refresh();
    } catch (error) {
      await Modal.alert("Não foi possível excluir", error instanceof ApiError ? error.message : "Erro inesperado.", "error");
      button.disabled = false;
    }
  }

  async _toggleAgentPause(agent, button) {
    const pausar = !agent.pausado;
    const confirmed = await Modal.confirm(
      pausar ? "Pausar agente" : "Retomar agente",
      pausar
        ? `Pausar o agente ${agent.empresa}?\n\nEle para de verificar e aplicar atualizações a partir do próximo ciclo (até ~10s), mas continua rodando e pode ser retomado a qualquer momento por aqui.`
        : `Retomar o agente ${agent.empresa}?\n\nEle volta a verificar e aplicar atualizações normalmente a partir do próximo ciclo.`,
      { confirmLabel: pausar ? "Pausar" : "Retomar", danger: pausar }
    );
    if (!confirmed) return;

    button.disabled = true;
    try {
      const identificador = encodeURIComponent(String(agent.cnpj || "").trim());
      await this.api.patch(`/versoes/agentes/${identificador}/${pausar ? "pausar" : "retomar"}`);
      toast.success(pausar ? "Agente pausado." : "Agente retomado.");
      this.cache?.invalidar("distribuicao:");
      await this.refresh();
    } catch (error) {
      await Modal.alert(
        pausar ? "Não foi possível pausar" : "Não foi possível retomar",
        error instanceof ApiError ? error.message : "Erro inesperado.",
        "error"
      );
      button.disabled = false;
    }
  }

  _renderFreshness() {
    if (!this._ultimaAtualizacao) return;
    this.freshnessBox.hidden = false;
    this.freshnessText.textContent = `Atualizado ${tempoRelativo(this._ultimaAtualizacao)}`;
    this.freshnessBox.title = formatarDataHora(this._ultimaAtualizacao);
  }

  _startPolling() {
    this._stopPolling();
    const interval = aparencia.ritmoPainel();
    if (!interval) return;
    this._timer = setInterval(() => {
      if (!this.visivel || document.visibilityState !== "visible") return;
      this.cache?.invalidar("distribuicao:painel");
      this.cache?.invalidar("distribuicao:logs");
      this.refresh().catch(() => {});
    }, interval);
  }

  _stopPolling() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  destroy() {
    this._stopPolling();
    super.destroy();
  }
}
