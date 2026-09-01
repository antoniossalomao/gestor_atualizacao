import { View } from "../core/View.js";
import { SortableTable } from "../core/SortableTable.js";
import { PieChart } from "../core/PieChart.js";
import { BarChart } from "../core/BarChart.js";
import { tokenHex } from "../core/color.js";
import { DESATUALIZADO_DIAS } from "../config.js";

/**
 * Aba Resumo: indicadores gerais. Equivalente de gestor/views/resumo.py -- a
 * diferença é que os cálculos moram no backend (AtualizacaoService.resumo()),
 * então esta classe só cuida de desenhar o que a API devolve.
 */
export class ResumoView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = `
      <div class="stat-tiles">
        <div class="card stat-tile" data-stat="clientes">
          <div class="stat-tile__label">Clientes</div>
          <div class="stat-tile__value">—</div>
        </div>
        <div class="card stat-tile" data-stat="atualizacoes">
          <div class="stat-tile__label">Atualizações</div>
          <div class="stat-tile__value">—</div>
        </div>
        <div class="card stat-tile" data-stat="mes">
          <div class="stat-tile__label">Atualizações Este Mês</div>
          <div class="stat-tile__value">—</div>
        </div>
        <div class="card stat-tile" data-stat="desatualizados">
          <div class="stat-tile__label">Parados Há Mais de ${DESATUALIZADO_DIAS} Dias</div>
          <div class="stat-tile__value">—</div>
        </div>
      </div>

      <div class="card">
        <h2 class="card__title">Situação dos Clientes</h2>
        <div data-role="pie"></div>
      </div>

      <div class="card-row">
        <div class="card">
          <h2 class="card__title">Atualizações Por Responsável</h2>
          <div data-role="responsaveis"></div>
        </div>
        <div class="card">
          <h2 class="card__title">Atualizações Por Sistema Este Mês</h2>
          <div data-role="sistemas"></div>
        </div>
      </div>
    `;

    this.pie = new PieChart(this.container.querySelector('[data-role="pie"]'));

    this.respTable = new SortableTable(this.container.querySelector('[data-role="responsaveis"]'), {
      columns: [
        { key: "label", label: "Responsável" },
        { key: "total", label: "Qtde", type: "numeric" },
      ],
      rowKey: (row) => row.label,
      emptyMessage: "Nenhuma atualização registrada ainda.",
      selectable: false,
    });

    this.sistemaChart = new BarChart(this.container.querySelector('[data-role="sistemas"]'));
  }

  async refresh() {
    await this.swr(
      "resumo",
      () => this.api.get("/resumo", null, { key: "resumo" }),
      (resumo) => this._render(resumo)
    );
  }

  _render(resumo) {
    this._setStat("clientes", resumo.totalClientes);
    this._setStat("atualizacoes", resumo.totalAtualizacoes);
    this._setStat("mes", resumo.mesCount);
    this._setStat("desatualizados", resumo.desatualizados.length);

    const desatTile = this.container.querySelector('[data-stat="desatualizados"]');
    desatTile.classList.toggle("is-alert", resumo.desatualizados.length > 0);

    this.pie.render([
      { label: "Em dia", value: resumo.emDia, color: tokenHex("--severidade-boa") },
      { label: "Desatualizados", value: resumo.desatualizados.length, color: tokenHex("--severidade-alta") },
    ]);

    this.respTable.setRows(resumo.porResponsavel);
    this.sistemaChart.render(resumo.atualizadosMesPorSistema);
  }

  _setStat(key, value) {
    this.container.querySelector(`[data-stat="${key}"] .stat-tile__value`).textContent = String(value);
  }
}
