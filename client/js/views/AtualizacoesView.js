import { COLUMNS } from "../config.js";
import { ApiError } from "../api/ApiClient.js";
import { View } from "../app/View.js";
import { SortableTable } from "../components/SortableTable.js";
import { Pagination } from "../components/Pagination.js";
import { Autocomplete } from "../components/Autocomplete.js";
import { Modal } from "../components/Modal.js";
import { toast } from "../components/Toast.js";
import { debounce } from "../utils/debounce.js";
import { todayBR, isValidDateBR, mascaraDataBR } from "../utils/date.js";
import { icon } from "../utils/icons.js";
import { escapeHtml, plural, copyToClipboard } from "../utils/html.js";
import { relatorioDeAtualizacao, relatorioDoCliente } from "../domain/relatorio.js";
import { emptyState } from "../components/EmptyState.js";
import { withBusyButton, marcarOcupado } from "../utils/guard.js";
import { baixarBlob } from "../utils/arquivo.js";
import { prefs } from "../app/prefs.js";
import { aparencia } from "../app/appearance.js";
import { Drawer } from "../components/Drawer.js";
import { montarPresets } from "../components/DatePresets.js";

/**
 * Aba Atualizações: histórico de atualizações de sistemas por cliente.
 * Cadastro, edição, busca, importação/exportação de planilha (.xlsx).
 * Equivalente de gestor/views/atualizacoes.py.
 *
 * O que mudou nesta revisão:
 *  - virou um `<form>` de verdade (submit nativo, validação do navegador);
 *  - `Escape` não destrói mais o que foi digitado sem volta: limpa e oferece
 *    "Desfazer" por alguns segundos;
 *  - excluir não pede confirmação modal -- exclui e oferece "Desfazer", que é
 *    a proteção que de fato protege (confirmação a gente clica no automático);
 *  - busca e filtro sobrevivem à troca de aba;
 *  - exportar respeita os filtros da tela;
 *  - o listener global de `Delete` é registrado por `this.on(...)` e some no
 *    `destroy()` -- antes vazava e podia excluir por uma tela fantasma.
 */
