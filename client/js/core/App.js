import { icon } from "./icons.js";
import { Modal } from "./Modal.js";
import { toast } from "./Toast.js";
import { escapeHtml } from "./html.js";
import { SwrCache } from "./SwrCache.js";
import { Router } from "./router.js";
import { CommandPalette } from "./CommandPalette.js";
import { ligarAtalhoAjuda, mostrarAtalhos } from "./Shortcuts.js";
import { theme } from "./theme.js";
import { settings } from "./prefs.js";
import { RequestCancelled } from "../api/ApiClient.js";
import { LoginView } from "../views/LoginView.js";
import { ResumoView } from "../views/ResumoView.js";
import { AtualizacoesView } from "../views/AtualizacoesView.js";
import { AgendamentosView } from "../views/AgendamentosView.js";
import { ClientesView } from "../views/ClientesView.js";
import { ConsultaView } from "../views/ConsultaView.js";
import { HistoricoView } from "../views/HistoricoView.js";
import { SistemasView } from "../views/SistemasView.js";
import { BackupsPanel } from "../views/BackupsPanel.js";
import { UsersPanel } from "../views/UsersPanel.js";
import { DistribuicaoView } from "../views/DistribuicaoView.js";
import { VersoesView } from "../views/VersoesView.js";
import { ReminderBanner } from "./ReminderBanner.js";

/**
 * Uma entrada por aba: chave interna (que é também a rota na URL), rótulo,
 * ícone, a classe de View responsável e a linha de apoio que aparece no
 * cabeçalho.
 *
 * O `descricao` é novo e existe porque o cabeçalho tinha uma frase fixa
 * ("Monitore clientes, versões e a saúde das atualizações") que valia para o
 * app inteiro e portanto não dizia nada sobre a tela aberta.
 */
const TABS = [
  { key: "resumo", label: "Resumo", icon: "resumo", View: ResumoView,
    descricao: "Indicadores gerais e quem está sem atualização há mais tempo." },
  { key: "atualizacoes", label: "Atualizações", icon: "atualizacoes", View: AtualizacoesView,
    descricao: "Histórico de atualizações feitas em cada cliente." },
  { key: "distribuicao", label: "Distribuição", icon: "distribuicao", View: DistribuicaoView,
    descricao: "Publique pacotes e acompanhe o retorno dos agentes." },
  { key: "versoes", label: "Versões", icon: "versoes", View: VersoesView,
    descricao: "Inventário de versões registradas e publicadas." },
  { key: "agendamentos", label: "Agendamentos", icon: "agendamentos", View: AgendamentosView,
    descricao: "Agenda interna de tarefas da equipe." },
  { key: "clientes", label: "Clientes", icon: "clientes", View: ClientesView,
    descricao: "Cadastro de clientes e dos sistemas que cada um usa." },
  { key: "consulta", label: "Consultar Cliente", icon: "consulta", View: ConsultaView,
    descricao: "Ficha completa de um cliente específico." },
  { key: "sistemas", label: "Sistemas", icon: "sistemas", View: SistemasView,
    descricao: "Relatório por sistema, com data de corte opcional." },
  { key: "historico", label: "Histórico", icon: "historico", View: HistoricoView,
    descricao: "Quem criou, editou ou excluiu o quê, e quando." },
];

/**
 * Classe raiz do front-end: decide se mostra a tela de autenticação ou o
 * shell principal (barra lateral + cabeçalho + abas), e troca de aba mantendo
 * cada View viva (só escondida) para não perder o que o usuário estava
 * digitando ao dar uma olhada em outra tela.
 *
 * O que ela ganhou nesta revisão:
 *  - **rota na URL** (`#/clientes`), então recarregar mantém a tela e dá para
 *    mandar link de uma aba específica;
 *  - **cache compartilhado** entre as views (`SwrCache`), que é o que faz a
 *    troca de aba ser instantânea;
 *  - **título de verdade** (`<h1>`) que muda conforme a aba -- antes o
 *    cabeçalho não tinha `h1` nenhum, e a regra de CSS que o estilizava
 *    apontava para um elemento que nunca era criado;
 *  - **paleta de comandos**, **atalhos numerados** e **tema claro/escuro**;
 *  - **`destroy()` nas views**, para os listeners globais delas não vazarem
 *    quando a sessão expira.
 */
export class App {
  /** @param {HTMLElement} root @param {import('../api/ApiClient').ApiClient} api */
  constructor(root, api) {
    this.root = root;
    this.api = api;
    this.user = null;
    this.views = new Map();
    this.activeTab = null;
    this.reauthenticating = false;
    this.cache = new SwrCache();
    /** @type {Array<() => void>} coisas a desligar quando o shell é desmontado */
    this._cleanups = [];

    // Um 401 em QUALQUER chamada -- não só no carregamento de aba -- leva de
    // volta ao login. Antes, a sessão expirar durante um "Adicionar" só
    // produzia um "Ocorreu um erro inesperado".
    this.api.onUnauthorized = () => this._showLoginAgain();
  }

