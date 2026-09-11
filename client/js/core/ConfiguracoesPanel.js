import { Modal } from "./Modal.js";
import { theme } from "./theme.js";
import {
  aparencia,
  DENSIDADES,
  LINHAS_OPCOES,
  ALTURAS,
  RITMOS,
  REALCES,
  ESCALAS,
  POSICOES_AVISO,
} from "./appearance.js";
import { settings, prefs } from "./prefs.js";
import { mostrarAtalhos } from "./Shortcuts.js";
import { notificacoes } from "./notify.js";
import { icon } from "./icons.js";
import { toast } from "./Toast.js";
import { escapeHtml } from "./html.js";

/**
 * Painel de Configurações.
 *
 * Existe porque as preferências do app estavam espalhadas e, pior, escondidas
 * atrás de gestos que ninguém descobre sozinho: o tema era um botão de ícone
 * que CICLAVA entre três estados, e recolher o menu era um botãozinho sem
 * rótulo na barra lateral. Nada disso era descobrível.
 *
 * A primeira versão resolveu isso com uma lista única de ajustes dentro de uma
 * caixa de diálogo de 520px. Funcionava, e deixou de funcionar assim que a
 * lista cresceu: catorze ajustes empilhados num rolinho de modal não são um
 * painel de configurações, são um formulário comprido -- não dá para varrer,
 * não dá para voltar a um ajuste que se viu há dois dias, e não há nenhum
 * sinal de ONDE se está enquanto se rola. A forma passou a atrapalhar o
 * conteúdo.
 *
 * Agora é um painel de duas colunas, que é a forma que quase todo sistema
 * operacional e quase todo app de porte usam para a mesma coisa, e pelos
 * mesmos motivos:
 *
 *  - **seções com nome** (Aparência, Tabelas, Comportamento, Avisos, Sistema).
 *    Cada uma cabe na tela inteira sem rolar, então escolher a seção é
 *    escolher um conjunto pequeno de decisões relacionadas -- em vez de
 *    procurar uma agulha numa lista de catorze;
 *  - **uma trilha de navegação fixa à esquerda**, que responde "onde estou e o
 *    que mais existe aqui" sem precisar rolar para descobrir;
 *  - **busca**, porque a pergunta real de quem abre configurações quase nunca
 *    é "quero ver a seção Aparência": é "onde muda o tamanho da letra". Com a
 *    busca, saber em que seção o ajuste mora deixa de ser pré-requisito.
 *
 * Tudo continua se aplicando na hora, sem botão de "Salvar": são preferências
 * reversíveis de um clique, e nenhuma delas destrói nada. Pedir confirmação
 * para escolher um tema seria cerimônia sem risco nenhum por trás.
 */
export class ConfiguracoesPanel {
  /**
   * @param {{
   *   aoMudarLinhas?: () => void,
   *   aoMudarSidebar?: (recolhida: boolean) => void,
   *   abas?: Array<{key: string, label: string}>,
   *   usuario?: {nome: string, usuario: string, role?: string},
   *   abrirBackups?: () => void,
   *   abrirUsuarios?: () => void,
   * }} [acoes]
   *   O painel não mexe no shell por conta própria: quem sabe atualizar o
   *   rótulo do botão de recolher e recarregar a aba aberta é o App, então ele
   *   entrega essas ações aqui em vez de o painel ir procurar elementos pela
   *   tela e adivinhar como cada um se comporta.
   */
  constructor({ aoMudarLinhas, aoMudarSidebar, abas, usuario, abrirBackups, abrirUsuarios } = {}) {
    this.aoMudarLinhas = aoMudarLinhas || (() => {});
    this.aoMudarSidebar = aoMudarSidebar || (() => {});
    /** @type {Array<{key: string, label: string}>} para o seletor de tela inicial */
    this.abas = abas || [];
    this.usuario = usuario || null;
    this.abrirBackups = abrirBackups || null;
    this.abrirUsuarios = abrirUsuarios || null;
    /** @type {Map<string, HTMLElement>} id da seção -> painel montado */
    this.secoes = new Map();
  }

