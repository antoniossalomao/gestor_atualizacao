import { COLUMNS } from "../config.js";
import { ApiError } from "../api/ApiClient.js";
import { View } from "../core/View.js";
import { SortableTable } from "../core/SortableTable.js";
import { Pagination } from "../core/Pagination.js";
import { Autocomplete } from "../core/Autocomplete.js";
import { Modal } from "../core/Modal.js";
import { toast } from "../core/Toast.js";
import { debounce } from "../core/debounce.js";
import { todayBR, isValidDateBR } from "../core/date.js";
import { icon } from "../core/icons.js";
import { escapeHtml, plural } from "../core/html.js";
import { emptyState } from "../core/EmptyState.js";
import { withBusyButton, marcarOcupado } from "../core/guard.js";
import { prefs } from "../core/prefs.js";

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
    // Filtros restaurados da sessão: sair da aba e voltar não zera mais nada.
    const salvo = prefs.get("atualizacoes:filtros", {});
    this.page = 1;
    this.busca = salvo.busca || "";
    this.responsavel = salvo.responsavel || "Todos";
    this.sortBy = salvo.sortBy;
    this.sortDir = salvo.sortDir || "desc";
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = `
      <form class="card" data-role="form" novalidate>
        <h2 class="card__title">Registro</h2>
        <div class="form-grid form-grid--4" data-role="fields"></div>
        <div class="form-actions">
          <button type="submit" class="btn btn--accent" data-action="add">Adicionar</button>
          <button type="button" class="btn" data-action="update">Atualizar Selecionado</button>
          <button type="button" class="btn btn--ghost" data-action="clear">Limpar</button>
          <span class="form-actions__hint text-muted" data-role="modo"></span>
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
          <div class="toolbar__clear">
            <button type="button" class="btn btn--small btn--ghost" data-action="limpar-filtros" hidden>Limpar filtros</button>
          </div>
          <div class="toolbar-spacer"></div>
          <span class="result-count" data-role="count" aria-live="polite"></span>
        </div>
        <div data-role="table"></div>
        <div data-role="pagination"></div>
        <div class="form-actions" style="margin-top: var(--sp-4)">
          <button type="button" class="btn btn--danger" data-action="delete">Excluir Selecionado</button>
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
      ],
      onSelect: (row) => this._loadIntoForm(row),
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
      this._pintarLimparFiltros();
      reload();
    });
    this.responsavelFilter.addEventListener("change", () => {
      this.responsavel = this.responsavelFilter.value;
      this.page = 1;
      this._pintarLimparFiltros();
      this._salvarFiltros();
      this._reloadList();
    });
    this.botaoLimparFiltros.addEventListener("click", () => this._limparFiltros());

    this.addBtn = this.container.querySelector('[data-action="add"]');
    this.updateBtn = this.container.querySelector('[data-action="update"]');
    this.deleteBtn = this.container.querySelector('[data-action="delete"]');
    const exportBtn = this.container.querySelector('[data-action="export"]');

    // O submit nativo cobre o clique em "Adicionar" E o Enter em qualquer
    // campo -- antes era preciso amarrar o Enter campo por campo, na mão.
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this._submit();
    });
    this.updateBtn.addEventListener("click", () => this.updateRecord());
    this.container.querySelector('[data-action="clear"]').addEventListener("click", () => this.clearForm({ comDesfazer: true }));
    this.deleteBtn.addEventListener("click", () => this.deleteRecord());
    exportBtn.addEventListener("click", withBusyButton(exportBtn, () => this.exportXlsx()));

    const fileInput = this.container.querySelector('[data-role="file-input"]');
    this.container.querySelector('[data-action="import"]').addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) this.importXlsx(fileInput.files[0]);
      fileInput.value = "";
    });

    // `this.on` em vez de `document.addEventListener`: fica anotado e é
    // removido no destroy(). Era exatamente aqui que o listener vazava.
    this.on(document, "keydown", (e) => this._onGlobalKeydown(e));

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
    return `atualizacoes:lista:${this.busca}|${this.responsavel}|${this.page}|${this.sortBy}|${this.sortDir}`;
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
              page: this.page,
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

  _temFiltro() {
    return Boolean(this.busca) || this.responsavel !== "Todos";
  }

  _pintarLimparFiltros() {
    this.botaoLimparFiltros.hidden = !this._temFiltro();
  }

  _limparFiltros() {
    this.busca = "";
    this.responsavel = "Todos";
    this.searchInput.value = "";
    this.responsavelFilter.value = "Todos";
    this.page = 1;
    this._pintarLimparFiltros();
    this._salvarFiltros();
    this._reloadList();
  }

  _salvarFiltros() {
    prefs.set("atualizacoes:filtros", {
      busca: this.busca,
      responsavel: this.responsavel,
      sortBy: this.sortBy,
      sortDir: this.sortDir,
    });
  }

  _loadIntoForm(row) {
    this.selectedId = row.id;
    for (const col of COLUMNS) this.fields[col.key].value = row[col.key] ?? "";
    this._pintarModo();
  }

  /**
   * Chamado pela aba Agendamentos ao converter uma tarefa em Atualização
   * (botão "Converter em Atualização", ver AgendamentosView.converterEmAtualizacao)
   * -- pré-preenche um registro NOVO (não edita nada existente) com o que a
   * tarefa já tinha, pra não digitar tudo de novo.
   */
  aplicarParams({ cliente, responsavel, data, motivo, obs } = {}) {
    if (!cliente) return;
    this.clearForm();
    if (cliente) this.fields.cliente.value = cliente;
    if (responsavel) this.fields.responsavel.value = responsavel;
    if (data) this.fields.data.value = data;
    if (motivo) this.fields.motivo.value = motivo;
    if (obs) this.fields.obs.value = obs;
    this.fields.maquinas.focus();
  }

  /** Mostra em qual modo o formulário está -- criando algo novo, ou editando. */
  _pintarModo() {
    const modo = this.container.querySelector('[data-role="modo"]');
    modo.textContent = this.selectedId == null ? "" : `Editando o registro #${this.selectedId}`;
    this.updateBtn.disabled = this.selectedId == null;
    this.deleteBtn.disabled = this.selectedId == null;
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
      await this.api.put(`/atualizacoes/${this.selectedId}`, data);
      this.clearForm();
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
    this.table?.clearSelection();
    for (const col of COLUMNS) this.fields[col.key].value = "";
    this.fields.data.value = todayBR();
    // Melhoria em relação ao app original: já vem preenchido com quem está
    // logado (continua editável, caso outra pessoa tenha feito a atualização
    // em nome dela).
    if (this.user) this.fields.responsavel.value = this.user.nome;
    for (const hint of this.container.querySelectorAll(".field__hint")) hint.textContent = "";
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
    });
    downloadBlob(blob, `atualizacoes${this._temFiltro() ? "-filtrado" : ""}.xlsx`);
    toast.info(this._temFiltro() ? "Exportação concluída (com os filtros atuais)." : "Exportação concluída.");
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
    if (e.key !== "Delete") return;
    if (isTypingTarget(e.target)) return;
    if (this.selectedId != null) this.deleteRecord();
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

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function errorMessage(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
