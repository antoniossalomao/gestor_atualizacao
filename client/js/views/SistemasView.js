import { View } from "../app/View.js";
import { SortableTable } from "../components/SortableTable.js";
import { blendHex, tokenHex } from "../utils/color.js";
import { debounce } from "../utils/debounce.js";
import { isValidDateBR, mascaraDataBR } from "../utils/date.js";
import { ApiError } from "../api/ApiClient.js";
import { Modal } from "../components/Modal.js";
import { emptyState } from "../components/EmptyState.js";
import { escapeHtml, plural } from "../utils/html.js";
import { prefs } from "../app/prefs.js";
import { rotuloSituacao, AJUDA_PELA_DATA } from "../domain/situacao.js";

/** Relatório por sistema, usando a data da última versão cadastrada pela equipe. */
export class SistemasView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    const salvo = prefs.get("sistemas:filtros", {});
    this.sistema = salvo.sistema || "";
    this.dataCorte = "";
    this.versoes = [];
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <div class="field">
            <label class="field__label" for="sis-filtro">Sistema</label>
            <select class="input" id="sis-filtro" data-role="sistema-filter"></select>
            <!-- Hint vazio de propósito: o campo ao lado (Desatualizado antes
                 de) tem uma linha de erro embaixo do input, o que o deixa mais
                 alto. Como o toolbar alinha os campos pela base, sem este
                 espaço reservado aqui também, o rótulo e o select deste campo
                 ficavam alguns pixels mais baixos que os do campo vizinho, um
                 desalinhamento visível. -->
            <div class="field__hint" aria-hidden="true"></div>
          </div>
          <div class="field">
            <label class="field__label" for="sis-corte">Data da última versão</label>
            <input type="text" class="input" id="sis-corte" data-role="data-corte"
                   placeholder="dd/mm/aaaa" aria-describedby="sis-corte-hint" />
            <div class="field__hint" id="sis-corte-hint" data-role="data-hint"></div>
          </div>
          <div class="field" style="min-width: 0;">
            <label class="field__label" aria-hidden="true">&nbsp;</label>
            <button type="button" class="btn" style="align-self: flex-start;" data-action="salvar-versao">Salvar versão</button>
            <div class="field__hint" aria-hidden="true"></div>
          </div>
          <div class="toolbar-spacer"></div>
          <span class="result-count" data-role="count" aria-live="polite"></span>
        </div>
        <div data-role="table"></div>
      </div>
    `;

    this.table = new SortableTable(this.container.querySelector('[data-role="table"]'), {
      columns: [
        { key: "cliente", label: "Cliente" },
        { key: "cidade", label: "Cidade" },
        { key: "ultima", label: "Última Atualização", type: "date" },
        { key: "instalada", label: "Versão recebida" },
        { key: "situacao", label: "Situação", render: celulaSituacao },
      ],
      rowKey: (row) => row.cliente,
      caption: "Clientes por sistema",
      rowStyle: (row, index) => ({ background: severidadeCor(row.situacao, index) }),
      selectable: false,
      emptyNode: () =>
        emptyState({
          titulo: "Nenhum cliente usa este sistema",
          descricao: "Ou o cadastro em Clientes ainda não foi marcado com este sistema.",
          icone: "sistemas",
          acao: { label: "Ir para Clientes", onClick: () => this.navigate("clientes") },
        }),
    });

    this.sistemaFilter = this.container.querySelector('[data-role="sistema-filter"]');
    this.dataCorteInput = this.container.querySelector('[data-role="data-corte"]');
    this.dataHint = this.container.querySelector('[data-role="data-hint"]');
    this.dataCorteInput.value = this.dataCorte;

    this.salvarBtn = this.container.querySelector('[data-action="salvar-versao"]');
    this.salvarBtn.hidden = this.user?.role === "consulta";
    this.dataCorteInput.readOnly = this.user?.role === "consulta";
    this.salvarBtn.addEventListener("click", () => this._salvarVersao());
    this.sistemaFilter.addEventListener("change", () => {
      this.sistema = this.sistemaFilter.value;
      this._usarReferencia();
      this._salvarFiltros();
      this._reloadList();
    });
    // Digitar uma data diferente da salva é uma consulta avulsa ("quem está
    // desatualizado desde tal dia?"), sem precisar clicar em "Salvar versão"
    // -- só reflete na tela e não grava nada. Debounced pra não recarregar a
    // cada tecla enquanto a máscara ainda está sendo digitada.
    const consultarComDebounce = debounce(() => {
      this.dataCorte = this.dataCorteInput.value.trim();
      this._reloadList();
    }, 300);
    this.dataCorteInput.addEventListener("input", () => {
      this.dataCorteInput.value = mascaraDataBR(this.dataCorteInput.value);
      const valor = this.dataCorteInput.value.trim();
      const invalida = Boolean(valor) && !isValidDateBR(valor);
      this.dataHint.textContent = invalida ? "Formato esperado: dd/mm/aaaa" : "";
      this.dataCorteInput.setAttribute("aria-invalid", String(invalida));
      this.salvarBtn.disabled = invalida;
      if (!invalida) consultarComDebounce();
    });
  }

  /**
   * Vindo do Resumo ("Mais clientes desatualizados"): abre já no sistema
   * clicado. `refresh` escolhe ele no select se ainda estiver no catálogo.
   * @param {{sistema?: string}} params
   */
  aplicarParams({ sistema } = {}) {
    if (!sistema) return;
    this.sistema = sistema;
    this._salvarFiltros();
  }

  async refresh() {
    this.versoes = await this.api.get("/sistemas/versoes", null, { key: "sistemas:versoes" });
    this.sistemaFilter.innerHTML = this.versoes.map((s) => `<option value="${escapeHtml(s.nome)}">${escapeHtml(s.nome)}${s.data ? ` — ${escapeHtml(s.data)}` : ""}</option>`).join("");
    if (this.versoes.some((s) => s.nome === this.sistema)) this.sistemaFilter.value = this.sistema;
    this.sistema = this.sistemaFilter.value;
    this._usarReferencia();
    await this._reloadList();
  }

  _usarReferencia() {
    this.dataCorte = this.versoes.find((s) => s.nome === this.sistema)?.data || "";
    this.dataCorteInput.value = this.dataCorte;
    this.dataHint.textContent = "";
    this.dataCorteInput.setAttribute("aria-invalid", "false");
    this.salvarBtn.disabled = !this.sistema;
  }

  async _salvarVersao() {
    const data = this.dataCorteInput.value.trim();
    if (data && !isValidDateBR(data)) return;
    this.salvarBtn.disabled = true;
    this.sistemaFilter.disabled = true;
    try {
      await this.api.put(`/sistemas/${encodeURIComponent(this.sistema)}/versao`, { data });
      this.cache?.invalidar("sistemas:");
      await this.refresh();
      this.dataHint.textContent = "Referência salva para a equipe.";
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      this.salvarBtn.disabled = false;
      this.sistemaFilter.disabled = false;
    }
  }

  async _reloadList() {
    if (!this.sistema) {
      this.table.setRows([]);
      this.container.querySelector('[data-role="count"]').textContent = "";
      return;
    }
    if (this.dataCorte && !isValidDateBR(this.dataCorte)) return;

    this.table.setRefreshing(true);
    try {
      await this.swr(
        `sistemas:lista:${this.sistema}|${this.dataCorte}`,
        () =>
          this.api.get(
            "/atualizacoes/por-sistema",
            { sistema: this.sistema, dataCorte: this.dataCorte },
            { key: "sistemas:lista" }
          ),
        (rows) => {
          this.rows = rows;
          this.table.setRows(rows);
          this.container.querySelector('[data-role="count"]').textContent = plural(rows.length, "cliente");
        }
      );
    } catch (err) {
      if (!err?.cancelled) Modal.alert("Erro", errorMessage(err), "error");
    } finally {
      this.table.setRefreshing(false);
    }
  }

  _salvarFiltros() {
    prefs.set("sistemas:filtros", { sistema: this.sistema });
  }
}

/**
 * Fundo levemente tingido: vermelho mais forte para "Nunca atualizado" e
 * "Desatualizado", verde discreto para "Em dia".
 *
 * As cores vêm dos tokens do tema (`tokenHex`), não de hex fixos no
 * JavaScript como antes -- com hex fixos, as linhas continuavam pintadas com
 * o cinza do tema escuro depois que o tema claro entrou.
 */
/**
 * "Em dia (pela data)" quando o atendimento não registrou versão e a
 * situação foi deduzida pela data (ver services/situacaoVersao.js) -- a cor
 * da linha é a mesma, mas o texto não pode fingir versão comprovada.
 */
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
