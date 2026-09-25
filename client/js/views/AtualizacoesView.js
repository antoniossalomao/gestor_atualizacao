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
import { icon, iconHtml } from "../utils/icons.js";
import { html, plural, copyToClipboard } from "../utils/html.js";
import { abrirRelatorio } from "../components/RelatorioModal.js";
import { relatorioDeAtualizacao, relatorioDoCliente, relatorioSituacao, relatorioDoPeriodo, versaoRegistrada } from "../domain/relatorio.js";
import { splitSistemas } from "../domain/matrizVersoes.js";
import { emptyState } from "../components/EmptyState.js";
import { withBusyButton, marcarOcupado } from "../utils/guard.js";
import { baixarBlob } from "../utils/arquivo.js";
import { prefs } from "../app/prefs.js";
import { aparencia } from "../app/appearance.js";
import { Drawer } from "../components/Drawer.js";
import { montarPresets, intervaloPreset } from "../components/DatePresets.js";
import { chipsFiltroAtualizacoes, htmlChips } from "../templates/filtros.js";

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
    const salvo = prefs.get("atualizacoes:filtros", null) || {};
    // Sem filtro guardado (primeira visita da sessão, ou "lembrar filtros"
    // desligado), a tela abre no período escolhido em Configurações >
    // Navegação. Com filtro guardado, é ele que manda: quem limpou a data de
    // propósito não quer vê-la voltar só porque trocou de aba e voltou.
    const semFiltroGuardado = Object.keys(salvo).length === 0;
    this.presetInicial = semFiltroGuardado ? aparencia.periodoAtualizacoes() : "";
    const periodoInicial = this.presetInicial ? intervaloPreset(this.presetInicial) : null;
    this.page = 1;
    this.busca = salvo.busca || "";
    this.responsavel = salvo.responsavel || "Todos";
    this.desde = salvo.desde || periodoInicial?.desde || "";
    this.ate = salvo.ate || periodoInicial?.ate || "";
    this.sortBy = salvo.sortBy;
    this.sortDir = salvo.sortDir || "desc";
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = html`
      <div class="view-actions">
        <div class="view-actions__left">
          <button type="button" class="btn" data-action="import">${iconHtml("upload")} Importar (.xlsx)</button>
          <button type="button" class="btn" data-action="export">${iconHtml("download")} Exportar (.xlsx)</button>
          <button type="button" class="btn btn--ghost" data-action="relatorio-periodo">Relatório do período</button>
          <button type="button" class="btn btn--ghost" data-action="relatorio" disabled>${iconHtml("copiar")} Relatório do Cliente</button>
          <button type="button" class="btn btn--danger" data-action="delete" disabled>${iconHtml("alerta")} Excluir</button>
          <input type="file" accept=".xlsx,.xls" data-role="file-input" hidden />
        </div>
        <div class="view-actions__right">
          <button type="button" class="btn btn--accent" data-action="nova-atualizacao">+ Nova Atualização</button>
        </div>
      </div>
      <form class="card" data-role="form" novalidate>
        <div class="form-grid form-grid--2" data-role="fields"></div>
        <div class="form-actions form-actions--modal">
          <div class="form-actions__left">
            <button type="button" class="btn btn--danger" data-action="modal-delete" hidden>${iconHtml("alerta")} Excluir</button>
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
            ${iconHtml("alerta")} Excluir selecionados
          </button>
        </div>

        <div data-role="table"></div>
        <div data-role="pagination"></div>
      </div>
    `;

    this._buildFields();

    // Larguras ajustadas para caber sem rolamento horizontal (ver
    // CHANGELOG): "máquinas" e "ações" estavam estreitas demais para o
    // próprio conteúdo -- "MÁQUINAS" cortava no meio, e 3 botões de 26px
    // mais o padding da célula passavam dos 86px reservados, encostando na
    // barra de rolagem. "obs" ocupava quase um quarto da tabela para
    // exibir, na prática, poucas palavras.
    const LARGURAS_ATUALIZACAO = {
      id: "46px",
      cliente: "20%",
      sistema: "16%",
      versao: "82px",
      responsavel: "132px",
      data: "78px",
      motivo: "105px",
      maquinas: "92px",
      obs: "11%",
      acoes: "104px",
    };

    this.table = new SortableTable(this.container.querySelector('[data-role="table"]'), {
      columns: [
        { key: "id", label: "ID", type: "numeric", largura: LARGURAS_ATUALIZACAO.id },
        ...COLUMNS.map((c) => ({
          key: c.key,
          label: c.label,
          type: c.key === "data" ? "date" : "text",
          largura: LARGURAS_ATUALIZACAO[c.key],
          // A célula é estreita demais para o resumo de vários sistemas
          // ("B_Vendas: 09/09/2026; B_NFe: 02/09/2026"), que cortava no meio.
          // Mostra só a versão do primeiro sistema listado -- geralmente uma
          // data só, do mesmo jeito que um atendimento de um sistema só
          // sempre apareceu aqui. O resumo inteiro continua no title (hover)
          // e no relatório/edição, que têm espaço para ele.
          ...(c.key === "versao" ? { render: (row) => versaoResumida(row) } : {}),
        })),
        { key: "acoes", label: "Ações", largura: LARGURAS_ATUALIZACAO.acoes, render: (row) => acoesAtualizacao(row, this.user?.role) },
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
    if (this.presetInicial) this.pintarPreset(this.presetInicial);

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
    this.container.querySelector('[data-action="relatorio-periodo"]').addEventListener("click", () => this.abrirRelatorioPeriodo());
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
      field.innerHTML = html`<label class="field__label" for="${id}">${col.label}</label>`;
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
        this.responsavelFilter.innerHTML = html`${opcoes.map((r) => html`<option>${r}</option>`)}`;
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

    // Quais chips e com que rótulo: templates/filtros.js (testado lá). Aqui
    // fica só o que cada um faz ao ser removido, porque isso mexe na tela.
    const chips = chipsFiltroAtualizacoes(this);
    if (chips.length === 0) {
      chipsEl.hidden = true;
      chipsEl.innerHTML = "";
      return;
    }

    const limpar = {
      busca: () => {
        this.busca = "";
        this.searchInput.value = "";
        this._trocouDeFiltro();
        this._salvarFiltros();
        this.page = 1;
        this._reloadList();
      },
      responsavel: () => {
        this.responsavel = "Todos";
        this.responsavelFilter.value = "Todos";
        this._trocouDeFiltro();
        this._salvarFiltros();
        this.page = 1;
        this._reloadList();
      },
      periodo: () => this._aplicarPeriodo("", ""),
    };

    chipsEl.hidden = false;
    chipsEl.innerHTML = htmlChips(chips);
    chipsEl.querySelectorAll(".filter-chip__remove").forEach((btn) => {
      btn.addEventListener("click", () => limpar[btn.dataset.chip]?.());
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

  /** Aplica o período vindo do Resumo ou abre um novo atendimento. */
  aplicarParams({ desde, ate, novo } = {}) {
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
  }

  /** Mostra em qual modo o formulário está -- criando algo novo, ou editando. */
  _pintarModo() {
    const modo = this.form.querySelector('[data-role="modo"]');
    const isEdit = this.selectedId != null;
    this.fields.versao.readOnly = !isEdit || this.selectedRow?.versoes_sistemas != null;
    this.fields.versao.placeholder = "Preenchida com as versões oficiais ao salvar";
    this.form.querySelector("#atu-versao-hint").textContent = isEdit
      ? "As versões recebidas são preservadas. Um novo atendimento deve ser registrado como nova atualização."
      : "Cada sistema informado recebe sua versão oficial cadastrada em Sistemas. Sem referência, a versão fica não informada.";
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
    const dadosAntes = { ...this.selectedRow, restaurarVersoes: true };

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
            await this.api.post("/atualizacoes", { ...dados, restaurarVersoes: true });
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
      const [situacao, cliente, historico] = await Promise.all([
        this.api.get(`/atualizacoes/situacao-cliente/${encodeURIComponent(nome)}`),
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
      this._modalRelatorio(registro, cliente, historico, situacao);
    } catch (err) {
      if (err?.cancelled) return;
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      liberar();
    }
  }

  async abrirRelatorioPeriodo() {
    try {
      const resumo = await this.api.get("/atualizacoes/relatorio", { search: this.busca, responsavel: this.responsavel, desde: this.desde, ate: this.ate });
      abrirRelatorio({ tipos: [{ valor: "periodo", nome: "Resumo do período filtrado" }], gerar: () => relatorioDoPeriodo(resumo) });
    } catch (err) { Modal.alert("Erro", errorMessage(err), "error"); }
  }

  _modalRelatorio(registro, cliente, historico, situacao) {
    const registros = Array.isArray(historico) ? historico : [];
    const posicao = registros.findIndex((r) => r.id === registro.id);
    const anteriores = posicao >= 0 ? registros.slice(posicao + 1) : [];
    const sistemas = String(registro.sistema || "").split(/,|\s+e\s+/i).map((s) => s.trim());
    const mapa = Object.fromEntries(sistemas.map((sistema) => {
      const anterior = anteriores.find((r) => String(r.sistema || "").split(/,|\s+e\s+/i).some((s) => s.trim().toLowerCase() === sistema.toLowerCase()));
      const versoes = anterior?.versoes_sistemas ? JSON.parse(anterior.versoes_sistemas) : null;
      return [sistema, versoes ? versoes[sistema] : anterior && String(anterior.sistema).split(/,|\s+e\s+/i).length === 1 ? anterior.versao : null];
    }));
    abrirRelatorio({
      tipos: [{ valor: "atualizacao", nome: "Atendimento selecionado" }, { valor: "cliente", nome: "Situação e histórico do cliente" }],
      periodo: true,
      gerar: (tipo, { desde, ate }) => {
        if (tipo === "atualizacao") return relatorioDeAtualizacao(registro, { cliente, anterior: { sistema: sistemas.length === 1 ? sistemas[0] : "", versao: sistemas.length === 1 ? mapa[sistemas[0]] : "", versoes_sistemas: JSON.stringify(mapa) } });
        const filtrados = registros.filter((r) => {
          const iso = r.data?.split("/").reverse().join("-");
          return (!desde && !ate) || (iso && (!desde || iso >= desde) && (!ate || iso <= ate));
        });
        const intervalo = desde || ate ? `\n\nHistórico: ${desde ? desde.split("-").reverse().join("/") : "Início"} até ${ate ? ate.split("-").reverse().join("/") : "Sem limite"}` : "";
        return `CLIENTE — ${registro.cliente}\n${[cliente?.codigo && `Código: ${cliente.codigo}`, cliente?.cidade].filter(Boolean).join(" · ")}\n\n${relatorioSituacao(situacao)}${intervalo}\n\n${relatorioDoCliente(registro.cliente, filtrados, cliente)}`;
      },
    });
  }

  _invalidar() {
    this.cache?.invalidar("atualizacoes:");
    // O Resumo e o inventário de versões contam atualizações: mudou aqui,
    // mudou lá. Invalidar de fora é o que mantém as abas coerentes entre si.
    this.cache?.invalidar("resumo");
    this.cache?.invalidar("sistemas:");
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

/**
 * Versão para a coluna estreita da grade: a do primeiro sistema listado
 * (a ordem em que a pessoa digitou), não o resumo de todos. O resumo
 * completo ("B_Vendas: ...; B_NFe: ...") fica só no title, pra quem passar
 * o mouse -- ele já existe pronto em row.versao.
 */
function versaoResumida(row) {
  const span = document.createElement("span");
  if (row.versoes_sistemas != null) {
    const primeiro = splitSistemas(row.sistema)[0] || "";
    span.textContent = versaoRegistrada(row, primeiro) || "—";
    span.title = row.versao || "";
  } else {
    span.textContent = row.versao || "—";
  }
  return span;
}

function acoesAtualizacao(row, role) {
  const wrap = document.createElement("div");
  wrap.className = "row-actions";
  const botoes = [
    ["relatorio", "copiar", "Copiar relatório"],
    ["cliente", "conta", "Abrir ficha do cliente"],
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
