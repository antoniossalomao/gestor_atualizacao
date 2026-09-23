import { icon } from "../utils/icons.js";
import { Modal } from "../components/Modal.js";
import { toast } from "../components/Toast.js";
import { SwrCache } from "./SwrCache.js";
import { Router } from "./router.js";
import { CommandPalette } from "../components/CommandPalette.js";
import { ligarAtalhoAjuda, mostrarAtalhos } from "./Shortcuts.js";
import { theme } from "./theme.js";
import { settings, conectarPreferencias } from "./prefs.js";
import { aparencia, reaplicarAparencia } from "./appearance.js";
import { RequestCancelled } from "../api/ApiClient.js";
import { LoginView } from "../views/LoginView.js";
import { ResumoView } from "../views/ResumoView.js";
import { AtualizacoesView } from "../views/AtualizacoesView.js";
import { AgendamentosView } from "../views/AgendamentosView.js";
import { ClientesView } from "../views/ClientesView.js";
import { ConsultaView } from "../views/ConsultaView.js";
import { SistemasView } from "../views/SistemasView.js";
import { AdministracaoView } from "../views/AdministracaoView.js";
import { ConfiguracoesView } from "../views/ConfiguracoesView.js";
import { DistribuicaoView } from "../views/DistribuicaoView.js";
import { VersoesView } from "../views/VersoesView.js";
import { MenuNotificacoes } from "../components/MenuNotificacoes.js";
import { MenuConta } from "../components/MenuConta.js";
import { montarNotificacoes } from "../domain/notificacoes.js";
import { ConexaoBanner } from "../components/ConexaoBanner.js";

