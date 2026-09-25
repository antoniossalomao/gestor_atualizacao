import { View } from "../app/View.js";
import { SortableTable } from "../components/SortableTable.js";
import { Drawer } from "../components/Drawer.js";
import { BarChart } from "../components/charts/BarChart.js";
import { LineChart } from "../components/charts/LineChart.js";
import { html, plural } from "../utils/html.js";
import { todayBR } from "../utils/date.js";
import { formatarMes, primeiroDiaDoMes, tendenciaMensal } from "../domain/resumo.js";
import { GRUPOS_SITUACAO, AJUDA_PELA_DATA, totaisSituacao, sistemasQueExplicam } from "../domain/situacao.js";
import { statTile, deltaTendencia, corpoSituacao } from "../templates/resumo.js";

/**
 * Aba Resumo: indicadores gerais. Equivalente de gestor/views/resumo.py -- a
 * diferença é que os cálculos moram no backend (AtualizacaoService.resumo()),
 * então esta classe só cuida de desenhar o que a API devolve.
 */
/**
 * Era "Parados Há Mais de N Dias", e o card ao lado chamava de "em dia" quem
 * NÃO estava nesta lista -- tempo parado fazendo papel de situação de
 * versão. Agora o rótulo diz só o que conta: tempo desde a última
 * atualização registrada.
 * @param {number|undefined} dias
 */