  /** Decide a tela inicial olhando o status de autenticação no servidor. */
  async start() {
    let status;
    try {
      status = await this.api.get("/auth/status");
    } catch {
      this._renderFalhaConexao();
      return;
    }
    if (status.needsSetup) {
      new LoginView(this.root, this.api, "setup", (user) => this._onAuthenticated(user));
      return;
    }
    if (!status.user) {
      new LoginView(this.root, this.api, "login", (user) => this._onAuthenticated(user));
      return;
    }
    this._onAuthenticated(status.user);
  }

  /**
   * Falha de conexão com botão de tentar de novo. Antes era uma frase solta
   * mandando "recarregue a página" -- deixar o usuário executar a ação em vez
   * de instruí-lo a fazê-la manualmente é sempre melhor.
   */
  _renderFalhaConexao() {
    this.root.innerHTML = `
      <div class="auth-screen">
        <div class="empty-state">
          <div class="empty-state__icon">${icon("alerta")}</div>
          <p class="empty-state__title">Não foi possível conectar ao servidor</p>
          <p class="empty-state__desc">Verifique se o Gestor está rodando e tente de novo.</p>
          <button type="button" class="btn btn--accent" data-action="retry">Tentar novamente</button>
        </div>
      </div>
    `;
    this.root.querySelector('[data-action="retry"]').addEventListener("click", () => this.start());
  }

  _onAuthenticated(user) {
    this.user = user;
    this.api.resetUnauthorized();
    this._buildShell();
    this.router = new Router(
      TABS.map((t) => t.key),
      (rota) => this._mostrarAba(rota)
    );
    this._cleanups.push(() => this.router.destroy());
    this.router.iniciar(TABS[0].key);
    this._checkLembretes();
  }

  async _checkLembretes() {
    let itens;
    try {
      itens = await this.api.get("/agendamentos/lembretes");
    } catch {
      return; // sem lembrete é melhor que travar o app inteiro por causa disso
    }
    this.reminderBanner.show(itens);
  }

  async _logout() {
    const ok = await Modal.confirm("Sair", "Deseja encerrar sua sessão?", { confirmLabel: "Sair", danger: false });
    if (!ok) return;
    await this.api.post("/auth/logout");
    this._desmontar();
    this.start();
  }

  /** Descarta views e listeners globais antes de trocar de tela. */
  _desmontar() {
    for (const { instance } of this.views.values()) instance.destroy?.();
    this.views.clear();
    for (const desligar of this._cleanups) desligar();
    this._cleanups = [];
    this.cache.invalidar();
  }

  _buildShell() {
    const recolhida = settings.get("sidebarRecolhida", false);
    this.root.className = recolhida ? "is-sidebar-collapsed" : "";
    this.root.innerHTML = `
      <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <aside class="app-sidebar">
        <div class="app-brand">
          <div class="app-brand__mark" aria-hidden="true">
            <img src="/assets/logo.png" alt="" width="34" height="34" />
          </div>
          <div class="app-brand__text"><strong>ATUALIZADOR</strong><span>Gestor de clientes</span></div>
        </div>
        <button type="button" class="app-sidebar__toggle" data-action="toggle-sidebar"
                aria-label="Recolher menu" title="Recolher menu (deixa mais espaço para as tabelas)">
          ${icon("painel")}
        </button>
        <div class="app-sidebar__label">Workspace</div>
        <nav class="tabs" role="tablist" aria-label="Telas do sistema"></nav>
        <div class="app-sidebar__footer">
          <button type="button" class="btn btn--small btn--sidebar" data-action="backups">${icon("backups")} <span>Backups</span></button>
          <button type="button" class="btn btn--small btn--sidebar" data-action="users">${icon("users")} <span>Usuários</span></button>
        </div>
      </aside>
      <section class="app-shell">
        <header class="app-header">
          <div class="app-header__titles">
            <span class="app-header__eyebrow">Painel de controle</span>
            <h1 data-role="titulo">Resumo</h1>
            <p data-role="descricao"></p>
          </div>
          <div class="app-header__actions">
            <button type="button" class="btn btn--small btn--ghost" data-action="tema" title=""></button>
            <div class="app-header__user">
              <strong>${escapeHtml(this.user.nome)}</strong>
              <span>@${escapeHtml(this.user.usuario)}</span>
            </div>
            <button type="button" class="btn btn--small btn--ghost" data-action="logout" title="Sair" aria-label="Sair">${icon("logout")}</button>
          </div>
        </header>
        <div data-role="reminder-banner"></div>
        <main class="app-main" id="conteudo" tabindex="-1"></main>
      </section>
    `;

    this.tituloEl = this.root.querySelector('[data-role="titulo"]');
    this.descricaoEl = this.root.querySelector('[data-role="descricao"]');

    this.reminderBanner = new ReminderBanner(this.root.querySelector('[data-role="reminder-banner"]'), () =>
      this.switchTab("agendamentos")
    );

    this.root.querySelector('[data-action="backups"]').addEventListener("click", () => new BackupsPanel(this.api).open());
    this.root.querySelector('[data-action="users"]').addEventListener("click", () => new UsersPanel(this.api, this.user).open());
    this.root.querySelector('[data-action="logout"]').addEventListener("click", () => this._logout());
    this.root.querySelector('[data-action="toggle-sidebar"]').addEventListener("click", () => this._alternarSidebar());

    this.botaoTema = this.root.querySelector('[data-action="tema"]');
    this.botaoTema.addEventListener("click", () => {
      theme.alternar();
      this._pintarBotaoTema();
    });
    this._pintarBotaoTema();

    this._montarAbas();
    this._montarPaleta();

    this._cleanups.push(ligarAtalhoAjuda());
    this._cleanups.push(this._ligarAtalhosNumericos());

    // Trocar de tema muda cores que algumas telas calculam em JavaScript (o
    // fundo tingido das linhas em Resumo e Sistemas). Redesenhar a aba atual
    // é o jeito mais simples de garantir que nada fique com a paleta antiga.
    const aoTrocarTema = () => {
      this.cache.invalidar();
      if (this.activeTab) this._mostrarAba(this.activeTab);
    };
    document.addEventListener("tema:mudou", aoTrocarTema);
    this._cleanups.push(() => document.removeEventListener("tema:mudou", aoTrocarTema));
  }