  open() {
    const { box, close } = Modal.abrirCaixa({ largura: 860, classe: "cfg" });
    this.close = close;
    this.box = box;

    box.innerHTML = `
      <header class="cfg__top">
        <div class="painel__icon" aria-hidden="true">${icon("config")}</div>
        <div class="cfg__titles">
          <h3 class="modal-box__title" id="config-titulo">Configurações</h3>
          <p class="modal-box__message">Valem só para este navegador, e mudam na hora.</p>
        </div>
        <div class="cfg__search">
          <span class="cfg__search-icon" aria-hidden="true">${icon("busca")}</span>
          <input type="search" class="input" data-role="busca" placeholder="Buscar um ajuste…"
                 aria-label="Buscar um ajuste" autocomplete="off" spellcheck="false" />
        </div>
        <button type="button" class="cfg__close" data-action="fechar"
                title="Fechar" aria-label="Fechar">${icon("fechar")}</button>
      </header>

      <div class="cfg__body">
        <nav class="cfg__nav" data-role="nav" aria-label="Seções das configurações"></nav>
        <div class="cfg__pane" data-role="pane" tabindex="-1">
          <p class="cfg__vazio" data-role="semResultado" hidden>
            Nenhum ajuste com esse nome. Tente "tema", "linhas", "avisos".
          </p>
        </div>
      </div>

      <footer class="cfg__foot">
        <button type="button" class="btn btn--ghost btn--small" data-action="restaurar">Restaurar padrões</button>
        <span class="toolbar-spacer"></span>
        <button type="button" class="btn btn--accent" data-action="concluir">Concluído</button>
      </footer>
    `;
    box.setAttribute("aria-labelledby", "config-titulo");

    this.nav = box.querySelector('[data-role="nav"]');
    this.pane = box.querySelector('[data-role="pane"]');
    this.semResultado = box.querySelector('[data-role="semResultado"]');

    for (const secao of this._definicoes()) this._montarSecao(secao);
    this._irPara(this._definicoes()[0].id);

    this._ligarBusca(box.querySelector('[data-role="busca"]'));
    this._ligarNavegacaoPorSetas();

    box.querySelector('[data-action="concluir"]').addEventListener("click", () => close());
    box.querySelector('[data-action="fechar"]').addEventListener("click", () => close());
    box.querySelector('[data-action="restaurar"]').addEventListener("click", () => this._restaurar());

    // O foco vai para a busca: é a primeira coisa que serve para QUALQUER
    // intenção de quem abriu o painel, e dali o Tab desce naturalmente para a
    // trilha de seções. Focar o primeiro ajuste presumiria que a pessoa veio
    // atrás justamente dele.
    box.querySelector('[data-role="busca"]').focus();
  }

  // ==========================================================================
  // O QUE O PAINEL OFERECE
  // ==========================================================================

