import { AGENDA_COLUMNS, STATUS_OPTIONS, FILTRO_ARQUIVADAS } from "../config.js";
import { ApiError } from "../api/ApiClient.js";
import { View } from "../app/View.js";
import { Autocomplete } from "../components/Autocomplete.js";
import { Modal } from "../components/Modal.js";
import { toast } from "../components/Toast.js";
import { debounce } from "../utils/debounce.js";
import { todayBR, isValidDateBR, mascaraDataBR } from "../utils/date.js";
import { emptyState } from "../components/EmptyState.js";
import { plural, escapeHtml, escapeAttr } from "../utils/html.js";
import { icon } from "../utils/icons.js";
import { marcarOcupado } from "../utils/guard.js";
import { prefs } from "../app/prefs.js";
import { Drawer } from "../components/Drawer.js";

const STATUS_CONCLUIDO = STATUS_OPTIONS[STATUS_OPTIONS.length - 1];

const META_COLUNAS = {
  "A Fazer": { titulo: "A Fazer" },
  "Em Andamento": { titulo: "Em Andamento" },
  "Sem resposta": { titulo: "Sem resposta" },
  "Concluído": { titulo: "Concluído" },
};

/**
 * Aba Agendamentos: quadro Kanban interativo com drag-and-drop de tarefas e colunas.
 */