  _montarAbas() {
    const tabsNav = this.root.querySelector(".tabs");
    const main = this.root.querySelector(".app-main");

    for (const [i, tab] of TABS.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tab-button";
      button.dataset.tab = tab.key;
      // Semântica de abas de verdade: o leitor de tela anuncia "aba 3 de 9,
      // selecionada", e as setas navegam entre elas (ver _navegarAbas).
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", "false");
      button.setAttribute("aria-controls", `painel-${tab.key}`);
      button.id = `aba-${tab.key}`;
      button.tabIndex = -1;
      button.title = `${tab.label} (Alt+${i + 1})`;
      button.innerHTML = `${icon(tab.icon)}<span>${tab.label}</span>`;
      tabsNav.appendChild(button);

      const container = document.createElement("div");
      container.className = "view";
      container.id = `painel-${tab.key}`;
      container.setAttribute("role", "tabpanel");
      container.setAttribute("aria-labelledby", `aba-${tab.key}`);
      container.style.display = "none";
      main.appendChild(container);

      this.views.set(tab.key, {
        tab,
        container,
        instance: new tab.View(container, this.api, {
          user: this.user,
          cache: this.cache,
          navigate: (destino, opcoes) => this.switchTab(destino, opcoes),
        }),
      });
    }

    tabsNav.addEventListener("click", (event) => {
      const button = event.target.closest(".tab-button");
      if (button) this.switchTab(button.dataset.tab);
    });
    // Setas percorrem as abas sem sair do teclado, como manda o padrão ARIA
    // de tablist -- antes, Tab passava por cada uma das nove abas.
    tabsNav.addEventListener("keydown", (e) => this._navegarAbas(e));
  }

  _navegarAbas(e) {
    const teclas = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    const passo = teclas[e.key];
    if (!passo && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const indiceAtual = TABS.findIndex((t) => t.key === this.activeTab);
    let alvo;
    if (e.key === "Home") alvo = 0;
    else if (e.key === "End") alvo = TABS.length - 1;
    else alvo = (indiceAtual + passo + TABS.length) % TABS.length;
    this.switchTab(TABS[alvo].key);
    this.root.querySelector(`#aba-${TABS[alvo].key}`)?.focus();
  }

  /** `Alt+1` … `Alt+9` levam direto à aba de mesmo número. */
  _ligarAtalhosNumericos() {
    const handler = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > TABS.length) return;
      e.preventDefault();
      this.switchTab(TABS[n - 1].key);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }

