import { View } from "../app/View.js";
import { debounce } from "../utils/debounce.js";
import { emptyState } from "../components/EmptyState.js";
import { plural, html, copyToClipboard } from "../utils/html.js";
import { toast } from "../components/Toast.js";
import { montarMatrizVersoes } from "../domain/matrizVersoes.js";
import { cartaoAcesso, CABECALHO_MATRIZ, linhaMatrizVersoes } from "../templates/consulta.js";

const MAX_SUGESTOES = 50;

/**
 * Aba Consultar Cliente: busca por nome e mostra sistemas + última
 * atualização. Equivalente de gestor/views/consulta.py.
 *
 * Ganhou `aplicarParams({ cliente })`: a paleta de comandos (Ctrl+K) lista os
 * clientes cadastrados e abre a ficha direto aqui. Antes, ver a ficha de um
 * cliente custava "ir para a aba > digitar o nome > clicar no resultado"; com
 * a paleta virou uma ação só, de qualquer tela.
 */
export class ConsultaView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.allNames = [];
    this.currentMatches = [];
    this.activeName = null;
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = html`
      <div class="consulta-layout">
        <div class="card consulta-search">
          <h2 class="card__title">Buscar Cliente</h2>
          <input type="search" class="input" data-role="search" placeholder="Digite um nome..." aria-label="Buscar cliente pelo nome" />
          <div class="consulta-matches" data-role="matches" role="listbox" aria-label="Clientes encontrados"></div>
          <span class="result-count" data-role="count" aria-live="polite"></span>
        </div>
        <div class="card consulta-detail" data-role="detail"></div>
      </div>
    `;
    this.searchInput = this.container.querySelector('[data-role="search"]');
    this.matchesBox = this.container.querySelector('[data-role="matches"]');
    this.countLabel = this.container.querySelector('[data-role="count"]');
    this.detailBox = this.container.querySelector('[data-role="detail"]');

    this.searchInput.addEventListener("input", debounce(() => this._filterMatches(), 200));
    // Setas percorrem a lista de resultados sem tirar a mão do campo de busca.
    this.searchInput.addEventListener("keydown", (e) => this._navegarResultados(e));
    // Uma vez o foco DENTRO da lista (o `primeiro.focus()` logo abaixo leva
    // para lá), as setas paravam de fazer qualquer coisa -- só o Tab movia.
    // Delegado no container em vez de um listener por botão: a lista é
    // redesenhada inteira a cada busca (ver _filterMatches).
    this.matchesBox.addEventListener("keydown", (e) => this._navegarNaLista(e));

    this._renderDetailVazio();
  }

  /** Chamado pela paleta de comandos ao escolher um cliente. */
  aplicarParams({ cliente }) {
    if (!cliente) return;
    this._clientePendente = cliente;
  }

  async refresh() {
    await this.swr(
      "consulta:nomes",
      () => this.api.get("/clientes/names", null, { key: "clientes:names" }),
      (nomes) => {
        this.allNames = nomes;
        this._filterMatches();
      }
    );

    // Um cliente pedido pela paleta é aberto depois que a lista chegou.
    if (this._clientePendente) {
      const alvo = this._clientePendente;
      this._clientePendente = null;
      this.searchInput.value = alvo;
      this._filterMatches();
      await this._selectClient(alvo);
    }
  }

  _filterMatches() {
    const termo = this.searchInput.value.trim().toLowerCase();
    const todos = termo ? this.allNames.filter((n) => n.toLowerCase().includes(termo)) : this.allNames;
    this.currentMatches = todos.slice(0, MAX_SUGESTOES);
    this.countLabel.textContent =
      todos.length > this.currentMatches.length
        ? `${plural(todos.length, "cliente")} — mostrando os ${MAX_SUGESTOES} primeiros`
        : plural(todos.length, "cliente");

    this.matchesBox.replaceChildren();
    if (this.currentMatches.length === 0) {
      this.matchesBox.appendChild(
        emptyState({
          titulo: termo ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado",
          descricao: termo ? `Nada casa com "${this.searchInput.value.trim()}".` : "Cadastre clientes na aba Clientes.",
          icone: termo ? "busca" : "clientes",
          acao: termo ? undefined : { label: "Ir para Clientes", onClick: () => this.navigate("clientes") },
        })
      );
      return;
    }
    for (const nome of this.currentMatches) {
      // <button> em vez de <div>: alcançável por Tab e acionável por Enter.
      // Como <div onclick>, a lista inteira era invisível para quem navega
      // por teclado ou usa leitor de tela.
      const item = document.createElement("button");
      item.type = "button";
      item.className = "consulta-matches__item" + (nome === this.activeName ? " is-active" : "");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(nome === this.activeName));
      item.textContent = nome;
      item.addEventListener("click", () => this._selectClient(nome));
      this.matchesBox.appendChild(item);
    }
  }

  _navegarResultados(e) {
    if (e.key !== "ArrowDown" && e.key !== "Enter") return;
    const primeiro = this.matchesBox.querySelector(".consulta-matches__item");
    if (!primeiro) return;
    e.preventDefault();
    if (e.key === "Enter") this._selectClient(this.currentMatches[0]);
    else primeiro.focus();
  }

  /** Seta para cima/baixo e Home/End dentro da lista de resultados (Enter já funciona: é um <button>). */
  _navegarNaLista(e) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const itens = Array.from(this.matchesBox.querySelectorAll(".consulta-matches__item"));
    if (itens.length === 0) return;
    const atual = itens.indexOf(document.activeElement);
    e.preventDefault();

    if (e.key === "ArrowUp" && atual <= 0) {
      // Seta para cima no primeiro item devolve o foco à busca -- simétrico
      // ao ArrowDown do campo, que é o que trouxe o foco para cá.
      this.searchInput.focus();
      return;
    }

    const proximo =
      e.key === "Home" ? 0 : e.key === "End" ? itens.length - 1 : e.key === "ArrowUp" ? atual - 1 : Math.min(atual + 1, itens.length - 1);
    itens[Math.max(0, proximo)].focus();
  }

  async _selectClient(nome) {
    this.activeName = nome;
    this._filterMatches();

    try {
      const cliente = await this.api.get(`/clientes/by-nome/${encodeURIComponent(nome)}`, null, { key: "consulta:cliente" });
      if (!cliente) {
        toast.error("Cliente não encontrado.");
        return;
      }
      const [historico, painelVersoes, acessos] = await Promise.all([
        this.api.get(`/atualizacoes/recent-by-client/${encodeURIComponent(nome)}`, { limit: 10 }, { key: "consulta:historico" }),
        this.api.get("/versoes/painel", null, { key: "consulta:painel" }).catch(() => null),
        this.api.get(`/clientes/${cliente.id}/acessos`, null, { key: "consulta:acessos" }).catch(() => []),
      ]);
      this._renderDetail(cliente, historico, painelVersoes, acessos);
    } catch (erro) {
      if (erro?.cancelled) return; // outra seleção, mais nova, tomou o lugar
      toast.error("Não foi possível carregar os dados deste cliente.");
    }
  }

  _renderDetailVazio() {
    this.detailBox.replaceChildren(
      emptyState({
        titulo: "Selecione um cliente",
        descricao: "Busque à esquerda, ou use Ctrl+K e digite o nome de qualquer lugar do sistema.",
        icone: "consulta",
      })
    );
  }

  _renderDetail(cliente, historico, painelVersoes, acessos = []) {
    this.detailBox.innerHTML = html`
      <div class="consulta-detail__name"></div>
      <div class="consulta-detail__subtitle"></div>
      <nav class="client-hub-tabs" role="tablist" aria-label="Ficha 360 graus">
        <button type="button" class="btn is-active" data-client-tab="resumo">Resumo & Cadastro</button>
        <button type="button" class="btn" data-client-tab="acessos">Acessos Remotos</button>
        <button type="button" class="btn" data-client-tab="versoes">Matriz de Versões</button>
        <button type="button" class="btn" data-client-tab="timeline">Linha do Tempo</button>
      </nav>
      <section class="client-hub-panel" data-client-panel="resumo"><div class="info-grid" data-role="cadastro"></div></section>
      <section class="client-hub-panel" data-client-panel="acessos" hidden><div class="access-grid" data-role="acessos"></div></section>
      <section class="client-hub-panel" data-client-panel="versoes" hidden><div data-role="versao-matriz"></div></section>
      <section class="client-hub-panel" data-client-panel="timeline" hidden><div class="client-timeline" data-role="ultima"></div></section>
    `;
    this.detailBox.querySelector(".consulta-detail__name").textContent = cliente.nome;

    const subtitulos = [];
    if (cliente.codigo) subtitulos.push(`Código: ${cliente.codigo}`);
    if (cliente.cidade) subtitulos.push(`Cidade: ${cliente.cidade}`);
    if (cliente.cnpj) subtitulos.push(`CNPJ: ${cliente.cnpj}`);
    this.detailBox.querySelector(".consulta-detail__subtitle").textContent =
      subtitulos.length > 0 ? subtitulos.join("    ·    ") : "Sem informações cadastrais adicionais";

    const cadastro = this.detailBox.querySelector('[data-role="cadastro"]');
    cadastro.append(infoItem("Código", cliente.codigo), infoItem("Grupo / Rede", cliente.grupo), infoItem("Cidade", cliente.cidade),
      infoItem("CNPJ", cliente.cnpj), infoItem("Sistemas contratados", (cliente.sistemas || []).join(", "), true));

    const acessosBox = this.detailBox.querySelector('[data-role="acessos"]');
    if (acessos.length === 0) acessosBox.appendChild(emptyState({ titulo: "Nenhum acesso remoto", descricao: "Cadastre os acessos na tela Clientes.", icone: "acessos" }));
    for (const acesso of acessos) {
      const card = document.createElement("article");
      card.className = "access-card";
      card.innerHTML = cartaoAcesso(acesso);
      card.addEventListener("click", async (e) => {
        const tipo = e.target.closest("[data-copy]")?.dataset.copy;
        if (!tipo) return;
        const valor = tipo === "anydesk" ? acesso.anydesk : (acesso.suporte_bredas || acesso.suporteBredas);
        if (valor && await copyToClipboard(valor)) toast.success("Acesso copiado.");
      });
      acessosBox.appendChild(card);
    }

    this.detailBox.querySelector(".client-hub-tabs").addEventListener("click", (e) => {
      const botao = e.target.closest("[data-client-tab]");
      if (!botao) return;
      for (const item of this.detailBox.querySelectorAll("[data-client-tab]")) item.classList.toggle("is-active", item === botao);
      for (const painel of this.detailBox.querySelectorAll("[data-client-panel]")) painel.hidden = painel.dataset.clientPanel !== botao.dataset.clientTab;
    });

    // Matriz Comparativa de Versões (Feature 3.2): Sistema | Instalada | Publicada | Estado | Último contato
    this._renderMatrizVersoes(cliente, historico, painelVersoes);

    const caixa = this.detailBox.querySelector('[data-role="ultima"]');
    if (!historico || historico.length === 0) {
      caixa.appendChild(
        emptyState({
          titulo: "Nenhuma atualização registrada",
          descricao: `Nada foi registrado para ${cliente.nome} ainda.`,
          icone: "atualizacoes",
          acao: { label: "Registrar atualização", onClick: () => this.navigate("atualizacoes") },
        })
      );
      return;
    }

    historico.forEach((registro, indice) => {
      if (indice > 0) {
        const separador = document.createElement("hr");
        separador.className = "separator";
        caixa.appendChild(separador);
      }
      const grid = document.createElement("article");
      grid.className = "info-grid";
      grid.appendChild(infoItem("Data", registro.data));
      grid.appendChild(infoItem("Sistema", registro.sistema));
      grid.appendChild(infoItem("Versão", registro.versao));
      grid.appendChild(infoItem("Atualizado por", registro.responsavel));
      grid.appendChild(infoItem("Máquinas", registro.maquinas));
      grid.appendChild(infoItem("Motivo", registro.motivo, true));
      if (registro.obs) grid.appendChild(infoItem("Obs", registro.obs, true));
      caixa.appendChild(grid);
    });
  }

  /** As contas estão em domain/matrizVersoes.js e a marcação em templates/consulta.js -- os dois testados. */
  _renderMatrizVersoes(cliente, historico, painelVersoes) {
    const container = this.detailBox.querySelector('[data-role="versao-matriz"]');
    const linhas = montarMatrizVersoes(cliente, historico, painelVersoes);
    if (linhas.length === 0) {
      container.replaceChildren(
        emptyState({
          titulo: "Nenhum sistema associado",
          descricao: "Este cliente não possui sistemas vinculados nem registros prévios.",
          icone: "sistemas",
        })
      );
      return;
    }

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";
    tableWrap.style.marginBottom = "var(--sp-2)";

    const table = document.createElement("table");
    table.className = "data-table";
    table.innerHTML = CABECALHO_MATRIZ;

    const tbody = table.querySelector("tbody");
    for (const linha of linhas) {
      const tr = document.createElement("tr");
      tr.className = "is-readonly";
      tr.innerHTML = linhaMatrizVersoes(linha);
      tbody.appendChild(tr);
    }

    tableWrap.appendChild(table);
    container.replaceChildren(tableWrap);
  }
}

function infoItem(label, value, wide = false) {
  const div = document.createElement("div");
  div.className = "info-grid__item" + (wide ? " info-grid__item--wide" : "");
  const l = document.createElement("div");
  l.className = "info-grid__label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "info-grid__value";
  v.textContent = value || "—";
  div.append(l, v);
  return div;
}
