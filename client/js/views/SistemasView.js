import { View } from "../app/View.js";
import { SortableTable } from "../components/SortableTable.js";
import { blendHex, tokenHex } from "../utils/color.js";
import { debounce } from "../utils/debounce.js";
import { formatarDataHora, isValidDateBR, mascaraDataBR } from "../utils/date.js";
import { ApiError } from "../api/ApiClient.js";
import { Modal } from "../components/Modal.js";
import { emptyState } from "../components/EmptyState.js";
import { escapeHtml, plural } from "../utils/html.js";
import { prefs } from "../app/prefs.js";
import { rotuloSituacao, AJUDA_PELA_DATA } from "../domain/situacao.js";
import { filtrarClientesDoSistema } from "../domain/filtrosSistemas.js";

/** Consulta por sistema; a referência oficial só pode ser editada no painel próprio. */
export class SistemasView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    const salvo = prefs.get("sistemas:filtros", {});
    this.sistema = salvo.sistema || "";
    this.situacao = salvo.situacao || "Todos";
    this.busca = salvo.busca || "";
    this.atendimentoAntesDe = salvo.atendimentoAntesDe || "";
    this.versoes = [];
    this.rows = [];
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = `
      <div class="card">
        <div class="toolbar sistemas-toolbar">
          <div class="field">
            <label class="field__label" for="sis-filtro">Sistema</label>
            <select class="input" id="sis-filtro" data-role="sistema-filter"></select>
          </div>
          <div class="field">
            <label class="field__label" for="sis-situacao">Situação</label>
            <select class="input" id="sis-situacao" data-role="situacao-filter">
              <option>Todos</option><option>Em dia</option><option>Desatualizados</option><option>Sem informação</option>
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="sis-busca">Buscar cliente ou cidade</label>
            <input class="input" id="sis-busca" data-role="busca" type="search" autocomplete="off" />
          </div>
          <button type="button" class="btn" data-action="filtros" aria-expanded="false" aria-controls="sis-filtros">Filtros</button>
          <button type="button" class="btn" data-action="oficiais" aria-expanded="false" aria-controls="sis-oficiais">Versões oficiais</button>
          <div class="toolbar-spacer"></div>
          <span class="result-count" data-role="count" aria-live="polite"></span>
        </div>
        <p class="sistemas-referencia" data-role="referencia"></p>
        <div id="sis-filtros" class="sistemas-filtros" hidden>
          <div class="field">
            <label class="field__label" for="sis-antes">Última atualização antes de</label>
            <input class="input" id="sis-antes" data-role="atendimento-antes" placeholder="dd/mm/aaaa" inputmode="numeric" aria-describedby="sis-antes-ajuda" />
            <div class="field__hint" id="sis-antes-ajuda" data-role="data-hint">Filtra a data da atualização; a situação continua usando a versão oficial.</div>
          </div>
          <button type="button" class="btn" data-action="limpar-data">Limpar data</button>
        </div>
        <section id="sis-oficiais" class="sistemas-oficiais" aria-label="Versões oficiais" hidden>
          <div class="sistemas-oficiais__cabecalho">
            <div><h2>Versões oficiais</h2><p>Novas atualizações recebem a referência vigente. As versões recebidas nas atualizações anteriores permanecem. Deixe o campo vazio para limpar a referência.</p></div>
            <button type="button" class="btn" data-action="fechar-oficiais">Fechar</button>
          </div>
          <div data-role="oficiais-lista"></div>
        </section>
        <div data-role="table"></div>
      </div>`;

    this.table = new SortableTable(this.container.querySelector('[data-role="table"]'), {
      columns: [
        { key: "cliente", label: "Cliente" },
        { key: "ultima", label: "Última atualização", type: "date" },
        { key: "instalada", label: "Versão recebida" },
        { key: "situacao", label: "Situação", render: celulaSituacao },
        { key: "cidade", label: "Cidade" },
      ],
      rowKey: (row) => row.cliente,
      caption: "Clientes por sistema",
      rowStyle: (row, index) => ({ background: severidadeCor(row.situacao, index) }),
      onSelect: (row) => this.navigate("consulta", { cliente: row.cliente }),
      emptyNode: () => emptyState({
        titulo: "Nenhum cliente para os filtros",
        descricao: "Ajuste a situação, a busca ou a data. Se o sistema não tiver clientes, vincule-os na tela Clientes.",
        icone: "sistemas",
      }),
    });

    this.sistemaFilter = this.container.querySelector('[data-role="sistema-filter"]');
    this.situacaoFilter = this.container.querySelector('[data-role="situacao-filter"]');
    this.buscaInput = this.container.querySelector('[data-role="busca"]');
    this.dataInput = this.container.querySelector('[data-role="atendimento-antes"]');
    this.dataHint = this.container.querySelector('[data-role="data-hint"]');
    this.situacaoFilter.value = this.situacao;
    this.buscaInput.value = this.busca;
    this.dataInput.value = this.atendimentoAntesDe;

    this.sistemaFilter.addEventListener("change", () => {
      this.sistema = this.sistemaFilter.value;
      this._salvarFiltros();
      this._mostrarReferencia();
      this._reloadList();
    });
    this.situacaoFilter.addEventListener("change", () => {
      this.situacao = this.situacaoFilter.value;
      this._salvarFiltros();
      this._filtrarRows();
    });
    const buscar = debounce(() => {
      this.busca = this.buscaInput.value.trim();
      this._salvarFiltros();
      this._filtrarRows();
    }, 180);
    this.buscaInput.addEventListener("input", buscar);
    const consultar = debounce(() => {
      this.atendimentoAntesDe = this.dataInput.value.trim();
      this._salvarFiltros();
      this._reloadList();
    }, 300);
    this.dataInput.addEventListener("input", () => {
      this.dataInput.value = mascaraDataBR(this.dataInput.value);
      const invalida = Boolean(this.dataInput.value) && !isValidDateBR(this.dataInput.value);
      this.dataInput.setAttribute("aria-invalid", String(invalida));
      this.dataHint.textContent = invalida ? "Informe uma data válida em dd/mm/aaaa." : "Filtra a data da atualização; a situação continua usando a versão oficial.";
      if (!invalida) consultar();
    });
    this.container.querySelector('[data-action="limpar-data"]').addEventListener("click", () => {
      this.dataInput.value = "";
      this.atendimentoAntesDe = "";
      this.dataInput.setAttribute("aria-invalid", "false");
      this._salvarFiltros();
      this._reloadList();
    });
    this.container.querySelector('[data-action="filtros"]').addEventListener("click", () => this._alternar("filtros"));
    this.container.querySelector('[data-action="oficiais"]').addEventListener("click", () => this._alternar("oficiais"));
    this.container.querySelector('[data-action="fechar-oficiais"]').addEventListener("click", () => this._fecharOficiais());
    this.container.querySelector('[data-role="oficiais-lista"]').addEventListener("click", (e) => this._acaoOficial(e));
  }

  aplicarParams({ sistema } = {}) {
    if (!sistema) return;
    this.sistema = sistema;
    this._salvarFiltros();
  }

  async refresh() {
    this.versoes = await this.api.get("/sistemas/versoes", null, { key: "sistemas:versoes" });
    this.sistemaFilter.innerHTML = this.versoes.map((s) => `<option value="${escapeHtml(s.nome)}">${escapeHtml(s.nome)}</option>`).join("");
    if (this.versoes.some((s) => s.nome === this.sistema)) this.sistemaFilter.value = this.sistema;
    this.sistema = this.sistemaFilter.value;
    this._salvarFiltros();
    this._mostrarReferencia();
    this._renderOficiais();
    await this._reloadList();
  }

  _mostrarReferencia() {
    const oficial = this.versoes.find((s) => s.nome === this.sistema)?.data;
    this.container.querySelector('[data-role="referencia"]').textContent = this.sistema
      ? `Versão oficial de ${this.sistema}: ${oficial || "não cadastrada"}`
      : "Nenhum sistema atualizável cadastrado.";
  }

  _alternar(tipo) {
    const botao = this.container.querySelector(`[data-action="${tipo}"]`);
    const painel = this.container.querySelector(`#sis-${tipo}`);
    painel.hidden = !painel.hidden;
    botao.setAttribute("aria-expanded", String(!painel.hidden));
    if (tipo === "oficiais" && !painel.hidden) this._renderOficiais();
    if (!painel.hidden) painel.querySelector("input, button")?.focus();
  }

  _fecharOficiais() {
    this.container.querySelector("#sis-oficiais").hidden = true;
    this.container.querySelector('[data-action="oficiais"]').setAttribute("aria-expanded", "false");
    this._renderOficiais(); // descarta qualquer edição sem gravar
    this.container.querySelector('[data-action="oficiais"]').focus();
  }

  _renderOficiais() {
    const lista = this.container.querySelector('[data-role="oficiais-lista"]');
    lista.innerHTML = this.versoes.map((s, i) => `
      <div class="sistemas-oficiais__row" data-index="${i}">
        <div><strong>${escapeHtml(s.nome)}</strong><span data-role="valor">${escapeHtml(s.data || "Sem referência")}</span>
          <small>${s.alteradaEm ? `Alterada por ${escapeHtml(s.autor || "não informado")} em ${escapeHtml(formatarDataHora(s.alteradaEm))}` : "Autor e data não registrados"}</small></div>
        <div class="sistemas-oficiais__acoes">
          <input class="input" data-role="edicao" aria-label="Versão oficial de ${escapeHtml(s.nome)}" placeholder="dd/mm/aaaa" inputmode="numeric" hidden />
          <button type="button" class="btn" data-action="editar" ${this.user?.role === "consulta" ? "hidden" : ""}>Editar</button>
          <button type="button" class="btn btn--accent" data-action="salvar" hidden>Salvar</button>
          <button type="button" class="btn" data-action="cancelar" hidden>Cancelar</button>
        </div>
      </div>`).join("");
    if (this.versoes.length === 0) lista.textContent = "Nenhum sistema atualizável cadastrado.";
  }

  async _acaoOficial(e) {
    const botao = e.target.closest("button[data-action]");
    const linha = botao?.closest("[data-index]");
    if (!linha) return;
    const sistema = this.versoes[Number(linha.dataset.index)];
    const campo = linha.querySelector('[data-role="edicao"]');
    if (botao.dataset.action === "editar") {
      campo.value = sistema.data || "";
      for (const acao of ["editar", "salvar", "cancelar"]) linha.querySelector(`[data-action="${acao}"]`).hidden = acao === "editar";
      campo.hidden = false;
      campo.focus();
      return;
    }
    if (botao.dataset.action === "cancelar") { this._renderOficiais(); return; }
    if (botao.dataset.action !== "salvar") return;
    const data = mascaraDataBR(campo.value.trim());
    if (data && !isValidDateBR(data)) {
      campo.setAttribute("aria-invalid", "true");
      campo.focus();
      return;
    }
    botao.disabled = true;
    try {
      await this.api.put(`/sistemas/${encodeURIComponent(sistema.nome)}/versao`, { data, versaoEsperada: sistema.data || "" });
      this.cache?.invalidar();
      await this.refresh();
    } catch (err) {
      if (err.status === 409) {
        this.cache?.invalidar();
        try { await this.refresh(); } catch { /* a mensagem de conflito continua sendo a informação principal */ }
      }
      Modal.alert("Não foi possível salvar", errorMessage(err), "error");
    } finally {
      botao.disabled = false;
    }
  }

  async _reloadList() {
    if (!this.sistema) {
      this.rows = [];
      this._filtrarRows();
      return;
    }
    if (this.atendimentoAntesDe && !isValidDateBR(this.atendimentoAntesDe)) return;
    this.table.setRefreshing(true);
    try {
      await this.swr(
        `sistemas:lista:${this.sistema}|${this.atendimentoAntesDe}`,
        () => this.api.get("/atualizacoes/por-sistema", { sistema: this.sistema, atendimentoAntesDe: this.atendimentoAntesDe }, { key: "sistemas:lista" }),
        (rows) => { this.rows = rows; this._filtrarRows(); }
      );
    } catch (err) {
      if (!err?.cancelled) Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      this.table.setRefreshing(false);
    }
  }

  _filtrarRows() {
    const rows = filtrarClientesDoSistema(this.rows, this.situacao, this.busca);
    this.table.setRows(rows);
    this.container.querySelector('[data-role="count"]').textContent = plural(rows.length, "cliente");
  }

  _salvarFiltros() {
    prefs.set("sistemas:filtros", { sistema: this.sistema, situacao: this.situacao, busca: this.busca, atendimentoAntesDe: this.atendimentoAntesDe });
  }
}

function celulaSituacao(row) {
  const span = document.createElement("span");
  span.textContent = rotuloSituacao(row.situacao, row.pelaData);
  if (row.pelaData) span.title = AJUDA_PELA_DATA;
  return span;
}

function severidadeCor(situacao, index) {
  const base = index % 2 === 0 ? tokenHex("--zebra-a") : tokenHex("--zebra-b");
  if (situacao === "Nunca atualizado") return blendHex(base, tokenHex("--severidade-alta"), 0.28);
  if (situacao === "Desatualizado") return blendHex(base, tokenHex("--severidade-alta"), 0.14);
  if (situacao === "Em dia") return blendHex(base, tokenHex("--severidade-boa"), 0.08);
  return base;
}

function errorMessage(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