  _montarPaleta() {
    // Telas e ações: montadas na hora, sem rede.
    const comandosBase = () => [
      ...TABS.map((tab) => ({
        id: `aba:${tab.key}`,
        titulo: tab.label,
        subtitulo: tab.descricao,
        grupo: "Telas",
        icone: tab.icon,
        executar: () => this.switchTab(tab.key),
      })),
      { id: "acao:backups", titulo: "Abrir Backups", grupo: "Ações", icone: "backups",
        executar: () => new BackupsPanel(this.api).open() },
      { id: "acao:usuarios", titulo: "Abrir Usuários", grupo: "Ações", icone: "users",
        executar: () => new UsersPanel(this.api, this.user).open() },
      { id: "acao:tema", titulo: "Alternar tema (claro / escuro / sistema)", grupo: "Ações", icone: "temaClaro",
        executar: () => { theme.alternar(); this._pintarBotaoTema(); } },
      { id: "acao:atalhos", titulo: "Ver atalhos de teclado", grupo: "Ações", icone: "teclado",
        executar: () => mostrarAtalhos() },
      { id: "acao:sair", titulo: "Sair da conta", grupo: "Ações", icone: "logout",
        executar: () => this._logout() },
    ];

    // Os clientes entram na mesma busca das telas: achar "Padaria Central" e
    // cair na ficha dela vira uma coisa só, em vez de "ir para Consulta,
    // digitar o nome, clicar no resultado".
    const carregarClientes = async () => {
      try {
        const nomes = await this.api.get("/clientes/names", null, { key: "clientes:names" });
        return nomes.map((nome) => ({
          id: `cliente:${nome}`,
          titulo: nome,
          subtitulo: "Abrir a ficha do cliente",
          grupo: "Clientes",
          icone: "clientes",
          executar: () => this.switchTab("consulta", { cliente: nome }),
        }));
      } catch {
        // Sem a lista de clientes, a paleta ainda serve para telas e ações.
        return [];
      }
    };

    this.palette = new CommandPalette(comandosBase, carregarClientes);
    this._cleanups.push(this.palette.ligarAtalho());
  }

  _pintarBotaoTema() {
    const modo = theme.atual();
    const icones = { sistema: "temaSistema", escuro: "temaEscuro", claro: "temaClaro" };
    this.botaoTema.innerHTML = icon(icones[modo]);
    this.botaoTema.title = `${theme.rotulo(modo)} — clique para alternar`;
    this.botaoTema.setAttribute("aria-label", this.botaoTema.title);
  }

  _alternarSidebar() {
    const recolhida = this.root.classList.toggle("is-sidebar-collapsed");
    settings.set("sidebarRecolhida", recolhida);
    const botao = this.root.querySelector('[data-action="toggle-sidebar"]');
    botao.setAttribute("aria-label", recolhida ? "Expandir menu" : "Recolher menu");
  }

  /**
   * Ponto de entrada público para trocar de aba: mexe na URL, e o roteador
   * chama `_mostrarAba` de volta. Assim existe UM caminho só para a troca --
   * clicar na aba, usar a paleta e digitar a URL na mão passam pelo mesmo
   * lugar, e o histórico do navegador fica consistente.
   *
   * @param {string} key
   * @param {object} [params] repassado à view (ex.: qual cliente abrir)
   */
  switchTab(key, params) {
    this._paramsPendentes = params || null;
    if (this.router?.atual() === key) {
      this._mostrarAba(key);
      return;
    }
    this.router?.ir(key);
  }

  _mostrarAba(key) {
    const params = this._paramsPendentes;
    this._paramsPendentes = null;
    this.activeTab = key;

    for (const [tabKey, { container }] of this.views) {
      container.style.display = tabKey === key ? "flex" : "none";
    }
    for (const button of this.root.querySelectorAll(".tab-button")) {
      const ativa = button.dataset.tab === key;
      button.classList.toggle("is-active", ativa);
      button.setAttribute("aria-selected", String(ativa));
      // Só a aba ativa fica na ordem de Tab: é o padrão "roving tabindex".
      button.tabIndex = ativa ? 0 : -1;
    }

    const entrada = this.views.get(key);
    if (!entrada) return;

    this.tituloEl.textContent = entrada.tab.label;
    this.descricaoEl.textContent = entrada.tab.descricao;
    document.title = `${entrada.tab.label} · Gestor de Atualizações`;

    const { instance } = entrada;
    if (params && typeof instance.aplicarParams === "function") instance.aplicarParams(params);
    if (typeof instance.refresh !== "function") return;

    instance.refresh().catch((error) => {
      if (error instanceof RequestCancelled) return;
      if (error?.status === 401) return; // já tratado por api.onUnauthorized
      toast.error("Não foi possível carregar os dados desta tela.");
    });
  }

  _showLoginAgain() {
    if (this.reauthenticating) return;
    this.reauthenticating = true;
    this.user = null;
    this._desmontar();
    this.root.className = "";
    this.root.replaceChildren();
    toast.info("Sua sessão expirou. Entre novamente.");
    new LoginView(this.root, this.api, "login", (user) => {
      this.reauthenticating = false;
      this._onAuthenticated(user);
    });
  }
}