/**
 * Uma entrada por aba: chave interna (que é também a rota na URL), rótulo,
 * ícone, a classe de View responsável e a linha de apoio que aparece no
 * cabeçalho.
 *
 * O `descricao` é novo e existe porque o cabeçalho tinha uma frase fixa
 * ("Monitore clientes, versões e a saúde das atualizações") que valia para o
 * app inteiro e portanto não dizia nada sobre a tela aberta.
 *
 * `requerAtualizador: true` marca as abas que só fazem sentido com o
 * Atualizador (agente C#) em uso -- somem da navegação, da paleta de
 * comandos e dos atalhos quando ele está desativado em Configurações (ver
 * `this.tabsAtivas`, calculado em `_onAuthenticated`).
 *
 * `papel` restringe a aba a um papel (hoje só a Administração, "admin"). É só
 * a navegação: quem garante de verdade é o servidor, que responde 403 às
 * rotas de administração para qualquer outro papel.
 *
 * `rodape: true` é uma tela SEM item no menu (hoje só as Configurações): tem
 * rota, título e fica viva como as outras, mas se chega a ela pelo botão do
 * rodapé da barra lateral, pelo menu da conta, por Ctrl + , ou pela paleta.
 * Fica fora da numeração Alt+1…9, das setas do menu e da escolha de "tela
 * inicial" -- ver `this.tabsNoMenu`.
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
    descricao: "Acompanhe os agentes e os relatórios das atualizações.", requerAtualizador: true },
  { key: "versoes", label: "Versões", icon: "versoes", View: VersoesView, grupo: "Distribuição",
    descricao: "Envie, publique e administre as versões distribuídas.", requerAtualizador: true },
  { key: "sistemas", label: "Sistemas", icon: "sistemas", View: SistemasView, grupo: "Distribuição",
    descricao: "Relatório por sistema, com data de corte opcional." },
  // Só administrador (ver `papel`). O Histórico de alterações, que era uma
  // aba aberta a todos, mora agora dentro dela -- ver AdministracaoView.
  { key: "administracao", label: "Administração", icon: "escudo", View: AdministracaoView, grupo: "Administração",
    descricao: "Usuários, histórico de alterações, regras da equipe, backups e saúde do servidor.", papel: "admin" },
  // Era um modal com desenho próprio; virou tela com a moldura da
  // Administração, mas continua sendo aberta pelos mesmos lugares de sempre
  // (ver `rodape` acima e ConfiguracoesView).
  { key: "configuracoes", label: "Configurações", icon: "config", View: ConfiguracoesView, rodape: true,
    descricao: "A sua conta e como o Gestor se comporta para você, em qualquer máquina em que você entrar." },
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
    // Vem do "/auth/status" (não de uma segunda chamada) porque é a
    // primeira resposta que o app recebe, antes até de saber se há sessão --
    // ver AuthController.status no servidor. `!== false` para o app não
    // esconder nada se o servidor for antigo e não mandar este campo.
    this.atualizadorHabilitado = status.atualizadorHabilitado !== false;
    // Regras públicas da equipe (ex.: quantos dias até "desatualizado"), para
    // as telas explicarem o que mostram. Só vêm com sessão.
    this.regras = status.regras || {};
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
    // Calculado uma vez por sessão (não a cada troca de aba): as abas do
    // Atualizador só desaparecem/reaparecem de fato num boot novo do app
    // (login, F5) ou já vêm corretas se o admin tiver acabado de mudar --
    // ver AtualizadorAdmin, que recarrega o app ao salvar.
    this.tabsAtivas = TABS.filter(
      (t) => (!t.requerAtualizador || this.atualizadorHabilitado) && (!t.papel || t.papel === user?.role)
    );
    /** As que têm item no menu lateral (ver `rodape` em TABS). */
    this.tabsNoMenu = this.tabsAtivas.filter((t) => !t.rodape);

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
      this.tabsAtivas.map((t) => t.key),
      (rota) => this._mostrarAba(rota)
    );
    this._cleanups.push(() => this.router.destroy());
    // A tela inicial é escolha do usuário (Configurações). Quem passa o dia em
    // Distribuição não quer o Resumo toda manhã. Só vale quando a URL não traz
    // rota: um link para `#/clientes` continua mandando mais que a preferência.
    // Se a preferência salva era uma aba do Atualizador e ele foi desativado
    // depois, cai no primeiro item de `tabsAtivas` como qualquer aba inexistente.
    const inicial = this.tabsNoMenu.some((t) => t.key === aparencia.abaInicial())
      ? aparencia.abaInicial()
      : this.tabsNoMenu[0].key;
    this.router.iniciar(inicial);
    this._carregarNotificacoes();
  }

  /**
   * Busca o que alimenta o sino: agendamentos vencidos/de hoje e o painel dos
   * agentes. As duas chamadas juntas, e cada uma com o seu próprio `catch`:
   * com o Atualizador desativado `/versoes/painel` responde 403 (ver
   * `requireAtualizadorHabilitado`), e uma falha de rede numa delas não pode
   * apagar o que a outra tinha a dizer.
   */
  async _carregarNotificacoes() {
    const [lembretes, painel] = await Promise.all([
      this.api.get("/agendamentos/lembretes").catch(() => null),
      this.atualizadorHabilitado ? this.api.get("/versoes/painel").catch(() => null) : Promise.resolve(null),
    ]);
    // Os dois fora do ar é o único caso em que nada se pode afirmar: zerar o
    // sino aí apagaria avisos que continuam valendo, só que invisíveis.
    if (lembretes === null && painel === null) return;
    this.menuNotificacoes.atualizar(montarNotificacoes({ lembretes, painel }));
    this._atualizarTitulo();
  }

  /**
   * De quanto em quanto tempo o sino se pergunta de novo, e por que não é um
   * `setInterval` solto: com a aba escondida o navegador já estrangula o
   * temporizador, mas continua acordando o servidor para uma resposta que
   * ninguém vai ver. Ao voltar à aba, uma busca imediata -- é justamente o
   * momento em que o número precisa estar certo.
   */
  _ligarRitmoDasNotificacoes() {
    const INTERVALO_MS = 5 * 60 * 1000;
    let timer = null;
    const parar = () => {
      clearInterval(timer);
      timer = null;
    };
    const comecar = () => {
      if (timer === null) timer = setInterval(() => this._carregarNotificacoes(), INTERVALO_MS);
    };
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") {
        this._carregarNotificacoes();
        comecar();
      } else {
        parar();
      }
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    comecar();
    return () => {
      parar();
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }

  /**
   * O título da aba do navegador: `(2) Clientes · Gestor de Atualizações`.
   *
   * O Gestor passa boa parte do dia numa aba de fundo, atrás do ERP e do
   * WhatsApp. O sino só existe para quem está OLHANDO a tela -- e quem está
   * olhando a tela é justamente quem menos precisa ser lembrado. O número no
   * título é a única parte deste app que alcança quem está em outro lugar,
   * porque é o que o Windows mostra na barra de tarefas.
   *
   * Ele segue o MESMO contador do sino, inclusive o "marcar como vistas": dois
   * números do mesmo assunto discordando entre si é pior que um número só.
   */
  _atualizarTitulo() {
    const nome = this.views.get(this.activeTab)?.tab.label || "Resumo";
    // Desligável em Configurações > Notificações: para quem deixa o Gestor
    // aberto numa tela compartilhada, o número na barra de tarefas é mais
    // incômodo do que útil.
    const pendentes = aparencia.contadorNoTitulo() ? this.menuNotificacoes?.pendentesNaoVistas() || 0 : 0;
    const prefixo = pendentes > 0 ? `(${pendentes}) ` : "";
    document.title = `${prefixo}${nome} · Gestor de Atualizações`;
  }

  async _logout() {
    // A confirmação é desligável (Configurações > Navegação): protege quem
    // clica sem querer, e só atrasa quem sempre sai de propósito.
    if (aparencia.confirmarSaida()) {
      const ok = await Modal.confirm("Sair", "Deseja encerrar sua sessão?", { confirmLabel: "Sair", danger: false });
      if (!ok) return;
    }
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
              O sino, ao lado da conta (ver MenuNotificacoes). Tudo o que o app
              tem a dizer sem ter sido perguntado passou a morar aqui: antes
              eram duas coisas grandes e desconexas -- a faixa amarela que
              ficava logo abaixo deste cabeçalho em TODA aba, e o bloco
              "Precisa de Atenção" que abria o Resumo com uma grade de cards.
            -->
            <div data-role="notificacoes"></div>
            <!--
              Nome, tema, configurações, atalhos e sair, num alvo só (ver
              MenuConta). Aqui havia um bloco de texto que não fazia nada e
              dois ícones sem rótulo colados um no outro -- um deles encerrando
              a sessão de quem errasse o alvo por seis pixels.
            -->
            <div data-role="conta"></div>
          </div>
        </header>
        <main class="app-main" id="conteudo" tabindex="-1"></main>
      </section>
    `;

    this.tituloEl = this.root.querySelector('[data-role="titulo"]');
    this.descricaoEl = this.root.querySelector('[data-role="descricao"]');

    this.menuNotificacoes = new MenuNotificacoes(this.root.querySelector('[data-role="notificacoes"]'), {
      // Abrir o sino é a deixa para perguntar de novo: quem clica ali quer o
      // estado de agora, e sem isto a lista seria sempre a do último ciclo.
      aoAbrir: () => this._carregarNotificacoes(),
      aoMarcarVistas: () => this._atualizarTitulo(),
      aoIr: (destino, params) => this.switchTab(destino, params || undefined),
    });
    this._cleanups.push(() => this.menuNotificacoes.destroy());
    this._cleanups.push(this._ligarRitmoDasNotificacoes());

    this._montarMenuConta();
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

    // "Pendências no título da aba" pode ser ligado e desligado a qualquer
    // momento -- o título tem que acompanhar na hora, não no próximo ciclo
    // do sino.
    const aoMudarAparencia = () => this._atualizarTitulo();
    document.addEventListener("aparencia:mudou", aoMudarAparencia);
    this._cleanups.push(() => document.removeEventListener("aparencia:mudou", aoMudarAparencia));
  }

  _montarMenuConta() {
    this.menuConta = new MenuConta(this.root.querySelector('[data-role="conta"]'), this.user, {
      aoConfigurar: () => this._abrirConfiguracoes(),
      aoAtalhos: () => mostrarAtalhos(),
      aoSair: () => this._logout(),
      aoAtualizar: () => this.recarregarAba({ avisar: true }),
    });
  }

  /**
   * O nome mudou em Configurações > Conta. O objeto do usuário é alterado NO
   * LUGAR, e não trocado por outro: todas as views receberam esta mesma
   * referência em `ctx.user` -- é de lá que Atualizações e Agendamentos tiram
   * o responsável que já vem preenchido num registro novo, e um objeto novo
   * deixaria as views com o nome antigo até o próximo login.
   */
  _aoMudarNome(nome) {
    this.user.nome = nome;
    this.menuConta.destroy();
    this._montarMenuConta();
  }

  _montarAbas() {
    const tabsNav = this.root.querySelector(".tabs");
    const main = this.root.querySelector(".app-main");

    let ultimoGrupo = null;
    for (const tab of this.tabsAtivas) {
      const container = this._montarContainerDaAba(main, tab);
      if (tab.rodape) continue; // sem item no menu (ver `rodape` em TABS)
      const i = this.tabsNoMenu.indexOf(tab);
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
      container.setAttribute("aria-labelledby", `aba-${tab.key}`);
    }

    tabsNav.addEventListener("click", (event) => {
      const button = event.target.closest(".tab-button");
      if (button) this.switchTab(button.dataset.tab);
    });
    // Setas percorrem as abas sem sair do teclado, como manda o padrão ARIA
    // de tablist -- antes, Tab passava por cada uma das nove abas.
    tabsNav.addEventListener("keydown", (e) => this._navegarAbas(e));
  }

  /** O painel de uma aba e a View dentro dele. */
  _montarContainerDaAba(main, tab) {
    const container = document.createElement("div");
    container.className = "view";
    container.id = `painel-${tab.key}`;
    container.setAttribute("role", tab.rodape ? "region" : "tabpanel");
    if (tab.rodape) container.setAttribute("aria-label", tab.label);
    container.style.display = "none";
    main.appendChild(container);

    this.views.set(tab.key, {
      tab,
      container,
      instance: new tab.View(container, this.api, {
        user: this.user,
        cache: this.cache,
        navigate: (destino, opcoes) => this.switchTab(destino, opcoes),
        atualizadorHabilitado: this.atualizadorHabilitado,
        regras: this.regras,
        recarregarApp: () => this.recarregarApp(),
        // Só as Configurações usam estes -- são as partes do shell que ela
        // mexe (o menu lateral, o cabeçalho com o nome) sem sair procurando
        // elementos pela tela e adivinhando como cada um se comporta.
        abasDoMenu: this.tabsNoMenu.map((t) => ({ key: t.key, label: t.label })),
        definirSidebar: (recolhida) => this._definirSidebar(recolhida),
        sincronizarPreferencias: () => this._sincronizarComPreferencias(),
        aoMudarNome: (nome) => this._aoMudarNome(nome),
      }),
    });
    return container;
  }

  _abrirAcoesRapidas() {
    const { box, close } = Modal.abrirCaixa({ largura: 460 });
    const permitida = ["operador", "admin"].includes(this.user?.role);
    const itens = [
      ["atualizacoes", "Nova Atualização", "atualizacoes"],
      ["agendamentos", "Novo Agendamento", "agendamentos"],
      ["clientes", "Novo Cliente", "clientes"],
      ...(this.atualizadorHabilitado ? [["versoes", "Publicar Nova Versão", "versoes"]] : []),
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
    const indiceAtual = this.tabsNoMenu.findIndex((t) => t.key === this.activeTab);
    let alvo;
    if (e.key === "Home") alvo = 0;
    else if (e.key === "End") alvo = this.tabsNoMenu.length - 1;
    else alvo = (indiceAtual + passo + this.tabsNoMenu.length) % this.tabsNoMenu.length;
    this.switchTab(this.tabsNoMenu[alvo].key);
    this.root.querySelector(`#aba-${this.tabsNoMenu[alvo].key}`)?.focus();
  }

  /** `Alt+1` … `Alt+9` levam direto à aba de mesmo número. */
  _ligarAtalhosNumericos() {
    const handler = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > this.tabsNoMenu.length) return;
      e.preventDefault();
      this.switchTab(this.tabsNoMenu[n - 1].key);
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
    // O sino junto: ele vive fora das abas, então "atualizar os dados desta
    // tela" o deixaria para trás -- e é o caminho por onde a volta da conexão
    // também passa, justamente quando o que ele mostra está mais velho.
    this._carregarNotificacoes();
    await this._mostrarAba(this.activeTab);
    if (avisar) toast.success("Dados atualizados.");
  }

  /**
   * Reconstrói o app inteiro (abas, sidebar, paleta) a partir de um novo
   * `/auth/status` -- o que `recarregarAba()` NÃO cobre, porque só troca os
   * dados da aba aberta, não a lista de abas que existem. Precisa disto
   * quando `atualizadorHabilitado` muda (ver AtualizadorAdmin): a
   * navegação inteira depende de `this.tabsAtivas`, calculado uma vez em
   * `_onAuthenticated`.
   *
   * Mesmo caminho de `_logout()` (desmontar + `start()`), só que sem de fato
   * encerrar a sessão -- o cookie continua válido, então `start()` volta
   * direto para `_onAuthenticated`.
   */
  async recarregarApp() {
    this._desmontar();
    await this.start();
  }

  _montarPaleta() {
    // Telas e ações: montadas na hora, sem rede.
    const comandosBase = () => [
      ...this.tabsAtivas.map((tab) => ({
        id: `aba:${tab.key}`,
        titulo: tab.label,
        subtitulo: tab.descricao,
        grupo: "Telas",
        icone: tab.icon,
        executar: () => this.switchTab(tab.key),
      })),
      // Atalhos direto para cada aba da Administração. Cada um leva à tela, e
      // não a um modal solto como antes -- dá para voltar, e o "Fechar" não
      // existe mais para devolver a pessoa ao lugar errado.
      ...(this.user?.role === "admin"
        ? [
            ["usuarios", "Usuários e papéis", "Criar conta, mudar papel, remover acesso", "users"],
            ["historico", "Histórico de alterações", "Quem criou, editou ou excluiu o quê, e quando", "historico"],
            ["regras", "Regras da equipe", "Dias até desatualizado, arquivamento de tarefas, backups", "ajustes"],
            ["notificacoes", "Notificações no Discord", "Webhook do canal e mensagem de teste", "sino"],
            [
              "atualizador",
              "Ligar/desligar o Atualizador",
              this.atualizadorHabilitado ? "Hoje ligado" : "Hoje desligado -- é por aqui que se liga de novo",
              "distribuicao",
            ],
            ["backups", "Backups do banco", "Baixar ou restaurar uma cópia", "backups"],
            ["saude", "Saúde do servidor", "Banco, processo e cópias de segurança", "saude"],
          ].map(([aba, titulo, subtitulo, icone]) => ({
            id: `admin:${aba}`,
            titulo,
            subtitulo,
            grupo: "Administração",
            icone,
            executar: () => this.switchTab("administracao", { aba }),
          }))
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
      ...(this.atualizadorHabilitado
        ? [
            {
              id: "acao:incidentes-distribuicao",
              titulo: "Ver Incidentes da Distribuição",
              subtitulo: "Filtrar agentes com erros, pendências ou sem contato",
              grupo: "Ações",
              icone: "alerta",
              executar: () => this.switchTab("distribuicao", { situacao: "erro" }),
            },
          ]
        : []),
      { id: "acao:trocar-senha", titulo: "Trocar minha senha", grupo: "Ações", icone: "chave",
        executar: () => this._abrirConfiguracoes({ aba: "conta", ajuste: "senha" }) },
      // Cada aba das Configurações direto da paleta, como as da Administração.
      // "Configurações" em si já aparece no grupo Telas.
      ...[
        ["conta", "Minha conta", "Nome, senha e sessões abertas", "conta"],
        ["aparencia", "Aparência", "Tema, cor de destaque, texto e perfis", "paleta"],
        ["tabelas", "Ajustes das tabelas", "Densidade, linhas por página, altura, com prévia", "tabela"],
        ["navegacao", "Navegação e comportamento", "Tela inicial, período inicial, filtros, confirmar ao sair", "bussola"],
        ["notificacoes", "Avisos e notificações", "Onde e por quanto tempo os avisos aparecem", "sino"],
        ["acessibilidade", "Acessibilidade", "Contraste, anel de foco, animações, superfícies", "acessibilidade"],
      ].map(([aba, titulo, subtitulo, icone]) => ({
        id: `config:${aba}`,
        titulo,
        subtitulo,
        grupo: "Configurações",
        icone,
        executar: () => this._abrirConfiguracoes({ aba }),
      })),
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
        // Com o Atualizador desativado, "/versoes/*" responde 403 (ver
        // requireAtualizadorHabilitado no servidor) -- nem vale chamar.
        this.atualizadorHabilitado
          ? this.api.get("/versoes/ativas", null, { key: "cmd:ativas" })
          : Promise.resolve([]),
        this.atualizadorHabilitado
          ? this.api.get("/versoes/painel", null, { key: "cmd:painel" })
          : Promise.resolve(null),
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

  /**
   * Configurações é uma tela (ver TABS); este é o caminho comum do botão do
   * rodapé, do menu da conta, do Ctrl + , e da paleta.
   * @param {{aba?: string, ajuste?: string}} [params] abre direto numa aba,
   *   e opcionalmente acende um ajuste dela
   */
  _abrirConfiguracoes(params) {
    this.switchTab("configuracoes", params);
  }

  /** Recolhe ou abre o menu. Vem de Configurações e do Ctrl + B. */
  _definirSidebar(recolhida) {
    this.root.classList.toggle("is-sidebar-collapsed", recolhida);
    settings.set("sidebarRecolhida", recolhida);
    // Avisa quem mostra essa preferência (a tela Configurações, se estiver
    // aberta): pelo Ctrl + B ela muda sem passar por lá.
    reaplicarAparencia();
  }

  /**
   * Alinha a casca ao que está guardado nas preferências AGORA.
   *
   * Serve aos casos em que MUITAS preferências mudam de uma vez: um perfil
   * aplicado, um arquivo importado, uma seção restaurada. A tela poderia
   * avisar ajuste por ajuste, mas aí cada preferência nova obrigaria a lembrar
   * de acrescentar mais um aviso -- e o esquecimento apareceria como "o
   * perfil mudou tudo, menos o menu lateral".
   *
   * Não recarrega a aba: quem chama é a própria tela Configurações, e as
   * outras telas buscam os dados de novo quando voltam a aparecer -- com o
   * número de linhas por página que estiver valendo.
   */
  _sincronizarComPreferencias() {
    this.root.classList.toggle("is-sidebar-collapsed", settings.get("sidebarRecolhida", false));
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
    // O botão do rodapé é o "item de menu" das Configurações: aceso enquanto
    // ela está aberta, para a barra lateral continuar dizendo onde se está.
    for (const botao of this.root.querySelectorAll('[data-action="config"]')) {
      const aqui = key === "configuracoes";
      botao.classList.toggle("is-active", aqui);
      if (aqui) botao.setAttribute("aria-current", "page");
      else botao.removeAttribute("aria-current");
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
