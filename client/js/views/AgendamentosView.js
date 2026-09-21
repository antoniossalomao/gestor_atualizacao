import { AGENDA_COLUMNS, STATUS_OPTIONS, FILTRO_ARQUIVADAS } from "../config.js";
import { ApiError } from "../api/ApiClient.js";
import { View } from "../app/View.js";
import { SortableTable } from "../components/SortableTable.js";
import { Pagination } from "../components/Pagination.js";
import { Autocomplete } from "../components/Autocomplete.js";
import { Modal } from "../components/Modal.js";
import { toast } from "../components/Toast.js";
import { debounce } from "../utils/debounce.js";
import { todayBR, isValidDateBR, mascaraDataBR } from "../utils/date.js";
import { emptyState } from "../components/EmptyState.js";
import { plural, escapeHtml } from "../utils/html.js";
import { icon } from "../utils/icons.js";
import { marcarOcupado } from "../utils/guard.js";
import { prefs } from "../app/prefs.js";
import { aparencia } from "../app/appearance.js";
import { Drawer } from "../components/Drawer.js";

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
      <div class="view-actions">
        <div class="segmented" role="group" aria-label="Visualização dos agendamentos">
          <button type="button" class="btn is-active" data-view="lista">📋 Lista</button>
          <button type="button" class="btn" data-view="kanban">▦ Kanban</button>
        </div>
        <button type="button" class="btn btn--accent" data-action="novo-agendamento">+ Novo Agendamento</button>
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
            <button type="submit" class="btn btn--accent" data-action="add">Adicionar Tarefa</button>
            <button type="button" class="btn btn--accent" data-action="update" hidden>Salvar Alterações</button>
          </div>
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
              <!-- Fica no MESMO select dos status, e não num botão à parte,
                   porque é aqui que a pessoa vem quando quer recortar a
                   lista -- e "arquivada" é, na prática, mais um recorte. O
                   rótulo ganha a contagem em _pintarArquivadas(). -->
              <option value="${FILTRO_ARQUIVADAS}">${FILTRO_ARQUIVADAS}</option>
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
        <!-- Uma lista que esvazia sozinha sem dizer por quê parece perda de
             dado. Esta linha só aparece quando a pessoa está OLHANDO as
             arquivadas, que é quando a pergunta surge. -->
        <p class="text-muted bulk-hint" data-role="aviso-arquivadas" hidden></p>
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
          <button type="button" class="btn" data-action="arquivar">Arquivar</button>
          <button type="button" class="btn" data-action="done">Marcar como Concluída</button>
          <button type="button" class="btn" data-action="converter">Converter em Atualização</button>
          <!-- Só existe enquanto o filtro é "Arquivadas": em qualquer outra
               lista não há o que reabrir, e um botão desligado o tempo todo
               é ruído. -->
          <button type="button" class="btn btn--accent" data-action="reabrir" hidden>Reabrir</button>
        </div>
      </div>
    `;

    this._buildFields();

    this.table = new SortableTable(this.container.querySelector('[data-role="table"]'), {
      columns: [
        { key: "id", label: "ID", type: "numeric", largura: "70px" },
        ...AGENDA_COLUMNS.map((c) => ({ key: c.key, label: c.label, type: c.key === "data" ? "date" : "text" })),
        { key: "acoes", label: "Ações", largura: "136px", render: (row) => acoesAgendamento(row, this.user?.role) },
      ],
      onSelect: (row) => this._loadIntoForm(row),
      rowClass: (row) => {
        if (row.status === STATUS_CONCLUIDO) return "is-muted";
        if (estaAtrasada(row.data)) return "is-atrasada";
        return "";
      },
      // Seleção múltipla: limpar uma fila de tarefas velhas ou concluir
      // várias de uma vez era um ciclo de "clicar na linha, clicar no botão"
      // por tarefa -- mesma ideia já usada em Atualizações.
      multiSelect: true,
      onMultiSelect: (chaves) => this._pintarBulk(chaves),
      caption: "Tarefas agendadas",
      emptyNode: () =>
        this.status === FILTRO_ARQUIVADAS
          ? emptyState({
              titulo: "Nenhuma tarefa arquivada",
              descricao: "Tarefas concluídas saem da lista sozinhas depois de um tempo. Ainda não houve nenhuma.",
              icone: "agendamentos",
            })
          : this._temFiltro()
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
    this.drawer = new Drawer(this.form, {
      titulo: "Agendamento",
      descricao: "Crie ou edite a tarefa mantendo o quadro visível.",
    });
    this.kanban = document.createElement("div");
    this.kanban.className = "kanban-board";
    this.kanban.hidden = true;
    this.table.container.after(this.kanban);
    this.container.querySelector('[data-action="novo-agendamento"]').addEventListener("click", () => {
      this.clearForm();
      this.drawer.abrir({ foco: this.fields.tarefa });
    });
    for (const botao of this.container.querySelectorAll("[data-view]")) {
      botao.addEventListener("click", () => this._trocarVisao(botao.dataset.view));
    }
    this.table.container.addEventListener("click", (e) => this._acaoRapida(e));
    this.kanban.addEventListener("click", (e) => this._acaoRapida(e));
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

    this.addBtn = this.form.querySelector('[data-action="add"]');
    this.updateBtn = this.form.querySelector('[data-action="update"]');
    this.deleteBtn = this.container.querySelector('[data-action="delete"]');
    this.modalDeleteBtn = this.form.querySelector('[data-action="modal-delete"]');
    if (this.modalDeleteBtn) {
      this.modalDeleteBtn.addEventListener("click", async () => {
        this.drawer.marcarLimpa();
        await this.drawer.fechar({ forcar: true });
        this.deleteTask();
      });
    }
    this.doneBtn = this.container.querySelector('[data-action="done"]');
    this.arquivarBtn = this.container.querySelector('[data-action="arquivar"]');
    this.converterBtn = this.container.querySelector('[data-action="converter"]');
    this.reabrirBtn = this.container.querySelector('[data-action="reabrir"]');
    this.avisoArquivadas = this.container.querySelector('[data-role="aviso-arquivadas"]');
    this.reabrirBtn.addEventListener("click", () => this.reabrir());

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
    this.updateBtn?.addEventListener("click", () => this.updateTask());
    this.deleteBtn?.addEventListener("click", () => this.deleteTask());
    this.doneBtn?.addEventListener("click", () => this.markDone());
    this.arquivarBtn?.addEventListener("click", () => this.arquivar());
    this.converterBtn?.addEventListener("click", () => this.converterEmAtualizacao());

    this.on(document, "keydown", (e) => this._onGlobalKeydown(e));

    if (this.user?.role === "consulta") {
      this.form.hidden = true;
      this.container.querySelector('[data-action="novo-agendamento"]').hidden = true;
      this.deleteBtn.hidden = true;
      this.doneBtn.hidden = true;
      this.arquivarBtn.hidden = true;
      this.converterBtn.hidden = true;
      this.reabrirBtn.hidden = true;
      this.bulkConcluir.hidden = true;
      this.bulkExcluir.hidden = true;
      const hint = this.container.querySelector(".bulk-hint");
      if (hint) hint.hidden = true;
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
          input.value = mascaraDataBR(input.value);
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
          this._renderKanban(resposta.rows);
          this.pagination.update(resposta);
          this.container.querySelector('[data-role="count"]').textContent = plural(resposta.total, "tarefa");
          this._pintarArquivadas(resposta);
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

  /**
   * A contagem no rótulo do filtro e o aviso que explica a regra.
   *
   * Os dois números vêm do servidor (`arquivadas`, `arquivarDias`) em vez de
   * estarem escritos aqui: o prazo mora no .env, e um texto de tela com "30
   * dias" fixo passaria a mentir no dia em que alguém mudasse para 60.
   */
  _pintarArquivadas({ arquivadas = 0, arquivarDias = 0 } = {}) {
    const opcao = this.statusFilter.querySelector(`option[value="${FILTRO_ARQUIVADAS}"]`);
    if (opcao) opcao.textContent = arquivadas > 0 ? `${FILTRO_ARQUIVADAS} (${arquivadas})` : FILTRO_ARQUIVADAS;

    const vendo = this.status === FILTRO_ARQUIVADAS;
    this.avisoArquivadas.hidden = !vendo;
    if (vendo) {
      this.avisoArquivadas.textContent =
        `Tarefas concluídas há mais de ${plural(arquivarDias, "dia")} saem da lista sozinhas. ` +
        `"Reabrir" traz a selecionada de volta como "${STATUS_OPTIONS[0]}".`;
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
    this.selectedRevision = row.revisao;
    for (const col of AGENDA_COLUMNS) this.fields[col.key].value = row[col.key] ?? "";
    this._pintarModo();
  }

  _trocarVisao(visao) {
    const kanban = visao === "kanban";
    this.table.container.hidden = kanban;
    this.container.querySelector('[data-role="pagination"]').hidden = kanban;
    this.kanban.hidden = !kanban;
    for (const botao of this.container.querySelectorAll("[data-view]")) botao.classList.toggle("is-active", botao.dataset.view === visao);
  }

  _renderKanban(rows) {
    const grupos = [
      ["A Fazer", "Pendentes"], ["Em Andamento", "Em andamento"],
      ["Sem resposta", "Aguardando cliente / bloqueado"], ["Concluído", "Concluídos recentemente"],
    ];
    this.kanban.innerHTML = grupos.map(([status, titulo]) => {
      const itens = rows.filter((row) => row.status === status);
      return `<section class="kanban-column" data-status="${status}">
        <header><h3>${titulo}</h3><span class="badge">${itens.length}</span></header>
        <div class="kanban-column__cards">${itens.map((row) => cartaoKanban(row, this.user?.role)).join("") || '<p class="text-muted">Nenhuma tarefa</p>'}</div>
      </section>`;
    }).join("");
  }

  async _acaoRapida(e) {
    const botao = e.target.closest("[data-row-action]");
    if (!botao) return;
    const row = this.table.rows.find((item) => String(item.id) === botao.dataset.id);
    if (!row) return;
    this._loadIntoForm(row);
    if (botao.dataset.rowAction === "editar") this.drawer.abrir({ foco: this.fields.tarefa });
    if (botao.dataset.rowAction === "converter") this.converterEmAtualizacao();
    if (botao.dataset.rowAction === "concluir") await this.markDone();
    if (botao.dataset.rowAction === "avancar") await this._avancar(row);
  }

  async _avancar(row) {
    const indice = STATUS_OPTIONS.indexOf(row.status);
    if (indice < 0 || indice >= STATUS_OPTIONS.length - 1) return;
    try {
      await this.api.put(`/agendamentos/${row.id}`, { ...row, status: STATUS_OPTIONS[indice + 1] });
      this._invalidar();
      await this._reloadList();
      toast.success(`Tarefa avançou para “${STATUS_OPTIONS[indice + 1]}”.`);
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    }
  }

  _pintarModo() {
    const modo = this.form.querySelector('[data-role="modo"]');
    const isEdit = this.selectedId != null;
    if (modo) modo.textContent = isEdit ? `Tarefa #${this.selectedId}` : "";
    if (this.addBtn) this.addBtn.hidden = isEdit;
    if (this.updateBtn) {
      this.updateBtn.hidden = !isEdit;
      this.updateBtn.disabled = !isEdit;
    }
    if (this.modalDeleteBtn) this.modalDeleteBtn.hidden = !isEdit || this.user?.role === "consulta";
    this.deleteBtn.disabled = !isEdit;
    this.doneBtn.disabled = !isEdit;
    this.arquivarBtn.disabled = !isEdit;
    this.converterBtn.disabled = !isEdit;
    this.reabrirBtn.disabled = !isEdit;
    if (this.drawer) {
      if (isEdit) {
        this.drawer.setTitulo(`Editar Tarefa #${this.selectedId}`, "Atualize os detalhes da tarefa agendada.");
      } else {
        this.drawer.setTitulo("Novo Agendamento", "Crie uma tarefa para a equipe.");
      }
    }

    // Olhando as arquivadas, "Marcar como Concluída" e "Arquivar" não têm o
    // que fazer (já estão concluídas/arquivadas) -- eles saem e o "Reabrir"
    // toma o lugar.
    const vendoArquivadas = this.status === FILTRO_ARQUIVADAS;
    this.reabrirBtn.hidden = !vendoArquivadas;
    this.doneBtn.hidden = vendoArquivadas;
    this.arquivarBtn.hidden = vendoArquivadas;
  }

  /**
   * Traz a tarefa selecionada de volta para a lista.
   *
   * Reabrir e desarquivar são a mesma ação de propósito: a varredura roda a
   * cada listagem, então uma tarefa que só saísse do arquivo continuando
   * "Concluído" seria arquivada de novo no mesmo segundo. Quem traz uma
   * tarefa de volta quer fazer algo com ela.
   */
  async reabrir() {
    if (this.selectedId == null) {
      Modal.alert("Seleção", "Selecione uma tarefa na tabela primeiro.", "warning");
      return;
    }
    const liberar = marcarOcupado(this.reabrirBtn);
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
      this.page = 1;
      this._reloadList();
    }
    if (filtro !== undefined) {
      this.busca = filtro;
      if (this.searchInput) this.searchInput.value = filtro;
      this.page = 1;
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
      this.drawer.marcarLimpa();
      await this.drawer.fechar({ forcar: true });
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

  /**
   * Arquiva a tarefa selecionada na hora, sem esperar o prazo automático do
   * .env. Só concluídas podem ser arquivadas (mesma regra da varredura
   * automática) -- validado aqui para não gastar uma ida ao servidor com um
   * erro que a tela já sabe de antemão.
   */
  async arquivar() {
    if (this.selectedId == null) {
      Modal.alert("Seleção", "Selecione uma tarefa na tabela primeiro.", "warning");
      return;
    }
    if (this.fields.status.value !== STATUS_CONCLUIDO) {
      Modal.alert("Arquivar", `Só é possível arquivar tarefas "${STATUS_CONCLUIDO}".`, "warning");
      return;
    }
    const liberar = marcarOcupado(this.arquivarBtn);
    try {
      await this.api.patch(`/agendamentos/${this.selectedId}/arquivar`);
      this.clearForm();
      this._invalidar();
      await this._reloadList();
      toast.success("Tarefa arquivada.");
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
    this.arquivarBtn.hidden = n > 0;
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
    this.selectedRevision = null;
    this.table?.clearSelection();
    for (const col of AGENDA_COLUMNS) this.fields[col.key].value = "";
    this.fields.data.value = todayBR();
    this.fields.status.value = STATUS_OPTIONS[0];
    if (this.user) this.fields.responsavel.value = this.user.nome;
    for (const hint of this.form.querySelectorAll(".field__hint")) hint.textContent = "";
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
    if (isTypingTarget(e.target)) return;
    if (e.key === "Delete" && this.selectedId != null) this.deleteTask();
    else if (e.key.toLowerCase() === "n") this.container.querySelector('[data-action="novo-agendamento"]')?.click();
    else if (e.key === "/") { e.preventDefault(); this.searchInput.focus(); }
    else if (e.key.toLowerCase() === "j") this.table.moverCursor(1);
    else if (e.key.toLowerCase() === "k") this.table.moverCursor(-1);
    else if (e.key.toLowerCase() === "e" || e.key === "Enter") { this.table.ativarCursor(); if (this.selectedId != null) this.drawer.abrir(); }
    else if (e.key.toLowerCase() === "x" || e.key === " ") { e.preventDefault(); this.table.alternarMarcacaoCursor(); }
  }

  destroy() {
    this.drawer?.destroy();
    this.clienteAutocomplete?.destroy();
    this.responsavelAutocomplete?.destroy();
    super.destroy();
  }
}

function acoesAgendamento(row, role) {
  const wrap = document.createElement("div");
  wrap.className = "row-actions";
  if (role === "consulta") return wrap;
  const botoes = row.status === STATUS_CONCLUIDO
    ? [["editar", "✏️", "Editar"]]
    : [["concluir", "✓", "Marcar como concluída"], ["converter", "↗", "Converter em atualização"], ["editar", "✏️", "Editar"]];
  for (const [acao, simbolo, titulo] of botoes) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "btn btn--icon btn--ghost";
    botao.dataset.rowAction = acao;
    botao.dataset.id = row.id;
    botao.title = titulo;
    botao.setAttribute("aria-label", titulo);
    botao.textContent = simbolo;
    wrap.appendChild(botao);
  }
  return wrap;
}

function cartaoKanban(row, role) {
  const vencida = row.status !== STATUS_CONCLUIDO && estaAtrasada(row.data);
  const acoes = role === "consulta" || row.status === STATUS_CONCLUIDO ? "" : `
    <div class="kanban-card__actions">
      <button type="button" class="btn btn--small" data-row-action="avancar" data-id="${row.id}">Avançar</button>
      <button type="button" class="btn btn--small btn--ghost" data-row-action="editar" data-id="${row.id}">Editar</button>
    </div>`;
  return `<article class="kanban-card${vencida ? " is-overdue" : ""}">
    <header><strong>${escapeHtml(row.cliente || "Sem cliente")}</strong>${vencida ? '<span class="badge badge--danger">Vencida</span>' : ""}</header>
    <p>${escapeHtml(row.tarefa)}</p>
    <dl><div><dt>Sistema</dt><dd>${escapeHtml(row.sistema || "—")}</dd></div><div><dt>Responsável</dt><dd>${escapeHtml(row.responsavel || "—")}</dd></div></dl>
    <time>${escapeHtml([row.data, row.horario].filter(Boolean).join(" · ") || "Sem data")}</time>${acoes}
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