export class AgendamentosView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.selectedId = null;
    this.selectedRevision = null;
    this.rows = [];
    this._draggedCardId = null;
    this._draggedColStatus = null;
    this._isDragging = false;
    const salvo = prefs.get("agendamentos:filtros", {});
    this.busca = salvo.busca || "";
    this.status = salvo.status || "Todos";
    this.sortBy = salvo.sortBy;
    this.sortDir = salvo.sortDir || "asc";
    this.ordemColunas = this._carregarOrdemColunas();
    this._buildDom();
  }

  _carregarOrdemColunas() {
    const salva = prefs.get("agendamentos:colunas", STATUS_OPTIONS);
    if (Array.isArray(salva)) {
      const validas = salva.filter((s) => STATUS_OPTIONS.includes(s));
      for (const s of STATUS_OPTIONS) {
        if (!validas.includes(s)) validas.push(s);
      }
      return validas;
    }
    return [...STATUS_OPTIONS];
  }

  _reordenarColunas(origemStatus, destinoStatus) {
    const de = this.ordemColunas.indexOf(origemStatus);
    const para = this.ordemColunas.indexOf(destinoStatus);
    if (de < 0 || para < 0 || de === para) return;
    const nova = [...this.ordemColunas];
    const [removido] = nova.splice(de, 1);
    nova.splice(para, 0, removido);
    this.ordemColunas = nova;
    prefs.set("agendamentos:colunas", nova);
    this._renderKanban(this.rows);
  }

  _buildDom() {
    this.container.innerHTML = `
      <div class="view-actions">
        <div class="view-actions__right">
          <button type="button" class="btn btn--accent" data-action="novo-agendamento">+ Novo Agendamento</button>
        </div>
      </div>

      <form class="card" data-role="form" novalidate>
        <div class="form-grid form-grid--2" data-role="fields"></div>
        <div class="form-actions form-actions--modal">
          <div class="form-actions__left">
            <button type="button" class="btn btn--danger btn--ghost" data-action="modal-delete" hidden>${icon("alerta")} Excluir</button>
            <span class="form-actions__hint text-muted" data-role="modo"></span>
          </div>
          <div class="form-actions__right">
            <button type="button" class="btn btn--ghost" data-action="cancel">Cancelar</button>
            <button type="button" class="btn btn--ghost" data-action="modal-converter" hidden>${icon("converter")} Converter</button>
            <button type="button" class="btn btn--ghost" data-action="modal-reabrir" hidden>${icon("atualizar")} Reabrir</button>
            <button type="button" class="btn btn--ghost" data-action="modal-done" hidden>${icon("check")} Concluir</button>
            <button type="submit" class="btn btn--accent" data-action="add">Adicionar Tarefa</button>
            <button type="button" class="btn btn--accent" data-action="update" hidden>Salvar Alterações</button>
          </div>
        </div>
      </form>

      <div class="card agendamentos-board-card">
        <div class="toolbar">
          <div class="field">
            <label class="field__label" for="age-busca">Buscar</label>
            <input type="search" class="input" id="age-busca" data-role="search" placeholder="Tarefa, cliente, responsável..." />
          </div>
          <div class="field">
            <label class="field__label" for="age-status">Status</label>
            <select class="input" id="age-status" data-role="status-filter">
              <option>Todos</option>
              ${STATUS_OPTIONS.map((s) => `<option>${s}</option>`).join("")}
              <option value="${FILTRO_ARQUIVADAS}">${FILTRO_ARQUIVADAS}</option>
            </select>
          </div>
          <div class="toolbar__clear">
            <button type="button" class="btn btn--small btn--ghost" data-action="limpar-filtros" hidden>Limpar filtros</button>
          </div>
          <div class="toolbar-spacer"></div>
          <span class="result-count" data-role="count" aria-live="polite"></span>
        </div>
        <p class="text-muted bulk-hint" data-role="aviso-arquivadas" hidden></p>
        <div class="kanban-board" data-role="kanban"></div>
      </div>
    `;

    this._buildFields();

    this.form = this.container.querySelector('[data-role="form"]');
    this.drawer = new Drawer(this.form, {
      titulo: "Agendamento",
      descricao: "Crie ou edite a tarefa mantendo o quadro visível.",
    });

    this.kanban = this.container.querySelector('[data-role="kanban"]');
    this.container.querySelector('[data-action="novo-agendamento"]').addEventListener("click", () => {
      this.clearForm();
      this.drawer.abrir({ foco: this.fields.tarefa });
    });

    this.searchInput = this.container.querySelector('[data-role="search"]');
    this.statusFilter = this.container.querySelector('[data-role="status-filter"]');
    this.botaoLimparFiltros = this.container.querySelector('[data-action="limpar-filtros"]');
    this.avisoArquivadas = this.container.querySelector('[data-role="aviso-arquivadas"]');
    this.searchInput.value = this.busca;
    this.statusFilter.value = this.status;

    const reload = debounce(() => {
      this._salvarFiltros();
      this._reloadList();
    }, 200);

    this.searchInput.addEventListener("input", () => {
      this.busca = this.searchInput.value.trim();
      this._pintarLimparFiltros();
      reload();
    });

    this.statusFilter.addEventListener("change", () => {
      this.status = this.statusFilter.value;
      this._pintarLimparFiltros();
      this._salvarFiltros();
      this._reloadList();
    });

    this.botaoLimparFiltros.addEventListener("click", () => this._limparFiltros());

    this.addBtn = this.form.querySelector('[data-action="add"]');
    this.updateBtn = this.form.querySelector('[data-action="update"]');
    this.modalDeleteBtn = this.form.querySelector('[data-action="modal-delete"]');
    this.modalConverterBtn = this.form.querySelector('[data-action="modal-converter"]');
    this.modalDoneBtn = this.form.querySelector('[data-action="modal-done"]');
    this.modalReabrirBtn = this.form.querySelector('[data-action="modal-reabrir"]');

    if (this.modalDeleteBtn) {
      this.modalDeleteBtn.addEventListener("click", async () => {
        this.drawer.marcarLimpa();
        await this.drawer.fechar({ forcar: true });
        this.deleteTask();
      });
    }

    if (this.modalConverterBtn) {
      this.modalConverterBtn.addEventListener("click", () => {
        this.drawer.fechar({ forcar: true });
        this.converterEmAtualizacao();
      });
    }

    if (this.modalDoneBtn) {
      this.modalDoneBtn.addEventListener("click", async () => {
        this.drawer.fechar({ forcar: true });
        await this.markDone();
      });
    }

    if (this.modalReabrirBtn) {
      this.modalReabrirBtn.addEventListener("click", async () => {
        this.drawer.fechar({ forcar: true });
        await this.reabrir();
      });
    }

    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this._submit();
    });
    this.updateBtn?.addEventListener("click", () => this.updateTask());

    // Ações rápidas e drag-and-drop no quadro Kanban
    this.kanban.addEventListener("click", (e) => this._acaoRapida(e));
    this._bindKanbanDragDrop();

    this.on(document, "keydown", (e) => this._onGlobalKeydown(e));

    if (this.user?.role === "consulta") {
      this.form.hidden = true;
      this.container.querySelector('[data-action="novo-agendamento"]').hidden = true;
    }

    this._pintarLimparFiltros();
    this.clearForm();
  }

  _buildFields() {
    const wrap = this.container.querySelector('[data-role="fields"]');
    this.fields = {};
    for (const col of AGENDA_COLUMNS) {
      const id = `age-${col.key}`;
      const field = document.createElement("div");
      field.className = "field";
      if (["tarefa", "cliente", "obs"].includes(col.key)) field.classList.add("field--full");
      field.innerHTML = `<label class="field__label" for="${id}">${col.label}</label>`;

      let input;
      if (col.key === "status") {
        input = document.createElement("select");
        input.className = "input";
        input.innerHTML = STATUS_OPTIONS.map((s) => `<option>${s}</option>`).join("");
      } else {
        input = document.createElement("input");
        input.type = col.key === "horario" ? "time" : "text";
        input.className = "input";
        if (col.key === "tarefa") input.required = true;
      }
      input.id = id;
      input.name = col.key;
      input.dataset.key = col.key;
      field.appendChild(input);
      const hint = document.createElement("div");
      hint.className = "field__hint";
      hint.id = `${id}-hint`;
      field.appendChild(hint);
      wrap.appendChild(field);

      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") this.clearForm({ comDesfazer: true });
      });
      if (col.key === "data") {
        input.setAttribute("aria-describedby", hint.id);
        input.addEventListener("input", () => {
          input.value = mascaraDataBR(input.value);
          const invalida = Boolean(input.value) && !isValidDateBR(input.value);
          hint.textContent = invalida ? "Formato esperado: dd/mm/aaaa" : "";
          input.setAttribute("aria-invalid", String(invalida));
        });
      }
      this.fields[col.key] = input;
    }
    this.clienteAutocomplete = new Autocomplete(this.fields.cliente, { values: [] });
    this.responsavelAutocomplete = new Autocomplete(this.fields.responsavel, { values: [] });
  }

  _bindKanbanDragDrop() {
    this.kanban.addEventListener("dragstart", (e) => {
      const card = e.target.closest(".kanban-card");
      if (card) {
        if (this.user?.role === "consulta") {
          e.preventDefault();
          return;
        }
        e.stopPropagation();
        this._isDragging = true;
        this._draggedCardId = card.dataset.id;
        card.classList.add("is-dragging");
        e.dataTransfer.setData("text/plain", card.dataset.id);
        e.dataTransfer.setData("application/x-kanban-card", card.dataset.id);
        e.dataTransfer.effectAllowed = "move";
        return;
      }

      const colHeader = e.target.closest('[data-col-drag="true"]');
      if (colHeader) {
        if (this.user?.role === "consulta") {
          e.preventDefault();
          return;
        }
        const col = colHeader.closest(".kanban-column");
        if (col) {
          this._draggedColStatus = col.dataset.status;
          col.classList.add("is-col-dragging");
          e.dataTransfer.setData("application/x-kanban-column", col.dataset.status);
          e.dataTransfer.effectAllowed = "move";
        }
      }
    });

    this.kanban.addEventListener("dragend", () => {
      for (const c of this.kanban.querySelectorAll(".kanban-card.is-dragging")) {
        c.classList.remove("is-dragging");
      }
      for (const col of this.kanban.querySelectorAll(".kanban-column")) {
        col.classList.remove("is-drop-target");
        col.classList.remove("is-col-dragging");
        col.classList.remove("is-col-target");
      }
      setTimeout(() => {
        this._isDragging = false;
        this._draggedCardId = null;
        this._draggedColStatus = null;
      }, 80);
    });

    this.kanban.addEventListener("dragover", (e) => {
      const col = e.target.closest(".kanban-column");
      if (!col) return;

      if (this._draggedCardId || e.dataTransfer.types.includes("application/x-kanban-card")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        for (const other of this.kanban.querySelectorAll(".kanban-column")) {
          if (other !== col) other.classList.remove("is-drop-target");
        }
        col.classList.add("is-drop-target");
      } else if (this._draggedColStatus || e.dataTransfer.types.includes("application/x-kanban-column")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        for (const other of this.kanban.querySelectorAll(".kanban-column")) {
          if (other !== col) other.classList.remove("is-col-target");
        }
        col.classList.add("is-col-target");
      }
    });

    this.kanban.addEventListener("dragleave", (e) => {
      const col = e.target.closest(".kanban-column");
      if (col && !col.contains(e.relatedTarget)) {
        col.classList.remove("is-drop-target");
        col.classList.remove("is-col-target");
      }
    });

    this.kanban.addEventListener("drop", (e) => {
      const col = e.target.closest(".kanban-column");
      if (!col) return;
      e.preventDefault();
      col.classList.remove("is-drop-target");
      col.classList.remove("is-col-target");

      if (this._draggedCardId || e.dataTransfer.types.includes("application/x-kanban-card")) {
        const cardId = e.dataTransfer.getData("application/x-kanban-card") || e.dataTransfer.getData("text/plain") || this._draggedCardId;
        const novoStatus = col.dataset.status;
        if (cardId && novoStatus && novoStatus !== FILTRO_ARQUIVADAS) {
          this._moverCard(cardId, novoStatus);
        }
      } else if (this._draggedColStatus || e.dataTransfer.types.includes("application/x-kanban-column")) {
        const origemStatus = e.dataTransfer.getData("application/x-kanban-column") || this._draggedColStatus;
        const destinoStatus = col.dataset.status;
        if (origemStatus && destinoStatus && origemStatus !== destinoStatus) {
          this._reordenarColunas(origemStatus, destinoStatus);
        }
      }
    });
  }

  async refresh() {
    await this.swr(
      "agendamentos:opcoes",
      async () => {
        const [nomes, responsaveis] = await Promise.all([
          this.api.get("/clientes/names", null, { key: "clientes:names" }),
          this.api.get("/atualizacoes/responsaveis", null, { key: "atu:responsaveis" }),
        ]);
        return { nomes, responsaveis };
      },
      ({ nomes, responsaveis }) => {
        this.clienteAutocomplete.setValues(nomes);
        this.responsavelAutocomplete.setValues(responsaveis);
      }
    );
    await this._reloadList();
  }

  async _reloadList() {
    this.kanban.classList.add("is-refreshing");
    try {
      await this.swr(
        `agendamentos:lista:${this.busca}|${this.status}|200|${this.sortBy}|${this.sortDir}`,
        () =>
          this.api.get(
            "/agendamentos",
            { search: this.busca, status: this.status, page: 1, pageSize: 200, sortBy: this.sortBy, sortDir: this.sortDir },
            { key: "agendamentos:lista" }
          ),
        (resposta) => {
          this.rows = resposta.rows || [];
          this._renderKanban(this.rows);
          const countEl = this.container.querySelector('[data-role="count"]');
          if (countEl) countEl.textContent = plural(resposta.total, "tarefa");
          this._pintarArquivadas(resposta);
        }
      );
    } finally {
      this.kanban.classList.remove("is-refreshing");
    }
  }

  _renderKanban(rows) {
    if (this.status === FILTRO_ARQUIVADAS) {
      const colunas = [
        {
          status: FILTRO_ARQUIVADAS,
          titulo: "Tarefas Arquivadas",
          subtitulo: "Concluídas há mais tempo",
          pip: "var(--cor-texto-fraco)",
          itens: rows,
        },
      ];
      this.kanban.dataset.colunas = "1";
      this.kanban.style.setProperty("--kanban-colunas", "1");
      this.kanban.innerHTML = this._gerarHtmlColunas(colunas);
      return;
    }

    if (this.status !== "Todos") {
      const colunas = [
        {
          status: this.status,
          titulo: META_COLUNAS[this.status]?.titulo || this.status,
          subtitulo: META_COLUNAS[this.status]?.subtitulo || "",
          pip: META_COLUNAS[this.status]?.pip || "var(--cor-accent)",
          itens: rows,
        },
      ];
      this.kanban.dataset.colunas = "1";
      this.kanban.style.setProperty("--kanban-colunas", "1");
      this.kanban.innerHTML = this._gerarHtmlColunas(colunas);
      return;
    }

    this.kanban.dataset.colunas = String(this.ordemColunas.length);
    this.kanban.style.setProperty("--kanban-colunas", String(this.ordemColunas.length));

    const colunas = this.ordemColunas.map((st) => ({
      status: st,
      titulo: META_COLUNAS[st]?.titulo || st,
      subtitulo: META_COLUNAS[st]?.subtitulo || "",
      pip: META_COLUNAS[st]?.pip || "var(--cor-accent)",
      itens: rows.filter((r) => r.status === st),
    }));

    if (rows.length === 0) {
      const wrap = document.createElement("div");
      wrap.style.gridColumn = "1 / -1";
      wrap.style.padding = "var(--sp-6) 0";

      if (this._temFiltro()) {
        wrap.appendChild(
          emptyState({
            titulo: "Nenhuma tarefa com esse filtro",
            descricao: "Tente outro termo ou limpe os filtros para ver o quadro completo.",
            icone: "busca",
            acao: { label: "Limpar filtros", onClick: () => this._limparFiltros() },
          })
        );
      } else {
        wrap.appendChild(
          emptyState({
            titulo: "Nenhuma tarefa agendada",
            descricao: "Crie a primeira tarefa para organizar o fluxo da equipe.",
            icone: "agendamentos",
            acao: {
              label: "+ Novo Agendamento",
              onClick: () => {
                this.clearForm();
                this.drawer.abrir({ foco: this.fields.tarefa });
              },
            },
          })
        );
      }
      this.kanban.replaceChildren(wrap);
      return;
    }

    this.kanban.innerHTML = this._gerarHtmlColunas(colunas);
  }

  _gerarHtmlColunas(colunas) {
    const podeArrastarCol = this.user?.role !== "consulta" && colunas.length > 1;
    return colunas
      .map((col) => {
        const cardsHtml = col.itens.map((r) => cartaoKanban(r, this.user?.role)).join("");
        const emptyHtml = `<div class="kanban-empty-placeholder"><span>Nenhuma tarefa aqui</span></div>`;
        const slug = col.status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
        return `
          <section class="kanban-column kanban-column--${slug}" data-status="${col.status}">
            <header class="kanban-column__header" ${podeArrastarCol ? 'draggable="true" data-col-drag="true" title="Arraste para reordenar coluna"' : ""}>
              <div class="kanban-column__header-top">
                <h3 class="kanban-column__title">${escapeHtml(col.titulo)}</h3>
                <span class="kanban-column__count">${col.itens.length}</span>
              </div>
            </header>
            <div class="kanban-column__cards">${cardsHtml || emptyHtml}</div>
          </section>
        `;
      })
      .join("");
  }

  async _moverCard(id, novoStatus) {
    const row = this.rows?.find((r) => String(r.id) === String(id));
    if (!row) return;
    if (row.status === novoStatus) return;

    const statusAnterior = row.status;
    // Atualização otimista imediata na UI
    row.status = novoStatus;
    this._renderKanban(this.rows);

    try {
      const atualizado = await this.api.put(`/agendamentos/${row.id}`, { ...row, status: novoStatus });
      if (atualizado) Object.assign(row, atualizado);
      this._invalidar();
      toast.success(`Tarefa movida para "${novoStatus}".`);
    } catch (err) {
      // Reverte em caso de erro
      row.status = statusAnterior;
      this._renderKanban(this.rows);
      Modal.alert("Erro ao mover tarefa", errorMessage(err), "error");
    }
  }

  async _acaoRapida(e) {
    const botao = e.target.closest("[data-row-action]");
    if (botao) {
      e.stopPropagation();
      const row = this.rows?.find((item) => String(item.id) === botao.dataset.id);
      if (!row) return;
      this._loadIntoForm(row);
      if (botao.dataset.rowAction === "editar") this.drawer.abrir({ foco: this.fields.tarefa });
      if (botao.dataset.rowAction === "converter") this.converterEmAtualizacao();
      if (botao.dataset.rowAction === "concluir") await this._moverCard(row.id, STATUS_CONCLUIDO);
      if (botao.dataset.rowAction === "avancar") await this._avancar(row);
      if (botao.dataset.rowAction === "reabrir") await this.reabrir();
      return;
    }

    const card = e.target.closest(".kanban-card");
    if (card && !this._isDragging) {
      const row = this.rows?.find((item) => String(item.id) === card.dataset.id);
      if (row) {
        this._loadIntoForm(row);
        this.drawer.abrir({ foco: this.fields.tarefa });
      }
    }
  }

  async _avancar(row) {
    const indice = STATUS_OPTIONS.indexOf(row.status);
    if (indice < 0 || indice >= STATUS_OPTIONS.length - 1) return;
    const proximo = STATUS_OPTIONS[indice + 1];
    await this._moverCard(row.id, proximo);
  }

  _pintarArquivadas({ arquivadas = 0, arquivarDias = 0 } = {}) {
    const opcao = this.statusFilter?.querySelector(`option[value="${FILTRO_ARQUIVADAS}"]`);
    if (opcao) opcao.textContent = arquivadas > 0 ? `${FILTRO_ARQUIVADAS} (${arquivadas})` : FILTRO_ARQUIVADAS;

    const vendo = this.status === FILTRO_ARQUIVADAS;
    if (this.avisoArquivadas) {
      this.avisoArquivadas.hidden = !vendo;
      if (vendo) {
        this.avisoArquivadas.textContent =
          `Tarefas concluídas há mais de ${plural(arquivarDias, "dia")} saem da lista ativa. ` +
          `Clique em "Reabrir" em qualquer cartão para trazê-lo de volta como "${STATUS_OPTIONS[0]}".`;
      }
    }
  }

  _temFiltro() {
    return Boolean(this.busca) || this.status !== "Todos";
  }

  _pintarLimparFiltros() {
    if (this.botaoLimparFiltros) this.botaoLimparFiltros.hidden = !this._temFiltro();
  }

  _limparFiltros() {
    this.busca = "";
    this.status = "Todos";
    if (this.searchInput) this.searchInput.value = "";
    if (this.statusFilter) this.statusFilter.value = "Todos";
    this._pintarLimparFiltros();
    this._salvarFiltros();
    this._reloadList();
  }

  _salvarFiltros() {
    prefs.set("agendamentos:filtros", {
      busca: this.busca,
      status: this.status,
      sortBy: this.sortBy,
      sortDir: this.sortDir,
    });
  }

  _loadIntoForm(row) {
    this.selectedId = row.id;
    this.selectedRevision = row.revisao;
    for (const col of AGENDA_COLUMNS) {
      if (this.fields?.[col.key]) this.fields[col.key].value = row[col.key] ?? "";
    }
    this._pintarModo();
  }

  _pintarModo() {
    const modo = this.form?.querySelector('[data-role="modo"]');
    const isEdit = this.selectedId != null;
    if (modo) modo.textContent = isEdit ? `Tarefa #${this.selectedId}` : "";
    if (this.addBtn) this.addBtn.hidden = isEdit;
    if (this.updateBtn) {
      this.updateBtn.hidden = !isEdit;
      this.updateBtn.disabled = !isEdit;
    }
    if (this.modalDeleteBtn) this.modalDeleteBtn.hidden = !isEdit || this.user?.role === "consulta";
    if (this.modalConverterBtn) this.modalConverterBtn.hidden = !isEdit || this.user?.role === "consulta";
    if (this.modalDoneBtn) {
      this.modalDoneBtn.hidden =
        !isEdit || this.user?.role === "consulta" || this.fields?.status?.value === STATUS_CONCLUIDO || this.status === FILTRO_ARQUIVADAS;
    }
    if (this.modalReabrirBtn) this.modalReabrirBtn.hidden = !isEdit || this.status !== FILTRO_ARQUIVADAS;

    if (this.drawer) {
      if (isEdit) {
        this.drawer.setTitulo(`Editar Tarefa #${this.selectedId}`, "Atualize os detalhes da tarefa agendada.");
      } else {
        this.drawer.setTitulo("Novo Agendamento", "Crie uma tarefa para a equipe.");
      }
    }
  }

  async reabrir() {
    if (this.selectedId == null) return;
    const liberar = marcarOcupado(this.modalReabrirBtn);
    try {
      const tarefa = await this.api.patch(`/agendamentos/${this.selectedId}/reabrir`);
      this.clearForm();
      this._invalidar();
      await this._reloadList();
      toast.success(`"${tarefa.tarefa}" voltou para a lista como "${STATUS_OPTIONS[0]}".`);
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  aplicarParams({ cliente, novo, filtro, status } = {}) {
    if (status !== undefined) {
      this.status = status;
      if (this.statusFilter) this.statusFilter.value = status;
      this._reloadList();
    }
    if (filtro !== undefined) {
      this.busca = filtro;
      if (this.searchInput) this.searchInput.value = filtro;
      this._reloadList();
    }
    if (novo) {
      this.clearForm();
      this.drawer.abrir({ foco: this.fields.cliente });
    } else if (cliente) {
      this.clearForm();
      if (this.fields.cliente) {
        this.fields.cliente.value = cliente;
        this.drawer.abrir({ foco: this.fields.tarefa });
      }
    }
  }

  converterEmAtualizacao() {
    if (this.selectedId == null) return;
    this.navigate("atualizacoes", {
      cliente: this.fields.cliente.value,
      responsavel: this.fields.responsavel.value,
      data: this.fields.data.value,
      motivo: this.fields.tarefa.value,
      obs: `Convertido do agendamento #${this.selectedId}.`,
    });
  }

  _readForm() {
    const data = {};
    for (const col of AGENDA_COLUMNS) data[col.key] = this.fields[col.key].value.trim();
    if (!data.tarefa) {
      Modal.alert("Validação", "Campo 'Tarefa' é obrigatório.", "warning");
      this.fields.tarefa.focus();
      return null;
    }
    if (!isValidDateBR(data.data)) {
      Modal.alert("Validação", "Campo 'Data' precisa estar no formato dd/mm/aaaa.", "warning");
      this.fields.data.focus();
      return null;
    }
    return data;
  }

  _submit() {
    if (this.selectedId == null) this.addTask();
    else this.updateTask();
  }

  async addTask() {
    const data = this._readForm();
    if (!data) return;
    const liberar = marcarOcupado(this.addBtn);
    try {
      await this.api.post("/agendamentos", data);
      this.clearForm();
      this.drawer.marcarLimpa();
      await this.drawer.fechar({ forcar: true });
      this._invalidar();
      await this._reloadList();
      toast.success("Tarefa adicionada.");
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  async updateTask() {
    if (this.selectedId == null) return;
    const data = this._readForm();
    if (!data) return;
    const liberar = marcarOcupado(this.updateBtn);
    try {
      await this.api.put(`/agendamentos/${this.selectedId}`, { ...data, revisao: this.selectedRevision });
      this.clearForm();
      this.drawer.marcarLimpa();
      await this.drawer.fechar({ forcar: true });
      this._invalidar();
      await this._reloadList();
      toast.success("Tarefa atualizada.");
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  async deleteTask() {
    if (this.selectedId == null) return;
    const id = this.selectedId;
    const dadosAntes = {};
    for (const col of AGENDA_COLUMNS) dadosAntes[col.key] = this.fields[col.key].value.trim();

    try {
      await this.api.delete(`/agendamentos/${id}`);
      this.clearForm();
      this._invalidar();
      await this._reloadList();
      toast.undo(`Tarefa "${dadosAntes.tarefa}" excluída.`, async () => {
        try {
          await this.api.post("/agendamentos", dadosAntes);
          this._invalidar();
          await this._reloadList();
          toast.success("Exclusão desfeita.");
        } catch {
          toast.error("Não foi possível desfazer a exclusão.");
        }
      });
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    }
  }

  async markDone() {
    if (this.selectedId == null) return;
    await this._moverCard(this.selectedId, STATUS_CONCLUIDO);
  }

  async arquivar() {
    if (this.selectedId == null) return;
    if (this.fields.status.value !== STATUS_CONCLUIDO) {
      Modal.alert("Arquivar", `Só é possível arquivar tarefas "${STATUS_CONCLUIDO}".`, "warning");
      return;
    }
    try {
      await this.api.patch(`/agendamentos/${this.selectedId}/arquivar`);
      this.clearForm();
      this._invalidar();
      await this._reloadList();
      toast.success("Tarefa arquivada.");
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    }
  }

  clearForm({ comDesfazer = false } = {}) {
    const antes = {};
    let tinhaConteudo = false;
    if (this.fields) {
      for (const col of AGENDA_COLUMNS) {
        antes[col.key] = this.fields[col.key]?.value || "";
        if (["tarefa", "cliente"].includes(col.key) && antes[col.key].trim()) tinhaConteudo = true;
      }
    }

    this.selectedId = null;
    this.selectedRevision = null;
    if (this.fields) {
      for (const col of AGENDA_COLUMNS) {
        if (this.fields[col.key]) this.fields[col.key].value = "";
      }
      if (this.fields.data) this.fields.data.value = todayBR();
      if (this.fields.status) this.fields.status.value = STATUS_OPTIONS[0];
      if (this.user && this.fields.responsavel) this.fields.responsavel.value = this.user.nome || "";
    }
    if (this.form) {
      for (const hint of this.form.querySelectorAll(".field__hint")) hint.textContent = "";
    }
    this._pintarModo();

    if (comDesfazer && tinhaConteudo) {
      toast.undo(
        "Formulário limpo.",
        () => {
          for (const col of AGENDA_COLUMNS) this.fields[col.key].value = antes[col.key];
          this.fields.tarefa.focus();
        },
        "Restaurar"
      );
    }
  }

  _invalidar() {
    this.cache?.invalidar("agendamentos:");
  }

  _onGlobalKeydown(e) {
    if (!this.visivel) return;
    if (isTypingTarget(e.target)) return;
    if (e.key === "Delete" && this.selectedId != null) this.deleteTask();
    else if (e.key.toLowerCase() === "n") this.container.querySelector('[data-action="novo-agendamento"]')?.click();
    else if (e.key === "/") {
      e.preventDefault();
      this.searchInput.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      const card = e.target.closest(".kanban-card");
      if (card) {
        e.preventDefault();
        const row = this.rows?.find((item) => String(item.id) === card.dataset.id);
        if (row) {
          this._loadIntoForm(row);
          this.drawer.abrir({ foco: this.fields.tarefa });
        }
      }
    }
  }

  destroy() {
    this.drawer?.destroy();
    this.clienteAutocomplete?.destroy();
    this.responsavelAutocomplete?.destroy();
    super.destroy();
  }
}

function cartaoKanban(row, role) {
  const vencida = row.status !== STATUS_CONCLUIDO && estaAtrasada(row.data);
  const hoje = row.status !== STATUS_CONCLUIDO && row.data === todayBR();
  const podeArrastar = role !== "consulta" && !row.arquivadoEm;
  const dataHora = [row.data, row.horario].filter(Boolean).join(" · ");
  const meta = [row.sistema, row.responsavel].filter(Boolean).join(" · ");

  return `<article class="kanban-card${vencida ? " is-overdue" : ""}" ${
    podeArrastar ? 'draggable="true"' : ""
  } data-id="${row.id}" data-status="${row.status}" tabindex="0" role="button" aria-label="Tarefa ${escapeHtml(row.tarefa)}">
    <div class="kanban-card__header">
      <strong class="kanban-card__client" title="${escapeAttr(row.cliente || "Sem cliente")}">${escapeHtml(row.cliente || "Sem cliente")}</strong>
      ${vencida ? '<span class="badge badge--danger">Vencida</span>' : hoje ? '<span class="badge badge--accent">Hoje</span>' : ""}
    </div>
    <p class="kanban-card__title">${escapeHtml(row.tarefa)}</p>
    <div class="kanban-card__footer">
      <span class="kanban-card__meta">${escapeHtml(meta || "—")}</span>
      ${dataHora ? `<time class="kanban-card__time${vencida ? " is-vencida" : hoje ? " is-today" : ""}">${escapeHtml(dataHora)}</time>` : ""}
    </div>
    ${
      row.arquivadoEm && role !== "consulta"
        ? `
      <div class="kanban-card__actions">
        <button type="button" class="btn btn--small btn--ghost" data-row-action="reabrir" data-id="${row.id}">
          ${icon("atualizar")} Reabrir
        </button>
      </div>`
        : ""
    }
  </article>`;
}

function isTypingTarget(el) {
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/** True se `dataBR` (dd/mm/aaaa) for anterior a hoje. Data vazia/mal formada nunca conta como atrasada. */
function estaAtrasada(dataBR) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dataBR || "");
  if (!m) return false;
  const [, diaStr, mesStr, anoStr] = m;
  const data = new Date(Number(anoStr), Number(mesStr) - 1, Number(diaStr));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return data < hoje;
}

function errorMessage(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
