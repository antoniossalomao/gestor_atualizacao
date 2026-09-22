import { View } from "../app/View.js";
import { SortableTable } from "../components/SortableTable.js";
import { PieChart } from "../components/charts/PieChart.js";
import { BarChart } from "../components/charts/BarChart.js";
import { LineChart } from "../components/charts/LineChart.js";
import { tokenHex } from "../utils/color.js";
import { icon } from "../utils/icons.js";
import { escapeHtml } from "../utils/html.js";
import { DESATUALIZADO_DIAS } from "../config.js";

/**
 * Um indicador do topo do Resumo. O `data-stat` é como `_setStat` o encontra.
 *
 * É um `<button>`, não uma `<div>`: os quatro números eram becos sem saída --
 * viam-se "37 clientes parados" e a única continuação possível era ir procurar
 * a tela certa e refazer o filtro na mão. Agora cada um leva à lista que ele
 * conta. Sendo botão de verdade, isso vale também para teclado e leitor de
 * tela, que é o que uma `<div onclick>` não daria.
 */
function statTile(chave, nomeIcone, rotulo, destino) {
  return `
    <button type="button" class="card stat-tile" data-stat="${chave}" data-destino="${escapeHtml(destino)}">
      <div class="stat-tile__label">
        <span class="stat-tile__icon">${icon(nomeIcone)}</span>
        ${escapeHtml(rotulo)}
      </div>
      <div class="stat-tile__value-row">
        <div class="stat-tile__value">—</div>
        <span class="stat-tile__delta" data-role="delta" hidden></span>
      </div>
      <span class="stat-tile__go">${escapeHtml(destino)} ${icon("seta")}</span>
    </button>`;
}

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
        ${statTile("clientes", "clientes", "Clientes", "Ver clientes")}
        ${statTile("atualizacoes", "atualizacoes", "Atualizações", "Ver histórico")}
        ${statTile("mes", "calendario", "Atualizações Este Mês", "Ver o mês")}
        ${statTile("desatualizados", "alerta", `Parados Há Mais de ${DESATUALIZADO_DIAS} Dias`, "Ver por sistema")}
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

      <div class="card">
        <h2 class="card__title">Tempo Médio de Resolução de Tarefas Por Responsável</h2>
        <p class="text-muted">
          Dias entre uma tarefa de Agendamentos ser criada e marcada como "Concluído".
          Só conta tarefa criada depois desta métrica existir.
        </p>
        <div data-role="resolucao"></div>
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
        mes: () => this.navigate("atualizacoes", { desde: primeiroDiaDoMes(), ate: hojeBR() }),
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

    this.resolucaoTable = new SortableTable(this.container.querySelector('[data-role="resolucao"]'), {
      columns: [
        { key: "label", label: "Responsável" },
        { key: "diasMedios", label: "Dias (média)", type: "numeric" },
        { key: "total", label: "Tarefas concluídas", type: "numeric" },
      ],
      rowKey: (row) => row.label,
      emptyMessage: "Nenhuma tarefa concluída com os dados necessários ainda.",
      selectable: false,
    });
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
    this.resolucaoTable.setRows(resumo.tempoMedioResolucao || []);
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
    el.innerHTML = tendencia.tendencia === "neutra" ? `${Math.abs(tendencia.pct)}%` : `${icon("seta")}${Math.abs(tendencia.pct)}%`;
    el.title = "Comparado ao mês anterior";
  }
}

/** dd/mm/aaaa do primeiro dia do mês corrente e de hoje -- o recorte de "este mês". */
function primeiroDiaDoMes() {
  const h = new Date();
  return `01/${String(h.getMonth() + 1).padStart(2, "0")}/${h.getFullYear()}`;
}

function hojeBR() {
  const h = new Date();
  return `${String(h.getDate()).padStart(2, "0")}/${String(h.getMonth() + 1).padStart(2, "0")}/${h.getFullYear()}`;
}

const MESES_ABREVIADOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-09" -> "set/2026". */
function formatarMes(mesStr) {
  const [ano, mes] = String(mesStr).split("-");
  const indice = Number(mes) - 1;
  return `${MESES_ABREVIADOS[indice] || mes}/${ano}`;
}

/**
 * Variação do mês corrente vs. o anterior, em %, a partir da série mensal que
 * o Resumo já busca para o gráfico de tendência (nenhuma chamada extra ao
 * servidor). Sem atualização nenhuma no mês anterior não há base para uma
 * porcentagem -- `null` aqui significa "não mostre nada", não "0%".
 * @param {Array<{mes: string, total: number}>} porMes
 */
function tendenciaMensal(porMes) {
  const hoje = new Date();
  const chave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);

  const totalAtual = porMes.find((m) => m.mes === chave(hoje))?.total ?? 0;
  const totalAnterior = porMes.find((m) => m.mes === chave(mesAnterior))?.total ?? 0;
  if (totalAnterior === 0) return null;

  const pct = Math.round(((totalAtual - totalAnterior) / totalAnterior) * 100);
  return { pct, tendencia: pct > 0 ? "alta" : pct < 0 ? "baixa" : "neutra" };
}