function rotuloSemAtendimento(dias) {
  return dias ? `Sem Atualização Há Mais de ${dias} Dias` : "Sem Atualização Recente";
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
        ${statTile("atualizacoes", "atualizacoes", "Atendimentos", "Ver histórico")}
        ${statTile("mes", "calendario", "Atendimentos Este Mês", "Ver o mês")}
        ${statTile("semAtendimento", "alerta", rotuloSemAtendimento(this.desatualizadoDias), "Ver a lista")}
      </div>

      <!--
        A situação e a tendência dividem uma linha, e essa é a correção de um
        defeito que ninguém consegue nomear mas todo mundo sente: a "Situação
        dos Clientes" era um card de largura inteira com um gráfico de 148px
        dentro, ou seja, uns 900px de card vazio à direita de um desenho
        pequeno. Não é só feio -- espaço vazio num painel promete que ALGO vem
        ali, e a pessoa procura o que não existe.

        A divisão é desigual de propósito (ver "card-row--aside" no CSS): a
        lista de situação satura numa largura pequena, enquanto a tendência
        melhora com cada pixel a mais -- doze meses de barras numa metade de
        tela ficam curtos demais para comparar. Cada um fica com a largura que
        o seu formato sabe usar, que é diferente de cada um ficar com metade.
      -->
      <div class="card-row card-row--aside">
        <div class="card">
          <h2 class="card__title">Atualização dos Clientes</h2>
          <div data-role="situacao"></div>
        </div>
        <div class="card">
          <h2 class="card__title">Tendência Mensal de Atendimentos</h2>
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

      <div data-role="gaveta-lista">
        <p class="gaveta-lista__ajuda" data-role="gaveta-ajuda"></p>
        <div data-role="gaveta-tabela"></div>
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
        // Levava para a aba Sistemas, que não tem como mostrar "quem está sem
        // atendimento" -- o clique abria uma lista que não era a contada.
        semAtendimento: () => this._listarSemAtendimento(),
      };
      rotas[tile.dataset.stat]?.();
    });

    this.situacaoEl = this.container.querySelector('[data-role="situacao"]');
    this.situacaoEl.addEventListener("click", (e) => {
      const grupo = e.target.closest("[data-grupo]");
      if (grupo) return this._listarGrupo(grupo.dataset.grupo);
      const sistema = e.target.closest("[data-sistema]");
      if (sistema) return this.navigate("sistemas", { sistema: sistema.dataset.sistema });
      if (e.target.closest('[data-action="todos-sistemas"]')) this._listarSistemas();
    });

    // Uma gaveta só, para as três listas que o Resumo abre. A lista vai
    // inteira na resposta do /resumo: o que se vê aqui é exatamente o que o
    // número contou, sem uma segunda consulta que pudesse discordar dele.
    this.gavetaEl = this.container.querySelector('[data-role="gaveta-lista"]');
    this.gavetaAjuda = this.gavetaEl.querySelector('[data-role="gaveta-ajuda"]');
    this.gavetaTabela = this.gavetaEl.querySelector('[data-role="gaveta-tabela"]');
    this.gaveta = new Drawer(this.gavetaEl, { titulo: "Clientes" });
    this.gavetaEl.addEventListener("click", (e) => {
      const alvo = e.target.closest("[data-ir]");
      if (!alvo) return;
      this.gaveta.fechar({ forcar: true });
      if (alvo.dataset.ir === "cliente") this.navigate("consulta", { cliente: alvo.dataset.valor });
      else this.navigate("sistemas", { sistema: alvo.dataset.valor });
    });

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
    this._setStat("semAtendimento", resumo.semAtendimento.length);
    // O limite é regra da equipe e pode ter mudado desde que a tela abriu: o
    // rótulo usa o número com que o servidor MONTOU esta lista, não o que a
    // tela tinha guardado -- os dois não podem se contradizer.
    if (resumo.desatualizadoDias) {
      this.container.querySelector('[data-stat="semAtendimento"] [data-role="rotulo"]').textContent =
        rotuloSemAtendimento(resumo.desatualizadoDias);
    }
    this._setDelta("mes", tendenciaMensal(resumo.atualizacoesPorMes || []));

    const semAtendimentoTile = this.container.querySelector('[data-stat="semAtendimento"]');
    semAtendimentoTile.classList.toggle("is-alert", resumo.semAtendimento.length > 0);

    this.resumo = resumo;
    this.situacaoEl.innerHTML = corpoSituacao(totaisSituacao(resumo.situacaoClientes), resumo.situacaoClientes.sistemasMaisAtrasados);

    this.respTable.setRows(resumo.porResponsavel);
    this.sistemaChart.render(resumo.atualizadosMesPorSistema);
    this.tendenciaChart.render(
      (resumo.atualizacoesPorMes || []).map((item) => ({ label: formatarMes(item.mes), total: item.total }))
    );
  }

  /** @param {string} chave em_dia | desatualizado | pendente */
  _listarGrupo(chave) {
    const grupo = GRUPOS_SITUACAO.find((g) => g.chave === chave);
    const clientes = this.resumo?.situacaoClientes?.[chave] || [];
    const algumPelaData = clientes.some((c) => c.sistemas.some((s) => s.pelaData));
    this._abrirGaveta({
      titulo: `${grupo.rotulo} — ${plural(clientes.length, "cliente")}`,
      ajuda: `${grupo.descricao}${algumPelaData ? ` "Pela data": ${AJUDA_PELA_DATA}` : ""}`,
      colunas: [
        { key: "nome", label: "Cliente", render: (row) => this._link("cliente", row.nome) },
        { key: "cidade", label: "Cidade" },
        { key: "sistemas", label: chave === "desatualizado" ? "Sistemas atrasados" : chave === "pendente" ? "O que falta" : "Sistemas" },
      ],
      linhas: clientes.map((c) => ({ nome: c.nome, cidade: c.cidade, sistemas: sistemasQueExplicam(chave, c.sistemas, c.decididoPor) })),
      chave: (row) => row.nome,
      vazio: "Nenhum cliente nesta situação.",
    });
  }

  _listarSemAtendimento() {
    const clientes = this.resumo?.semAtendimento || [];
    this._abrirGaveta({
      titulo: `${rotuloSemAtendimento(this.resumo?.desatualizadoDias)} — ${plural(clientes.length, "cliente")}`,
      ajuda: "Tempo desde a última atualização registrada. Não diz se as versões estão em dia: isso está no card Atualização dos Clientes.",
      colunas: [
        { key: "nome", label: "Cliente", render: (row) => this._link("cliente", row.nome) },
        { key: "cidade", label: "Cidade" },
        { key: "ultima", label: "Última atualização", type: "date" },
        // Para quem nunca foi atendido, o servidor manda um número enorme
        // como sentinela: ordena esses primeiro, mas não é para ser lido.
        { key: "dias", label: "Dias", type: "numeric", render: (row) => document.createTextNode(row.ultima === "Nunca" ? "—" : String(row.dias)) },
      ],
      linhas: clientes,
      chave: (row) => row.nome,
      vazio: "Todos os clientes foram atendidos dentro do prazo.",
    });
  }

  _listarSistemas() {
    const sistemas = this.resumo?.situacaoClientes?.sistemasMaisAtrasados || [];
    this._abrirGaveta({
      titulo: "Clientes atrasados por sistema",
      ajuda: "Conta cada sistema separado: um cliente atrasado em dois sistemas aparece nos dois, e um cliente em dia pelo B_Vendas ainda aparece aqui se outro sistema dele estiver atrasado.",
      colunas: [
        { key: "sistema", label: "Sistema", render: (row) => this._link("sistema", row.sistema) },
        { key: "total", label: "Clientes", type: "numeric" },
      ],
      linhas: sistemas,
      chave: (row) => row.sistema,
      vazio: "Nenhum sistema com cliente atrasado.",
    });
  }

  /**
   * Uma tabela nova a cada abertura: as três listas têm colunas diferentes,
   * e o SortableTable fixa as colunas no construtor.
   */
  _abrirGaveta({ titulo, ajuda, colunas, linhas, chave, vazio }) {
    const alvo = document.createElement("div");
    this.gavetaTabela.replaceChildren(alvo);
    const tabela = new SortableTable(alvo, { columns: colunas, rowKey: chave, emptyMessage: vazio, selectable: false });
    tabela.setRows(linhas);
    this.gavetaAjuda.textContent = ajuda;
    this.gaveta.setTitulo(titulo);
    this.gaveta.abrir();
  }

  /** @param {"cliente"|"sistema"} destino @param {string} valor */
  _link(destino, valor) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "tabela-link";
    botao.dataset.ir = destino;
    botao.dataset.valor = valor;
    botao.textContent = valor;
    botao.title = destino === "cliente" ? "Abrir a ficha do cliente" : "Abrir o sistema na aba Sistemas";
    return botao;
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
