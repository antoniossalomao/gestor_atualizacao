import { View } from "../app/View.js";
import { TabelaOrdenavel } from "../components/TabelaOrdenavel.js";
import { Gaveta } from "../components/Gaveta.js";
import { GraficoDeBarras } from "../components/graficos/GraficoDeBarras.js";
import { GraficoDeLinhas } from "../components/graficos/GraficoDeLinhas.js";
import { html, plural } from "../utils/html.js";
import { hojeBR } from "../utils/data.js";
import { casaBusca } from "../utils/busca.js";
import { formatarMes, primeiroDiaDoMes, tendenciaMensal, barrasPorSistema, variacaoMesAnterior } from "../domain/resumo.js";
import { GRUPOS_SITUACAO, GRUPOS_ATIVIDADE, totaisSituacao, totaisAtividade, descreverSistemasQueExplicam } from "../domain/situacao.js";
import { blocoDeNumero, deltaTendencia, corpoSituacao, corpoAtividade } from "../templates/resumo.js";

/**
 * Aba Resumo: indicadores gerais. Os cálculos moram no backend
 * (AtualizacaoService.resumo()); esta classe só desenha o que a API devolve.
 */
/**
 * Era "Parados Há Mais de N Dias", e o card ao lado chamava de "em dia" quem
 * NÃO estava nesta lista -- tempo parado fazendo papel de situação de
 * versão. Agora o rótulo diz só o que conta: tempo desde a última
 * atualização registrada.
 * @param {number|undefined} dias
 */
function rotuloSemAtualizacao(dias) {
  return dias ? `Sem atualização (+${dias} dias)` : "Sem atualização recente";
}

