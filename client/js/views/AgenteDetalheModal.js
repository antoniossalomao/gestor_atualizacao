import { Modal } from "../core/Modal.js";
import { copyToClipboard, escapeHtml } from "../core/html.js";
import { formatarDataHora, tempoRelativo, formatarDuracao } from "../core/date.js";
import { emptyState } from "../core/EmptyState.js";
import { faseLabel } from "../core/agenteLabels.js";
import { ApiError } from "../api/ApiClient.js";
import { toast } from "../core/Toast.js";
import { criarDetalhesRetorno, relatorioRetornosTexto } from "../core/agenteReport.js";
import { classificarRetorno } from "../core/agenteStatus.js";

const LIMITE_RETORNOS = 300;

/**
 * Retornos recentes de um agente, com filtro de problemas e detalhes técnicos.
 * A API limita a consulta aos 300 registros mais recentes.
 */
export class AgenteDetalheModal {
  /**
   * @param {import('../api/ApiClient').ApiClient} api
   * @param {{cnpj:string, empresa:string, maquina?:string}} agente
   * @param {{somenteErros?:boolean, sistema?:string}} opcoes
   */
  constructor(api, agente, opcoes = {}) {
    this.api = api;
    this.agente = agente;
    this.somenteErros = Boolean(opcoes.somenteErros);
    this.sistema = String(opcoes.sistema || "");
    this.logs = [];
    this.logsFiltrados = [];
  }

