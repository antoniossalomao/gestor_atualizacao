import { AGENDA_COLUMNS, STATUS_OPTIONS } from "../config.js";
import { ApiError } from "../api/ApiClient.js";
import { View } from "../core/View.js";
import { SortableTable } from "../core/SortableTable.js";
import { Pagination } from "../core/Pagination.js";
import { Autocomplete } from "../core/Autocomplete.js";
import { Modal } from "../core/Modal.js";
import { toast } from "../core/Toast.js";
import { debounce } from "../core/debounce.js";
import { todayBR, isValidDateBR } from "../core/date.js";
import { emptyState } from "../core/EmptyState.js";
import { plural } from "../core/html.js";
import { icon } from "../core/icons.js";
import { marcarOcupado } from "../core/guard.js";
import { prefs } from "../core/prefs.js";
import { aparencia } from "../core/appearance.js";

const STATUS_CONCLUIDO = STATUS_OPTIONS[STATUS_OPTIONS.length - 1];

/**
 * Aba Agendamentos: agenda interna de tarefas. Equivalente de
 * gestor/views/agendamentos.py.
 *
 * Mesmas correções aplicadas em Atualizações: `<form>` de verdade, `Escape`
 * com desfazer, exclusão reversível em vez de modal de confirmação, filtros
 * que sobrevivem à troca de aba, e o listener global de `Delete` registrado
 * por `this.on(...)` para não vazar quando a view é descartada.
 */