  /**
   * A lista inteira de ajustes, como dados.
   *
   * Está escrita assim -- e não como uma sequência de chamadas que empurram
   * elementos numa div, como era antes -- porque três coisas diferentes
   * precisam percorrer a MESMA lista: o desenho das seções, a trilha de
   * navegação e a busca. Com a lista sendo dado, as três leem a mesma fonte;
   * com ela sendo código, cada uma teria que ser mantida em sincronia na mão,
   * e a busca seria a primeira a ficar desatualizada quando um ajuste novo
   * entrasse.
   */
  _definicoes() {
    if (this._cacheDefinicoes) return this._cacheDefinicoes;

    const secoes = [
      {
        id: "aparencia",
        titulo: "Aparência",
        icone: "paleta",
        descricao: "Como o Gestor se parece nesta máquina.",
        itens: [
          {
            tipo: "temas",
            titulo: "Tema",
            ajuda: '"Sistema" acompanha a configuração do seu computador.',
            busca: "tema claro escuro noturno modo sistema cor de fundo",
          },
          {
            tipo: "cores",
            titulo: "Cor de destaque",
            ajuda: "A cor dos botões, links e da aba ativa.",
            busca: "cor destaque realce accent azul verde roxo violeta rosa âmbar",
          },
          {
            tipo: "segmentado",
            titulo: "Tamanho do texto",
            ajuda: "Aumenta tudo junto, sem desalinhar a interface.",
            nome: "cfg-escala",
            busca: "tamanho do texto letra fonte zoom acessibilidade enxergar",
            opcoes: ESCALAS.map((e) => ({ valor: e.valor, rotulo: e.rotulo })),
            atual: () => aparencia.escalaTexto(),
            aoEscolher: (valor) => aparencia.aplicar({ escalaTexto: valor }),
          },
          {
            tipo: "segmentado",
            titulo: "Animações",
            ajuda: "Transições, deslizes e o fade das janelas.",
            nome: "cfg-movimento",
            busca: "animação movimento transição efeito reduzir enjoo",
            opcoes: [
              { valor: "normal", rotulo: "Normais" },
              { valor: "reduzido", rotulo: "Reduzidas" },
            ],
            atual: () => aparencia.movimento(),
            aoEscolher: (valor) => aparencia.aplicar({ movimento: valor }),
          },
          {
            tipo: "segmentado",
            titulo: "Fundo da tela",
            ajuda: "A grade discreta atrás do conteúdo, com o brilho no topo.",
            nome: "cfg-fundo",
            busca: "fundo grade textura brilho halo liso plano",
            opcoes: [
              { valor: "grade", rotulo: "Com grade" },
              { valor: "liso", rotulo: "Liso" },
            ],
            atual: () => aparencia.fundoTela(),
            aoEscolher: (valor) => aparencia.aplicar({ fundoTela: valor }),
          },
        ],
      },

      {
        id: "tabelas",
        titulo: "Tabelas",
        icone: "tabela",
        descricao: "Este é um app de ler tabela o dia inteiro. Aqui é onde isso se ajusta.",
        itens: [
          {
            tipo: "segmentado",
            titulo: "Densidade das linhas",
            ajuda: "Quanto respiro cada linha tem. Compacta mostra mais registros sem rolar.",
            nome: "cfg-densidade",
            busca: "densidade linha altura da linha compacta confortável espaçamento",
            opcoes: DENSIDADES.map((d) => ({ valor: d.valor, rotulo: d.rotulo })),
            atual: () => aparencia.densidade(),
            aoEscolher: (valor) => aparencia.aplicar({ densidade: valor }),
          },
          {
            tipo: "segmentado",
            titulo: "Altura das tabelas",
            ajuda: "Quanto da tela a tabela ocupa antes de precisar rolar por dentro.",
            nome: "cfg-altura",
            busca: "altura tabela rolagem scroll tela cheia",
            opcoes: ALTURAS.map((a) => ({ valor: a.valor, rotulo: a.rotulo })),
            atual: () => aparencia.altura(),
            aoEscolher: (valor) => aparencia.aplicar({ altura: valor }),
          },
          {
            tipo: "segmentado",
            titulo: "Linhas por página",
            ajuda: "Vale para Atualizações, Clientes, Agendamentos e Histórico.",
            nome: "cfg-linhas",
            busca: "linhas por página paginação quantidade registros",
            opcoes: LINHAS_OPCOES.map((n) => ({ valor: String(n), rotulo: String(n) })),
            atual: () => String(aparencia.linhasPorPagina()),
            aoEscolher: (valor) => {
              aparencia.aplicar({ linhasPorPagina: Number(valor) });
              this.aoMudarLinhas();
            },
          },
        ],
      },

      {
        id: "comportamento",
        titulo: "Comportamento",
        icone: "ajustes",
        descricao: "Onde o app abre, o que ele lembra e de quanto em quanto tempo se atualiza.",
        itens: [
          {
            // Nove telas não cabem num trilho de opções: nove botões colados
            // não seriam legíveis nem caberiam na largura. A regra aqui é a
            // largura do que se escolhe, não a consistência pela consistência.
            tipo: "select",
            titulo: "Tela inicial",
            ajuda: "Onde o sistema abre quando você entra.",
            busca: "tela inicial abertura página inicial padrão entrar",
            oculto: () => this.abas.length === 0,
            opcoes: [
              { valor: "", rotulo: "Primeira da lista (Resumo)" },
              ...this.abas.map((a) => ({ valor: a.key, rotulo: a.label })),
            ],
            atual: () => aparencia.abaInicial(),
            aoEscolher: (valor) => aparencia.aplicar({ abaInicial: valor }),
          },
          {
            tipo: "segmentado",
            titulo: "Menu lateral",
            ajuda: "Recolhido, sobra bastante largura para as tabelas.",
            nome: "cfg-menu",
            busca: "menu lateral barra sidebar recolher esconder largura",
            opcoes: [
              { valor: "aberto", rotulo: "Aberto" },
              { valor: "recolhido", rotulo: "Recolhido" },
            ],
            atual: () => (settings.get("sidebarRecolhida", false) ? "recolhido" : "aberto"),
            aoEscolher: (valor) => this.aoMudarSidebar(valor === "recolhido"),
          },
          {
            tipo: "segmentado",
            titulo: "Lembrar filtros ao trocar de aba",
            ajuda: "Busca, filtro e ordenação continuam como estavam ao voltar. Somem quando o navegador fecha.",
            nome: "cfg-filtros",
            busca: "lembrar filtros busca ordenação memória limpar sessão",
            opcoes: [
              { valor: "sim", rotulo: "Lembrar" },
              { valor: "nao", rotulo: "Sempre limpo" },
            ],
            atual: () => (aparencia.lembrarFiltros() ? "sim" : "nao"),
            aoEscolher: (valor) => {
              const lembrar = valor === "sim";
              aparencia.aplicar({ lembrarFiltros: lembrar });
              // Desligar sem varrer o que já estava guardado deixaria os
              // filtros de antes presos na sessão: invisíveis para o app, mas
              // de volta assim que alguém religasse a opção.
              if (!lembrar) prefs.limparTudo();
            },
          },
          {
            tipo: "segmentado",
            titulo: "Atualizar a Distribuição sozinha",
            ajuda: "De quanto em quanto tempo o painel busca o retorno dos agentes.",
            nome: "cfg-ritmo",
            busca: "atualizar sozinha automático distribuição agentes intervalo tempo",
            opcoes: RITMOS.map((r) => ({ valor: String(r.valor), rotulo: r.rotulo })),
            atual: () => String(aparencia.ritmoPainel()),
            aoEscolher: (valor) => aparencia.aplicar({ ritmoPainel: Number(valor) }),
          },
        ],
      },

      {
        id: "avisos",
        titulo: "Avisos",
        icone: "sino",
        descricao: "O que o Gestor pode interromper para contar, e onde ele conta.",
        itens: [
          {
            tipo: "segmentado",
            titulo: "Avisar quando um agente falhar",
            ajuda: "Notificação do sistema, mesmo com o Gestor em outra aba.",
            nome: "cfg-notificacoes",
            busca: "notificação aviso falha erro agente windows alerta som",
            oculto: () => !notificacoes.suportado(),
            opcoes: [
              { valor: "nao", rotulo: "Não" },
              { valor: "sim", rotulo: "Sim" },
            ],
            atual: () => (notificacoes.ligadas() ? "sim" : "nao"),
            aoEscolher: async (valor, grupo) => {
              const ligou = await notificacoes.definir(valor === "sim");
              // Se o navegador recusou a permissão, a opção volta sozinha para
              // "Não": deixar "Sim" marcado prometeria avisos que nunca
              // viriam, e a pessoa só descobriria isso na hora em que mais
              // precisava.
              if (valor === "sim" && !ligou) {
                grupo.querySelector('input[value="nao"]').checked = true;
                toast.error("O navegador bloqueou as notificações para este site.");
              }
            },
          },
          {
            tipo: "segmentado",
            titulo: "Onde os avisos aparecem",
            ajuda: 'Os recados rápidos ("Registro salvo"). Embaixo eles passam por cima da paginação.',
            nome: "cfg-avisos",
            busca: "avisos toast posição canto topo rodapé onde aparecem",
            opcoes: POSICOES_AVISO.map((p) => ({ valor: p.valor, rotulo: p.rotulo })),
            atual: () => aparencia.posicaoAvisos(),
            aoEscolher: (valor) => {
              aparencia.aplicar({ posicaoAvisos: valor });
              // O único ajuste cujo efeito é invisível até algo acontecer:
              // mostrar um aviso na hora é a demonstração, não um parabéns.
              toast.info(valor === "topo" ? "Os avisos passam a aparecer aqui em cima." : "Os avisos voltam para o rodapé.");
            },
          },
        ],
      },

      {
        id: "sistema",
        titulo: "Sistema",
        icone: "config",
        descricao: "Quem está usando, e as telas que não são ajuste.",
        itens: [
          {
            tipo: "conta",
            busca: "conta usuário logado perfil quem sou permissão",
            // Sem usuário (o painel é montável sem ele), a linha sairia da
            // lista como uma caixa vazia -- e a busca por "conta" a traria de
            // volta à tona, já que esconder é o que a busca desfaz.
            oculto: () => !this.usuario,
          },
          /*
           * Backups, Usuários e Atalhos não são preferências -- são telas que
           * se abrem -- e por isso têm forma de link, não de ajuste. Um ajuste
           * muda como o app se comporta; estes três levam a outro lugar, e
           * desenhá-los como trilho de opções diria que são a mesma coisa.
           */
          {
            tipo: "link",
            titulo: "Backups",
            ajuda: "Salvar e restaurar cópias do banco",
            icone: "backups",
            busca: "backup cópia restaurar banco segurança exportar",
            acao: () => this.abrirBackups?.(),
            oculto: () => typeof this.abrirBackups !== "function",
          },
          {
            tipo: "link",
            titulo: "Usuários",
            ajuda: "Quem tem acesso e com qual permissão",
            icone: "users",
            busca: "usuários acesso permissão senha conta equipe",
            acao: () => this.abrirUsuarios?.(),
            oculto: () => typeof this.abrirUsuarios !== "function",
          },
          {
            tipo: "link",
            titulo: "Atalhos de teclado",
            ajuda: "Tudo que dá para fazer sem tirar a mão do teclado",
            icone: "teclado",
            busca: "atalhos teclado teclas shortcuts ctrl k",
            acao: () => mostrarAtalhos(),
          },
        ],
      },
    ];

    // Um item escondido (sem abas para escolher, sem suporte a notificação)
    // sai da lista AQUI, antes de qualquer um dos três consumidores -- assim a
    // busca não encontra um ajuste que não existe nesta máquina, e a seção não
    // nasce vazia sem ninguém perceber.
    for (const secao of secoes) secao.itens = secao.itens.filter((item) => !item.oculto?.());
    this._cacheDefinicoes = secoes.filter((secao) => secao.itens.length > 0);
    return this._cacheDefinicoes;
  }