  async open() {
    const { box, close } = Modal.abrirCaixa({ largura: 900, classe: "agente-detalhe" });
    this.box = box;
    this.close = close;

    box.innerHTML = `
      <div class="agente-detalhe__header">
        <p class="agente-detalhe__eyebrow">Retornos do agente</p>
        <h3 class="modal-box__title" id="agente-detalhe-titulo">${escapeHtml(this.agente.empresa || this.agente.cnpj)}</h3>
        <p class="modal-box__message agente-detalhe__identity">${escapeHtml(this.agente.cnpj)}${this.agente.maquina ? ` · ${escapeHtml(this.agente.maquina)}` : ""}</p>
      </div>
      <div class="agente-detalhe__toolbar">
        <div class="agente-detalhe__filters" role="group" aria-label="Filtrar mensagens">
          <button type="button" class="btn btn--ghost agente-detalhe__filter" data-filter="todos" aria-pressed="${!this.somenteErros}">Todas</button>
          <button type="button" class="btn btn--ghost agente-detalhe__filter" data-filter="problemas" aria-pressed="${this.somenteErros}">Erros e pendências</button>
        </div>
        <label class="field agente-detalhe__system" hidden>
          <span class="field__label">Sistema</span>
          <select class="input" data-role="sistema" aria-label="Filtrar por sistema"></select>
        </label>
      </div>
      <p class="agente-detalhe__summary" data-role="summary" role="status" aria-live="polite"></p>
      <p class="agente-detalhe__limit" data-role="limit" hidden></p>
      <div class="agent-log-list agente-detalhe__list" data-role="list" aria-busy="true"></div>
      <div class="modal-box__actions">
        <button type="button" class="btn btn--ghost" data-action="copy" disabled>Copiar mensagens exibidas</button>
        <button type="button" class="btn" data-action="close">Fechar</button>
      </div>
    `;
    box.setAttribute("aria-labelledby", "agente-detalhe-titulo");
    box.querySelector('[data-action="close"]').addEventListener("click", () => close());
    box.querySelector('[data-action="copy"]').addEventListener("click", () => this._copiar());
    box.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        this.somenteErros = button.dataset.filter === "problemas";
        this._renderLogs();
      });
    });
    box.querySelector('[data-role="sistema"]').addEventListener("change", (event) => {
      this.sistema = event.target.value;
      this._renderLogs();
    });

    this.list = box.querySelector('[data-role="list"]');
    box.querySelector('[data-action="close"]').focus();
    await this._reload();
  }

  async _reload() {
    this.loading = true;
    this.logs = [];
    this.logsFiltrados = [];
    this.list.replaceChildren();
    this.list.setAttribute("aria-busy", "true");
    this.box.querySelector('[data-action="copy"]').disabled = true;
    this.box.querySelector('[data-role="summary"]').textContent = "Carregando retornos…";
    this.box.querySelector('[data-role="limit"]').hidden = true;
    this._atualizarFiltros();
    let logs;
    try {
      logs = await this.api.get("/versoes/logs", { cnpj: this.agente.cnpj, limit: LIMITE_RETORNOS });
    } catch (err) {
      this.loading = false;
      this.list.setAttribute("aria-busy", "false");
      this.box.querySelector('[data-role="summary"]').textContent = "Retornos indisponíveis";
      this.list.appendChild(
        emptyState({
          titulo: "Não foi possível carregar os retornos",
          descricao: err instanceof ApiError ? err.message : "Erro inesperado.",
          icone: "distribuicao",
          acao: { label: "Tentar novamente", onClick: () => this._reload() },
        })
      );
      return;
    }

    this.loading = false;
    this.logs = logs;
    this.list.setAttribute("aria-busy", "false");
    const sistemas = [...new Set(logs.map((log) => log.sistema).filter(Boolean))].sort();
    const select = this.box.querySelector('[data-role="sistema"]');
    select.replaceChildren(new Option("Todos os sistemas", ""), ...sistemas.map((sistema) => new Option(sistema, sistema)));
    if (!sistemas.includes(this.sistema)) this.sistema = "";
    select.value = this.sistema;
    this.box.querySelector(".agente-detalhe__system").hidden = sistemas.length < 2;
    const limite = this.box.querySelector('[data-role="limit"]');
    limite.hidden = logs.length < LIMITE_RETORNOS;
    limite.textContent = `Exibindo os ${LIMITE_RETORNOS} retornos mais recentes. Registros anteriores não estão incluídos neste relatório.`;
    this._renderLogs();
  }

  _atualizarFiltros() {
    this.box.querySelectorAll("[data-filter]").forEach((button) => {
      const active = (button.dataset.filter === "problemas") === this.somenteErros;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      button.disabled = this.loading;
    });
    this.box.querySelector('[data-role="sistema"]').disabled = this.loading;
  }

  _renderLogs() {
    this._atualizarFiltros();
    this.logsFiltrados = this.logs.filter((log) => {
      if (this.sistema && log.sistema !== this.sistema) return false;
      return !this.somenteErros || ["erro", "pendencias"].includes(classificarRetorno(log).tipo);
    });
    const total = this.logsFiltrados.length;
    const falhas = this.logsFiltrados.filter((log) => classificarRetorno(log).tipo === "erro").length;
    const pendencias = this.logsFiltrados.filter((log) => classificarRetorno(log).tipo === "pendencias").length;
    const resumo = [`${total} de ${this.logs.length} mensagens`];
    if (falhas) resumo.push(`${falhas} ${falhas === 1 ? "erro" : "erros"}`);
    if (pendencias) resumo.push(`${pendencias} ${pendencias === 1 ? "mensagem com pendências" : "mensagens com pendências"}`);
    resumo.push("Mais recentes primeiro");
    this.box.querySelector('[data-role="summary"]').textContent = resumo.join(" · ");
    this.box.querySelector('[data-action="copy"]').disabled = !total;
    this.list.replaceChildren();

    if (!total) {
      this.list.appendChild(
        emptyState({
          titulo: this.logs.length ? "Nenhum retorno neste filtro" : "Nenhum retorno ainda",
          descricao: this.logs.length ? "Não há erros ou pendências entre os retornos selecionados." : "Os retornos aparecerão aqui quando o agente se comunicar.",
          icone: this.logs.length ? "busca" : "historico",
          acao: this.logs.length ? { label: "Ver todos os retornos", onClick: () => {
            this.somenteErros = false;
            this.sistema = "";
            this.box.querySelector('[data-role="sistema"]').value = "";
            this._renderLogs();
          } } : undefined,
        })
      );
      return;
    }

    for (const log of this.logsFiltrados) {
      this.list.appendChild(this._linha(log));
    }
  }

  _linha(log) {
    const { tipo, label } = classificarRetorno(log);

    const item = document.createElement("div");
    item.className = "agent-log agente-detalhe__item";

    const contexto = [
      log.sistema,
      log.versaoAnterior && log.versao ? `${log.versaoAnterior} → ${log.versao}` : log.versao ? `Versão ${log.versao}` : null,
      formatarDuracao(log.duracaoMs) !== "—" ? formatarDuracao(log.duracaoMs) : null,
      faseLabel(log.fase),
    ]
      .filter(Boolean)
      .join(" · ");

    item.innerHTML = `
      <div class="agent-log__dot${tipo === "erro" ? " is-error" : tipo === "sucesso" ? "" : " is-pending"}" aria-hidden="true"></div>
      <div class="agente-detalhe__body">
        <div class="agente-detalhe__head">
          <strong class="agente-detalhe__status agente-detalhe__status--${tipo}">${escapeHtml(label)}</strong>
          <time class="agente-detalhe__time" data-role="quando"></time>
        </div>
        ${contexto ? `<p class="agent-log__ctx">${escapeHtml(contexto)}</p>` : ""}
        <div data-role="relatorio"></div>
      </div>
    `;
    const quando = item.querySelector('[data-role="quando"]');
    quando.textContent = tempoRelativo(log.criadoEm);
    quando.title = formatarDataHora(log.criadoEm);
    const data = new Date(log.criadoEm);
    if (!Number.isNaN(data.getTime())) quando.dateTime = data.toISOString();
    item.querySelector('[data-role="relatorio"]').appendChild(criarDetalhesRetorno(log));
    return item;
  }

  async _copiar() {
    if (!this.logsFiltrados?.length) {
      toast.info("Não há retornos neste filtro para copiar.");
      return;
    }
    const logsRelatorio = this.logsFiltrados.map((log) => ({ ...log, status: classificarRetorno(log).label }));
    let texto = relatorioRetornosTexto(logsRelatorio, {
      titulo: `${this.somenteErros ? "ERROS E PENDÊNCIAS" : "RETORNOS DO AGENTE"} — ${this.agente.empresa || this.agente.cnpj}${this.sistema ? ` · ${this.sistema}` : ""}`,
    });
    if (this.logs.length >= LIMITE_RETORNOS) texto += `\n\nConsulta limitada aos ${LIMITE_RETORNOS} retornos mais recentes do agente.`;
    if (await copyToClipboard(texto)) toast.success("Relatório copiado.");
    else toast.error("Não foi possível copiar o relatório.");
  }
}
