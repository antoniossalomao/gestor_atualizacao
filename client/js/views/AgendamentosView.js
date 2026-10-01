import { ocuparAlturaDisponivel } from "../components/alturaDisponivel.js";
import { COLUNAS_AGENDAMENTOS, OPCOES_STATUS, FILTRO_ARQUIVADAS, OPCOES_PRIORIDADE } from "../config.js";
import { ErroApi } from "../api/ApiPainel.js";
import { View } from "../app/View.js";
import { CampoComSugestoes } from "../components/CampoComSugestoes.js";
import { Modal } from "../components/Modal.js";
import { avisoRapido } from "../components/AvisosRapidos.js";
import { aguardarPausa } from "../utils/aguardarPausa.js";
import { hojeBR, dataBRValida, mascaraDataBR } from "../utils/data.js";
import { estadoVazio } from "../components/estadoVazio.js";
import { plural, html } from "../utils/html.js";
import { iconeHtml } from "../utils/icones.js";
import { marcarOcupado } from "../components/botaoOcupado.js";
import { prefs } from "../app/preferencias.js";
import { Gaveta } from "../components/Gaveta.js";
import { STATUS_CONCLUIDO } from "../domain/agendamento.js";
import { colunasKanban } from "../templates/agendamentos.js";

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
    this._lastDragEnd = 0; // timestamp do último dragend -- distingue clique de drag
    const salvo = prefs.get("agendamentos:filtros", {});
    this.busca = salvo.busca || "";
    // "hoje" | "atrasadas" | "": os botões de filtro rápido, que o servidor
    // entende (AgendamentoRepository.list). Antes eles escreviam na BUSCA a
    // data de hoje ou "__atrasadas__", que o servidor procurava como texto --
    // e os dois voltavam sempre vazios. O que ficou guardado desse jeito no
    // navegador é convertido aqui, para ninguém abrir a aba com uma busca
    // por "__atrasadas__" (ou pela data de um dia que já passou).
    this.quando = salvo.quando || "";
    if (this.busca === "__atrasadas__") {
      this.busca = "";
      this.quando = "atrasadas";
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(this.busca)) {
      this.busca = "";
      this.quando = "hoje";
    }
    this.status = salvo.status || "Todos";
    this.prioridade = salvo.prioridade || "Todas";
    this.sortBy = salvo.sortBy;
    this.sortDir = salvo.sortDir || "asc";
    this.ordemColunas = this._carregarOrdemColunas();
    this._montarDom();
  }

  _carregarOrdemColunas() {
    const salva = prefs.get("agendamentos:colunas", OPCOES_STATUS);
    if (Array.isArray(salva)) {
      const validas = salva.filter((s) => OPCOES_STATUS.includes(s));
      for (const s of OPCOES_STATUS) {
        if (!validas.includes(s)) validas.push(s);
      }
      return validas;
    }
    return [...OPCOES_STATUS];
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
    this._desenharKanban(this.rows);
  }

  _montarDom() {
    this.container.innerHTML = html`
      <form class="card" data-role="form" novalidate>
        <div class="form-grid form-grid--2" data-role="fields"></div>
        <div class="form-actions form-actions--modal">
          <div class="form-actions__left">
            <button type="button" class="btn btn--danger" data-action="modal-delete" hidden>${iconeHtml("alerta")} Excluir</button>
            <button type="button" class="btn btn--small" data-action="modal-arquivar" hidden>Arquivar</button>
            <span class="form-actions__hint text-muted" data-role="modo"></span>
          </div>
          <div class="form-actions__right">
            <button type="button" class="btn btn--ghost" data-action="cancel">Cancelar</button>
            <button type="button" class="btn btn--ghost" data-action="modal-reabrir" hidden>${iconeHtml("atualizar")} Reabrir</button>
            <button type="button" class="btn btn--ghost" data-action="modal-done" hidden>${iconeHtml("check")} Concluir</button>
            <button type="submit" class="btn btn--accent" data-action="add">Adicionar Tarefa</button>
            <button type="button" class="btn btn--accent" data-action="update" hidden>Salvar Alterações</button>
          </div>
        </div>
      </form>

      <div class="card agendamentos-board-card">
        <!-- Toolbar: todos os controles na mesma barra -->
        <div class="toolbar">
          <div class="field">
            <label class="field__label" for="age-busca">Buscar</label>
            <input type="search" class="input" id="age-busca" data-role="search" placeholder="Tarefa, cliente, responsável..." />
          </div>
          <div class="field">
            <!-- id "age-filtro-*", e não "age-status": esse é o do campo do
                 formulário (ver _montarCampos). Com os dois iguais, o <label>
                 de um apontava para o outro e um dos <select> ficava sem nome
                 para o leitor de tela (achado pelo teste de navegador). -->
            <label class="field__label" for="age-filtro-status">Status</label>
            <select class="input" id="age-filtro-status" data-role="status-filter">
              <option>Todos</option>
              ${OPCOES_STATUS.map((s) => html`<option>${s}</option>`)}
              <option value="${FILTRO_ARQUIVADAS}">${FILTRO_ARQUIVADAS}</option>
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="age-filtro-prioridade">Prioridade</label>
            <select class="input" id="age-filtro-prioridade" data-role="prioridade-filter">
              <option value="Todas">Todas</option>
              ${OPCOES_PRIORIDADE.slice().reverse().map((p) => html`<option>${p}</option>`)}
            </select>
          </div>
          <div class="toolbar__clear">
            <button type="button" class="btn btn--small btn--ghost" data-action="limpar-filtros" hidden>Limpar filtros</button>
          </div>
          <div class="toolbar-spacer"></div>
          <span class="result-count" data-role="count" aria-live="polite"></span>
          <button type="button" class="btn btn--accent btn--small" data-action="novo-agendamento">+ Novo Agendamento</button>
        </div>

        <!-- Filtros rápidos discretos -->
        <div class="filtros-rapidos" data-role="filtros-rapidos" aria-label="Filtros rápidos">
          <button type="button" class="filtro-rapido" data-filtro-rapido="minhas">Minhas tarefas</button>
          <button type="button" class="filtro-rapido" data-filtro-rapido="hoje">Hoje</button>
          <button type="button" class="filtro-rapido" data-filtro-rapido="atrasadas">Atrasadas</button>
          <button type="button" class="filtro-rapido" data-filtro-rapido="arquivadas">Arquivadas</button>
        </div>

        <p class="text-muted bulk-hint" data-role="aviso-arquivadas" hidden></p>
        <div class="kanban-board" data-role="kanban"></div>
      </div>
    `;


    this._montarCampos();

    this.form = this.container.querySelector('[data-role="form"]');
    this.drawer = new Gaveta(this.form, {
      titulo: "Agendamento",
      descricao: "Crie ou edite a tarefa mantendo o quadro visível.",
    });

    this.kanban = this.container.querySelector('[data-role="kanban"]');
    ocuparAlturaDisponivel(this.kanban);
    this.container.querySelector('[data-action="novo-agendamento"]').addEventListener("click", () => {
      this.limparFormulario();
      this.drawer.abrir({ foco: this.fields.tarefa });
    });

    this.searchInput = this.container.querySelector('[data-role="search"]');
    this.statusFilter = this.container.querySelector('[data-role="status-filter"]');
    this.prioridadeFilter = this.container.querySelector('[data-role="prioridade-filter"]');
    this.botaoLimparFiltros = this.container.querySelector('[data-action="limpar-filtros"]');
    this.avisoArquivadas = this.container.querySelector('[data-role="aviso-arquivadas"]');
    this.searchInput.value = this.busca;
    this.statusFilter.value = this.status;
    if (this.prioridadeFilter) this.prioridadeFilter.value = this.prioridade;

    const reload = aguardarPausa(() => {
      this._salvarFiltros();
      this._recarregarLista();
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
      this._recarregarLista();
    });

    this.prioridadeFilter?.addEventListener("change", () => {
      this.prioridade = this.prioridadeFilter.value;
      this._pintarLimparFiltros();
      this._salvarFiltros();
      this._recarregarLista();
    });

    this.botaoLimparFiltros.addEventListener("click", () => this._limparFiltros());

    // -- Filtros rápidos --
    // Cada botão aplica um recorte semântico claro sem exigir que a pessoa
    // saiba qual campo ajustar. "Minhas tarefas" usa o nome do usuário logado;
    // "Hoje" / "Atrasadas" filtram pela data da tarefa. "Arquivadas" é um
    // alias do status especial que já existia no select.
    this.filtrosRapidosEl = this.container.querySelector('[data-role="filtros-rapidos"]');
    this.filtrosRapidosEl?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-filtro-rapido]");
      if (!btn) return;
      const tipo = btn.dataset.filtroRapido;
      const jaAtivo = btn.classList.contains("is-active");
      // Toggle: clicar no mesmo botão ativo limpa apenas aquele filtro
      if (jaAtivo) {
        this._limparFiltros();
        return;
      }
      this._limparFiltros();
      if (tipo === "minhas") {
        const nome = this.user?.nome || "";
        if (nome) {
          this.busca = nome;
          if (this.searchInput) this.searchInput.value = nome;
        }
      } else if (tipo === "hoje" || tipo === "atrasadas") {
        // Filtro do servidor, não texto na busca (ver `quando` no construtor).
        // "Atrasadas" usa a mesma regra do selo "Vencida" do cartão.
        this.quando = tipo;
      } else if (tipo === "arquivadas") {
        this.status = FILTRO_ARQUIVADAS;
        if (this.statusFilter) this.statusFilter.value = FILTRO_ARQUIVADAS;
      }
      this._pintarFiltrosRapidos();
      this._pintarLimparFiltros();
      this._salvarFiltros();
      this._recarregarLista();
    });

    this.addBtn = this.form.querySelector('[data-action="add"]');
    this.updateBtn = this.form.querySelector('[data-action="update"]');
    this.modalDeleteBtn = this.form.querySelector('[data-action="modal-delete"]');
    this.modalArquivarBtn = this.form.querySelector('[data-action="modal-arquivar"]');
    this.modalDoneBtn = this.form.querySelector('[data-action="modal-done"]');
    this.modalReabrirBtn = this.form.querySelector('[data-action="modal-reabrir"]');

    if (this.modalDeleteBtn) {
      this.modalDeleteBtn.addEventListener("click", async () => {
        this.drawer.marcarLimpa();
        await this.drawer.fechar({ forcar: true });
        this.excluirTarefa();
      });
    }

    this.modalArquivarBtn?.addEventListener("click", () => this.arquivar());

    if (this.modalDoneBtn) {
      this.modalDoneBtn.addEventListener("click", async () => {
        this.drawer.fechar({ forcar: true });
        await this.marcarConcluida();
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
      this._enviar();
    });
    this.updateBtn?.addEventListener("click", () => this.alterarTarefa());

    // Ações rápidas e drag-and-drop no quadro Kanban
    this.kanban.addEventListener("click", (e) => this._acaoRapida(e));
    this._ligarArrastarKanban();

    this.on(document, "keydown", (e) => this._aoTeclarGlobal(e));

    if (this.user?.role === "consulta") {
      this.form.hidden = true;
      this.container.querySelector('[data-action="novo-agendamento"]').hidden = true;
    }

    this._pintarLimparFiltros();
    this._pintarFiltrosRapidos();
    this.limparFormulario();
  }

  /**
   * Pinta qual filtro rápido está ativo (se houver), marcando com
   * `.is-active`. Apenas um pode estar ativo ao mesmo tempo.
   */
  _pintarFiltrosRapidos() {
    if (!this.filtrosRapidosEl) return;
    const btns = this.filtrosRapidosEl.querySelectorAll("[data-filtro-rapido]");
    let ativoTipo = null;
    if (this.status === FILTRO_ARQUIVADAS) ativoTipo = "arquivadas";
    else if (this.quando) ativoTipo = this.quando;
    else if (this.busca && this.user?.nome && this.busca === this.user.nome) ativoTipo = "minhas";
    for (const btn of btns) {
      btn.classList.toggle("is-active", btn.dataset.filtroRapido === ativoTipo);
    }
  }


  _montarCampos() {
    const wrap = this.container.querySelector('[data-role="fields"]');
    this.fields = {};
    for (const col of COLUNAS_AGENDAMENTOS) {
      const id = `age-${col.key}`;
      const field = document.createElement("div");
      field.className = "field";
      if (["tarefa", "cliente", "obs"].includes(col.key)) field.classList.add("field--full");
      field.innerHTML = html`<label class="field__label" for="${id}">${col.label}</label>`;

      let input;
      if (col.key === "status") {
        input = document.createElement("select");
        input.className = "input";
        input.innerHTML = html`${OPCOES_STATUS.map((s) => html`<option>${s}</option>`)}`;
      } else if (col.key === "prioridade") {
        input = document.createElement("select");
        input.className = "input";
        input.innerHTML = html`${OPCOES_PRIORIDADE.map((p) => html`<option>${p}</option>`)}`;
      } else if (col.key === "obs") {
        input = document.createElement("textarea");
        input.className = "input";
        input.rows = 2;
        input.style.resize = "vertical";
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
        if (e.key === "Escape") this.limparFormulario({ comDesfazer: true });
      });
      if (col.key === "data") {
        input.setAttribute("aria-describedby", hint.id);
        input.addEventListener("input", () => {
          input.value = mascaraDataBR(input.value);
          const invalida = Boolean(input.value) && !dataBRValida(input.value);
          hint.textContent = invalida ? "Formato esperado: dd/mm/aaaa" : "";
          input.setAttribute("aria-invalid", String(invalida));
        });
      }
      this.fields[col.key] = input;
    }
    this.clienteAutocomplete = new CampoComSugestoes(this.fields.cliente, { values: [] });
    this.responsavelAutocomplete = new CampoComSugestoes(this.fields.responsavel, { values: [] });
    this.sistemaAutocomplete = new CampoComSugestoes(this.fields.sistema, { values: [] });
  }

  _ligarArrastarKanban() {
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

    this.kanban.addEventListener("dragend", () => this._encerrarArrasto());

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
        // Encerrado aqui, e não só no dragend: o _moverCard redesenha o quadro
        // na hora, o cartão de origem sai do DOM, e o dragend -- que o
        // navegador dispara nesse cartão -- não sobe mais até o quadro. Sem
        // isto _draggedCardId ficava preso, e o próximo arrasto de COLUNA era
        // tratado como arrasto daquele cartão antigo.
        this._encerrarArrasto();
        if (cardId && novoStatus && novoStatus !== FILTRO_ARQUIVADAS) {
          this._moverCard(cardId, novoStatus);
        }
      } else if (this._draggedColStatus || e.dataTransfer.types.includes("application/x-kanban-column")) {
        const origemStatus = e.dataTransfer.getData("application/x-kanban-column") || this._draggedColStatus;
        const destinoStatus = col.dataset.status;
        this._encerrarArrasto();
        if (origemStatus && destinoStatus && origemStatus !== destinoStatus) {
          this._reordenarColunas(origemStatus, destinoStatus);
        }
      }
    });
  }

  _encerrarArrasto() {
    for (const c of this.kanban.querySelectorAll(".kanban-card.is-dragging")) {
      c.classList.remove("is-dragging");
    }
    for (const col of this.kanban.querySelectorAll(".kanban-column")) {
      col.classList.remove("is-drop-target");
      col.classList.remove("is-col-dragging");
      col.classList.remove("is-col-target");
    }
    this._draggedCardId = null;
    setTimeout(() => {
      this._isDragging = false;
      this._lastDragEnd = Date.now(); // registrado DEPOIS do timeout: clique falso jamais passa daqui
      this._draggedColStatus = null;
    }, 80);
  }

  async refresh() {
    await this.swr(
      "agendamentos:opcoes",
      async () => {
        const [nomes, responsaveis, sistemas] = await Promise.all([
          this.api.get("/clientes/names", null, { key: "clientes:names" }),
          this.api.get("/atualizacoes/responsaveis", null, { key: "atu:responsaveis" }),
          this.api.get("/sistemas", null, { key: "sistemas:lista" }),
        ]);
        return { nomes, responsaveis, sistemas };
      },
      ({ nomes, responsaveis, sistemas }) => {
        this.clienteAutocomplete.definirValores(nomes);
        this.responsavelAutocomplete.definirValores(responsaveis);
        this.sistemaAutocomplete?.definirValores(sistemas || []);
      }
    );
    await this._recarregarLista();
  }

  async _recarregarLista() {
    this.kanban.classList.add("is-refreshing");
    try {
      await this.swr(
        `agendamentos:lista:${this.busca}|${this.status}|${this.prioridade}|${this.quando}|200|${this.sortBy}|${this.sortDir}`,
        () =>
          this.api.get(
            "/agendamentos",
            {
              search: this.busca,
              status: this.status,
              prioridade: this.prioridade,
              quando: this.quando,
              page: 1,
              pageSize: 200,
              sortBy: this.sortBy,
              sortDir: this.sortDir,
            },
            { key: "agendamentos:lista" }
          ),
        (resposta) => {
          this.rows = resposta.rows || [];
          this._desenharKanban(this.rows);
          const countEl = this.container.querySelector('[data-role="count"]');
          if (countEl) countEl.textContent = plural(resposta.total, "tarefa");
          this._pintarArquivadas(resposta);
        }
      );
    } finally {
      this.kanban.classList.remove("is-refreshing");
    }
  }

  _desenharKanban(rows) {
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
          estadoVazio({
            titulo: "Nenhuma tarefa com esse filtro",
            descricao: "Tente outro termo ou limpe os filtros para ver o quadro completo.",
            icone: "busca",
            acao: { label: "Limpar filtros", onClick: () => this._limparFiltros() },
          })
        );
      } else {
        wrap.appendChild(
          estadoVazio({
            titulo: "Nenhuma tarefa agendada",
            descricao: "Crie a primeira tarefa para organizar o fluxo da equipe.",
            icone: "agendamentos",
            acao: {
              label: "+ Novo Agendamento",
              onClick: () => {
                this.limparFormulario();
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

  /** A marca\u00e7\u00e3o mora em templates/agendamentos.js, onde \u00e9 testada. */
  _gerarHtmlColunas(colunas) {
    return colunasKanban(colunas, this.user?.role);
  }

  async _moverCard(id, novoStatus) {
    const row = this.rows?.find((r) => String(r.id) === String(id));
    if (!row) return;
    if (row.status === novoStatus) return;

    const statusAnterior = row.status;
    // Atualização otimista imediata na UI
    row.status = novoStatus;
    this._desenharKanban(this.rows);

    try {
      // A resposta traz a `revisao` nova, e é o Object.assign que a guarda na
      // linha: sem isso a próxima mudança do mesmo cartão sai com a revisão
      // antiga e o servidor recusa com 409 (ver AgendamentoService.update).
      const atualizado = await this.api.put(`/agendamentos/${row.id}`, { ...row, status: novoStatus });
      if (atualizado) Object.assign(row, atualizado);
      this._invalidar();
      avisoRapido.sucesso(`Tarefa movida para "${novoStatus}".`);
    } catch (err) {
      row.status = statusAnterior;
      this._desenharKanban(this.rows);
      Modal.alert("Erro ao mover tarefa", mensagemDeErro(err), "error");
      // Num conflito de verdade (outra pessoa mexeu na tarefa), a linha local
      // está velha e continuaria recusada em toda tentativa até um F5. Recarregar
      // traz a revisão atual e o quadro volta a aceitar a mudança.
      if (err instanceof ErroApi && err.status === 409) {
        this._invalidar();
        await this._recarregarLista();
      }
    }
  }

  async _acaoRapida(e) {
    const botao = e.target.closest("[data-row-action]");
    if (botao) {
      e.stopPropagation();
      const row = this.rows?.find((item) => String(item.id) === botao.dataset.id);
      if (!row) return;
      this._carregarNoFormulario(row);
      if (botao.dataset.rowAction === "editar") this.drawer.abrir({ foco: this.fields.tarefa });
      if (botao.dataset.rowAction === "arquivar") await this.arquivar(botao);
      if (botao.dataset.rowAction === "concluir") await this._moverCard(row.id, STATUS_CONCLUIDO);
      if (botao.dataset.rowAction === "avancar") await this._avancar(row);
      if (botao.dataset.rowAction === "reabrir") await this.reabrir();
      return;
    }

    const card = e.target.closest(".kanban-card");
    // Ignora o clique se ele veio logo após um drag (janela de 300 ms).
    // _isDragging sozinho não basta: o click dispara APÓS o dragend,
    // quando _isDragging já pode ter sido resetado pelo setTimeout.
    const acabouDeDragar = Date.now() - this._lastDragEnd < 300;
    if (card && !acabouDeDragar) {
      const row = this.rows?.find((item) => String(item.id) === card.dataset.id);
      if (row) {
        this._carregarNoFormulario(row);
        this.drawer.abrir({ foco: this.fields.tarefa });
      }
    }
  }

  async _avancar(row) {
    const indice = OPCOES_STATUS.indexOf(row.status);
    if (indice < 0 || indice >= OPCOES_STATUS.length - 1) return;
    const proximo = OPCOES_STATUS[indice + 1];
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
          `Clique em "Reabrir" em qualquer cartão para trazê-lo de volta como "${OPCOES_STATUS[0]}".`;
      }
    }
  }

  _temFiltro() {
    return Boolean(this.busca) || this.status !== "Todos" || this.prioridade !== "Todas" || Boolean(this.quando);
  }

  _pintarLimparFiltros() {
    if (this.botaoLimparFiltros) this.botaoLimparFiltros.hidden = !this._temFiltro();
  }

  _limparFiltros() {
    this.busca = "";
    this.status = "Todos";
    this.prioridade = "Todas";
    this.quando = "";
    if (this.searchInput) this.searchInput.value = "";
    if (this.statusFilter) this.statusFilter.value = "Todos";
    if (this.prioridadeFilter) this.prioridadeFilter.value = "Todas";
    this._pintarLimparFiltros();
    this._pintarFiltrosRapidos();
    this._salvarFiltros();
    this._recarregarLista();
  }

  _salvarFiltros() {
    prefs.set("agendamentos:filtros", {
      busca: this.busca,
      status: this.status,
      prioridade: this.prioridade,
      quando: this.quando,
      sortBy: this.sortBy,
      sortDir: this.sortDir,
    });
  }

  _carregarNoFormulario(row) {
    this.selectedId = row.id;
    this.selectedRevision = row.revisao;
    for (const col of COLUNAS_AGENDAMENTOS) {
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
    if (this.modalArquivarBtn) this.modalArquivarBtn.hidden =
      !isEdit || this.user?.role === "consulta" || this.fields?.status?.value !== STATUS_CONCLUIDO || this.status === FILTRO_ARQUIVADAS;
    if (this.modalDoneBtn) {
      this.modalDoneBtn.hidden =
        !isEdit || this.user?.role === "consulta" || this.fields?.status?.value === STATUS_CONCLUIDO || this.status === FILTRO_ARQUIVADAS;
    }
    if (this.modalReabrirBtn) this.modalReabrirBtn.hidden = !isEdit || this.user?.role === "consulta" || this.status !== FILTRO_ARQUIVADAS;

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
      this.limparFormulario();
      this._invalidar();
      await this._recarregarLista();
      avisoRapido.sucesso(`"${tarefa.tarefa}" voltou para a lista como "${OPCOES_STATUS[0]}".`);
    } catch (err) {
      Modal.alert("Erro", mensagemDeErro(err), "error");
    } finally {
      liberar();
    }
  }

  aplicarParams({ cliente, novo, filtro, status } = {}) {
    if (status !== undefined) {
      this.status = status;
      if (this.statusFilter) this.statusFilter.value = status;
      this._recarregarLista();
    }
    if (filtro !== undefined) {
      this.busca = filtro;
      if (this.searchInput) this.searchInput.value = filtro;
      this._recarregarLista();
    }
    if (novo) {
      this.limparFormulario();
      this.drawer.abrir({ foco: this.fields.cliente });
    } else if (cliente) {
      this.limparFormulario();
      if (this.fields.cliente) {
        this.fields.cliente.value = cliente;
        this.drawer.abrir({ foco: this.fields.tarefa });
      }
    }
  }

  _lerFormulario() {
    const dados = {};
    for (const col of COLUNAS_AGENDAMENTOS) dados[col.key] = this.fields[col.key].value.trim();
    if (!dados.tarefa) {
      Modal.alert("Validação", "Campo 'Tarefa' é obrigatório.", "warning").then(() => this.fields.tarefa.focus());
      return null;
    }
    if (!dataBRValida(dados.data)) {
      Modal.alert("Validação", "Campo 'Data' precisa estar no formato dd/mm/aaaa.", "warning").then(() => this.fields.data.focus());
      return null;
    }
    return dados;
  }

  _enviar() {
    if (this.selectedId == null) this.adicionarTarefa();
    else this.alterarTarefa();
  }

  async adicionarTarefa() {
    const dados = this._lerFormulario();
    if (!dados) return;
    const liberar = marcarOcupado(this.addBtn);
    try {
      await this.api.post("/agendamentos", dados);
      this.limparFormulario();
      this.drawer.marcarLimpa();
      await this.drawer.fechar({ forcar: true });
      this._invalidar();
      await this._recarregarLista();
      avisoRapido.sucesso("Tarefa adicionada.");
    } catch (err) {
      Modal.alert("Erro", mensagemDeErro(err), "error");
    } finally {
      liberar();
    }
  }

  async alterarTarefa() {
    if (this.selectedId == null) return;
    const dados = this._lerFormulario();
    if (!dados) return;
    const liberar = marcarOcupado(this.updateBtn);
    try {
      await this.api.put(`/agendamentos/${this.selectedId}`, { ...dados, revisao: this.selectedRevision });
      this.limparFormulario();
      this.drawer.marcarLimpa();
      await this.drawer.fechar({ forcar: true });
      this._invalidar();
      await this._recarregarLista();
      avisoRapido.sucesso("Tarefa atualizada.");
    } catch (err) {
      Modal.alert("Erro", mensagemDeErro(err), "error");
    } finally {
      liberar();
    }
  }

  async excluirTarefa() {
    if (this.selectedId == null) return;
    const id = this.selectedId;
    const dadosAntes = {};
    for (const col of COLUNAS_AGENDAMENTOS) dadosAntes[col.key] = this.fields[col.key].value.trim();

    try {
      await this.api.delete(`/agendamentos/${id}`);
      this.limparFormulario();
      this._invalidar();
      await this._recarregarLista();
      avisoRapido.desfazer(`Tarefa "${dadosAntes.tarefa}" excluída.`, async () => {
        try {
          await this.api.post("/agendamentos", dadosAntes);
          this._invalidar();
          await this._recarregarLista();
          avisoRapido.sucesso("Exclusão desfeita.");
        } catch {
          avisoRapido.erro("Não foi possível desfazer a exclusão.");
        }
      });
    } catch (err) {
      Modal.alert("Erro", mensagemDeErro(err), "error");
    }
  }

  async marcarConcluida() {
    if (this.selectedId == null) return;
    await this._moverCard(this.selectedId, STATUS_CONCLUIDO);
  }

  async arquivar(botao = this.modalArquivarBtn) {
    if (this.selectedId == null) return;
    if (this.user?.role === "consulta" || this.status === FILTRO_ARQUIVADAS) return;
    if (botao.disabled) return;
    if (this.fields.status.value !== STATUS_CONCLUIDO) {
      Modal.alert("Arquivar", `Só é possível arquivar tarefas "${STATUS_CONCLUIDO}".`, "warning");
      return;
    }
    const liberar = marcarOcupado(botao);
    try {
      await this.api.patch(`/agendamentos/${this.selectedId}/arquivar`);
      this.limparFormulario();
      this.drawer.marcarLimpa();
      await this.drawer.fechar({ forcar: true });
      this._invalidar();
      await this._recarregarLista();
      avisoRapido.sucesso("Tarefa arquivada.");
    } catch (err) {
      Modal.alert("Erro", mensagemDeErro(err), "error");
    } finally {
      liberar();
    }
  }

  limparFormulario({ comDesfazer = false } = {}) {
    const antes = {};
    let tinhaConteudo = false;
    if (this.fields) {
      for (const col of COLUNAS_AGENDAMENTOS) {
        antes[col.key] = this.fields[col.key]?.value || "";
        if (["tarefa", "cliente"].includes(col.key) && antes[col.key].trim()) tinhaConteudo = true;
      }
    }

    this.selectedId = null;
    this.selectedRevision = null;
    if (this.fields) {
      for (const col of COLUNAS_AGENDAMENTOS) {
        if (this.fields[col.key]) this.fields[col.key].value = "";
      }
      if (this.fields.data) this.fields.data.value = hojeBR();
      if (this.fields.status) this.fields.status.value = OPCOES_STATUS[0];
      if (this.user && this.fields.responsavel) this.fields.responsavel.value = this.user.nome || "";
    }
    if (this.form) {
      for (const hint of this.form.querySelectorAll(".field__hint")) hint.textContent = "";
    }
    this._pintarModo();

    if (comDesfazer && tinhaConteudo) {
      avisoRapido.desfazer(
        "Formulário limpo.",
        () => {
          for (const col of COLUNAS_AGENDAMENTOS) this.fields[col.key].value = antes[col.key];
          this.fields.tarefa.focus();
        },
        "Restaurar"
      );
    }
  }

  _invalidar() {
    this.cache?.invalidar("agendamentos:");
  }

  _aoTeclarGlobal(e) {
    if (!this.visivel) return;
    if (ehCampoDeTexto(e.target)) return;
    if (e.key === "Delete" && this.selectedId != null) this.excluirTarefa();
    else if (e.key.toLowerCase() === "n") this.container.querySelector('[data-action="novo-agendamento"]')?.click();
    else if (e.key === "/") {
      e.preventDefault();
      this.searchInput.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      const card = e.target.closest(".kanban-card");
      if (card && e.target === card) {
        e.preventDefault();
        const row = this.rows?.find((item) => String(item.id) === card.dataset.id);
        if (row) {
          this._carregarNoFormulario(row);
          this.drawer.abrir({ foco: this.fields.tarefa });
        }
      }
    }
  }

  destroy() {
    this.drawer?.destroy();
    this.clienteAutocomplete?.destroy();
    this.responsavelAutocomplete?.destroy();
    this.sistemaAutocomplete?.destroy();
    super.destroy();
  }
}

function ehCampoDeTexto(el) {
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function mensagemDeErro(err) {
  return err instanceof ErroApi ? err.message : "Ocorreu um erro inesperado.";
}
