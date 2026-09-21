import { icon } from "../utils/icons.js";
import { Modal } from "../components/Modal.js";
import { toast } from "../components/Toast.js";
import { SwrCache } from "./SwrCache.js";
import { Router } from "./router.js";
import { CommandPalette } from "../components/CommandPalette.js";
import { ligarAtalhoAjuda, mostrarAtalhos } from "./Shortcuts.js";
import { theme } from "./theme.js";
import { settings, conectarPreferencias } from "./prefs.js";
import { abrirConfiguracoes } from "../views/ConfiguracoesPanel.js";
import { aparencia, reaplicarAparencia } from "./appearance.js";
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
import { ConfiguracaoApiPanel } from "../views/ConfiguracaoApiPanel.js";
import { SaudeSistemaPanel } from "../views/SaudeSistemaPanel.js";
import { DistribuicaoView } from "../views/DistribuicaoView.js";
import { VersoesView } from "../views/VersoesView.js";
import { ReminderBanner } from "../components/ReminderBanner.js";
import { MenuConta } from "../components/MenuConta.js";
import { ConexaoBanner } from "../components/ConexaoBanner.js";

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
  { key: "resumo", label: "Resumo", icon: "resumo", View: ResumoView, grupo: "Visão Geral",
    descricao: "Indicadores gerais e quem está sem atualização há mais tempo." },
  { key: "atualizacoes", label: "Atualizações", icon: "atualizacoes", View: AtualizacoesView, grupo: "Operação",
    descricao: "Histórico de atualizações feitas em cada cliente." },
  { key: "agendamentos", label: "Agendamentos", icon: "agendamentos", View: AgendamentosView, grupo: "Operação",
    descricao: "Agenda interna de tarefas da equipe." },
  { key: "clientes", label: "Clientes", icon: "clientes", View: ClientesView, grupo: "Operação",
    descricao: "Cadastro de clientes e dos sistemas que cada um usa." },
  { key: "consulta", label: "Consultar Cliente", icon: "consulta", View: ConsultaView, grupo: "Operação",
    descricao: "Ficha completa de um cliente específico." },
  { key: "distribuicao", label: "Distribuição", icon: "distribuicao", View: DistribuicaoView, grupo: "Distribuição",
    descricao: "Acompanhe os agentes e os relatórios das atualizações." },
  { key: "versoes", label: "Versões", icon: "versoes", View: VersoesView, grupo: "Distribuição",
    descricao: "Envie, publique e administre as versões distribuídas." },
  { key: "sistemas", label: "Sistemas", icon: "sistemas", View: SistemasView, grupo: "Distribuição",
    descricao: "Relatório por sistema, com data de corte opcional." },
  { key: "historico", label: "Histórico", icon: "historico", View: HistoricoView, grupo: "Administração",
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
    /** Abas que já foram abertas ao menos uma vez -- ver a animação em _mostrarAba. */
    this._jaMostradas = new Set();
    /** @type {Map<string, number>} onde cada aba estava rolada quando foi deixada. */
    this._rolagemPorAba = new Map();
    /** Quantos lembretes de agendamento estão em aberto -- vai para o título da aba. */
    this._qtdLembretes = 0;

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

    // As preferências de apresentação são da CONTA, não do navegador. O
    // localStorage já pintou a tela (theme-init.js, no <head>, antes do
    // primeiro pixel) -- isto busca as da conta e corrige se divergirem, o
    // que é o caso quando a pessoa entra de outra máquina ou quando outra
    // pessoa usou este mesmo navegador antes. Sem `await`: o app não fica
    // esperando por isso para abrir.
    conectarPreferencias(this.api, user, () => {
      theme.aplicar();
      reaplicarAparencia();
    });

    this._buildShell();
    this.router = new Router(
      TABS.map((t) => t.key),
      (rota) => this._mostrarAba(rota)
    );
    this._cleanups.push(() => this.router.destroy());
    // A tela inicial é escolha do usuário (Configurações). Quem passa o dia em
    // Distribuição não quer o Resumo toda manhã. Só vale quando a URL não traz
    // rota: um link para `#/clientes` continua mandando mais que a preferência.
    const inicial = TABS.some((t) => t.key === aparencia.abaInicial()) ? aparencia.abaInicial() : TABS[0].key;
    this.router.iniciar(inicial);
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
    this._qtdLembretes = itens.length;
    this._atualizarTitulo();
  }

  /**
   * O título da aba do navegador: `(2) Clientes · Gestor de Atualizações`.
   *
   * O Gestor passa boa parte do dia numa aba de fundo, atrás do ERP e do
   * WhatsApp. A faixa de lembretes só existe para quem está OLHANDO a tela --
   * e quem está olhando a tela é justamente quem menos precisa ser lembrado. O
   * número no título é a única parte deste app que alcança quem está em outro
   * lugar, porque é o que o Windows mostra na barra de tarefas.
   */
  _atualizarTitulo() {
    const nome = this.views.get(this.activeTab)?.tab.label || "Resumo";
    const prefixo = this._qtdLembretes > 0 ? `(${this._qtdLembretes}) ` : "";
    document.title = `${prefixo}${nome} · Gestor de Atualizações`;
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
    // As views serão recriadas do zero no próximo login: a rolagem guardada
    // aponta para um conteúdo que não existe mais, e cada aba volta a merecer
    // a animação de estreia.
    this._jaMostradas.clear();
    this._rolagemPorAba.clear();
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
        <!-- O botão de recolher também saiu: era um ícone sem rótulo cujo
             efeito só se descobre clicando, e "Menu lateral: Aberto /
             Recolhido" em Configurações diz a mesma coisa por extenso. -->
        <nav class="tabs" role="tablist" aria-label="Telas do sistema"></nav>
        <div class="app-sidebar__footer">
          <button type="button" class="btn btn--small btn--sidebar" data-action="config" data-tooltip="Configurações">${icon("config")} <span>Configurações</span></button>
        </div>
      </aside>
      <section class="app-shell">
        <!--
          Um pixel invisível ANTES do cabeçalho. Quando ele sai de vista, o
          cabeçalho ganha a sombra que o descola do conteúdo que passa por
          baixo (ver ".app-header.is-grudado").

          É um observador de interseção, e não um listener de "scroll": o
          listener roda a cada quadro de rolagem -- numa tabela de duzentas
          linhas, é trabalho de sobra para descobrir um booleano que muda duas
          vezes no dia inteiro.
        -->
        <div data-role="sentinela" aria-hidden="true"></div>
        <header class="app-header">
          <div class="app-header__titles">
            <span class="app-header__eyebrow">Painel de controle</span>
            <h1 data-role="titulo">Resumo</h1>
            <p data-role="descricao"></p>
          </div>
          <div class="app-header__actions">
            <!--
              A busca do cabeçalho não é um campo: é um botão com cara de
              campo, e o que ele abre é a paleta de comandos. O Ctrl+K existe
              desde a primeira versão e não aparecia em lugar nenhum da tela --
              atalho que não aparece é atalho que só quem escreveu o código
              usa. O estilo dele já estava no CSS há tempos, inclusive o que
              ele vira no tablet (".app-header__search"); faltava o botão.
            -->
            <button type="button" class="btn btn--small app-header__search" data-action="buscar"
                    aria-label="Buscar telas, clientes e ações (Ctrl+K)">
              ${icon("busca")}<span>Buscar…</span><kbd>Ctrl</kbd><kbd>K</kbd>
            </button>
            <button type="button" class="btn btn--accent btn--small app-header__quick" data-action="acao-rapida"
                    aria-label="Abrir ações rápidas (Alt+N)">+ <span>Ação rápida</span><kbd>Alt+N</kbd></button>
            <!--
              Nome, tema, configurações, atalhos e sair, num alvo só (ver
              MenuConta). Aqui havia um bloco de texto que não fazia nada e
              dois ícones sem rótulo colados um no outro -- um deles encerrando
              a sessão de quem errasse o alvo por seis pixels.
            -->
            <div data-role="conta"></div>
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

    this.menuConta = new MenuConta(this.root.querySelector('[data-role="conta"]'), this.user, {
      aoConfigurar: () => this._abrirConfiguracoes(),
      aoAtalhos: () => mostrarAtalhos(),
      aoSair: () => this._logout(),
      aoAtualizar: () => this.recarregarAba({ avisar: true }),
    });
    this._cleanups.push(() => this.menuConta.destroy());

    // Configurações continua a um clique: o do rodapé da barra lateral, onde
    // se procura "as coisas do sistema" (é ali que Backups e Usuários moram).
    // O ícone que existia também no cabeçalho saiu -- virou item escrito por
    // extenso no menu da conta, com o atalho ao lado.
    for (const botao of this.root.querySelectorAll('[data-action="config"]')) {
      botao.addEventListener("click", () => this._abrirConfiguracoes());
    }

    this._montarAbas();
    this._montarPaleta();
    this._ligarSombraDoCabecalho();

    this.root.querySelector('[data-action="buscar"]').addEventListener("click", () => this.palette.abrir());
    this.root.querySelector('[data-action="acao-rapida"]').addEventListener("click", () => this._abrirAcoesRapidas());

    // Vive fora das abas e fora do cabeçalho: a queda do servidor não é
    // assunto de uma tela, é do app inteiro. Quando ele volta, os dados da aba
    // aberta são buscados de novo -- enquanto esteve fora, outra pessoa pode
    // ter mudado tudo.
    this.conexaoBanner = new ConexaoBanner(this.api, () => this.recarregarAba());
    this._cleanups.push(() => this.conexaoBanner.destroy());

    this._cleanups.push(ligarAtalhoAjuda());
    this._cleanups.push(this._ligarAtalhosNumericos());
    this._cleanups.push(this._ligarAtalhoConfiguracoes());
    this._cleanups.push(this._ligarAtalhoSidebar());
    this._cleanups.push(this._ligarAtalhoAcaoRapida());

    // Trocar de tema muda cores que algumas telas calculam em JavaScript (o
    // fundo tingido das linhas em Resumo e Sistemas). Redesenhar a aba atual
    // é o jeito mais simples de garantir que nada fique com a paleta antiga.
    const aoTrocarTema = () => this.recarregarAba();
    document.addEventListener("tema:mudou", aoTrocarTema);
    this._cleanups.push(() => document.removeEventListener("tema:mudou", aoTrocarTema));
  }

  _montarAbas() {
    const tabsNav = this.root.querySelector(".tabs");
    const main = this.root.querySelector(".app-main");

    let ultimoGrupo = null;
    for (const [i, tab] of TABS.entries()) {
      if (tab.grupo && tab.grupo !== ultimoGrupo) {
        ultimoGrupo = tab.grupo;
        const grupoEl = document.createElement("div");
        grupoEl.className = "app-sidebar__group-title";
        grupoEl.textContent = tab.grupo;
        tabsNav.appendChild(grupoEl);
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "tab-button";
      button.dataset.tab = tab.key;
      button.dataset.tooltip = tab.label;
      // Semântica de abas de verdade: o leitor de tela anuncia "aba 3 de 9,
      // selecionada", e as setas navegam entre elas (ver _navegarAbas).
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", "false");
      button.setAttribute("aria-controls", `painel-${tab.key}`);
      button.id = `aba-${tab.key}`;
      button.tabIndex = -1;
      button.title = `${tab.label} (Alt+${i + 1})`;
      // A dica do atalho fica na própria aba, aparecendo ao passar o mouse ou
      // ao focar pelo teclado. O `title` só conta a mesma coisa depois de um
      // segundo parado em cima -- e ninguém para em cima de um menu que já
      // sabe usar. Ela ocupa o espaço dela o tempo todo (muda só a opacidade),
      // senão cada aba mudaria de largura quando o mouse passasse.
      button.innerHTML = `${icon(tab.icon)}<span>${tab.label}</span><kbd class="tab-button__atalho">Alt+${i + 1}</kbd>`;
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

  _abrirAcoesRapidas() {
    const { box, close } = Modal.abrirCaixa({ largura: 460 });
    const permitida = ["operador", "admin"].includes(this.user?.role);
    const itens = [
      ["atualizacoes", "Nova Atualização", "atualizacoes"],
      ["agendamentos", "Novo Agendamento", "agendamentos"],
      ["clientes", "Novo Cliente", "clientes"],
      ["versoes", "Publicar Nova Versão", "versoes"],
    ];
    box.innerHTML = `<h3 class="modal-box__title">Ação rápida</h3><p class="modal-box__message">Comece uma tarefa sem perder tempo procurando a tela.</p>
      <div class="quick-action-list">${itens.map(([aba, label, icone]) => `<button type="button" class="btn" data-tab="${aba}" ${permitida ? "" : "disabled"}>${icon(icone)}<span>${label}</span></button>`).join("")}</div>`;
    box.addEventListener("click", (e) => {
      const botao = e.target.closest("[data-tab]");
      if (!botao) return;
      close();
      this.switchTab(botao.dataset.tab, { novo: true });
    });
    box.querySelector("button:not([disabled])")?.focus();
  }

  _ligarAtalhoAcaoRapida() {
    const handler = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.key.toLowerCase() !== "n") return;
      e.preventDefault();
      this._abrirAcoesRapidas();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
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

  /**
   * `Ctrl + ,` abre as Configurações -- o mesmo atalho do Windows, do macOS,
   * do VS Code e de praticamente todo app com um painel de preferências. Um
   * atalho que a pessoa já traz aprendido de outro lugar é o único tipo que
   * não precisa ser ensinado.
   */
  _ligarAtalhoConfiguracoes() {
    const handler = (e) => {
      if (e.key !== "," || (!e.ctrlKey && !e.metaKey) || e.altKey) return;
      // Com um diálogo já aberto o atalho não vale: abriria as Configurações
      // por cima de uma confirmação de exclusão, e a caixa de baixo continuaria
      // esperando uma resposta que ninguém consegue mais ver.
      if (document.querySelector(".modal-overlay")) return;
      e.preventDefault();
      this._abrirConfiguracoes();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }

  /**
   * `Ctrl + B` recolhe e abre a barra lateral.
   *
   * A preferência existe desde sempre em Configurações, e é a única de lá que
   * a pessoa quer mexer VÁRIAS vezes no mesmo dia: recolher para caber mais
   * coluna numa tabela larga, abrir de volta para procurar outra tela. Quatro
   * cliques (abrir Configurações, achar a seção, marcar, fechar) para um gesto
   * dessa frequência é caro demais -- e `Ctrl + B` é o mesmo atalho do VS Code
   * e de tanta coisa com painel lateral.
   */
  _ligarAtalhoSidebar() {
    const handler = (e) => {
      if (e.key !== "b" && e.key !== "B") return;
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.altKey || e.shiftKey) return;
      // Num campo de texto o Ctrl+B pode ser negrito (não há campo rico aqui
      // hoje, mas roubar a tecla de dentro de um input é o tipo de coisa que
      // surpreende), e com um diálogo aberto a barra lateral nem está à vista.
      const alvo = e.target;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) return;
      if (document.querySelector(".modal-overlay, .cmdk-overlay")) return;
      e.preventDefault();
      this._definirSidebar(!settings.get("sidebarRecolhida", false));
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }

  /**
   * A sombra que descola o cabeçalho do conteúdo assim que a página sai do
   * topo. Com o cabeçalho grudado (`position: sticky`), sem ela a primeira
   * linha da tabela passa por baixo do título e as duas viram uma coisa só.
   *
   * Um `IntersectionObserver` sobre um pixel invisível, e não um listener de
   * rolagem: o listener roda a cada quadro enquanto se rola uma tabela de
   * duzentas linhas, tudo isso para descobrir um booleano que muda duas vezes
   * no dia inteiro.
   */
  _ligarSombraDoCabecalho() {
    const sentinela = this.root.querySelector('[data-role="sentinela"]');
    const cabecalho = this.root.querySelector(".app-header");
    if (!sentinela || typeof IntersectionObserver !== "function") return;
    const observador = new IntersectionObserver(
      ([entrada]) => cabecalho.classList.toggle("is-grudado", !entrada.isIntersecting),
      { threshold: 1 }
    );
    observador.observe(sentinela);
    this._cleanups.push(() => observador.disconnect());
  }

  /**
   * Busca de novo os dados da aba aberta, jogando fora o que estava guardado.
   *
   * Existe porque o cache torna a troca de aba instantânea (`SwrCache`), e o
   * preço disso é não haver um jeito de dizer "esqueça o que você guardou e
   * pergunte de novo agora" -- que é exatamente o que se quer quando outra
   * pessoa acabou de mexer no mesmo registro do outro lado da sala. Recarregar
   * a página inteira fazia esse papel, e cobrava o login, a rolagem e a aba.
   *
   * @param {{avisar?: boolean}} [opcoes] `avisar` confirma com um toast: quem
   *   pediu a atualização merece saber que ela terminou, já que numa rede
   *   local a resposta costuma voltar rápido demais para se ver diferença.
   */
  async recarregarAba({ avisar = false } = {}) {
    if (!this.activeTab) return;
    this.cache.invalidar();
    await this._mostrarAba(this.activeTab);
    if (avisar) toast.success("Dados atualizados.");
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
      ...(this.user?.role === "admin"
        ? [
            {
              id: "acao:saude",
              titulo: "Saúde Operacional do Sistema",
              subtitulo: "Diagnóstico técnico: integridade do SQLite, memória e runtime",
              grupo: "Ações",
              icone: "saude",
              executar: () => new SaudeSistemaPanel(this.api).open(),
            },
            {
              id: "acao:backups",
              titulo: "Abrir Backups",
              subtitulo: "Download preventivo e restauração do banco",
              grupo: "Ações",
              icone: "backups",
              executar: () => new BackupsPanel(this.api).open(),
            },
            {
              id: "acao:configuracao-api",
              titulo: "Configuração da API",
              subtitulo: "URL pública, chave dos agentes, webhook do Discord",
              grupo: "Ações",
              icone: "acessos",
              executar: () => new ConfiguracaoApiPanel(this.api).open(),
            },
          ]
        : []),
      ...(["operador", "admin"].includes(this.user?.role)
        ? [
            {
              id: "acao:nova-atualizacao",
              titulo: "Nova Atualização",
              subtitulo: "Registrar atualização de cliente",
              grupo: "Ações",
              icone: "atualizacoes",
              executar: () => this.switchTab("atualizacoes", { novo: true }),
            },
            {
              id: "acao:novo-agendamento",
              titulo: "Novo Agendamento",
              subtitulo: "Criar agendamento de tarefa ou atualização",
              grupo: "Ações",
              icone: "agendamentos",
              executar: () => this.switchTab("agendamentos", { novo: true }),
            },
          ]
        : []),
      {
        id: "acao:incidentes-distribuicao",
        titulo: "Ver Incidentes da Distribuição",
        subtitulo: "Filtrar agentes com erros, pendências ou sem contato",
        grupo: "Ações",
        icone: "alerta",
        executar: () => this.switchTab("distribuicao", { situacao: "erro" }),
      },
      { id: "acao:usuarios", titulo: "Abrir Usuários", grupo: "Ações", icone: "users",
        executar: () => new UsersPanel(this.api, this.user).open() },
      { id: "acao:config", titulo: "Abrir Configurações", subtitulo: "Tema, densidade, segurança, preferências",
        grupo: "Ações", icone: "config", executar: () => this._abrirConfiguracoes() },
      /*
       * Exportar/imprimir a tela aberta.
       */
      { id: "acao:imprimir", titulo: "Exportar / Imprimir esta tela",
        subtitulo: "Escolha \"Salvar como PDF\" no diálogo do navegador",
        grupo: "Ações", icone: "download", executar: () => window.print() },
      { id: "acao:atualizar", titulo: "Atualizar os dados desta tela",
        subtitulo: "Descarta o que está em cache e pergunta de novo ao servidor",
        grupo: "Ações", icone: "atualizar", executar: () => this.recarregarAba({ avisar: true }) },
      { id: "acao:tema", titulo: "Alternar tema (claro / escuro / sistema)", grupo: "Ações", icone: "temaClaro",
        executar: () => theme.alternar() },
      { id: "acao:densidade", titulo: "Alternar densidade das linhas (compacta / padrão)",
        grupo: "Aparência", icone: "tabela",
        executar: () => {
          const compacta = aparencia.densidade() === "compacta";
          aparencia.aplicar({ densidade: compacta ? "padrao" : "compacta" });
          toast.info(compacta ? "Linhas no tamanho padrão." : "Linhas compactas: cabe mais na tela.");
        } },
      { id: "acao:contraste", titulo: "Alternar contraste alto", grupo: "Aparência", icone: "acessibilidade",
        executar: () => {
          const alto = aparencia.contraste() === "alto";
          aparencia.aplicar({ contraste: alto ? "normal" : "alto" });
          toast.info(alto ? "Contraste normal." : "Contraste alto ligado.");
        } },
      { id: "acao:atalhos", titulo: "Ver atalhos de teclado", grupo: "Ações", icone: "teclado",
        executar: () => mostrarAtalhos() },
      { id: "acao:sair", titulo: "Sair da conta", grupo: "Ações", icone: "logout",
        executar: () => this._logout() },
    ];

    // Pesquisa global operacional (Feature 3.6): Clientes, Versões publicadas e Incidentes de Agentes
    const carregarExtras = async () => {
      const [resClientes, resAtivas, resPainel] = await Promise.allSettled([
        this.api.get("/clientes/names", null, { key: "clientes:names" }),
        this.api.get("/versoes/ativas", null, { key: "cmd:ativas" }),
        this.api.get("/versoes/painel", null, { key: "cmd:painel" }),
      ]);

      const itens = [];

      if (resClientes.status === "fulfilled" && Array.isArray(resClientes.value)) {
        for (const nome of resClientes.value) {
          itens.push({
            id: `cliente:${nome}`,
            titulo: nome,
            subtitulo: "Abrir a ficha e comparação de versões do cliente",
            grupo: "Clientes",
            icone: "clientes",
            executar: () => this.switchTab("consulta", { cliente: nome }),
          });
        }
      }

      if (resAtivas.status === "fulfilled" && Array.isArray(resAtivas.value)) {
        for (const v of resAtivas.value) {
          itens.push({
            id: `versao:${v.sistema}`,
            titulo: `${v.sistema} v${v.versao}`,
            subtitulo: "Versão publicada · Filtrar na Distribuição",
            grupo: "Versões Publicadas",
            icone: "versoes",
            executar: () => this.switchTab("distribuicao", { sistema: v.sistema }),
          });
        }
      }

      if (resPainel.status === "fulfilled" && Array.isArray(resPainel.value?.agentes)) {
        const incidentes = resPainel.value.agentes.filter((a) =>
          ["erro", "aguardando_autorizacao_demorada", "offline", "pendencias"].includes(a.situacao)
        );
        for (const ag of incidentes) {
          const rotulo =
            ag.situacao === "erro"
              ? "com erro"
              : ag.situacao === "offline"
              ? "sem contato"
              : ag.situacao === "pendencias"
              ? "com pendências"
              : ag.situacao;
          itens.push({
            id: `agente:${ag.cnpj}`,
            titulo: `${ag.empresa || ag.cnpj} (${rotulo})`,
            subtitulo: `${ag.ultimoSistema || "Sistema"} · Última: ${ag.ultimaVersao || "—"} · Abrir na Distribuição`,
            grupo: "Incidentes em Agentes",
            icone: "alerta",
            executar: () => this.switchTab("distribuicao", { busca: ag.empresa || ag.cnpj }),
          });
        }
      }

      return itens;
    };

    this.palette = new CommandPalette(comandosBase, carregarExtras);
    this._cleanups.push(this.palette.ligarAtalho());
  }

  _abrirConfiguracoes() {
    abrirConfiguracoes({
      aoMudarLinhas: () => this.recarregarAba(),
      aoMudarSidebar: (recolhida) => this._definirSidebar(recolhida),
      aoMudarVarias: () => this._sincronizarComPreferencias(),
      abas: TABS.map((t) => ({ key: t.key, label: t.label })),
      usuario: this.user,
      abrirBackups: this.user?.role === "admin" ? () => new BackupsPanel(this.api).open() : undefined,
      abrirUsuarios: () => new UsersPanel(this.api, this.user).open(),
      abrirConfiguracaoApi: this.user?.role === "admin" ? () => new ConfiguracaoApiPanel(this.api).open() : undefined,
      abrirSaude: this.user?.role === "admin" ? () => new SaudeSistemaPanel(this.api).open() : undefined,
    });
  }

  /** Recolhe ou abre o menu. Único caminho, hoje vindo só de Configurações. */
  _definirSidebar(recolhida) {
    this.root.classList.toggle("is-sidebar-collapsed", recolhida);
    settings.set("sidebarRecolhida", recolhida);
  }

  /**
   * Alinha a casca ao que está guardado nas preferências AGORA.
   *
   * Serve aos dois casos em que MUITAS preferências mudam de uma vez: um perfil
   * aplicado e um arquivo de preferências importado. O painel poderia avisar
   * ajuste por ajuste, mas aí cada preferência nova obrigaria a lembrar de
   * acrescentar mais um aviso -- e o esquecimento apareceria como "o perfil
   * mudou tudo, menos o menu lateral".
   */
  _sincronizarComPreferencias() {
    this.root.classList.toggle("is-sidebar-collapsed", settings.get("sidebarRecolhida", false));
    this.recarregarAba();
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

    // `_mostrarAba` também é chamado para a aba que JÁ está aberta -- ao trocar
    // de tema (que redesenha a tela atual) e ao clicar na aba ativa. Aí não há
    // troca nenhuma, e mexer na rolagem seria arrastar a página debaixo de
    // quem está lendo.
    const mesmaAba = this.activeTab === key;

    // Onde a aba que está saindo tinha sido deixada. Sem isto, passar por uma
    // aba curta (o Resumo) fazia o navegador grampear a rolagem em zero, e
    // voltar para a tabela longa que se estava lendo devolvia o topo dela --
    // o lugar exato onde a pessoa estava se perdia sem nenhum aviso.
    if (this.activeTab && !mesmaAba) {
      this._rolagemPorAba.set(this.activeTab, window.scrollY);
    }
    this.activeTab = key;

    const entrada = this.views.get(key);
    // A classe entra ANTES do `display`: com o elemento ainda escondido, trocar
    // qual animação vale não dispara nada -- quem dispara é o `display`
    // voltando a existir. O deslize de apresentação fica, assim, só na estreia
    // de cada aba; daí em diante a troca é o fade curto do `.view` (ver o
    // comentário em components.css).
    if (entrada) {
      entrada.container.classList.toggle("is-first-show", !this._jaMostradas.has(key));
      this._jaMostradas.add(key);
    }

    for (const [tabKey, { container }] of this.views) {
      container.style.display = tabKey === key ? "flex" : "none";
    }

    // Depois do `display`, com a altura da página já correta. As views não são
    // destruídas ao sair de cena (só escondidas), então o conteúdo -- e a
    // altura dele -- continua lá: dá para devolver a rolagem no mesmo quadro,
    // sem esperar nenhuma resposta da API.
    //
    // Com `params`, sobe ao topo: aí a pessoa não está "voltando" para a aba,
    // está sendo levada a algo específico (a ficha de um cliente escolhido na
    // paleta de comandos), e o começo da tela é onde essa coisa está.
    if (!mesmaAba) window.scrollTo(0, params ? 0 : this._rolagemPorAba.get(key) || 0);

    for (const button of this.root.querySelectorAll(".tab-button")) {
      const ativa = button.dataset.tab === key;
      button.classList.toggle("is-active", ativa);
      button.setAttribute("aria-selected", String(ativa));
      // Só a aba ativa fica na ordem de Tab: é o padrão "roving tabindex".
      button.tabIndex = ativa ? 0 : -1;
    }

    if (!entrada) return;

    this.tituloEl.textContent = entrada.tab.label;
    this.descricaoEl.textContent = entrada.tab.descricao;
    this._atualizarTitulo();

    const { instance } = entrada;
    if (params && typeof instance.aplicarParams === "function") instance.aplicarParams(params);
    if (typeof instance.refresh !== "function") return;

    // Devolve a promessa: quem chamou `recarregarAba` precisa saber quando a
    // busca terminou para só então confirmar na tela. Quem troca de aba pelo
    // clique continua ignorando o retorno, como sempre ignorou.
    return instance.refresh().catch((error) => {
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
