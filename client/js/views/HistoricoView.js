import { View } from "../core/View.js";
import { SortableTable } from "../core/SortableTable.js";
import { Pagination } from "../core/Pagination.js";
import { debounce } from "../core/debounce.js";
import { emptyState } from "../core/EmptyState.js";
import { plural } from "../core/html.js";
import { tempoRelativo } from "../core/date.js";
import { prefs } from "../core/prefs.js";
import { aparencia } from "../core/appearance.js";

const ACAO_LABEL = {
  criar: "Criou",
  atualizar: "Atualizou",
  excluir: "Excluiu",
  marcar_concluida: "Concluiu",
  publicar: "Publicou",
  restaurar_backup: "Restaurou backup",
};

const ENTIDADE_LABEL = {
  cliente: "Cliente",
  acesso: "Acesso",
  atualizacao: "Atualização",
  agendamento: "Agendamento",
  sistema: "Sistema",
  usuario: "Usuário",
  backup: "Backup",
  versao: "Versão",
};

const ENTIDADES = Object.keys(ENTIDADE_LABEL);

/**
 * Aba Histórico: quem criou/editou/excluiu o quê, e quando. Não existia no
 * app Python original (uso individual, sem contas) -- é a peça que dá
 * visibilidade sobre o uso do sistema por uma equipe com vários logins.
 */
export class HistoricoView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    const salvo = prefs.get("historico:filtros", {});
    this.page = 1;
    this.busca = salvo.busca || "";
    this.entidade = salvo.entidade || "Todos";
    this.sortBy = salvo.sortBy;
    this.sortDir = salvo.sortDir || "desc";
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <div class="field">
            <label class="field__label" for="his-busca">Buscar</label>
            <input type="search" class="input" id="his-busca" data-role="search" placeholder="Pessoa ou descrição..." />
          </div>
          <div class="field">
            <label class="field__label" for="his-tipo">Tipo</label>
            <select class="input" id="his-tipo" data-role="entidade-filter">
              <option value="Todos">Todos</option>
              ${ENTIDADES.map((e) => `<option value="${e}">${ENTIDADE_LABEL[e]}</option>`).join("")}
            </select>
          </div>
          <div class="toolbar__clear">
            <button type="button" class="btn btn--small btn--ghost" data-action="limpar-filtros" hidden>Limpar filtros</button>
          </div>
          <div class="toolbar-spacer"></div>
          <span class="result-count" data-role="count" aria-live="polite"></span>
        </div>
        <div data-role="table"></div>
        <div data-role="pagination"></div>
      </div>
    `;

    this.table = new SortableTable(this.container.querySelector('[data-role="table"]'), {
      columns: [
        { key: "quando", label: "Quando", type: "text" },
        { key: "usuario_nome", label: "Quem" },
        { key: "acaoLabel", label: "Ação" },
        { key: "entidadeLabel", label: "Tipo" },
        { key: "descricao", label: "Descrição" },
      ],
      selectable: false,
      caption: "Ações registradas no sistema",
      emptyNode: () =>
        this._temFiltro()
          ? emptyState({
              titulo: "Nenhuma ação com esse filtro",
              descricao: "Tente outro termo ou outro tipo.",
              icone: "busca",
              acao: { label: "Limpar filtros", onClick: () => this._limparFiltros() },
            })
          : emptyState({
              titulo: "Nenhuma ação registrada",
              descricao: "Tudo que a equipe fizer no sistema aparece aqui.",
              icone: "historico",
            }),
      serverSort: true,
      onSortChange: (key, dir) => {
        // As colunas exibidas (quando/acaoLabel/entidadeLabel) são textos
        // formatados no front-end -- a ordenação de verdade acontece pelas
        // colunas originais do banco, então mapeamos de volta aqui.
        const mapa = { quando: "criado_em", acaoLabel: "acao", entidadeLabel: "entidade" };
        this.sortBy = mapa[key] || key;
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

    this.searchInput = this.container.querySelector('[data-role="search"]');
    this.entidadeFilter = this.container.querySelector('[data-role="entidade-filter"]');
    this.botaoLimparFiltros = this.container.querySelector('[data-action="limpar-filtros"]');
    this.searchInput.value = this.busca;
    this.entidadeFilter.value = this.entidade;

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
    this.entidadeFilter.addEventListener("change", () => {
      this.entidade = this.entidadeFilter.value;
      this.page = 1;
      this._pintarLimparFiltros();
      this._salvarFiltros();
      this._reloadList();
    });
    this.botaoLimparFiltros.addEventListener("click", () => this._limparFiltros());
    this._pintarLimparFiltros();
  }

  async refresh() {
    await this._reloadList();
  }

  async _reloadList() {
    this.table.setRefreshing(true);
    try {
      await this.swr(
        `historico:lista:${this.busca}|${this.entidade}|${this.page}|${this.sortBy}|${this.sortDir}`,
        () =>
          this.api.get(
            "/historico",
            {
              search: this.busca,
              entidade: this.entidade === "Todos" ? "" : this.entidade,
              page: this.page,
              pageSize: aparencia.linhasPorPagina(),
              sortBy: this.sortBy,
              sortDir: this.sortDir,
            },
            { key: "historico:lista" }
          ),
        (resposta) => {
          const linhas = resposta.rows.map((r) => ({
            ...r,
            // Relativo no texto ("há 2 h"), absoluto no tooltip: num registro
            // de auditoria, saber se algo foi agora ou semana passada é a
            // primeira pergunta, e uma data crua obriga a fazer a conta.
            quando: tempoRelativo(r.criado_em),
            acaoLabel: ACAO_LABEL[r.acao] || r.acao,
            entidadeLabel: ENTIDADE_LABEL[r.entidade] || r.entidade,
          }));
          this.table.setRows(linhas);
          this.pagination.update(resposta);
          this.container.querySelector('[data-role="count"]').textContent = plural(resposta.total, "registro");
        }
      );
    } finally {
      this.table.setRefreshing(false);
    }
  }

  _temFiltro() {
    return Boolean(this.busca) || this.entidade !== "Todos";
  }

  _pintarLimparFiltros() {
    this.botaoLimparFiltros.hidden = !this._temFiltro();
  }

  _limparFiltros() {
    this.busca = "";
    this.entidade = "Todos";
    this.searchInput.value = "";
    this.entidadeFilter.value = "Todos";
    this.page = 1;
    this._pintarLimparFiltros();
    this._salvarFiltros();
    this._reloadList();
  }

  _salvarFiltros() {
    prefs.set("historico:filtros", {
      busca: this.busca,
      entidade: this.entidade,
      sortBy: this.sortBy,
      sortDir: this.sortDir,
    });
  }
}
