import { ApiError } from "../api/ApiClient.js";
import { View } from "../app/View.js";
import { SortableTable } from "../components/SortableTable.js";
import { Pagination } from "../components/Pagination.js";
import { Modal } from "../components/Modal.js";
import { toast } from "../components/Toast.js";
import { debounce } from "../utils/debounce.js";
import { icon, iconHtml } from "../utils/icons.js";
import { emptyState } from "../components/EmptyState.js";
import { html, plural, copyToClipboard } from "../utils/html.js";
import { marcarOcupado } from "../utils/guard.js";
import { prefs } from "../app/prefs.js";
import { aparencia } from "../app/appearance.js";
import { Autocomplete } from "../components/Autocomplete.js";
import { AcessosModal } from "./AcessosModal.js";
import { Drawer } from "../components/Drawer.js";

/**
 * Aba Clientes: cadastro, edição e listagem dos clientes e seus sistemas.
 * O formulário fica escondido por padrão (botão "+ Novo Cliente") -- mesma
 * ideia de gestor/views/clientes.py.
 */
export class ClientesView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.selectedId = null;
    this.formVisible = false;
    this.sistemasDisponiveis = [];
    const salvo = prefs.get("clientes:filtros", {});
    this.page = 1;
    this.busca = salvo.busca || "";
    this.sortBy = salvo.sortBy;
    this.sortDir = salvo.sortDir || "asc";
    this._buildDom();
  }

  aplicarParams({ novo } = {}) {
    if (!novo || this.user?.role === "consulta") return;
    this.clearForm();
    this.drawer?.abrir({ foco: this.fields.nome });
  }

  _buildDom() {
    this.container.innerHTML = html`
      <form class="card" id="clientes-form" data-role="form-card" hidden novalidate>
        <div class="form-grid form-grid--3">
          <div class="field field--full"><label class="field__label" for="cli-nome">Cliente</label><input type="text" class="input" id="cli-nome" data-field="nome" required /></div>
          <div class="field"><label class="field__label" for="cli-codigo">Código</label><input type="text" class="input" id="cli-codigo" data-field="codigo" /></div>
          <div class="field"><label class="field__label" for="cli-cidade">Cidade</label><input type="text" class="input" id="cli-cidade" data-field="cidade" /></div>
          <div class="field">
            <label class="field__label" for="cli-grupo">Grupo/Rede</label>
            <input type="text" class="input" id="cli-grupo" data-field="grupo" placeholder="ex.: REDE EXEMPLO" autocomplete="off" />
          </div>
        </div>

        <div class="clientes-sistemas-head" style="margin-top: var(--sp-4);">
          <span class="field__label">Sistemas Contratados</span>
          <button type="button" class="btn btn--small" data-action="toggle-novo-sistema">${iconHtml("plus")} Novo Sistema</button>
        </div>
        <div class="toolbar" data-role="novo-sistema-row" hidden>
          <input type="text" class="input" data-role="novo-sistema-input" style="max-width:240px" placeholder="Nome do sistema" />
          <button type="button" class="btn btn--small" data-action="add-sistema">Adicionar</button>
        </div>
        <div class="checkbox-grid" data-role="sistemas-grid"></div>

        <div class="form-actions form-actions--modal">
          <div class="form-actions__left">
            <button type="button" class="btn btn--danger" data-action="modal-delete" hidden>${iconHtml("alerta")} Excluir</button>
          </div>
          <div class="form-actions__right">
            <button type="button" class="btn btn--ghost" data-action="cancel">Cancelar</button>
            <button type="submit" class="btn btn--accent" data-action="add">Adicionar Cliente</button>
            <button type="button" class="btn btn--accent" data-action="update" hidden>Salvar Alterações</button>
          </div>
        </div>
      </form>

      <div class="card">
        <div class="toolbar">
          <div class="field">
            <label class="field__label" for="cli-busca">Buscar (nome, cidade, sistema ou grupo)</label>
            <input type="search" class="input" id="cli-busca" data-role="search" />
          </div>
          <div class="toolbar__clear">
            <button type="button" class="btn btn--small btn--ghost" data-action="limpar-filtros" hidden>Limpar busca</button>
          </div>
          <div class="toolbar-spacer"></div>
          <span class="result-count" data-role="count" aria-live="polite"></span>
          <button type="button" class="btn btn--small btn--danger" data-action="delete" disabled>${iconHtml("alerta")} Excluir</button>
          <button type="button" class="btn btn--accent btn--small" data-action="toggle-form">+ Novo Cliente</button>
        </div>
        <p class="text-muted bulk-hint">
          Dica: segure <kbd>Shift</kbd> e clique em duas linhas para selecionar tudo entre elas.
        </p>
        <div class="bulk-bar" data-role="bulk" hidden>
          <span class="bulk-bar__count" data-role="bulk-count" aria-live="polite"></span>
          <button type="button" class="btn btn--small btn--ghost" data-action="bulk-limpar">Desmarcar</button>
          <div class="toolbar-spacer"></div>
          <select class="input" data-role="bulk-sistema-select" style="max-width:200px"></select>
          <button type="button" class="btn btn--small" data-action="bulk-add-sistema">Adicionar sistema</button>
          <button type="button" class="btn btn--small btn--danger" data-action="bulk-excluir">
            ${iconHtml("alerta")} Excluir selecionados
          </button>
        </div>
        <div data-role="table"></div>
        <div data-role="pagination"></div>
      </div>
    `;

    this.formCard = this.container.querySelector('[data-role="form-card"]');
    this.drawer = new Drawer(this.formCard, {
      titulo: "Novo Cliente",
      descricao: "Cadastre um novo cliente e selecione seus sistemas.",
    });
    this.toggleFormBtn = this.container.querySelector('[data-action="toggle-form"]');
    this.fields = {
      codigo: this.formCard.querySelector('[data-field="codigo"]'),
      nome: this.formCard.querySelector('[data-field="nome"]'),
      cidade: this.formCard.querySelector('[data-field="cidade"]'),
      grupo: this.formCard.querySelector('[data-field="grupo"]'),
    };
    for (const input of Object.values(this.fields)) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") this.clearForm({ comDesfazer: true });
      });
    }
    this.grupoAutocomplete = new Autocomplete(this.fields.grupo, { values: [] });

    this.sistemasGrid = this.formCard.querySelector('[data-role="sistemas-grid"]');
    this.novoSistemaRow = this.formCard.querySelector('[data-role="novo-sistema-row"]');
    this.novoSistemaInput = this.formCard.querySelector('[data-role="novo-sistema-input"]');
    this.novoSistemaInput.addEventListener("keydown", (e) => {
      // `preventDefault` porque este input mora DENTRO do <form>: sem isso o
      // Enter submeteria o cadastro do cliente em vez de criar o sistema.
      if (e.key === "Enter") {
        e.preventDefault();
        this.addSistema();
      }
    });

    this.table = new SortableTable(this.container.querySelector('[data-role="table"]'), {
      columns: [
        { key: "id", label: "ID", type: "numeric", largura: "56px" },
        { key: "codigo", label: "Código", largura: "80px" },
        { key: "nome", label: "Cliente", largura: "26%" },
        { key: "cidade", label: "Cidade", largura: "120px" },
        {
          key: "grupo",
          label: "Grupo/Rede",
          largura: "130px",
          title: (row) => row.grupo || "",
          render: (row) => {
            const span = document.createElement("span");
            span.textContent = row.grupo || "—";
            return span;
          },
        },
        { key: "sistemasTexto", label: "Sistemas" },
        { key: "maquinas", label: "Máquinas", type: "numeric", largura: "75px" },
        { key: "acoes", label: "Ações", largura: "140px", render: (row) => acoesCliente(row, this.user?.role) },
      ],
      onSelect: (row) => this._loadIntoForm(row),
      // Seleção múltipla: marcar um sistema em vários clientes de uma vez
      // (ex.: "esses 8 agora têm NFCe") ou excluir vários era um ciclo de
      // "abrir, editar, salvar" por cliente -- mesma ideia já usada em
      // Atualizações e Agendamentos.
      multiSelect: true,
      onMultiSelect: (chaves) => this._pintarBulk(chaves),
      caption: "Clientes cadastrados",
      emptyNode: () =>
        this.busca
          ? emptyState({
              titulo: "Nenhum cliente encontrado",
              descricao: `Nada casa com "${this.busca}". Tente outro termo.`,
              icone: "busca",
              acao: { label: "Limpar busca", onClick: () => this._limparFiltros() },
            })
          : emptyState({
              titulo: "Nenhum cliente cadastrado",
              descricao: "Cadastre o primeiro cliente para começar a registrar atualizações.",
              icone: "clientes",
              acao: { label: "Novo cliente", onClick: () => { this.clearForm(); this.drawer.abrir({ foco: this.fields.nome }); } },
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
    this.table.container.addEventListener("click", (e) => this._acaoRapida(e));

    this.searchInput = this.container.querySelector('[data-role="search"]');
    this.botaoLimparFiltros = this.container.querySelector('[data-action="limpar-filtros"]');
    this.searchInput.value = this.busca;
    const reload = debounce(() => {
      this.page = 1;
      this._salvarFiltros();
      this._reloadList();
    }, 200);
    this.searchInput.addEventListener("input", () => {
      this.busca = this.searchInput.value.trim();
      this.botaoLimparFiltros.hidden = !this.busca;
      reload();
    });
    this.botaoLimparFiltros.addEventListener("click", () => this._limparFiltros());

    this.toggleFormBtn.addEventListener("click", () => {
      this.clearForm();
      this.drawer.abrir({ foco: this.fields.nome });
    });
    this.formCard.querySelector('[data-action="toggle-novo-sistema"]').addEventListener("click", () => this._toggleNovoSistema());
    this.formCard.querySelector('[data-action="add-sistema"]').addEventListener("click", () => this.addSistema());

    this.addBtn = this.formCard.querySelector('[data-action="add"]');
    this.updateBtn = this.formCard.querySelector('[data-action="update"]');
    this.modalDeleteBtn = this.formCard.querySelector('[data-action="modal-delete"]');
    if (this.modalDeleteBtn) {
      this.modalDeleteBtn.addEventListener("click", async () => {
        this.drawer.marcarLimpa();
        await this.drawer.fechar({ forcar: true });
        this.deleteClient();
      });
    }
    this.deleteBtn = this.container.querySelector('[data-action="delete"]');

    // -- lote --
    this.bulkBar = this.container.querySelector('[data-role="bulk"]');
    this.bulkCount = this.container.querySelector('[data-role="bulk-count"]');
    this.bulkSistemaSelect = this.container.querySelector('[data-role="bulk-sistema-select"]');
    this.bulkAddSistema = this.container.querySelector('[data-action="bulk-add-sistema"]');
    this.bulkExcluir = this.container.querySelector('[data-action="bulk-excluir"]');
    this.container.querySelector('[data-action="bulk-limpar"]').addEventListener("click", () => this.table.limparMarcadas());
    this.bulkAddSistema.addEventListener("click", () => this.adicionarSistemaLote());
    this.bulkExcluir.addEventListener("click", () => this.excluirLote());

    this.formCard.addEventListener("submit", (e) => {
      e.preventDefault();
      this._submit();
    });
    this.updateBtn?.addEventListener("click", () => this.updateClient());
    this.deleteBtn?.addEventListener("click", () => this.deleteClient());

    this.on(document, "keydown", (e) => this._onGlobalKeydown(e));

    if (this.user?.role === "consulta") {
      this.toggleFormBtn.hidden = true;
      this.deleteBtn.hidden = true;
      this.bulkAddSistema.hidden = true;
      this.bulkExcluir.hidden = true;
      const hint = this.container.querySelector(".bulk-hint");
      if (hint) hint.hidden = true;
    }

    this.botaoLimparFiltros.hidden = !this.busca;
    this.clearForm();
  }

  /** @param {boolean} [forcarAberto] */
  toggleForm(forcarAberto) {
    if (forcarAberto === true) {
      this.drawer.abrir({ foco: this.fields.nome });
    } else if (forcarAberto === false) {
      this.drawer.fechar();
    } else {
      if (this.drawer.aberta) this.drawer.fechar();
      else this.drawer.abrir({ foco: this.fields.nome });
    }
  }

  async _acaoRapida(e) {
    const botao = e.target.closest("[data-row-action]");
    if (!botao) return;
    // Evita propagação do clique que abriria simultaneamente a seleção/drawer
    e.stopPropagation();
    const row = this.table.rows.find((item) => String(item.id) === botao.dataset.id);
    if (!row) return;
    if (botao.dataset.rowAction === "editar") {
      this._loadIntoForm(row);
      this.toggleForm(true);
    }
    if (botao.dataset.rowAction === "ficha") this.navigate("consulta", { cliente: row.nome });
    if (botao.dataset.rowAction === "acessos" || botao.dataset.rowAction === "gerenciar-acesso" || botao.dataset.rowAction === "acesso") {
      this.abrirAcessos(row.id, row.nome);
    }
  }

  _toggleNovoSistema() {
    const visible = !this.novoSistemaRow.hidden;
    this.novoSistemaRow.hidden = visible;
    if (!visible) {
      this.novoSistemaInput.value = "";
      this.novoSistemaInput.focus();
    }
  }

  async addSistema() {
    const nome = this.novoSistemaInput.value.trim();
    if (!nome) return;
    try {
      await this.api.post("/sistemas", { nome });
      // Um sistema novo afeta a aba Sistemas e o formulário de Distribuição,
      // que também listam esse cadastro.
      this.cache?.invalidar("sistemas");
      await this._reloadSistemas();
      const cb = [...this.sistemasGrid.querySelectorAll("input[type=checkbox]")].find((el) => el.value === nome);
      if (cb) cb.checked = true;
      this._toggleNovoSistema();
      toast.success(`Sistema "${nome}" adicionado.`);
    } catch (err) {
      Modal.alert("Validação", errorMessage(err), "warning");
    }
  }

  async _reloadSistemas() {
    const marcados = new Set([...this.sistemasGrid.querySelectorAll("input:checked")].map((el) => el.value));
    this.sistemasDisponiveis = await this.api.get("/sistemas", null, { key: "clientes:sistemas" });
    this.sistemasGrid.innerHTML = "";
    for (const sistema of this.sistemasDisponiveis) {
      // <label> e o botão de excluir ficam IRMÃOS, não um dentro do outro:
      // um <button> aninhado num <label> associado a um checkbox corre o
      // risco de, em navegadores mais antigos, também alternar o checkbox ao
      // clicar em "excluir" -- como irmãos, o clique num nunca afeta o outro.
      const row = document.createElement("div");
      row.className = "checkbox-item-row";

      const label = document.createElement("label");
      label.className = "checkbox-item";
      label.innerHTML = html`<input type="checkbox" value="${sistema}" /> <span></span>`;
      // defaultChecked, e não .checked: é o equivalente do atributo "checked"
      // que o HTML trazia antes, e continua valendo num form.reset().
      label.querySelector("input").defaultChecked = marcados.has(sistema);
      label.querySelector("span").textContent = sistema;

      const excluir = document.createElement("button");
      excluir.type = "button";
      excluir.className = "checkbox-item__remove";
      excluir.setAttribute("aria-label", `Excluir sistema "${sistema}" do catálogo`);
      excluir.title = `Excluir "${sistema}" do catálogo`;
      excluir.textContent = "✕";
      excluir.addEventListener("click", () => this._removerSistema(sistema));

      row.append(label, excluir);
      this.sistemasGrid.appendChild(row);
    }

    const selecionado = this.bulkSistemaSelect.value;
    // Começa vazio, de propósito: sem isso, o <select> ficava mostrando o
    // primeiro sistema do catálogo (ordem alfabética) já escolhido, e quem
    // clicasse "Adicionar sistema" sem prestar atenção aplicaria esse
    // sistema por engano em todos os clientes marcados.
    this.bulkSistemaSelect.innerHTML = html`<option value="">Escolha um sistema…</option>${this.sistemasDisponiveis.map((s) => html`<option>${s}</option>`)}`;
    if (this.sistemasDisponiveis.includes(selecionado)) this.bulkSistemaSelect.value = selecionado;
  }

  /**
   * Remove um sistema do catálogo inteiro (não só deste cliente). A ação
   * afeta o app inteiro -- some do formulário de "Preparar versão" na
   * Distribuição, do filtro da aba Sistemas, e é desmarcado de todo cliente
   * que o tivesse hoje -- por isso pede confirmação, diferente de um simples
   * check/uncheck.
   */
  async _removerSistema(sistema) {
    const ok = await Modal.confirm(
      "Excluir sistema do catálogo",
      `Excluir "${sistema}"?\n\nEle deixa de aparecer como opção para novos cadastros e é desmarcado de qualquer cliente que o tenha hoje. Atualizações e versões já registradas com esse sistema continuam no histórico, sem mudar.`,
      { confirmLabel: "Excluir" }
    );
    if (!ok) return;

    try {
      const resultado = await this.api.delete(`/sistemas/${encodeURIComponent(sistema)}`);
      // Afeta o catálogo (visto por Distribuição e pela aba Sistemas) e a
      // lista de cada cliente que tinha esse sistema marcado.
      this.cache?.invalidar("sistemas");
      this.cache?.invalidar("clientes:");
      await this._reloadSistemas();
      await this._reloadList();
      toast.success(
        resultado.clientesAfetados > 0
          ? `Sistema "${sistema}" excluído (desmarcado de ${plural(resultado.clientesAfetados, "cliente")}).`
          : `Sistema "${sistema}" excluído.`
      );
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    }
  }

  async refresh() {
    await this._reloadSistemas();
    await this._reloadList();
    await this.swr(
      "clientes:grupos",
      () => this.api.get("/clientes/grupos", null, { key: "clientes:grupos" }),
      (grupos) => this.grupoAutocomplete.setValues(grupos)
    );
  }

  async _reloadList() {
    this.table.setRefreshing(true);
    try {
      const resposta = await this.swr(
        `clientes:lista:${this.busca}|${this.page}|${this.sortBy}|${this.sortDir}`,
        () =>
          this.api.get(
            "/clientes",
            { search: this.busca, page: this.page, pageSize: aparencia.linhasPorPagina(), sortBy: this.sortBy, sortDir: this.sortDir },
            { key: "clientes:lista" }
          ),
        (resposta) => {
          this.table.setRows(resposta.rows.map((r) => ({ ...r, sistemasTexto: r.sistemas.join(", ") })));
          this.pagination.update(resposta);
          this.container.querySelector('[data-role="count"]').textContent = plural(resposta.total, "cliente");
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

  _limparFiltros() {
    this.busca = "";
    this.searchInput.value = "";
    this.botaoLimparFiltros.hidden = true;
    this.page = 1;
    this._salvarFiltros();
    this._reloadList();
  }

  _salvarFiltros() {
    prefs.set("clientes:filtros", { busca: this.busca, sortBy: this.sortBy, sortDir: this.sortDir });
  }

  _loadIntoForm(row) {
    this.selectedId = row.id;
    this.selectedRevision = row.revisao;
    this.fields.codigo.value = row.codigo || "";
    this.fields.nome.value = row.nome || "";
    this.fields.cidade.value = row.cidade || "";
    this.fields.grupo.value = row.grupo || "";
    const ativos = new Set(row.sistemas || []);
    for (const cb of this.sistemasGrid.querySelectorAll("input[type=checkbox]")) {
      cb.checked = ativos.has(cb.value);
    }
    this._pintarModo();
  }

  _pintarModo() {
    const isEdit = this.selectedId != null;
    if (this.addBtn) this.addBtn.hidden = isEdit;
    if (this.updateBtn) {
      this.updateBtn.hidden = !isEdit;
      this.updateBtn.disabled = !isEdit;
    }
    if (this.modalDeleteBtn) this.modalDeleteBtn.hidden = !isEdit || this.user?.role === "consulta";
    if (this.deleteBtn) this.deleteBtn.disabled = !isEdit;
    if (this.drawer) {
      if (isEdit) {
        this.drawer.setTitulo(`Editar Cliente #${this.selectedId}`, "Altere os dados e sistemas cadastrados deste cliente.");
      } else {
        this.drawer.setTitulo("Novo Cliente", "Cadastre um novo cliente e selecione seus sistemas.");
      }
    }
  }

  /** Abre a janela de acessos remotos (AnyDesk / Suporte Bredas) do cliente selecionado ou informado diretamente. */
  abrirAcessos(id = this.selectedId, nome = this.fields?.nome?.value?.trim()) {
    if (id == null) {
      Modal.alert("Seleção", "Selecione um cliente na tabela primeiro.", "warning");
      return;
    }
    new AcessosModal(this.api, { id, nome }, { role: this.user?.role }).open();
  }

  _readForm() {
    const nome = this.fields.nome.value.trim();
    if (!nome) {
      Modal.alert("Validação", "Campo 'Cliente' é obrigatório.", "warning");
      this.fields.nome.focus();
      return null;
    }
    const sistemas = [...this.sistemasGrid.querySelectorAll("input:checked")].map((el) => el.value);
    return {
      codigo: this.fields.codigo.value.trim(),
      nome,
      cidade: this.fields.cidade.value.trim(),
      grupo: this.fields.grupo.value.trim(),
      sistemas,
    };
  }

  _submit() {
    if (this.selectedId == null) this.addClient();
    else this.updateClient();
  }

  async addClient() {
    const data = this._readForm();
    if (!data) return;
    const liberar = marcarOcupado(this.addBtn);
    try {
      await this.api.post("/clientes", data);
      this.clearForm();
      this.drawer.marcarLimpa();
      await this.drawer.fechar({ forcar: true });
      this._invalidar();
      await this._reloadList();
      toast.success("Cliente adicionado.");
    } catch (err) {
      Modal.alert("Validação", errorMessage(err), "warning");
    } finally {
      liberar();
    }
  }

  async updateClient() {
    if (this.selectedId == null) {
      Modal.alert("Seleção", "Selecione um cliente na tabela primeiro.", "warning");
      return;
    }
    const data = this._readForm();
    if (!data) return;
    const liberar = marcarOcupado(this.updateBtn);
    try {
      await this.api.put(`/clientes/${this.selectedId}`, { ...data, revisao: this.selectedRevision });
      this.clearForm();
      this.drawer.marcarLimpa();
      await this.drawer.fechar({ forcar: true });
      this._invalidar();
      await this._reloadList();
      toast.success("Cliente atualizado.");
    } catch (err) {
      Modal.alert("Validação", errorMessage(err), "warning");
    } finally {
      liberar();
    }
  }

  /**
   * Excluir cliente CONTINUA pedindo confirmação, diferente de Atualizações e
   * Agendamentos. O motivo é a consequência: um cliente é referenciado pelo
   * nome em todo o histórico de atualizações e agendamentos, e a exclusão
   * afeta o Resumo e a Consulta inteiros. "Desfazer" recriaria o cadastro com
   * um id novo, o que não é o mesmo que nunca ter excluído.
   */
  async deleteClient() {
    if (this.selectedId == null) {
      Modal.alert("Seleção", "Selecione um cliente na tabela primeiro.", "warning");
      return;
    }
    const nome = this.fields.nome.value.trim();
    const ok = await Modal.confirm(
      "Excluir cliente",
      `Excluir "${nome}"?\n\nO histórico de atualizações deste cliente continua salvo, mas ele deixa de aparecer no Resumo e na Consulta.`,
      { confirmLabel: "Excluir" }
    );
    if (!ok) return;

    const liberar = marcarOcupado(this.deleteBtn);
    try {
      await this.api.delete(`/clientes/${this.selectedId}`);
      this.clearForm();
      this._invalidar();
      await this._reloadList();
      toast.success("Cliente excluído.");
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  _pintarBulk(chaves) {
    const n = chaves.length;
    this.bulkBar.hidden = n === 0;
    this.bulkCount.textContent = n === 0 ? "" : `${plural(n, "cliente")} ${n === 1 ? "selecionado" : "selecionados"}`;
    // Ver o comentário equivalente em AtualizacoesView._pintarBulk: evita os
    // dois botões de excluir (lote + avulso) na tela ao mesmo tempo.
    this.deleteBtn.hidden = n > 0;
  }

  /** Marca um sistema em todos os clientes selecionados de uma vez (idempotente: quem já tinha não muda). */
  async adicionarSistemaLote() {
    const ids = this.table.selecionadas.map(Number).filter(Number.isInteger);
    if (ids.length === 0) return;
    const sistema = this.bulkSistemaSelect.value;
    if (!sistema) {
      Modal.alert("Validação", "Cadastre um sistema no catálogo antes de aplicar em lote.", "warning");
      return;
    }

    const liberar = marcarOcupado(this.bulkAddSistema);
    try {
      const { afetados, total } = await this.api.post("/clientes/adicionar-sistema-lote", { ids, sistema });
      this.table.limparMarcadas();
      this._invalidar();
      await this._reloadList();
      toast.success(
        afetados === 0
          ? `Todos os ${plural(total, "cliente selecionado", "clientes selecionados")} já tinham "${sistema}".`
          : `"${sistema}" adicionado a ${plural(afetados, "cliente")}${afetados < total ? ` (${total - afetados} já tinha${total - afetados === 1 ? "" : "m"})` : ""}.`
      );
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  /**
   * Exclui todos os clientes marcados de uma vez. Sem "Desfazer", diferente
   * de Atualizações/Agendamentos -- ver o comentário em deleteClient() sobre
   * por que a exclusão de cliente já pedia confirmação: recriar perde o id
   * antigo e, agora, também os acessos remotos (AnyDesk/Suporte Bredas)
   * cadastrados, apagados junto por causa da chave estrangeira. Numa
   * exclusão em lote isso pesa ainda mais do que numa exclusão só.
   */
  async excluirLote() {
    const ids = this.table.selecionadas.map(Number).filter(Number.isInteger);
    if (ids.length === 0) return;

    const ok = await Modal.confirm(
      "Excluir clientes selecionados",
      `${plural(ids.length, "cliente")} ${ids.length === 1 ? "será excluído" : "serão excluídos"}, junto com os acessos remotos (AnyDesk/Suporte Bredas) cadastrados neles.\n\n` +
        "O histórico de atualizações continua salvo, mas eles deixam de aparecer no Resumo e na Consulta. Esta ação não pode ser desfeita pela tela.",
      { confirmLabel: "Excluir" }
    );
    if (!ok) return;

    const liberar = marcarOcupado(this.bulkExcluir);
    try {
      const { excluidos } = await this.api.post("/clientes/excluir-lote", { ids });
      this.table.limparMarcadas();
      this.clearForm();
      this._invalidar();
      await this._reloadList();
      toast.success(`${plural(excluidos, "cliente")} ${excluidos === 1 ? "excluído" : "excluídos"}.`);
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  clearForm({ comDesfazer = false } = {}) {
    const antes = {
      codigo: this.fields?.codigo?.value || "",
      nome: this.fields?.nome?.value || "",
      cidade: this.fields?.cidade?.value || "",
      grupo: this.fields?.grupo?.value || "",
      sistemas: this.sistemasGrid ? [...this.sistemasGrid.querySelectorAll("input:checked")].map((el) => el.value) : [],
    };
    const tinhaConteudo = Boolean(antes.nome.trim());

    this.selectedId = null;
    this.selectedRevision = null;
    this.table?.clearSelection();
    if (this.fields) {
      this.fields.codigo.value = "";
      this.fields.nome.value = "";
      this.fields.cidade.value = "";
      this.fields.grupo.value = "";
    }
    if (this.sistemasGrid) {
      for (const cb of this.sistemasGrid.querySelectorAll("input[type=checkbox]")) cb.checked = false;
    }
    this._pintarModo();

    if (comDesfazer && tinhaConteudo) {
      toast.undo("Formulário limpo.", () => {
        this.fields.codigo.value = antes.codigo;
        this.fields.nome.value = antes.nome;
        this.fields.cidade.value = antes.cidade;
        this.fields.grupo.value = antes.grupo;
        const ativos = new Set(antes.sistemas);
        for (const cb of this.sistemasGrid.querySelectorAll("input[type=checkbox]")) cb.checked = ativos.has(cb.value);
        this.fields.nome.focus();
      }, "Restaurar");
    }
  }

  destroy() {
    this.drawer?.destroy();
    this.grupoAutocomplete?.destroy();
    super.destroy();
  }

  _invalidar() {
    this.cache?.invalidar("clientes:");
    // O Resumo conta clientes e a Consulta lista nomes -- os dois ficam
    // desatualizados se este cache não for derrubado junto.
    this.cache?.invalidar("resumo");
    this.cache?.invalidar("consulta");
  }

  _onGlobalKeydown(e) {
    if (!this.visivel) return;
    if (isTypingTarget(e.target)) return;
    if (e.key === "Delete" && this.selectedId != null) this.deleteClient();
    else if (e.key.toLowerCase() === "n") { this.clearForm(); this.drawer.abrir({ foco: this.fields.nome }); }
    else if (e.key === "/") { e.preventDefault(); this.searchInput.focus(); }
    else if (e.key.toLowerCase() === "j") this.table.moverCursor(1);
    else if (e.key.toLowerCase() === "k") this.table.moverCursor(-1);
    else if (e.key.toLowerCase() === "e" || e.key === "Enter") { this.table.ativarCursor(); if (this.selectedId != null) this.drawer.abrir({ foco: this.fields.nome }); }
    else if (e.key.toLowerCase() === "x" || e.key === " ") { e.preventDefault(); this.table.alternarMarcacaoCursor(); }
  }
}

function acoesCliente(row, role) {
  const wrap = document.createElement("div");
  wrap.className = "row-actions";
  const botoes = [
    ["acessos", "acessos", "Acessos remotos"],
    ["ficha", "olho", "Abrir Ficha 360°"],
    ...(role === "consulta" ? [] : [["editar", "editar", "Editar"]]),
  ];
  for (const [acao, nomeIcone, titulo] of botoes) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "btn btn--icon btn--ghost";
    botao.dataset.rowAction = acao;
    botao.dataset.id = row.id;
    botao.title = titulo;
    botao.setAttribute("aria-label", titulo);
    botao.innerHTML = icon(nomeIcone);
    wrap.appendChild(botao);
  }
  return wrap;
}

function isTypingTarget(el) {
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function errorMessage(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