  // ==========================================================================
  // DESENHO
  // ==========================================================================

  _montarSecao(secao) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "cfg__nav-item";
    botao.dataset.secao = secao.id;
    botao.innerHTML = `<span class="cfg__nav-icon">${icon(secao.icone)}</span><span>${escapeHtml(secao.titulo)}</span>`;
    botao.addEventListener("click", () => this._irPara(secao.id));
    this.nav.appendChild(botao);

    const painel = document.createElement("section");
    painel.className = "cfg__section";
    painel.dataset.secao = secao.id;
    painel.hidden = true;
    painel.innerHTML = `
      <div class="cfg__section-head">
        <h4>${escapeHtml(secao.titulo)}</h4>
        <p>${escapeHtml(secao.descricao)}</p>
      </div>
      <div class="cfg__rows"></div>
    `;
    const linhas = painel.querySelector(".cfg__rows");
    for (const item of secao.itens) linhas.appendChild(this._montarItem(item, secao));
    this.pane.appendChild(painel);
    this.secoes.set(secao.id, painel);
  }

  _montarItem(item, secao) {
    const linha = this._porTipo(item);
    linha.classList.add("cfg__row");
    // O que a busca lê: o que está escrito na tela MAIS os sinônimos da
    // definição. Só o texto visível não bastaria -- ninguém procura "realce",
    // procura "cor"; ninguém procura "densidade", procura "linha apertada".
    linha.dataset.busca = normalizar(`${item.titulo || ""} ${item.ajuda || ""} ${item.busca || ""} ${secao.titulo}`);
    linha.dataset.secaoTitulo = secao.titulo;
    return linha;
  }

  _porTipo(item) {
    if (item.tipo === "temas") return this._temas(item);
    if (item.tipo === "cores") return this._cores(item);
    if (item.tipo === "select") return this._select(item);
    if (item.tipo === "link") return this._link(item);
    if (item.tipo === "conta") return this._conta();
    return this._segmentado(item);
  }

  /** Rótulo à esquerda + controle à direita, a forma padrão de uma linha. */
  _linha(titulo, ajuda) {
    const linha = document.createElement("div");
    linha.className = "cfg-group";
    const legenda = document.createElement("div");
    legenda.className = "cfg-group__labels";
    legenda.innerHTML = `<span class="cfg-group__title"></span><span class="cfg-group__help"></span>`;
    legenda.querySelector(".cfg-group__title").textContent = titulo;
    legenda.querySelector(".cfg-group__help").textContent = ajuda || "";
    linha.appendChild(legenda);
    return linha;
  }

  /**
   * Um grupo de opções mutuamente exclusivas, desenhado como botões colados.
   *
   * Por baixo são `<input type="radio">` de verdade, escondidos visualmente e
   * cobertos por um `<label>`. Isso não é preciosismo: um grupo de radios
   * nativo já vem com navegação por setas, com o anúncio correto ("opção 2 de
   * 3, marcada") em leitor de tela e com o clique no rótulo funcionando --
   * três coisas que uma fileira de `<button>` obrigaria a reimplementar na
   * mão, e que quase sempre saem pela metade quando se reimplementa.
   */
  _segmentado({ titulo, ajuda, nome, opcoes, atual, aoEscolher }) {
    const linha = this._linha(titulo, ajuda);
    const trilho = document.createElement("div");
    trilho.className = "segmented";
    trilho.setAttribute("role", "radiogroup");
    trilho.setAttribute("aria-label", titulo);

    const marcado = atual();
    for (const opcao of opcoes) {
      const label = document.createElement("label");
      label.className = "cfg-group__option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = nome;
      input.value = opcao.valor;
      input.checked = opcao.valor === marcado;
      const texto = document.createElement("span");
      texto.textContent = opcao.rotulo;
      label.append(input, texto);
      trilho.appendChild(label);

      // O `trilho` vai junto porque alguns ajustes podem falhar depois de
      // marcados (a permissão de notificação, que quem decide é o navegador) e
      // precisam desmarcar a opção de volta.
      input.addEventListener("change", () => {
        if (input.checked) aoEscolher(opcao.valor, trilho);
      });
    }

    linha.appendChild(trilho);
    return linha;
  }

  /**
   * Tema: três miniaturas, não três palavras.
   *
   * "Claro" e "Escuro" até se explicam sozinhos, mas "Sistema" não -- e o
   * problema real é outro: escolher o visual do app lendo a palavra que
   * descreve o visual é dar uma volta desnecessária, quando mostrar o visual é
   * possível. A miniatura de "Sistema" é metade de cada, que é literalmente o
   * que a opção significa.
   */
  _temas({ titulo, ajuda }) {
    const linha = this._linha(titulo, ajuda);
    linha.classList.add("cfg-group--largo");

    const grade = document.createElement("div");
    grade.className = "cfg-temas";
    grade.setAttribute("role", "radiogroup");
    grade.setAttribute("aria-label", titulo);

    const atual = theme.atual();
    for (const opcao of [
      { valor: "sistema", rotulo: "Sistema" },
      { valor: "claro", rotulo: "Claro" },
      { valor: "escuro", rotulo: "Escuro" },
    ]) {
      const label = document.createElement("label");
      label.className = "cfg-tema";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "cfg-tema";
      input.value = opcao.valor;
      input.checked = opcao.valor === atual;
      label.appendChild(input);
      label.insertAdjacentHTML(
        "beforeend",
        `<span class="cfg-tema__preview cfg-tema__preview--${opcao.valor}" aria-hidden="true">
           <span class="cfg-tema__barra"></span>
           <span class="cfg-tema__corpo"><i></i><i></i><i></i></span>
         </span>
         <span class="cfg-tema__rotulo">${escapeHtml(opcao.rotulo)}${icon("check")}</span>`
      );
      input.addEventListener("change", () => {
        if (input.checked) theme.aplicar(opcao.valor);
      });
      grade.appendChild(label);
    }

    linha.appendChild(grade);
    return linha;
  }

  /** Cor de destaque: bolinhas, pelo mesmo motivo das miniaturas de tema. */
  _cores({ titulo, ajuda }) {
    const linha = this._linha(titulo, ajuda);
    const trilho = document.createElement("div");
    trilho.className = "cfg-cores";
    trilho.setAttribute("role", "radiogroup");
    trilho.setAttribute("aria-label", titulo);

    const atual = aparencia.realce();
    for (const cor of REALCES) {
      const label = document.createElement("label");
      label.className = "cfg-cor";
      label.title = cor.rotulo;
      label.style.setProperty("--amostra", cor.hex);
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "cfg-realce";
      input.value = cor.valor;
      input.checked = cor.valor === atual;
      // O nome da cor não some, vira texto de leitor de tela: sete bolinhas
      // coloridas sem rótulo são sete opções idênticas para quem não as
      // enxerga, e a cor é exatamente a informação que falta nesse caso.
      const nome = document.createElement("span");
      nome.className = "sr-only";
      nome.textContent = cor.rotulo;
      label.append(input, nome);
      input.addEventListener("change", () => {
        if (input.checked) aparencia.aplicar({ realce: cor.valor });
      });
      trilho.appendChild(label);
    }

    linha.appendChild(trilho);
    return linha;
  }

  _select({ titulo, ajuda, opcoes, atual, aoEscolher }) {
    const linha = this._linha(titulo, ajuda);
    const select = document.createElement("select");
    select.className = "input cfg-group__select";
    select.setAttribute("aria-label", titulo);
    for (const opcao of opcoes) {
      const el = document.createElement("option");
      el.value = opcao.valor;
      el.textContent = opcao.rotulo;
      select.appendChild(el);
    }
    select.value = atual();
    select.addEventListener("change", () => aoEscolher(select.value));
    linha.appendChild(select);
    return linha;
  }

  /** Linha clicável (ícone, rótulo, seta) -- "isto leva a outro lugar". */
  _link({ titulo, ajuda, icone, acao }) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "cfg-link";
    botao.innerHTML = `
      <span class="cfg-link__icon">${icon(icone)}</span>
      <span class="cfg-link__labels"><strong></strong><span></span></span>
      <span class="cfg-link__seta">${icon("seta")}</span>
    `;
    botao.querySelector("strong").textContent = titulo;
    botao.querySelector(".cfg-link__labels span").textContent = ajuda;
    // Fecha este painel antes de abrir o outro: dois diálogos empilhados
    // prendem o foco no de cima e escondem o de baixo pela metade.
    botao.addEventListener("click", () => {
      this.close();
      acao();
    });
    return botao;
  }

  /**
   * Quem está usando. Não é ajuste nenhum -- está aqui porque "com que conta
   * eu entrei?" era, até agora, uma pergunta que só o canto do cabeçalho
   * respondia, e é a primeira coisa que se quer confirmar antes de mexer em
   * Usuários ou em Backups, que ficam logo abaixo.
   */
  _conta() {
    const caixa = document.createElement("div");
    caixa.className = "cfg-conta";
    const { nome, usuario, role } = this.usuario;
    caixa.innerHTML = `
      <span class="cfg-conta__avatar" aria-hidden="true"></span>
      <span class="cfg-conta__texto">
        <strong></strong>
        <span></span>
      </span>
    `;
    caixa.querySelector(".cfg-conta__avatar").textContent = iniciais(nome || usuario);
    caixa.querySelector("strong").textContent = nome || usuario;
    // "admin" é o valor guardado no banco (ver AuthService), não uma palavra
    // para mostrar: quem lê quer saber se pode mexer em usuários, e é isso que
    // "Administrador" responde.
    const papel = role === "admin" ? "Administrador" : "Usuário";
    caixa.querySelector(".cfg-conta__texto span").textContent = `@${usuario} — ${papel}`;
    return caixa;
  }

  // ==========================================================================
  // NAVEGAÇÃO E BUSCA
  // ==========================================================================

  _irPara(id) {
    this.secaoAtual = id;
    for (const [secaoId, painel] of this.secoes) painel.hidden = secaoId !== id;
    for (const botao of this.nav.querySelectorAll(".cfg__nav-item")) {
      const ativo = botao.dataset.secao === id;
      botao.classList.toggle("is-active", ativo);
      // `aria-current` e não `aria-selected`: durante uma busca o painel mostra
      // várias seções ao mesmo tempo, e aí "selecionado" seria mentira. O que
      // o botão marca é sempre "é aqui que você está", e isso continua verdade
      // nos dois modos.
      if (ativo) botao.setAttribute("aria-current", "true");
      else botao.removeAttribute("aria-current");
    }
    this.pane.scrollTop = 0;
  }

  /**
   * A busca não filtra uma lista -- ela troca o painel de modo. Enquanto há
   * texto, TODAS as seções aparecem mostrando só as linhas que casam (com o
   * nome da seção em cima, senão "Densidade" e "Altura" viram dois resultados
   * soltos sem contexto); apagando o texto, o painel volta exatamente para a
   * seção onde estava.
   */
  _ligarBusca(campo) {
    campo.addEventListener("input", () => {
      const termo = normalizar(campo.value.trim());
      this.box.classList.toggle("is-buscando", termo.length > 0);

      if (!termo) {
        for (const linha of this.pane.querySelectorAll(".cfg__row")) linha.hidden = false;
        this.semResultado.hidden = true;
        this._irPara(this.secaoAtual);
        return;
      }

      let achou = 0;
      for (const [, painel] of this.secoes) {
        let visiveis = 0;
        for (const linha of painel.querySelectorAll(".cfg__row")) {
          const casa = termo.split(/\s+/).every((parte) => linha.dataset.busca.includes(parte));
          linha.hidden = !casa;
          if (casa) visiveis += 1;
        }
        painel.hidden = visiveis === 0;
        achou += visiveis;
      }
      this.semResultado.hidden = achou > 0;
      this.pane.scrollTop = 0;
    });

    // Escape com texto digitado limpa a busca em vez de fechar o painel: quem
    // está buscando quer desistir da BUSCA, não do painel -- e fechar tudo
    // obrigaria a reabrir e reencontrar a seção. Sem texto, o Escape segue seu
    // caminho e o Modal fecha, como em qualquer outro diálogo.
    campo.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !campo.value) return;
      e.stopPropagation();
      campo.value = "";
      campo.dispatchEvent(new Event("input"));
    });
  }

  /**
   * Setas ↑↓ percorrem a trilha de seções, como num menu de verdade.
   *
   * O Tab sozinho até funcionaria, mas atravessaria a trilha inteira botão a
   * botão antes de chegar aos ajustes. Uma lista vertical de navegação é o
   * caso clássico em que a seta é o gesto esperado -- e sem ela o teclado fica
   * medindo esforço em número de Tabs.
   */
  _ligarNavegacaoPorSetas() {
    this.nav.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const botoes = [...this.nav.querySelectorAll(".cfg__nav-item")];
      const atual = botoes.indexOf(document.activeElement);
      if (atual === -1) return;
      e.preventDefault();
      const proximo = (atual + (e.key === "ArrowDown" ? 1 : -1) + botoes.length) % botoes.length;
      botoes[proximo].focus();
      botoes[proximo].click();
    });
  }

  async _restaurar() {
    const ok = await Modal.confirm(
      "Restaurar padrões",
      "Todas as preferências deste navegador voltam ao estado original: tema, cor de destaque, tamanho do texto, densidade, altura, linhas por página, tela inicial, menu e avisos.\n\nNenhum dado do sistema é afetado.",
      { confirmLabel: "Restaurar", danger: false }
    );
    if (!ok) return;
    aparencia.restaurarPadroes();
    // Recarregar é honesto aqui: o tema, o menu e a densidade são aplicados em
    // pontos diferentes do arranque, e desfazer cada um na mão seria
    // reimplementar a inicialização inteira só para esta tecla.
    location.reload();
  }
}