export class AtualizacoesView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.selectedId = null;
    this.selectedRow = null;
    // Filtros restaurados da sessão: sair da aba e voltar não zera mais nada.
    const salvo = prefs.get("atualizacoes:filtros", {});
    this.page = 1;
    this.busca = salvo.busca || "";
    this.responsavel = salvo.responsavel || "Todos";
    this.desde = salvo.desde || "";
    this.ate = salvo.ate || "";
    this.sortBy = salvo.sortBy;
    this.sortDir = salvo.sortDir || "desc";
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = `
      <div class="view-actions"><button type="button" class="btn btn--accent" data-action="nova-atualizacao">+ Nova Atualização</button></div>
      <form class="card" data-role="form" novalidate>
        <div class="form-grid form-grid--2" data-role="fields"></div>
        <div class="form-actions form-actions--modal">
          <div class="form-actions__left">
            <button type="button" class="btn btn--danger btn--ghost" data-action="modal-delete" hidden>${icon("alerta")} Excluir</button>
            <span class="form-actions__hint text-muted" data-role="modo"></span>
          </div>
          <div class="form-actions__right">
            <button type="button" class="btn btn--ghost" data-action="cancel">Cancelar</button>
            <button type="submit" class="btn btn--accent" data-action="add">Adicionar</button>
            <button type="button" class="btn btn--accent" data-action="update" hidden>Salvar Alterações</button>
          </div>
        </div>
      </form>

      <div class="card">
        <div class="toolbar">
          <div class="field">
            <label class="field__label" for="atu-busca">Buscar</label>
            <input type="search" class="input" id="atu-busca" data-role="search" placeholder="Cliente, sistema, responsável, motivo..." />
          </div>
          <div class="field">
            <label class="field__label" for="atu-resp">Responsável</label>
            <select class="input" id="atu-resp" data-role="responsavel-filter"><option>Todos</option></select>
          </div>
          <!-- Período. A busca era só texto livre + responsável, então "o que
               foi feito neste mês" -- provavelmente a pergunta mais comum de
               quem abre esta tela -- não tinha resposta a não ser rolar a
               lista inteira conferindo datas com o olho. -->
          <div class="field field--periodo">
            <label class="field__label" for="atu-desde">De</label>
            <input type="text" class="input" id="atu-desde" data-role="desde"
                   placeholder="dd/mm/aaaa" inputmode="numeric" />
          </div>
          <div class="field field--periodo">
            <label class="field__label" for="atu-ate">Até</label>
            <input type="text" class="input" id="atu-ate" data-role="ate"
                   placeholder="dd/mm/aaaa" inputmode="numeric" />
          </div>
          <div class="date-presets" data-role="date-presets" role="group" aria-label="Filtro rápido de período"></div>
          <div class="toolbar__clear">
            <button type="button" class="btn btn--small btn--ghost" data-action="limpar-filtros" hidden>Limpar filtros</button>
          </div>
          <div class="toolbar-spacer"></div>
          <span class="result-count" data-role="count" aria-live="polite"></span>
        </div>
        <div data-role="filter-chips" class="filter-chips" hidden></div>
        <!--
          Sem coluna de caixinhas, o Shift+clique não tem NENHUM indício visual
          na tabela -- é um gesto que ninguém adivinha sozinho. Esta linha é a
          única pista de que ele existe (a lista de atalhos, aberta com "?",
          também o documenta -- ver Shortcuts.js). Fica sempre visível, mas
          discreta: uma frase, não um card chamando atenção.
        -->
        <p class="text-muted bulk-hint">
          Dica: segure <kbd>Shift</kbd> e clique em duas linhas para selecionar tudo entre elas.
        </p>
        <!--
          Barra de lote. Só existe quando há algo marcado -- uma barra
          permanente dizendo "0 selecionados" com botões desligados ocuparia
          espaço o tempo todo para não oferecer nada na maior parte dele.
        -->
        <div class="bulk-bar" data-role="bulk" hidden>
          <span class="bulk-bar__count" data-role="bulk-count" aria-live="polite"></span>
          <button type="button" class="btn btn--small btn--ghost" data-action="bulk-limpar">Desmarcar</button>
          <div class="toolbar-spacer"></div>
          <button type="button" class="btn btn--small btn--danger" data-action="bulk-excluir">
            ${icon("alerta")} Excluir selecionados
          </button>
        </div>

        <div data-role="table"></div>
        <div data-role="pagination"></div>
        <div class="form-actions" style="margin-top: var(--sp-4)">
          <button type="button" class="btn btn--danger" data-action="delete">Excluir Selecionado</button>
          <button type="button" class="btn" data-action="relatorio">${icon("copiar")} Gerar Relatório</button>
          <button type="button" class="btn" data-action="import">${icon("upload")} Importar Planilha (.xlsx)</button>
          <button type="button" class="btn" data-action="export">${icon("download")} Exportar para .xlsx</button>
          <input type="file" accept=".xlsx,.xls" data-role="file-input" hidden />
        </div>
      </div>
    `;

    this._buildFields();

    this.table = new SortableTable(this.container.querySelector('[data-role="table"]'), {
      columns: [
        { key: "id", label: "ID", type: "numeric", largura: "70px" },
        ...COLUMNS.map((c) => ({ key: c.key, label: c.label, type: c.key === "data" ? "date" : "text" })),
        { key: "acoes", label: "Ações", largura: "136px", render: (row) => acoesAtualizacao(row, this.user?.role) },
      ],
      onSelect: (row) => this._loadIntoForm(row),
      // Seleção múltipla: esta é a tabela onde faz sentido: importar uma
      // planilha errada e precisar remover as sessenta linhas que entraram
      // significava sessenta ciclos de "clicar na linha, clicar em Excluir".
      multiSelect: true,
      onMultiSelect: (chaves) => this._pintarBulk(chaves),
      caption: "Atualizações registradas",
      emptyNode: () =>
        this._temFiltro()
          ? emptyState({
              titulo: "Nenhum registro com esse filtro",
              descricao: "Tente outro termo, ou limpe os filtros para ver tudo.",
              icone: "busca",
              acao: { label: "Limpar filtros", onClick: () => this._limparFiltros() },
            })
          : emptyState({
              titulo: "Nenhuma atualização registrada",
              descricao: "Preencha o formulário acima para registrar a primeira, ou importe uma planilha.",
              icone: "atualizacoes",
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
      titulo: "Atualização",
      descricao: "Registre um atendimento sem perder a lista de vista.",
    });
    this.container.querySelector('[data-action="nova-atualizacao"]').addEventListener("click", () => {
      this.clearForm();
      this.drawer.abrir({ foco: this.fields.cliente });
    });
    this.searchInput = this.container.querySelector('[data-role="search"]');
    this.responsavelFilter = this.container.querySelector('[data-role="responsavel-filter"]');
    this.botaoLimparFiltros = this.container.querySelector('[data-action="limpar-filtros"]');
    this.searchInput.value = this.busca;

    const reload = debounce(() => {
      this.page = 1;
      this._salvarFiltros();
      this._reloadList();
    }, 200);
    this.searchInput.addEventListener("input", () => {
      this.busca = this.searchInput.value.trim();
      this._trocouDeFiltro();
      reload();
    });
    this.responsavelFilter.addEventListener("change", () => {
      this.responsavel = this.responsavelFilter.value;
      this.page = 1;
      this._trocouDeFiltro();
      this._salvarFiltros();
      this._reloadList();
    });
    this.botaoLimparFiltros.addEventListener("click", () => this._limparFiltros());

    // -- período --
    this.desdeInput = this.container.querySelector('[data-role="desde"]');
    this.ateInput = this.container.querySelector('[data-role="ate"]');
    this.desdeInput.value = this.desde;
    this.ateInput.value = this.ate;

    // Uma data pela metade ("15/01/") não é filtro nenhum: enquanto não estiver
    // completa, o campo é simplesmente ignorado, em vez de a lista esvaziar e
    // reaparecer a cada tecla digitada.
    const aplicarPeriodo = debounce(() => {
      this.desde = isValidDateBR(this.desdeInput.value) ? this.desdeInput.value.trim() : "";
      this.ate = isValidDateBR(this.ateInput.value) ? this.ateInput.value.trim() : "";
      this.page = 1;
      this._trocouDeFiltro();
      this._salvarFiltros();
      this._reloadList();
    }, 300);
    for (const campo of [this.desdeInput, this.ateInput]) {
      campo.addEventListener("input", () => {
        campo.value = mascaraDataBR(campo.value);
        const vazio = !campo.value.trim();
        const invalido = !vazio && !isValidDateBR(campo.value);
        campo.setAttribute("aria-invalid", String(invalido));
        aplicarPeriodo();
      });
    }

    this.pintarPreset = montarPresets(this.container.querySelector('[data-role="date-presets"]'), (chave, intervalo) => {
      if (chave === "custom") {
        this.desdeInput.focus();
        this.pintarPreset("custom");
        return;
      }
      this.pintarPreset(chave);
      this._aplicarPeriodo(intervalo.desde, intervalo.ate);
    });

    this.table.container.addEventListener("click", (e) => {
      const botao = e.target.closest("[data-row-action]");
      if (!botao) return;
      const row = this.table.rows.find((item) => String(item.id) === botao.dataset.id);
      if (!row) return;
      this._loadIntoForm(row);
      if (botao.dataset.rowAction === "editar") this.drawer.abrir({ foco: this.fields.cliente });
      if (botao.dataset.rowAction === "relatorio") this.abrirRelatorio();
      if (botao.dataset.rowAction === "cliente") this.navigate("consulta", { cliente: row.cliente });
    });

    // -- lote --
    this.bulkBar = this.container.querySelector('[data-role="bulk"]');
    this.bulkCount = this.container.querySelector('[data-role="bulk-count"]');
    this.bulkExcluir = this.container.querySelector('[data-action="bulk-excluir"]');
    this.container.querySelector('[data-action="bulk-limpar"]').addEventListener("click", () => this.table.limparMarcadas());
    this.bulkExcluir.addEventListener("click", () => this.excluirLote());

    this.addBtn = this.form.querySelector('[data-action="add"]');
    this.updateBtn = this.form.querySelector('[data-action="update"]');
    this.relatorioBtn = this.container.querySelector('[data-action="relatorio"]');
    this.deleteBtn = this.container.querySelector('[data-action="delete"]');
    this.modalDeleteBtn = this.form.querySelector('[data-action="modal-delete"]');
    if (this.modalDeleteBtn) {
      this.modalDeleteBtn.addEventListener("click", async () => {
        this.drawer.marcarLimpa();
        await this.drawer.fechar({ forcar: true });
        this.deleteRecord();
      });
    }
    const exportBtn = this.container.querySelector('[data-action="export"]');

    // O submit nativo cobre o clique em "Adicionar" E o Enter em qualquer
    // campo -- antes era preciso amarrar o Enter campo por campo, na mão.
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this._submit();
    });
    this.updateBtn?.addEventListener("click", () => this.updateRecord());
    this.relatorioBtn?.addEventListener("click", () => this.abrirRelatorio());
    this.deleteBtn?.addEventListener("click", () => this.deleteRecord());
    exportBtn.addEventListener("click", withBusyButton(exportBtn, () => this.exportXlsx()));

    const fileInput = this.container.querySelector('[data-role="file-input"]');
    this.container.querySelector('[data-action="import"]').addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) this.importXlsx(fileInput.files[0]);
      fileInput.value = "";
    });

    this.on(document, "keydown", (e) => this._onGlobalKeydown(e));

    if (this.user?.role === "consulta") {
      this.form.hidden = true;
      this.container.querySelector('[data-action="nova-atualizacao"]').hidden = true;
      this.deleteBtn.hidden = true;
      this.bulkExcluir.hidden = true;
      const importBtn = this.container.querySelector('[data-action="import"]');
      if (importBtn) importBtn.hidden = true;
      const hint = this.container.querySelector(".bulk-hint");
      if (hint) hint.hidden = true;
    }

    this._pintarLimparFiltros();
    this.clearForm();
  }

  _buildFields() {
    const wrap = this.container.querySelector('[data-role="fields"]');
    this.fields = {};
    for (const col of COLUMNS) {
      const id = `atu-${col.key}`;
      const field = document.createElement("div");
      field.className = "field";
      if (col.key === "cliente" || col.key === "obs") field.classList.add("field--full");
      field.innerHTML = `<label class="field__label" for="${id}">${col.label}</label>`;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "input";
      input.id = id;
      input.name = col.key;
      input.dataset.key = col.key;
      if (col.key === "cliente") input.required = true;
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
    // Sugere nomes já usados no campo Responsável -- diferente de Cliente,
    // continua sendo texto livre (a mesma pessoa pode digitar um nome novo),
    // só ajuda a não escrever "Camila" de um jeito diferente cada vez.
    this.responsavelAutocomplete = new Autocomplete(this.fields.responsavel, { values: [] });
  }

  async refresh() {
    await this.swr(
      "atualizacoes:opcoes",
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
        const opcoes = ["Todos", ...responsaveis];
        this.responsavelFilter.innerHTML = opcoes.map((r) => `<option>${escapeHtml(r)}</option>`).join("");
        this.responsavelFilter.value = opcoes.includes(this.responsavel) ? this.responsavel : "Todos";
        this.responsavel = this.responsavelFilter.value;
      }
    );
    await this._reloadList();
  }

  _chaveLista() {
    return `atualizacoes:lista:${this.busca}|${this.responsavel}|${this.desde}|${this.ate}|${this.page}|${this.sortBy}|${this.sortDir}`;
  }

  async _reloadList() {
    this.table.setRefreshing(true);
    try {
      const resposta = await this.swr(
        this._chaveLista(),
        () =>
          this.api.get(
            "/atualizacoes",
            {
              search: this.busca,
              responsavel: this.responsavel,
              desde: this.desde,
              ate: this.ate,
              page: this.page,
              // Escolhido em Configurações. O servidor já aceitava `pageSize`
              // desde sempre (ver server/src/shared/pagination.js); o que
              // faltava era alguém oferecer a escolha.
              pageSize: aparencia.linhasPorPagina(),
              sortBy: this.sortBy,
              sortDir: this.sortDir,
            },
            // Chave de cancelamento: uma busca nova aborta a anterior, então a
            // resposta de "ab" nunca sobrescreve a de "abc".
            { key: "atualizacoes:lista" }
          ),
        (resposta) => this._pintarLista(resposta)
      );

      // Excluir o único registro de uma página que não é a primeira deixaria
      // essa página vazia (mesmo havendo resultados nas anteriores) -- volta
      // uma página sozinho, em vez de mostrar "nenhum registro" enganosamente.
      if (resposta && resposta.rows.length === 0 && this.page > 1 && resposta.total > 0) {
        this.page -= 1;
        return this._reloadList();
      }
    } finally {
      this.table.setRefreshing(false);
    }
  }

  _pintarLista(resposta) {
    this.table.setRows(resposta.rows);
    this.pagination.update(resposta);
    this.container.querySelector('[data-role="count"]').textContent = plural(resposta.total, "registro");
  }

  /**
   * Aplica um intervalo de fora (o botão "Este mês", ou o indicador do Resumo
   * via `aplicarParams`). Ponto único, para os três caminhos não divergirem.
   */
  _aplicarPeriodo(desde, ate) {
    this.desde = desde || "";
    this.ate = ate || "";
    this.desdeInput.value = this.desde;
    this.ateInput.value = this.ate;
    for (const campo of [this.desdeInput, this.ateInput]) campo.setAttribute("aria-invalid", "false");
    this.page = 1;
    this._trocouDeFiltro();
    this._salvarFiltros();
    this._reloadList();
  }

  /**
   * Chamado sempre que o CONJUNTO de resultados muda de significado.
   *
   * A marcação sobrevive à paginação de propósito -- marcar cinquenta linhas
   * espalhadas em três páginas e excluir tudo de uma vez é justamente para
   * isso que a seleção múltipla serve, e a barra mostra o total o tempo todo.
   * Mas ela NÃO pode sobreviver a uma troca de filtro: as linhas marcadas
   * saem da lista e continuam contando, e aí a pessoa apagaria registros que
   * não estão mais na tela e que ela nem lembra ter marcado.
   */
  _trocouDeFiltro() {
    this._pintarLimparFiltros();
    this.table?.limparMarcadas();
  }

  _temFiltro() {
    return Boolean(this.busca) || this.responsavel !== "Todos" || Boolean(this.desde) || Boolean(this.ate);
  }

  _pintarLimparFiltros() {
    this.botaoLimparFiltros.hidden = !this._temFiltro();
    const chipsEl = this.container.querySelector('[data-role="filter-chips"]');
    if (!chipsEl) return;

    const chips = [];
    if (this.busca) {
      chips.push({
        id: "busca",
        label: `Busca: "${this.busca}"`,
        clear: () => {
          this.busca = "";
          this.searchInput.value = "";
          this._trocouDeFiltro();
          this._salvarFiltros();
          this.page = 1;
          this._reloadList();
        },
      });
    }
    if (this.responsavel && this.responsavel !== "Todos") {
      chips.push({
        id: "responsavel",
        label: `Responsável: ${this.responsavel}`,
        clear: () => {
          this.responsavel = "Todos";
          this.responsavelFilter.value = "Todos";
          this._trocouDeFiltro();
          this._salvarFiltros();
          this.page = 1;
          this._reloadList();
        },
      });
    }
    if (this.desde || this.ate) {
      const periodoTexto =
        this.desde && this.ate
          ? `${this.desde} a ${this.ate}`
          : this.desde
          ? `A partir de ${this.desde}`
          : `Até ${this.ate}`;
      chips.push({
        id: "periodo",
        label: `Período: ${periodoTexto}`,
        clear: () => {
          this._aplicarPeriodo("", "");
        },
      });
    }

    if (chips.length === 0) {
      chipsEl.hidden = true;
      chipsEl.innerHTML = "";
      return;
    }

    chipsEl.hidden = false;
    chipsEl.innerHTML = chips
      .map(
        (c) =>
          `<span class="filter-chip"><span>${escapeHtml(c.label)}</span><button type="button" class="filter-chip__remove" data-chip="${c.id}" aria-label="Remover filtro">✕</button></span>`
      )
      .join("");

    chipsEl.querySelectorAll(".filter-chip__remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const found = chips.find((c) => c.id === btn.dataset.chip);
        found?.clear();
      });
    });
  }

  _limparFiltros() {
    this.busca = "";
    this.responsavel = "Todos";
    this.searchInput.value = "";
    this.responsavelFilter.value = "Todos";
    this._aplicarPeriodo("", "");
  }

  _salvarFiltros() {
    prefs.set("atualizacoes:filtros", {
      busca: this.busca,
      responsavel: this.responsavel,
      desde: this.desde,
      ate: this.ate,
      sortBy: this.sortBy,
      sortDir: this.sortDir,
    });
  }

  _loadIntoForm(row) {
    this.selectedId = row.id;
    // Guardado inteiro (e não só o id) porque o relatório sai DO REGISTRO
    // SALVO, não do que está digitado no formulário: quem abriu a linha,
    // mexeu num campo e não salvou continua recebendo o relatório do que de
    // fato está gravado, que é o que ele vai colar no chamado.
    this.selectedRow = row;
    this.selectedRevision = row.revisao;
    for (const col of COLUMNS) this.fields[col.key].value = row[col.key] ?? "";
    this._pintarModo();
  }

  /**
   * Chamado pela aba Agendamentos ao converter uma tarefa em Atualização
   * (botão "Converter em Atualização", ver AgendamentosView.converterEmAtualizacao)
   * -- pré-preenche um registro NOVO (não edita nada existente) com o que a
   * tarefa já tinha, pra não digitar tudo de novo.
   */
  aplicarParams({ cliente, responsavel, data, motivo, obs, desde, ate, novo } = {}) {
    // Vindo de um indicador do Resumo: não é para preencher formulário
    // nenhum, é para FILTRAR a lista pelo período que aquele número contava.
    if (desde || ate) {
      this._aplicarPeriodo(desde, ate);
      return;
    }
    if (novo) {
      this.clearForm();
      this.drawer.abrir({ foco: this.fields.cliente });
      return;
    }
    if (!cliente) return;
    this.clearForm();
    if (cliente) this.fields.cliente.value = cliente;
    if (responsavel) this.fields.responsavel.value = responsavel;
    if (data) this.fields.data.value = data;
    if (motivo) this.fields.motivo.value = motivo;
    if (obs) this.fields.obs.value = obs;
    this.drawer.abrir({ foco: this.fields.maquinas });
  }

  /** Mostra em qual modo o formulário está -- criando algo novo, ou editando. */
  _pintarModo() {
    const modo = this.form.querySelector('[data-role="modo"]');
    const isEdit = this.selectedId != null;
    if (modo) modo.textContent = isEdit ? `Registro #${this.selectedId}` : "";
    if (this.addBtn) this.addBtn.hidden = isEdit;
    if (this.updateBtn) {
      this.updateBtn.hidden = !isEdit;
      this.updateBtn.disabled = !isEdit;
    }
    if (this.modalDeleteBtn) this.modalDeleteBtn.hidden = !isEdit || this.user?.role === "consulta";
    if (this.relatorioBtn) this.relatorioBtn.disabled = !isEdit;
    if (this.deleteBtn) this.deleteBtn.disabled = !isEdit;
    if (this.drawer) {
      if (isEdit) {
        this.drawer.setTitulo(`Editar Atualização #${this.selectedId}`, "Altere os dados deste atendimento.");
      } else {
        this.drawer.setTitulo("Nova Atualização", "Registre um atendimento no histórico de clientes.");
      }
    }
  }

  _readForm() {
    const data = {};
    for (const col of COLUMNS) data[col.key] = this.fields[col.key].value.trim();
    if (!data.cliente) {
      Modal.alert("Validação", "Campo 'Cliente' é obrigatório.", "warning");
      this.fields.cliente.focus();
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
    if (this.selectedId == null) this.addRecord();
    else this.updateRecord();
  }

  async addRecord() {
    const data = this._readForm();
    if (!data) return;
    const liberar = marcarOcupado(this.addBtn);
    try {
      await this.api.post("/atualizacoes", data);
      this.clearForm();
      this.drawer.marcarLimpa();
      await this.drawer.fechar({ forcar: true });
      // Volta pra 1ª página: com a ordenação padrão (mais recente primeiro),
      // é onde o registro recém-criado aparece.
      this.page = 1;
      this._invalidar();
      await this._reloadList();
      toast.success("Registro adicionado.");
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  async updateRecord() {
    if (this.selectedId == null) {
      Modal.alert("Seleção", "Selecione um registro na tabela primeiro.", "warning");
      return;
    }
    const data = this._readForm();
    if (!data) return;
    const liberar = marcarOcupado(this.updateBtn);
    try {
      await this.api.put(`/atualizacoes/${this.selectedId}`, { ...data, revisao: this.selectedRevision });
      this.clearForm();
      this.drawer.marcarLimpa();
      await this.drawer.fechar({ forcar: true });
      this._invalidar();
      await this._reloadList();
      toast.success("Registro atualizado.");
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  /**
   * Exclui na hora e oferece "Desfazer" por alguns segundos.
   *
   * Trocamos o modal de confirmação por isto de propósito: confirmação em
   * toda exclusão vira reflexo (a pessoa clica "Confirmar" sem ler), então
   * ela custa um clique a mais em todas as vezes e não impede o engano
   * nenhuma. Desfazer custa zero quando você quis mesmo excluir, e resolve o
   * problema de verdade quando não quis.
   */
  async deleteRecord() {
    if (this.selectedId == null) {
      Modal.alert("Seleção", "Selecione um registro na tabela primeiro.", "warning");
      return;
    }
    const id = this.selectedId;
    const dadosAntes = {};
    for (const col of COLUMNS) dadosAntes[col.key] = this.fields[col.key].value.trim();

    const liberar = marcarOcupado(this.deleteBtn);
    try {
      await this.api.delete(`/atualizacoes/${id}`);
      this.clearForm();
      this._invalidar();
      await this._reloadList();
      toast.undo(`Registro de ${dadosAntes.cliente || "cliente"} excluído.`, async () => {
        try {
          await this.api.post("/atualizacoes", dadosAntes);
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

  _pintarBulk(chaves) {
    const n = chaves.length;
    this.bulkBar.hidden = n === 0;
    this.bulkCount.textContent = n === 0 ? "" : `${plural(n, "registro")} ${n === 1 ? "selecionado" : "selecionados"}`;
    // Um clique normal (sem Shift) continua carregando a linha no formulário
    // e habilitando "Excluir Selecionado" mesmo com um lote marcado ao lado
    // -- sem isto, os dois botões de excluir (o de lote e o avulso) ficavam
    // visíveis ao mesmo tempo, quase iguais, um risco real de clicar no
    // errado (visto rodando o app: aconteceu exatamente ao clicar uma linha
    // e depois Shift+clicar outra). Com o lote ativo, só o de lote aparece.
    this.deleteBtn.hidden = n > 0;
  }

  /**
   * Exclui todos os marcados de uma vez.
   *
   * Aqui a confirmação VOLTA, ao contrário da exclusão de um registro só (ver
   * o comentário em `deleteRecord` sobre por que "Desfazer" protege melhor que
   * "Confirmar"). O argumento se inverte quando o número cresce: um clique
   * errado em "Excluir selecionados" com quarenta linhas marcadas não é o
   * mesmo engano que apagar uma linha, e a confirmação aqui é rara o bastante
   * para não virar reflexo. O "Desfazer" continua existindo por cima disso --
   * são duas redes, não uma substituindo a outra.
   */
  async excluirLote() {
    const ids = this.table.selecionadas.map(Number).filter(Number.isInteger);
    if (ids.length === 0) return;

    const ok = await Modal.confirm(
      "Excluir selecionados",
      `${plural(ids.length, "registro")} ${ids.length === 1 ? "será excluído" : "serão excluídos"}.\n\n` +
        "Você ainda poderá desfazer nos segundos seguintes.",
      { confirmLabel: "Excluir", danger: true }
    );
    if (!ok) return;

    const liberar = marcarOcupado(this.bulkExcluir);
    try {
      // O servidor devolve os registros que apagou -- é com eles que o
      // "Desfazer" recria tudo. A tela não pode montar essa lista sozinha:
      // depois de "marcar todos da página" ela tem as chaves, mas não
      // necessariamente os dados completos de cada uma.
      const { excluidos, registros } = await this.api.post("/atualizacoes/excluir-lote", { ids });
      this.table.limparMarcadas();
      this.clearForm();
      this._invalidar();
      await this._reloadList();

      toast.undo(`${plural(excluidos, "registro")} ${excluidos === 1 ? "excluído" : "excluídos"}.`, async () => {
        try {
          // Um a um: não existe rota de criação em lote, e recriar é uma
          // operação rara o bastante para não valer uma. `id` sai fora --
          // o banco atribui um novo.
          for (const registro of registros) {
            const { id, ...dados } = registro;
            await this.api.post("/atualizacoes", dados);
          }
          this._invalidar();
          await this._reloadList();
          toast.success("Exclusão desfeita.");
        } catch {
          toast.error("Não foi possível desfazer tudo. Confira a lista.");
          this._invalidar();
          this._reloadList();
        }
      });
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  /**
   * @param {{comDesfazer?: boolean}} [opts] quando `true`, oferece restaurar
   *   o que estava digitado. `Escape` limpava oito campos sem volta.
   */
  clearForm({ comDesfazer = false } = {}) {
    const antes = {};
    let tinhaConteudo = false;
    if (this.fields) {
      for (const col of COLUMNS) {
        antes[col.key] = this.fields[col.key].value;
        if (col.key !== "data" && col.key !== "responsavel" && antes[col.key].trim()) tinhaConteudo = true;
      }
    }

    this.selectedId = null;
    this.selectedRow = null;
    this.selectedRevision = null;
    this.table?.clearSelection();
    for (const col of COLUMNS) this.fields[col.key].value = "";
    this.fields.data.value = todayBR();
    // Melhoria em relação ao app original: já vem preenchido com quem está
    // logado (continua editável, caso outra pessoa tenha feito a atualização
    // em nome dela).
    if (this.user) this.fields.responsavel.value = this.user.nome;
    for (const hint of this.form.querySelectorAll(".field__hint")) hint.textContent = "";
    this._pintarModo();

    if (comDesfazer && tinhaConteudo) {
      toast.undo("Formulário limpo.", () => {
        for (const col of COLUMNS) this.fields[col.key].value = antes[col.key];
        this.fields.cliente.focus();
      }, "Restaurar");
    }
  }

  async importXlsx(file) {
    const ok = await Modal.confirm(
      "Importar planilha",
      `Importar "${file.name}"?\n\nOs registros da planilha são acrescentados aos que já existem — nada é substituído.`,
      { confirmLabel: "Importar", danger: false }
    );
    if (!ok) return;

    try {
      const resultado = await this.api.postFile("/atualizacoes/import", file);
      this.page = 1;
      this._invalidar();
      await this._reloadList();

      let msg = `${plural(resultado.inserted, "registro")} importado(s).`;
      if (resultado.naoCadastrados.length > 0) {
        const exemplos = resultado.naoCadastrados.slice(0, 5).join(", ");
        const reticencias = resultado.naoCadastrados.length > 5 ? "..." : "";
        msg +=
          `\n\nAtenção: ${plural(resultado.naoCadastrados.length, "cliente")} da planilha não ` +
          `${resultado.naoCadastrados.length === 1 ? "está cadastrado" : "estão cadastrados"} na aba Clientes ` +
          `(${exemplos}${reticencias}). Esses registros foram salvos, mas não vão aparecer no Resumo nem na ` +
          "Consulta até o cliente ser cadastrado com o nome exatamente igual.";
        Modal.alert("Importar", msg, "warning");
      } else {
        toast.success(msg);
      }
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    }
  }

  /**
   * Exporta respeitando os filtros da tela. Antes exportava sempre a tabela
   * inteira: filtrar 12 registros na tela e receber um arquivo com 4.000 é
   * exatamente o oposto do que a pessoa pediu ao filtrar.
   */
  async exportXlsx() {
    const blob = await this.api.getFile("/atualizacoes/export", {
      search: this.busca,
      responsavel: this.responsavel,
      desde: this.desde,
      ate: this.ate,
    });
    baixarBlob(blob, `atualizacoes${this._temFiltro() ? "-filtrado" : ""}.xlsx`);
    toast.info(this._temFiltro() ? "Exportação concluída (com os filtros atuais)." : "Exportação concluída.");
  }

  /**
   * Abre o relatório da linha selecionada, pronto para colar num chamado.
   *
   * Os dois formatos (só esta atualização / histórico do cliente) são
   * montados de uma vez, da MESMA consulta: o histórico completo do cliente
   * serve aos dois -- é dele que sai também a "versão anterior" do relatório
   * individual, sem campo novo nenhum no cadastro. Trocar de formato dentro
   * do modal, portanto, não vai à rede.
   */
  async abrirRelatorio() {
    if (this.selectedId == null) {
      Modal.alert("Seleção", "Selecione um registro na tabela primeiro.", "warning");
      return;
    }
    const registro = this.selectedRow;
    const nome = registro.cliente;

    const liberar = marcarOcupado(this.relatorioBtn);
    try {
      const [cliente, historico] = await Promise.all([
        // Cliente não cadastrado na aba Clientes não é erro -- a importação de
        // planilha avisa que isso acontece, e o registro de atualização existe
        // do mesmo jeito. Vem nulo, e o relatório sai sem código nem cidade em
        // vez de não sair.
        this.api.get(`/clientes/by-nome/${encodeURIComponent(nome)}`, null, { key: "relatorio:cliente" }),
        this.api.get(
          `/atualizacoes/recent-by-client/${encodeURIComponent(nome)}`,
          { limit: "todas" },
          { key: "relatorio:historico" }
        ),
      ]);
      this._modalRelatorio(registro, cliente, historico);
    } catch (err) {
      if (err?.cancelled) return;
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  _modalRelatorio(registro, cliente, historico) {
    const registros = Array.isArray(historico) ? historico : [];
    const posicao = registros.findIndex((r) => r.id === registro.id);
    const textos = {
      atualizacao: relatorioDeAtualizacao(registro, {
        // O histórico vem do mais recente para o mais antigo, então a
        // atualização anterior é simplesmente a próxima da lista.
        anterior: posicao >= 0 ? registros[posicao + 1] : null,
      }),
      cliente: relatorioDoCliente(registro.cliente, registros, cliente),
    };

    const { box, close } = Modal.abrirCaixa({ largura: 640 });
    // Sufixo aleatório no `name` dos radios: dois relatórios abertos ao mesmo
    // tempo não deveriam acontecer, mas se acontecerem os grupos não se
    // misturam -- é o mesmo cuidado que Modal._open já toma com o id do título.
    const sufixo = Math.random().toString(36).slice(2, 8);
    const tituloId = `relatorio-titulo-${sufixo}`;
    box.setAttribute("aria-labelledby", tituloId);
    box.innerHTML = `
      <div class="relatorio">
        <h3 class="modal-box__title" id="${tituloId}">Relatório</h3>
        <div class="segmented" role="radiogroup" aria-label="Conteúdo do relatório">
          <label class="cfg-group__option">
            <input type="radio" name="rel-${sufixo}" value="atualizacao" checked />
            <span>Esta atualização</span>
          </label>
          <label class="cfg-group__option">
            <input type="radio" name="rel-${sufixo}" value="cliente" />
            <span>Histórico do cliente</span>
          </label>
        </div>
        <textarea class="input relatorio__texto" data-role="texto" readonly spellcheck="false"
                  aria-label="Texto do relatório"></textarea>
        <div class="modal-box__actions">
          <button type="button" class="btn" data-action="fechar">Fechar</button>
          <button type="button" class="btn btn--accent" data-action="copiar">Copiar</button>
        </div>
      </div>
    `;

    const area = box.querySelector('[data-role="texto"]');
    area.value = textos.atualizacao;
    for (const radio of box.querySelectorAll('input[type="radio"]')) {
      radio.addEventListener("change", () => {
        if (radio.checked) area.value = textos[radio.value];
      });
    }

    const copiar = box.querySelector('[data-action="copiar"]');
    copiar.addEventListener("click", async () => {
      if (await copyToClipboard(area.value)) {
        close();
        toast.success("Relatório copiado.");
        return;
      }
      // Sem área de transferência (pode acontecer em HTTP puro, ver
      // copyToClipboard) o modal FICA ABERTO, com o texto já selecionado:
      // fechar aqui jogaria fora a única cópia que a pessoa tem.
      area.focus();
      area.select();
      toast.error("Não foi possível copiar. O texto está selecionado — use Ctrl+C.");
    });
    box.querySelector('[data-action="fechar"]').addEventListener("click", () => close());
    copiar.focus();
  }

  _invalidar() {
    this.cache?.invalidar("atualizacoes:");
    // O Resumo e o inventário de versões contam atualizações: mudou aqui,
    // mudou lá. Invalidar de fora é o que mantém as abas coerentes entre si.
    this.cache?.invalidar("resumo");
    this.cache?.invalidar("versoes:");
  }

  _onGlobalKeydown(e) {
    if (!this.visivel) return;
    if (isTypingTarget(e.target)) return;
    if (e.key === "Delete" && this.selectedId != null) this.deleteRecord();
    else if (e.key.toLowerCase() === "n") this.container.querySelector('[data-action="nova-atualizacao"]')?.click();
    else if (e.key === "/") { e.preventDefault(); this.searchInput.focus(); }
    else if (e.key.toLowerCase() === "j") this.table.moverCursor(1);
    else if (e.key.toLowerCase() === "k") this.table.moverCursor(-1);
    else if (e.key.toLowerCase() === "e" || e.key === "Enter") { this.table.ativarCursor(); if (this.selectedId != null) this.drawer.abrir(); }
    else if (e.key.toLowerCase() === "x" || e.key === " ") { e.preventDefault(); this.table.alternarMarcacaoCursor(); }
    else if (e.key.toLowerCase() === "c" && this.selectedId != null) this.abrirRelatorio();
  }

  destroy() {
    this.drawer?.destroy();
    this.clienteAutocomplete?.destroy();
    this.responsavelAutocomplete?.destroy();
    super.destroy();
  }
}

function acoesAtualizacao(row, role) {
  const wrap = document.createElement("div");
  wrap.className = "row-actions";
  const botoes = [
    ["relatorio", "📋", "Copiar relatório"],
    ["cliente", "👤", "Abrir ficha do cliente"],
    ...(role === "consulta" ? [] : [["editar", "✏️", "Editar"]]),
  ];
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

/** Primeiro dia do mês corrente em dd/mm/aaaa -- o "de" do botão "Este mês". */
function primeiroDiaDoMes() {
  const hoje = new Date();
  return `01/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
}

function isTypingTarget(el) {
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function errorMessage(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
