import { View } from "../app/View.js";
import { TabelaOrdenavel } from "../components/TabelaOrdenavel.js";
import { Paginacao } from "../components/Paginacao.js";
import { aguardarPausa } from "../utils/aguardarPausa.js";
import { estadoVazio } from "../components/estadoVazio.js";
import { plural } from "../utils/html.js";
import { tempoRelativo, formatarDataHora } from "../utils/data.js";
import { prefs } from "../app/preferencias.js";
import { aparencia } from "../app/aparencia.js";
import { Modal } from "../components/Modal.js";
import { escaparHtml } from "../utils/html.js";

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
  agente: "Agente",
  configuracao: "Configuração",
  campanha: "Campanha",
};

const ENTIDADES = Object.keys(ENTIDADE_LABEL);

/**
 * Aba Histórico: quem criou/editou/excluiu o quê, e quando. Dá visibilidade
 * sobre o uso do sistema por uma equipe com vários logins.
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

    this.table = new TabelaOrdenavel(this.container.querySelector('[data-role="table"]'), {
      columns: [
        { key: "quando", label: "Quando", type: "text", title: (row) => formatarDataHora(row.criado_em) },
        { key: "usuario_nome", label: "Quem" },
        { key: "acaoLabel", label: "Ação" },
        { key: "entidadeLabel", label: "Tipo" },
        { key: "descricao", label: "Descrição" },
      ],
      selectable: true,
      onSelect: (row) => this._abrirDiff(row),
      caption: "Ações registradas no sistema",
      emptyNode: () =>
        this._temFiltro()
          ? estadoVazio({
              titulo: "Nenhuma ação com esse filtro",
              descricao: "Tente outro termo ou outro tipo.",
              icone: "busca",
              acao: { label: "Limpar filtros", onClick: () => this._limparFiltros() },
            })
          : estadoVazio({
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
    this.pagination = new Paginacao(this.container.querySelector('[data-role="pagination"]'), (page) => {
      this.page = page;
      this._reloadList();
    });

    this.searchInput = this.container.querySelector('[data-role="search"]');
    this.entidadeFilter = this.container.querySelector('[data-role="entidade-filter"]');
    this.botaoLimparFiltros = this.container.querySelector('[data-action="limpar-filtros"]');
    this.searchInput.value = this.busca;
    this.entidadeFilter.value = this.entidade;

    const reload = aguardarPausa(() => {
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
    this.table.definirRecarregando(true);
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
          this.table.definirLinhas(linhas);
          this.pagination.update(resposta);
          this.container.querySelector('[data-role="count"]').textContent = plural(resposta.total, "registro");
        }
      );
    } finally {
      this.table.definirRecarregando(false);
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

  _abrirDiff(row) {
    if (!row.detalhes_json) return;
    let detalhes;
    try { detalhes = JSON.parse(row.detalhes_json); } catch { return; }
    const antes = detalhes.antes || {};
    const depois = detalhes.depois || {};
    const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter((chave) => !["id", "criadoEm", "atualizadoEm", "revisao"].includes(chave));
    const linhas = chaves.filter((chave) => JSON.stringify(antes[chave] ?? null) !== JSON.stringify(depois[chave] ?? null));
    const { box, close } = Modal.abrirCaixa({ largura: 680 });
    box.innerHTML = `<h3 class="modal-box__title">Antes × Depois</h3><p class="modal-box__message">${escaparHtml(row.descricao)}</p>
      <div class="audit-diff">${linhas.length ? linhas.map((chave) => `<div class="audit-diff__row"><strong>${escaparHtml(rotuloCampo(chave))}</strong><del>${escaparHtml(valorDiff(antes[chave]))}</del><span aria-hidden="true">→</span><ins>${escaparHtml(valorDiff(depois[chave]))}</ins></div>`).join("") : "<p>Nenhum campo comparável foi alterado.</p>"}</div>
      <div class="modal-box__actions"><button type="button" class="btn btn--accent" data-action="fechar">Fechar</button></div>`;
    box.querySelector('[data-action="fechar"]').addEventListener("click", close);
  }
}

function rotuloCampo(chave) { return chave.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()); }
function valorDiff(valor) {
  if (valor == null || valor === "") return "—";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}