/** "Antonio Salomão" -> "AS". Duas letras bastam para o avatar. */
function iniciais(nome) {
  const partes = String(nome || "?").trim().split(/\s+/);
  const primeira = partes[0]?.[0] || "?";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * Minúsculas e sem acento, dos dois lados da comparação. Sem isto, procurar
 * "aparencia" não acharia "Aparência" -- e esperar que alguém digite o acento
 * certo numa caixa de busca é esperar demais.
 */
function normalizar(texto) {
  return String(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Abre o painel. Wrapper minúsculo, mas evita repetir a montagem nos três
 * lugares que chegam até aqui (botão do cabeçalho, botão da barra lateral e
 * paleta de comandos).
 */
export function abrirConfiguracoes({
  aoMudarLinhas,
  aoMudarSidebar,
  abas,
  usuario,
  abrirBackups,
  abrirUsuarios,
} = {}) {
  new ConfiguracoesPanel({
    aoMudarSidebar,
    abas,
    usuario,
    abrirBackups,
    abrirUsuarios,
    aoMudarLinhas: () => {
      aoMudarLinhas?.();
      // As outras preferências se explicam sozinhas na tela (o tema muda a
      // cor, a densidade muda a linha). O tamanho de página é o único cujo
      // efeito acontece atrás do painel aberto, onde não dá para ver.
      toast.info("Tamanho de página atualizado.");
    },
  }).open();
}