export class ResumoView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    /** Regra da equipe; o /resumo confirma o valor a cada carga (ver _render). */
    this.desatualizadoDias = ctx?.regras?.desatualizadoDias;
    this._montarDom();
  }

  _montarDom() {
    this.container.innerHTML = html`
      <div class="stat-tiles">
        ${blocoDeNumero("clientes", "clientes", "Clientes cadastrados", "Abrir lista de clientes cadastrados")}
        ${blocoDeNumero("atualizacoes", "atualizacoes", "Total de atualizações", "Abrir histórico completo de atualizações")}
        ${blocoDeNumero("mes", "calendario", "Atualizações no mês", "Filtrar atualizações deste mês")}
        ${blocoDeNumero("semAtualizacao", "alerta", rotuloSemAtualizacao(this.desatualizadoDias), "Listar clientes sem atualização no prazo")}
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
          <h2 class="card__title">Frequência de atualização</h2>
          <div data-role="situacao"></div>
        </div>
        <div class="card">
          <div class="tendencia-cabecalho"><h2 class="card__title">Tendência mensal de atualizações</h2><span data-role="tendencia-atual"></span></div>
          <div data-role="tendencia"></div>
        </div>
      </div>

      <div class="card-row">
        <div class="card">
          <h2 class="card__title">Atualizações por responsável</h2>
          <div data-role="responsaveis"></div>
        </div>
        <div class="card">
          <h2 class="card__title">Atualizações por sistema no mês</h2>
          <p class="card__subtitle">Clientes atualizados em cada sistema. ▲▼ contra o mesmo período do mês anterior; clique para ver a lista.</p>
          <div data-role="sistemas"></div>
        </div>
      </div>

      <div data-role="gaveta-lista" class="gaveta-lista">
        <div class="gaveta-lista__topo">
          <p class="gaveta-lista__ajuda" data-role="gaveta-ajuda"></p>
          <div class="gaveta-lista__busca-wrap">
            <input type="search" class="gaveta-lista__busca" data-role="gaveta-busca" placeholder="Filtrar na lista..." aria-label="Filtrar na lista" autocomplete="off" />
            <span class="gaveta-lista__contagem" data-role="gaveta-contagem"></span>
          </div>
        </div>
        <div data-role="gaveta-tabela" class="gaveta-lista__tabela"></div>
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
        // Levava para a aba Sistemas, que não tem como mostrar "quem está sem
        // atualização" -- o clique abria uma lista que não era a contada.
        semAtualizacao: () => this._listarSemAtualizacao(),
      };
      rotas[tile.dataset.stat]?.();
    });

    this.situacaoEl = this.container.querySelector('[data-role="situacao"]');
    this.situacaoEl.addEventListener("click", (e) => {
      const grupoAtividade = e.target.closest("[data-grupo-atividade]");
      if (grupoAtividade) return this._listarGrupoAtividade(grupoAtividade.dataset.grupoAtividade);
      const critico = e.target.closest("[data-cliente-critico]");
      if (critico) return this.navigate("clientes", { cliente: critico.dataset.clienteCritico });
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
    this.gavetaBusca = this.gavetaEl.querySelector('[data-role="gaveta-busca"]');
    this.gavetaContagem = this.gavetaEl.querySelector('[data-role="gaveta-contagem"]');
    this.gavetaTabela = this.gavetaEl.querySelector('[data-role="gaveta-tabela"]');
    this.gaveta = new Gaveta(this.gavetaEl, { titulo: "Clientes" });
    this.gavetaBusca.addEventListener("input", () => this._filtrarGaveta());
    this.gavetaEl.addEventListener("click", (e) => {
      const alvo = e.target.closest("[data-ir]");
      if (!alvo) return;
      this.gaveta.fechar({ forcar: true });
      if (alvo.dataset.ir === "cliente") this.navigate("clientes", { cliente: alvo.dataset.valor });
      else this.navigate("sistemas", { sistema: alvo.dataset.valor });
    });

    this.respChart = new GraficoDeBarras(this.container.querySelector('[data-role="responsaveis"]'), {
      vazio: "Nenhuma atualização registrada ainda.",
      aoClicar: (barra) => this.navigate("atualizacoes", { responsavel: barra.label }),
    });

    this.sistemaChart = new GraficoDeBarras(this.container.querySelector('[data-role="sistemas"]'), {
      vazio: "Nenhuma atualização registrada neste mês ainda.",
      // A lista abre com o MESMO recorte do número: o sistema da barra e o
      // mês até hoje. "Outros" junta vários sistemas, que a lista não filtra
      // de uma vez -- abre o mês inteiro.
      aoClicar: (barra) =>
        this.navigate("atualizacoes", { desde: primeiroDiaDoMes(), ate: hojeBR(), sistema: barra.outros ? "" : barra.label }),
    });
    this.tendenciaChart = new GraficoDeLinhas(this.container.querySelector('[data-role="tendencia"]'));

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
    this._definirNumero("clientes", resumo.totalClientes);
    this._definirNumero("atualizacoes", resumo.totalAtualizacoes);
    this._definirNumero("mes", resumo.mesCount);
    this._definirNumero("semAtualizacao", resumo.semAtualizacao.length);
    // O limite é regra da equipe e pode ter mudado desde que a tela abriu: o
    // rótulo usa o número com que o servidor MONTOU esta lista, não o que a
    // tela tinha guardado -- os dois não podem se contradizer.
    if (resumo.desatualizadoDias) {
      const rotuloEl = this.container.querySelector('[data-stat="semAtualizacao"] [data-role="rotulo"]');
      if (rotuloEl) rotuloEl.textContent = rotuloSemAtualizacao(resumo.desatualizadoDias);
    }
    this._definirVariacao("mes", tendenciaMensal(resumo.mesAtualComparavel, resumo.mesAnteriorComparavel));
    this._atualizarAriaLabel(this.container.querySelector('[data-stat="semAtualizacao"]'));

    const semAtualizacaoTile = this.container.querySelector('[data-stat="semAtualizacao"]');
    semAtualizacaoTile.classList.toggle("is-alert", resumo.semAtualizacao.length > 0);
    // Suaviza o destaque sem quebrar contratos de classe nem seletores de teste:
    // aplica borda e background semântico sutil (estilo Stripe/Linear warning) sem mancha vermelha pura.
    if (resumo.semAtualizacao.length > 0) {
      semAtualizacaoTile.style.borderColor = "color-mix(in srgb, var(--cor-vermelho, #e5484d) 35%, var(--cor-borda, transparent))";
      semAtualizacaoTile.style.background = "color-mix(in srgb, var(--cor-vermelho, #e5484d) 4%, var(--cor-superficie))";
    } else {
      semAtualizacaoTile.style.borderColor = "";
      semAtualizacaoTile.style.background = "";
    }

    this.resumo = resumo;
    if (resumo.atividadeClientes) {
      this.situacaoEl.innerHTML = corpoAtividade(
        totaisAtividade(resumo.atividadeClientes),
        resumo.semAtualizacao || [],
        resumo.situacaoClientes?.sistemasMaisAtrasados || []
      );
    } else {
      this.situacaoEl.innerHTML = corpoSituacao(totaisSituacao(resumo.situacaoClientes), resumo.situacaoClientes?.sistemasMaisAtrasados || [], resumo.prazoVersaoDias ?? null);
    }

    this.respChart.render(
      (resumo.porResponsavel || []).map((r) => ({
        label: r.label,
        total: r.total,
        dica: `${r.label}: ${plural(r.total, "atualização", "atualizações")}`,
      }))
    );
    const barras = barrasPorSistema(resumo.atualizadosMesPorSistema);
    this.sistemaChart.render(
      // Zerado este mês, com atualização só no mês anterior: não vale uma
      // barra, mas conta para o estado vazio não mentir que "nada aconteceu".
      barras.some((b) => b.total > 0)
        ? barras.map((b) => ({
            label: b.label,
            total: b.total,
            dica: b.outros ? `Outros (${b.sistemas.join(", ")}): ${b.total}` : `${b.label}: ${plural(b.total, "cliente")} este mês, ${b.anterior} no mesmo período do mês anterior`,
            variacao: { ...variacaoMesAnterior(b.diferenca), dica: `${b.anterior} no mesmo período do mês anterior` },
          }))
        : []
    );
    this.container.querySelector('[data-role="tendencia-atual"]').textContent =
      resumo.mesCount > 0
        ? `${plural(resumo.mesCount, "atualização", "atualizações")} neste mês (parcial)`
        : "Nenhuma atualização registrada este mês ainda";

    const historicoMeses = resumo.atualizacoesPorMes || [];
    const totalHistorico = historicoMeses.reduce((acc, item) => acc + (item.total || 0), 0);
    const containerTendencia = this.container.querySelector('[data-role="tendencia"]');
    if (totalHistorico === 0) {
      containerTendencia.setAttribute("data-vazio", "true");
    } else {
      containerTendencia.removeAttribute("data-vazio");
    }

    this.tendenciaChart.render(
      historicoMeses.map((item) => ({ label: formatarMes(item.mes), total: item.total, parcial: item.mes === historicoMeses.at(-1)?.mes }))
    );
  }

  aoEntrar() {
    if (this.resumo) {
      requestAnimationFrame(() => {
        const historicoMeses = this.resumo?.atualizacoesPorMes || [];
        this.tendenciaChart.render(
          historicoMeses.map((item) => ({ label: formatarMes(item.mes), total: item.total, parcial: item.mes === historicoMeses.at(-1)?.mes }))
        );
        for (const el of this.container.querySelectorAll(".bar-chart__fill")) el.classList.add("is-visivel");
      });
    }
  }

  /** @param {string} chave ate30 | ate60 | mais60 | nunca */
  _listarGrupoAtividade(chave) {
    const grupo = GRUPOS_ATIVIDADE.find((g) => g.chave === chave);
    const clientes = this.resumo?.atividadeClientes?.[chave] || [];
    const tomBadge = {
      ate30: "badge--success",
      ate60: "badge--neutral",
      mais60: "badge--danger",
      nunca: "badge--muted",
    }[chave] || "badge--muted";
    this._abrirGaveta({
      titulo: `${grupo?.rotulo || "Clientes"} — ${plural(clientes.length, "cliente")}`,
      ajuda: grupo?.descricao || "Tempo desde a última atualização registrada.",
      colunas: [
        { key: "nome", label: "Cliente", render: (row) => this._link("cliente", row.nome) },
        { key: "cidade", label: "Cidade", render: (row) => this._celulaSecundaria(row.cidade || "—") },
        { key: "ultima", label: "Última atualização", type: "date", render: (row) => this._celulaMono(row.ultima || "Nunca") },
        {
          key: "dias",
          label: "Tempo",
          type: "numeric",
          render: (row) => this._badgeDias(row.dias != null ? `${row.dias} ${row.dias === 1 ? "dia" : "dias"}` : "Nunca", tomBadge),
        },
      ],
      linhas: clientes,
      chave: (row) => row.nome,
      vazio: "Nenhum cliente nesta faixa.",
    });
  }

  /** @param {string} chave em_dia | aguardando | desatualizado */
  _listarGrupo(chave) {
    const grupo = GRUPOS_SITUACAO.find((g) => g.chave === chave);
    const clientes = this.resumo?.situacaoClientes?.[chave] || [];
    this._abrirGaveta({
      titulo: `${grupo.rotulo} — ${plural(clientes.length, "cliente")}`,
      ajuda: grupo.descricao,
      colunas: [
        { key: "nome", label: "Cliente", render: (row) => this._link("cliente", row.nome) },
        { key: "cidade", label: "Cidade", render: (row) => this._celulaSecundaria(row.cidade || "—") },
        { key: "sistemas", label: { desatualizado: "Sistemas atrasados", aguardando: "Sistemas aguardando" }[chave] || "Sistemas" },
      ],
      linhas: clientes.map((c) => ({ nome: c.nome, cidade: c.cidade, sistemas: descreverSistemasQueExplicam(c.explicam) })),
      chave: (row) => row.nome,
      vazio: "Nenhum cliente nesta situação.",
    });
  }

  _listarSemAtualizacao() {
    const clientes = this.resumo?.semAtualizacao || [];
    this._abrirGaveta({
      titulo: `${rotuloSemAtualizacao(this.resumo?.desatualizadoDias)} — ${plural(clientes.length, "cliente")}`,
      ajuda: "Tempo desde a última atualização registrada. Clique num cliente para abrir a ficha completa.",
      colunas: [
        { key: "nome", label: "Cliente", render: (row) => this._link("cliente", row.nome) },
        { key: "cidade", label: "Cidade", render: (row) => this._celulaSecundaria(row.cidade || "—") },
        { key: "ultima", label: "Última atualização", type: "date", render: (row) => this._celulaMono(row.ultima || "Nunca") },
        // Clientes sem registro anterior ou com data inválida mostram "Nunca"
        {
          key: "dias",
          label: "Tempo",
          type: "numeric",
          render: (row) => {
            const nunca = row.dias == null || row.dias >= Number.MAX_SAFE_INTEGER || !row.ultima || row.ultima === "Nunca";
            return this._badgeDias(nunca ? "Nunca" : `${row.dias} dias`, nunca ? "badge--muted" : "badge--danger");
          },
        },
      ],
      linhas: clientes,
      chave: (row) => row.nome,
      vazio: "Todos os clientes foram atualizados dentro do prazo.",
    });
  }

  _listarSistemas() {
    const sistemas = this.resumo?.situacaoClientes?.sistemasMaisAtrasados || [];
    this._abrirGaveta({
      titulo: "Clientes pendentes por sistema",
      ajuda: "Conta cada sistema separado: um cliente pendente em dois sistemas aparece nos dois. Clique no sistema para abrir a aba Sistemas.",
      colunas: [
        { key: "sistema", label: "Sistema", render: (row) => this._link("sistema", row.sistema) },
        { key: "total", label: "Pendentes", type: "numeric", render: (row) => this._celulaMono(String(row.total)) },
        { key: "clientes", label: "Total no sistema", type: "numeric", render: (row) => this._celulaMono(String(row.clientes)) },
        {
          key: "pct",
          label: "Proporção",
          type: "numeric",
          render: (row) => this._barraProporcao(row.pct),
        },
      ],
      // A mesma proporção do card: atrasados sobre quem usa o sistema.
      linhas: sistemas.map((s) => ({ ...s, clientes: s.clientes || s.total, pct: Math.round((s.total / (s.clientes || s.total || 1)) * 100) })),
      chave: (row) => row.sistema,
      vazio: "Nenhum sistema com cliente pendente.",
    });
  }

  /**
   * Uma tabela nova a cada abertura: as três listas têm colunas diferentes,
   * e o TabelaOrdenavel fixa as colunas no construtor.
   */
  _abrirGaveta({ titulo, ajuda, colunas, linhas, chave, vazio }) {
    const alvo = document.createElement("div");
    this.gavetaTabela.replaceChildren(alvo);
    this._gavetaLinhasOriginais = linhas;
    this._gavetaVazioOriginal = vazio;
    this._gavetaTabelaInstancia = new TabelaOrdenavel(alvo, { columns: colunas, rowKey: chave, emptyMessage: vazio, selectable: false });
    this._gavetaTabelaInstancia.definirLinhas(linhas);
    this.gavetaAjuda.textContent = ajuda;
    this.gavetaBusca.value = "";
    this.gavetaBusca.parentElement.hidden = linhas.length <= 5;
    this.gavetaContagem.textContent = `${plural(linhas.length, "item", "itens")}`;
    this.gaveta.setTitulo(titulo);
    this.gaveta.abrir({ foco: linhas.length > 5 ? this.gavetaBusca : undefined });
  }

  _filtrarGaveta() {
    if (!this._gavetaTabelaInstancia || !this._gavetaLinhasOriginais) return;
    const termo = this.gavetaBusca.value.trim();
    const filtradas = !termo
      ? this._gavetaLinhasOriginais
      : this._gavetaLinhasOriginais.filter((row) =>
          casaBusca([row.nome, row.sistema, row.cidade, row.ultima, row.sistemas].filter(Boolean).join(" "), termo)
        );
    this._gavetaTabelaInstancia.emptyMessage = termo ? `Nenhum resultado para "${termo}".` : this._gavetaVazioOriginal;
    this._gavetaTabelaInstancia.definirLinhas(filtradas);
    this.gavetaContagem.textContent = termo
      ? `${filtradas.length} de ${this._gavetaLinhasOriginais.length}`
      : `${plural(this._gavetaLinhasOriginais.length, "item", "itens")}`;
  }

  _celulaSecundaria(texto) {
    const span = document.createElement("span");
    span.className = "gaveta-lista__cidade";
    span.textContent = texto;
    span.title = texto;
    return span;
  }

  _celulaMono(texto) {
    const span = document.createElement("span");
    span.className = "gaveta-lista__mono";
    span.textContent = texto;
    return span;
  }

  _badgeDias(texto, classeBadge) {
    const span = document.createElement("span");
    span.className = `badge ${classeBadge} gaveta-lista__badge`;
    span.textContent = texto;
    return span;
  }

  _barraProporcao(pct) {
    const wrap = document.createElement("span");
    wrap.className = "gaveta-lista__proporcao";
    const trilho = document.createElement("span");
    trilho.className = "gaveta-lista__proporcao-trilho";
    const barra = document.createElement("span");
    barra.className = "gaveta-lista__proporcao-barra";
    barra.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    trilho.appendChild(barra);
    const rotulo = document.createElement("strong");
    rotulo.textContent = `${pct}%`;
    wrap.append(trilho, rotulo);
    return wrap;
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

  _definirNumero(key, value) {
    const tile = this.container.querySelector(`[data-stat="${key}"]`);
    if (!tile) return;
    const valEl = tile.querySelector(".stat-tile__value");
    if (valEl) valEl.textContent = String(value);
    this._atualizarAriaLabel(tile);
  }

  _atualizarAriaLabel(tile) {
    if (!tile) return;
    const rotulo = tile.querySelector('[data-role="rotulo"]')?.textContent || "";
    const valor = tile.querySelector(".stat-tile__value")?.textContent || "—";
    const destino = tile.dataset.destino || tile.title || "";
    const deltaEl = tile.querySelector('[data-role="delta"]');
    const deltaTexto = deltaEl && !deltaEl.hidden ? ` (${deltaEl.textContent.trim()} vs mês anterior)` : "";
    tile.setAttribute("aria-label", `${rotulo}: ${valor}${deltaTexto}. ${destino}`.trim());
  }

  /** @param {{pct: number, tendencia: "alta"|"baixa"|"neutra"}|null} tendencia */
  _definirVariacao(key, tendencia) {
    const tile = this.container.querySelector(`[data-stat="${key}"]`);
    if (!tile) return;
    const el = tile.querySelector('[data-role="delta"]');
    if (!el) return;
    if (!tendencia) {
      el.hidden = true;
      this._atualizarAriaLabel(tile);
      return;
    }
    el.hidden = false;
    el.className = `stat-tile__delta is-${tendencia.tendencia}`;
    el.innerHTML = deltaTendencia(tendencia);
    el.title = "Comparado ao mesmo período do mês anterior";
    this._atualizarAriaLabel(tile);
  }

  destroy() {
    this.tendenciaChart.destroy();
    this.gaveta.destroy();
    super.destroy();
  }
}
