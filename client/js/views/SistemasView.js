import { View } from "../app/View.js";
import { SortableTable } from "../components/SortableTable.js";
import { blendHex, tokenHex } from "../utils/color.js";
import { isValidDateBR, mascaraDataBR } from "../utils/date.js";
import { ApiError } from "../api/ApiClient.js";
import { Modal } from "../components/Modal.js";
import { debounce } from "../utils/debounce.js";
import { emptyState } from "../components/EmptyState.js";
import { escapeHtml, plural } from "../utils/html.js";
import { prefs } from "../app/prefs.js";

/**
 * Relatório por sistema: filtra clientes que usam um sistema específico
 * (ex.: NFCe) e mostra a última atualização de cada um naquele sistema, com
 * uma data de corte opcional para marcar quem ficou para trás depois de uma
 * mudança grande do sistema numa certa data. Não existia no app original --
 * os dados já existem em Atualizações/Clientes, isto junta as duas coisas com
 * um filtro focado.
 */
export class SistemasView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    const salvo = prefs.get("sistemas:filtros", {});
    this.sistema = salvo.sistema || "";
    this.dataCorte = salvo.dataCorte || "";
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
            <label class="field__label" for="sis-corte">Desatualizado antes de</label>
            <input type="text" class="input" id="sis-corte" data-role="data-corte"
                   placeholder="dd/mm/aaaa (opcional)" aria-describedby="sis-corte-hint" />
            <div class="field__hint" id="sis-corte-hint" data-role="data-hint"></div>
          </div>
          <div class="toolbar-spacer"></div>
          <button type="button" class="btn btn--accent" data-action="gerar-agendamentos">Gerar Agendamentos em Lote</button>
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
        { key: "situacao", label: "Situação" },
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
    this.gerarBtn = this.container.querySelector('[data-action="gerar-agendamentos"]');
    this.gerarBtn.hidden = this.user?.role === "consulta";
    this.gerarBtn.addEventListener("click", () => this._gerarAgendamentos());
    this.dataHint = this.container.querySelector('[data-role="data-hint"]');
    this.dataCorteInput.value = this.dataCorte;

    this.sistemaFilter.addEventListener("change", () => {
      this.sistema = this.sistemaFilter.value;
      this._salvarFiltros();
      this._reloadList();
    });
    const reload = debounce(() => this._reloadList(), 250);
    this.dataCorteInput.addEventListener("input", () => {
      this.dataCorteInput.value = mascaraDataBR(this.dataCorteInput.value);
      const valor = this.dataCorteInput.value.trim();
      const invalida = Boolean(valor) && !isValidDateBR(valor);
      this.dataHint.textContent = invalida ? "Formato esperado: dd/mm/aaaa" : "";
      this.dataCorteInput.setAttribute("aria-invalid", String(invalida));
      if (!invalida) {
        this.dataCorte = valor;
        this._salvarFiltros();
        reload();
      }
    });
  }

  async refresh() {
    await this.swr(
      "sistemas",
      () => this.api.get("/sistemas", null, { key: "sistemas" }),
      (sistemas) => {
        this.sistemaFilter.innerHTML = sistemas.map((s) => `<option>${escapeHtml(s)}</option>`).join("");
        if (sistemas.includes(this.sistema)) this.sistemaFilter.value = this.sistema;
        else if (sistemas.includes("NFCe")) this.sistemaFilter.value = "NFCe";
        this.sistema = this.sistemaFilter.value;
      }
    );
    await this._reloadList();
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
    prefs.set("sistemas:filtros", { sistema: this.sistema, dataCorte: this.dataCorte });
  }

  async _gerarAgendamentos() {
    const clientes = (this.rows || []).filter((row) => row.situacao !== "Em dia").map((row) => row.cliente);
    if (clientes.length === 0) {
      Modal.alert("Agendamentos", "Nenhum cliente defasado neste recorte.", "info");
      return;
    }
    const ok = await Modal.confirm("Gerar agendamentos em lote", `Criar ${plural(clientes.length, "tarefa")} para os clientes defasados em ${this.sistema}?`, { confirmLabel: "Gerar", danger: false });
    if (!ok) return;
    try {
      const resultado = await this.api.post("/agendamentos/gerar-lote", {
        clientes,
        sistema: this.sistema,
        dataCorte: this.dataCorte,
        responsavel: this.user?.nome || "",
      });
      this.cache?.invalidar("agendamentos:");
      Modal.alert("Agendamentos criados", `${plural(resultado.criados, "tarefa")} criada para acompanhamento.`, "success");
    } catch (err) {
      Modal.alert("Erro", errorMessage(err), "error");
    }
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
