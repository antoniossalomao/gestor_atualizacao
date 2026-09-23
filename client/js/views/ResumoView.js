import { View } from "../app/View.js";
import { SortableTable } from "../components/SortableTable.js";
import { PieChart } from "../components/charts/PieChart.js";
import { BarChart } from "../components/charts/BarChart.js";
import { LineChart } from "../components/charts/LineChart.js";
import { tokenHex } from "../utils/color.js";
import { html } from "../utils/html.js";
import { todayBR } from "../utils/date.js";
import { formatarMes, primeiroDiaDoMes, tendenciaMensal } from "../domain/resumo.js";
import { statTile, deltaTendencia } from "../templates/resumo.js";

/**
 * Aba Resumo: indicadores gerais. Equivalente de gestor/views/resumo.py -- a
 * diferença é que os cálculos moram no backend (AtualizacaoService.resumo()),
 * então esta classe só cuida de desenhar o que a API devolve.
 */
/** @param {number|undefined} dias */
function rotuloParados(dias) {
  return dias ? `Parados Há Mais de ${dias} Dias` : "Clientes Parados";
}

export class ResumoView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    /** Regra da equipe; o /resumo confirma o valor a cada carga (ver _render). */
    this.desatualizadoDias = ctx?.regras?.desatualizadoDias;
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = html`
      <div class="stat-tiles">
        ${statTile("clientes", "clientes", "Clientes", "Ver clientes")}
        ${statTile("atualizacoes", "atualizacoes", "Atualizações", "Ver histórico")}
        ${statTile("mes", "calendario", "Atualizações Este Mês", "Ver o mês")}
        ${statTile("desatualizados", "alerta", rotuloParados(this.desatualizadoDias), "Ver por sistema")}
      </div>

      <!--
        A rosca e a tendência dividem uma linha, e essa é a correção de um
        defeito que ninguém consegue nomear mas todo mundo sente: a "Situação
        dos Clientes" era um card de largura inteira com um gráfico de 148px
        dentro, ou seja, uns 900px de card vazio à direita de um desenho
        pequeno. Não é só feio -- espaço vazio num painel promete que ALGO vem
        ali, e a pessoa procura o que não existe.

        A divisão é desigual de propósito (ver "card-row--aside" no CSS): a
        rosca é redonda e satura numa largura pequena, enquanto a tendência
        melhora com cada pixel a mais -- doze meses de barras numa metade de
        tela ficam curtos demais para comparar. Cada um fica com a largura que
        o seu formato sabe usar, que é diferente de cada um ficar com metade.
      -->
      <div class="card-row card-row--aside">
        <div class="card">
          <h2 class="card__title">Situação dos Clientes</h2>
          <div data-role="pie"></div>
        </div>
        <div class="card">
          <h2 class="card__title">Tendência Mensal de Atualizações</h2>
          <div data-role="tendencia"></div>
        </div>
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

    // Um listener na grade toda (delegação) em vez de quatro. Cada destino é
    // "a tela onde aquele número vira uma lista que dá para trabalhar".
    this.container.querySelector(".stat-tiles").addEventListener("click", (e) => {
      const tile = e.target.closest(".stat-tile");
      if (!tile) return;
      const rotas = {
        clientes: () => this.navigate("clientes"),
        atualizacoes: () => this.navigate("atualizacoes", { desde: "", ate: "" }),
        // O "este mês" do indicador tem que ser o MESMO recorte que o número
        // contou, senão a lista abre com um total diferente do que se clicou.
        mes: () => this.navigate("atualizacoes", { desde: primeiroDiaDoMes(), ate: todayBR() }),
        desatualizados: () => this.navigate("sistemas"),
      };
      rotas[tile.dataset.stat]?.();
    });

    // "373" sozinho no meio da rosca é um número grande sem substantivo --
    // e num painel que também conta atualizações e agendamentos, é a coisa
    // mais fácil de ler como a contagem errada.
    this.pie = new PieChart(this.container.querySelector('[data-role="pie"]'), { unidade: "clientes" });

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
    this.tendenciaChart = new LineChart(this.container.querySelector('[data-role="tendencia"]'));

  }

  /**
   * O Resumo abria com um bloco "Precisa de Atenção": título, subtítulo e uma
   * grade de cards grandes com os agentes em situação ruim. Ele saiu daqui e
   * virou o sino do cabeçalho (ver MenuNotificacoes), que está em toda aba e
   * não custa a primeira dobra da tela inicial.
   *
   * O bloco também tinha um defeito que ninguém via: o card de agendamentos
   * atrasados lia `lembretes.atrasados`, mas `/agendamentos/lembretes`
   * devolve um ARRAY -- o card nunca apareceu, sem erro nenhum no console.
   */
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
    // O limite é regra da equipe e pode ter mudado desde que a tela abriu: o
    // rótulo usa o número com que o servidor MONTOU esta lista, não o que a
    // tela tinha guardado -- os dois não podem se contradizer.
    if (resumo.desatualizadoDias) {
      this.container.querySelector('[data-stat="desatualizados"] [data-role="rotulo"]').textContent =
        rotuloParados(resumo.desatualizadoDias);
    }
    this._setDelta("mes", tendenciaMensal(resumo.atualizacoesPorMes || []));

    const desatTile = this.container.querySelector('[data-stat="desatualizados"]');
    desatTile.classList.toggle("is-alert", resumo.desatualizados.length > 0);

    this.pie.render([
      { label: "Em dia", value: resumo.emDia, color: tokenHex("--severidade-boa") },
      { label: "Desatualizados", value: resumo.desatualizados.length, color: tokenHex("--severidade-alta") },
    ]);

    this.respTable.setRows(resumo.porResponsavel);
    this.sistemaChart.render(resumo.atualizadosMesPorSistema);
    this.tendenciaChart.render(
      (resumo.atualizacoesPorMes || []).map((item) => ({ label: formatarMes(item.mes), total: item.total }))
    );
  }

  _setStat(key, value) {
    this.container.querySelector(`[data-stat="${key}"] .stat-tile__value`).textContent = String(value);
  }

  /** @param {{pct: number, tendencia: "alta"|"baixa"|"neutra"}|null} tendencia */
  _setDelta(key, tendencia) {
    const el = this.container.querySelector(`[data-stat="${key}"] [data-role="delta"]`);
    if (!tendencia) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.className = `stat-tile__delta is-${tendencia.tendencia}`;
    el.innerHTML = deltaTendencia(tendencia);
    el.title = "Comparado ao mês anterior";
  }
}