export class AgendamentosView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.selectedId = null;
    const salvo = prefs.get("agendamentos:filtros", {});
    this.page = 1;
    this.busca = salvo.busca || "";
    this.status = salvo.status || "Todos";
    this.sortBy = salvo.sortBy;
    this.sortDir = salvo.sortDir || "asc";
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = `
      <form class="card" data-role="form" novalidate>
        <h2 class="card__title">Nova Tarefa</h2>
        <div class="form-grid form-grid--6" data-role="fields"></div>
        <div class="form-actions">
          <button type="submit" class="btn btn--accent" data-action="add">Adicionar</button>
          <button type="button" class="btn" data-action="update">Atualizar Selecionada</button>
          <button type="button" class="btn btn--ghost" data-action="clear">Limpar</button>
          <span class="form-actions__hint text-muted" data-role="modo"></span>
        </div>
      </form>

      <div class="card">
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
            </select>
          </div>
          <div class="toolbar__clear">
            <button type="button" class="btn btn--small btn--ghost" data-action="limpar-filtros" hidden>Limpar filtros</button>
          </div>
          <div class="toolbar-spacer"></div>
          <span class="result-count" data-role="count" aria-live="polite"></span>
        </div>
        <p class="text-muted bulk-hint">
          Dica: segure <kbd>Shift</kbd> e clique em duas linhas para selecionar tudo entre elas.
        </p>
        <div class="bulk-bar" data-role="bulk" hidden>
          <span class="bulk-bar__count" data-role="bulk-count" aria-live="polite"></span>
          <button type="button" class="btn btn--small btn--ghost" data-action="bulk-limpar">Desmarcar</button>
          <div class="toolbar-spacer"></div>
          <button type="button" class="btn btn--small" data-action="bulk-concluir">
            ${icon("check")} Concluir selecionadas
          </button>
          <button type="button" class="btn btn--small btn--danger" data-action="bulk-excluir">
            ${icon("alerta")} Excluir selecionadas
          </button>
        </div>

        <div data-role="table"></div>
        <div data-role="pagination"></div>
        <div class="form-actions" style="margin-top: var(--sp-4)">
          <button type="button" class="btn btn--danger" data-action="delete">Excluir Selecionada</button>
          <button type="button" class="btn" data-action="done">Marcar como Concluída</button>
          <button type="button" class="btn" data-action="converter">Converter em Atualização</button>
        </div>
      </div>
    `;

    this._buildFields();

    this.table = new SortableTable(this.container.querySelector('[data-role="table"]'), {
      columns: [
        { key: "id", label: "ID", type: "numeric", largura: "70px" },
        ...AGENDA_COLUMNS.map((c) => ({ key: c.key, label: c.label, type: c.key === "data" ? "date" : "text" })),
      ],
      onSelect: (row) => this._loadIntoForm(row),
      rowClass: (row) => (row.status === STATUS_CONCLUIDO ? "is-muted" : ""),
      // Seleção múltipla: limpar uma fila de tarefas velhas ou concluir
      // várias de uma vez era um ciclo de "clicar na linha, clicar no botão"
      // por tarefa -- mesma ideia já usada em Atualizações.
      multiSelect: true,
      onMultiSelect: (chaves) => this._pintarBulk(chaves),
      caption: "Tarefas agendadas",
      emptyNode: () =>
        this._temFiltro()
          ? emptyState({
              titulo: "Nenhuma tarefa com esse filtro",
              descricao: "Tente outro termo, ou limpe os filtros para ver tudo.",
              icone: "busca",
              acao: { label: "Limpar filtros", onClick: () => this._limparFiltros() },
            })
          : emptyState({
              titulo: "Nenhuma tarefa agendada",
              descricao: "Use o formulário acima para agendar a primeira.",
              icone: "agendamentos",
            }),
      serverSort: true,
      onSortChange: (key, dir) => {
        this.sortBy = key;
        this.sortDir = dir;
        this.page = 1;
        this._salvarFiltros();
        this._reloadList();
      },
    });
    this.pagination = new Pagination(this.container.querySelector('[data-role="pagination"]'), (page) => {
      this.page = page;
      this._reloadList();
    });

    this.form = this.container.querySelector('[data-role="form"]');
    this.searchInput = this.container.querySelector('[data-role="search"]');
    this.statusFilter = this.container.querySelector('[data-role="status-filter"]');
    this.botaoLimparFiltros = this.container.querySelector('[data-action="limpar-filtros"]');
    this.searchInput.value = this.busca;
    this.statusFilter.value = this.status;

    const reload = debounce(() => {
      this.page = 1;
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
      this.page = 1;
      this._pintarLimparFiltros();
      this._salvarFiltros();
      this._reloadList();
    });
    this.botaoLimparFiltros.addEventListener("click", () => this._limparFiltros());

    this.addBtn = this.container.querySelector('[data-action="add"]');
    this.updateBtn = this.container.querySelector('[data-action="update"]');
    this.deleteBtn = this.container.querySelector('[data-action="delete"]');
    this.doneBtn = this.container.querySelector('[data-action="done"]');
    this.converterBtn = this.container.querySelector('[data-action="converter"]');

    // -- lote --
    this.bulkBar = this.container.querySelector('[data-role="bulk"]');
    this.bulkCount = this.container.querySelector('[data-role="bulk-count"]');
    this.bulkConcluir = this.container.querySelector('[data-action="bulk-concluir"]');
    this.bulkExcluir = this.container.querySelector('[data-action="bulk-excluir"]');
    this.container.querySelector('[data-action="bulk-limpar"]').addEventListener("click", () => this.table.limparMarcadas());
    this.bulkConcluir.addEventListener("click", () => this.concluirLote());
    this.bulkExcluir.addEventListener("click", () => this.excluirLote());

    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this._submit();
    });
    this.updateBtn.addEventListener("click", () => this.updateTask());
    this.container.querySelector('[data-action="clear"]').addEventListener("click", () => this.clearForm({ comDesfazer: true }));
    this.deleteBtn.addEventListener("click", () => this.deleteTask());
    this.doneBtn.addEventListener("click", () => this.markDone());
    this.converterBtn.addEventListener("click", () => this.converterEmAtualizacao());

    this.on(document, "keydown", (e) => this._onGlobalKeydown(e));

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
      field.innerHTML = `<label class="field__label" for="${id}">${col.label}</label>`;

      let input;
      if (col.key === "status") {
        input = document.createElement("select");
        input.className = "input";
        input.innerHTML = STATUS_OPTIONS.map((s) => `<option>${s}</option>`).join("");
      } else {
        input = document.createElement("input");
        // "horario" usa o seletor nativo do navegador (sempre devolve
        // "HH:MM" ou vazio) -- diferente de "data", que é texto livre com
        // validação manual porque precisa aceitar o formato dd/mm/aaaa já
        // usado no resto do app.
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
          const invalida = Boolean(input.value) && !isValidDateBR(input.value);
          hint.textContent = invalida ? "Formato esperado: dd/mm/aaaa" : "";
          input.setAttribute("aria-invalid", String(invalida));
        });
      }
      this.fields[col.key] = input;
    }
    this.clienteAutocomplete = new Autocomplete(this.fields.cliente, { values: [] });
    // Mesma lista de nomes já usados no campo Responsável da aba Atualizações
    // -- continua texto livre, só sugere para não escrever o mesmo nome de
    // jeitos diferentes.
    this.responsavelAutocomplete = new Autocomplete(this.fields.responsavel, { values: [] });
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
    this.table.setRefreshing(true);
    try {
      const resposta = await this.swr(
        `agendamentos:lista:${this.busca}|${this.status}|${this.page}|${this.sortBy}|${this.sortDir}`,
        () =>
          this.api.get(
            "/agendamentos",
            { search: this.busca, status: this.status, page: this.page, pageSize: aparencia.linhasPorPagina(), sortBy: this.sortBy, sortDir: this.sortDir },
            { key: "agendamentos:lista" }
          ),
        (resposta) => {
          this.table.setRows(resposta.rows);
          this.pagination.update(resposta);
          this.container.querySelector('[data-role="count"]').textContent = plural(resposta.total, "tarefa");
        }
      );

      if (resposta && resposta.rows.length === 0 && this.page > 1 && resposta.total > 0) {
        this.page -= 1;
        return this._reloadList();
      }
    } finally {
      this.table.setRefreshing(false);
    }
  }

  _temFiltro() {
    return Boolean(this.busca) || this.status !== "Todos";
  }

  _pintarLimparFiltros() {
    this.botaoLimparFiltros.hidden = !this._temFiltro();
  }

  _limparFiltros() {
    this.busca = "";
    this.status = "Todos";
    this.searchInput.value = "";
    this.statusFilter.value = "Todos";
    this.page = 1;
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
    for (const col of AGENDA_COLUMNS) this.fields[col.key].value = row[col.key] ?? "";
    this._pintarModo();
  }

  _pintarModo() {
    const modo = this.container.querySelector('[data-role="modo"]');
    modo.textContent = this.selectedId == null ? "" : `Editando a tarefa #${this.selectedId}`;
    this.updateBtn.disabled = this.selectedId == null;
    this.deleteBtn.disabled = this.selectedId == null;
    this.doneBtn.disabled = this.selectedId == null;
    this.converterBtn.disabled = this.selectedId == null;
  }

  /**
   * Manda os dados da tarefa selecionada pra aba Atualizações, já num
   * registro novo pré-preenchido (ver AtualizacoesView.aplicarParams) --
   * evita digitar cliente/responsável/data de novo pra registrar a
   * atualização que essa tarefa gerou.
   */
  converterEmAtualizacao() {
    if (this.selectedId == null) {
      Modal.alert("Seleção", "Selecione uma tarefa na tabela primeiro.", "warning");
      return;
    }
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
      this.page = 1;
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
    if (this.selectedId == null) {
      Modal.alert("Seleção", "Selecione uma tarefa na tabela primeiro.", "warning");
      return;
    }
    const data = this._readForm();
    if (!data) return;
    const liberar = marcarOcupado(this.updateBtn);
    try {
      await this.api.put(`/agendamentos/${this.selectedId}`, data);
      this.clearForm();
      this._invalidar();
      await this._reloadList();
      toast.success("Tarefa atualizada.");
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  /** Exclui e oferece "Desfazer" -- ver o comentário em AtualizacoesView. */
  async deleteTask() {
    if (this.selectedId == null) {
      Modal.alert("Seleção", "Selecione uma tarefa na tabela primeiro.", "warning");
      return;
    }
    const id = this.selectedId;
    const dadosAntes = {};
    for (const col of AGENDA_COLUMNS) dadosAntes[col.key] = this.fields[col.key].value.trim();

    const liberar = marcarOcupado(this.deleteBtn);
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
    } finally {
      liberar();
    }
  }

  async markDone() {
    if (this.selectedId == null) {
      Modal.alert("Seleção", "Selecione uma tarefa na tabela primeiro.", "warning");
      return;
    }
    const liberar = marcarOcupado(this.doneBtn);
    try {
      await this.api.patch(`/agendamentos/${this.selectedId}/done`);
      this.clearForm();
      this._invalidar();
      await this._reloadList();
      toast.success("Tarefa marcada como concluída.");
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  _pintarBulk(chaves) {
    const n = chaves.length;
    this.bulkBar.hidden = n === 0;
    this.bulkCount.textContent = n === 0 ? "" : `${plural(n, "tarefa")} ${n === 1 ? "selecionada" : "selecionadas"}`;
    // Um clique normal continua carregando a tarefa no formulário mesmo com
    // um lote marcado ao lado -- sem isto, "Excluir Selecionada"/"Marcar
    // como Concluída" (avulsos) ficavam visíveis junto dos equivalentes de
    // lote, quase iguais. "Converter em Atualização" não tem par de lote,
    // continua sempre disponível.
    this.deleteBtn.hidden = n > 0;
    this.doneBtn.hidden = n > 0;
  }

  /**
   * Marca todas as marcadas como concluídas de uma vez. Sem confirmação
   * (igual a conclusão de uma tarefa só) -- "Desfazer" cobre o engano, e
   * concluir não tem o mesmo peso de excluir.
   */
  async concluirLote() {
    const ids = this.table.selecionadas.map(Number).filter(Number.isInteger);
    if (ids.length === 0) return;

    const liberar = marcarOcupado(this.bulkConcluir);
    try {
      const { concluidos, registros } = await this.api.post("/agendamentos/concluir-lote", { ids });
      this.table.limparMarcadas();
      this.clearForm();
      this._invalidar();
      await this._reloadList();

      if (concluidos === 0) {
        toast.info("As tarefas selecionadas já estavam concluídas.");
        return;
      }
      toast.undo(`${plural(concluidos, "tarefa")} ${concluidos === 1 ? "concluída" : "concluídas"}.`, async () => {
        try {
          // Os ids continuam os mesmos (foi UPDATE, não recriação) -- um PUT
          // por tarefa, com os dados de ANTES, basta pra restaurar o status
          // (e a data de conclusão) exatos que cada uma tinha.
          for (const registro of registros) {
            const { id, ...dados } = registro;
            await this.api.put(`/agendamentos/${id}`, dados);
          }
          this._invalidar();
          await this._reloadList();
          toast.success("Conclusão desfeita.");
        } catch {
          toast.error("Não foi possível desfazer tudo. Confira a lista.");
        }
      });
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  /** Exclui todas as marcadas de uma vez -- ver o comentário equivalente em AtualizacoesView.excluirLote. */
  async excluirLote() {
    const ids = this.table.selecionadas.map(Number).filter(Number.isInteger);
    if (ids.length === 0) return;

    const ok = await Modal.confirm(
      "Excluir selecionadas",
      `${plural(ids.length, "tarefa")} ${ids.length === 1 ? "será excluída" : "serão excluídas"}.\n\n` +
        "Você ainda poderá desfazer nos segundos seguintes.",
      { confirmLabel: "Excluir", danger: true }
    );
    if (!ok) return;

    const liberar = marcarOcupado(this.bulkExcluir);
    try {
      const { excluidos, registros } = await this.api.post("/agendamentos/excluir-lote", { ids });
      this.table.limparMarcadas();
      this.clearForm();
      this._invalidar();
      await this._reloadList();

      toast.undo(`${plural(excluidos, "tarefa")} ${excluidos === 1 ? "excluída" : "excluídas"}.`, async () => {
        try {
          for (const registro of registros) {
            const { id, ...dados } = registro;
            await this.api.post("/agendamentos", dados);
          }
          this._invalidar();
          await this._reloadList();
          toast.success("Exclusão desfeita.");
        } catch {
          toast.error("Não foi possível desfazer tudo. Confira a lista.");
        }
      });
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  clearForm({ comDesfazer = false } = {}) {
    const antes = {};
    let tinhaConteudo = false;
    if (this.fields) {
      for (const col of AGENDA_COLUMNS) {
        antes[col.key] = this.fields[col.key].value;
        if (["tarefa", "cliente"].includes(col.key) && antes[col.key].trim()) tinhaConteudo = true;
      }
    }

    this.selectedId = null;
    this.table?.clearSelection();
    for (const col of AGENDA_COLUMNS) this.fields[col.key].value = "";
    this.fields.data.value = todayBR();
    this.fields.status.value = STATUS_OPTIONS[0];
    if (this.user) this.fields.responsavel.value = this.user.nome;
    for (const hint of this.container.querySelectorAll(".field__hint")) hint.textContent = "";
    this._pintarModo();

    if (comDesfazer && tinhaConteudo) {
      toast.undo("Formulário limpo.", () => {
        for (const col of AGENDA_COLUMNS) this.fields[col.key].value = antes[col.key];
        this.fields.tarefa.focus();
      }, "Restaurar");
    }
  }

  _invalidar() {
    this.cache?.invalidar("agendamentos:");
  }

  _onGlobalKeydown(e) {
    if (!this.visivel) return;
    if (e.key !== "Delete") return;
    if (isTypingTarget(e.target)) return;
    if (this.selectedId != null) this.deleteTask();
  }

  destroy() {
    this.clienteAutocomplete?.destroy();
    this.responsavelAutocomplete?.destroy();
    super.destroy();
  }
}

function isTypingTarget(el) {
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function errorMessage(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
