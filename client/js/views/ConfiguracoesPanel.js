import { Modal } from "../components/Modal.js";
import { theme } from "../app/theme.js";
import {
  aparencia,
  reaplicarAparencia,
  DENSIDADES,
  LINHAS_OPCOES,
  ALTURAS,
  RITMOS,
  REALCES,
  ESCALAS,
  POSICOES_AVISO,
  CONTRASTES,
  TRANSPARENCIAS,
  ZEBRAS,
  PERFIS,
} from "../app/appearance.js";
import { settings, prefs } from "../app/prefs.js";
import { mostrarAtalhos } from "../app/Shortcuts.js";
import { notificacoes } from "../app/notify.js";
import { icon } from "../utils/icons.js";
import { toast } from "../components/Toast.js";
import { escapeHtml } from "../utils/html.js";
import { iniciais, rotuloPapel } from "../domain/pessoa.js";
import { baixarTexto, escolherArquivo } from "../utils/arquivo.js";

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
 * Hoje é um painel de duas colunas, que é a forma que quase todo sistema
 * operacional e quase todo app de porte usam para a mesma coisa, e pelos
 * mesmos motivos:
 *
 *  - **seções com nome** (Aparência, Tabelas, Acessibilidade, Comportamento,
 *    Avisos, Conta). Cada uma cabe na tela inteira sem rolar, então escolher
 *    a seção é escolher um conjunto pequeno de decisões relacionadas -- em vez
 *    de procurar uma agulha numa lista de dezoito;
 *  - **uma trilha de navegação fixa à esquerda**, que responde "onde estou e o
 *    que mais existe aqui" sem precisar rolar para descobrir;
 *  - **busca**, porque a pergunta real de quem abre configurações quase nunca
 *    é "quais seções existem", é "onde fica aquilo".
 *
 * O que ele ganhou nesta revisão, e por quê:
 *
 *  - **Perfis.** Dezoito ajustes é mais do que a maioria das pessoas quer
 *    decidir. Um clique em "Operação" ou "Leitura" põe a interface inteira
 *    numa configuração coerente, e cada ajuste continua editável embaixo.
 *  - **Selo "alterado", contagem por seção e resumo no rodapé.** "O que aqui
 *    dentro fui EU que mexi?" era impossível de responder sem lembrar de cada
 *    escolha feita meses atrás -- e é a primeira pergunta de quem herda uma
 *    máquina configurada por outra pessoa, ou de quem quer desfazer um ajuste
 *    de que se arrependeu sem zerar todo o resto junto.
 *  - **Restaurar só uma seção**, pelo mesmo motivo: o botão de restaurar era
 *    tudo ou nada, e "tudo" é caro demais para quem só quer desfazer a
 *    densidade.
 *  - **Exportar e importar as preferências** num arquivo, para montar uma
 *    máquina nova (ou a de um colega) igual à sua sem refazer dezoito
 *    escolhas na mão.
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
   *   aoMudarVarias?: () => void,
   *   abas?: Array<{key: string, label: string}>,
   *   usuario?: {nome: string, usuario: string, role?: string},
   *   atualizadorHabilitado?: boolean,
   *   trocarSenha?: () => void,
   *   abrirAdministracao?: () => void,
   * }} [acoes]
   *   O painel não mexe no shell por conta própria: quem sabe atualizar o
   *   rótulo do botão de recolher e recarregar a aba aberta é o App, então ele
   *   entrega essas ações aqui em vez de o painel ir procurar elementos pela
   *   tela e adivinhar como cada um se comporta.
   *
   *   `aoMudarVarias` é o caso em que MUITAS preferências mudam de uma vez (um
   *   perfil aplicado, um arquivo importado, uma seção restaurada): avisar
   *   ajuste por ajuste obrigaria a lembrar de acrescentar um aviso novo a
   *   cada preferência criada, e o esquecimento apareceria como "o perfil
   *   mudou tudo, menos o menu lateral".
   */
  constructor({
    aoMudarLinhas,
    aoMudarSidebar,
    aoMudarVarias,
    abas,
    usuario,
    atualizadorHabilitado = true,
    trocarSenha,
    abrirAdministracao,
  } = {}) {
    this.aoMudarLinhas = aoMudarLinhas || (() => {});
    this.aoMudarSidebar = aoMudarSidebar || (() => {});
    this.aoMudarVarias = aoMudarVarias || (() => {});
    /** @type {Array<{key: string, label: string}>} para o seletor de tela inicial */
    this.abas = abas || [];
    this.usuario = usuario || null;
    // Sem o Atualizador, "Atualizar a Distribuição sozinha" e "Avisar quando um
    // agente falhar" são ajustes de uma tela que não existe -- somem daqui.
    this.atualizadorHabilitado = atualizadorHabilitado;
    this.trocarSenha = trocarSenha || null;
    this.abrirAdministracao = abrirAdministracao || null;
    /** @type {Map<string, HTMLElement>} id da seção -> painel montado */
    this.secoes = new Map();
  }

  open() {
    const { box, close } = Modal.abrirCaixa({ largura: 880, classe: "cfg" });
    this.close = close;
    this.box = box;

    box.innerHTML = `
      <header class="cfg__top">
        <div class="painel__icon" aria-hidden="true">${icon("config")}</div>
        <div class="cfg__titles">
          <h3 class="modal-box__title" id="config-titulo">Configurações</h3>
          <!-- Estas preferências deixaram de ser "deste navegador" quando
               passaram a ser gravadas na conta (ver prefs.js). A frase antiga
               continuava dizendo o contrário, que é o tipo de texto que só
               engana quem confia nele. -->
          <p class="modal-box__message">Acompanham a sua conta em qualquer máquina, e valem na hora.</p>
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
        <span class="cfg__resumo" data-role="resumo" aria-live="polite"></span>
        <span class="toolbar-spacer"></span>
        <button type="button" class="btn btn--ghost btn--small" data-action="restaurar">Restaurar tudo</button>
        <button type="button" class="btn btn--accent" data-action="concluir">Concluído</button>
      </footer>
    `;
    box.setAttribute("aria-labelledby", "config-titulo");

    this.nav = box.querySelector('[data-role="nav"]');
    this.pane = box.querySelector('[data-role="pane"]');
    this.semResultado = box.querySelector('[data-role="semResultado"]');
    this.resumo = box.querySelector('[data-role="resumo"]');
    this.busca = box.querySelector('[data-role="busca"]');

    for (const secao of this._definicoes()) this._montarSecao(secao);
    this._irPara(this._definicoes()[0].id);
    this._atualizarSelos();

    this._ligarBusca(this.busca);
    this._ligarNavegacaoPorSetas();

    box.querySelector('[data-action="concluir"]').addEventListener("click", () => close());
    box.querySelector('[data-action="fechar"]').addEventListener("click", () => close());
    box.querySelector('[data-action="restaurar"]').addEventListener("click", () => this._restaurarTudo());

    // O foco vai para a busca: é a primeira coisa que serve para QUALQUER
    // intenção de quem abriu o painel, e dali o Tab desce naturalmente para a
    // trilha de seções. Focar o primeiro ajuste presumiria que a pessoa veio
    // atrás justamente dele.
    this.busca.focus();
  }

  // ==========================================================================
  // O QUE O PAINEL OFERECE
  // ==========================================================================

  /**
   * A lista inteira de ajustes, como dados.
   *
   * Está escrita assim -- e não como uma sequência de chamadas que empurram
   * elementos numa div, como era antes -- porque quatro coisas diferentes
   * precisam percorrer a MESMA lista: o desenho das seções, a trilha de
   * navegação, a busca e o cálculo do que está fora do padrão. Com a lista
   * sendo dado, as quatro leem a mesma fonte; com ela sendo código, cada uma
   * teria que ser mantida em sincronia na mão, e a busca seria a primeira a
   * ficar desatualizada quando um ajuste novo entrasse.
   *
   * O campo `chaves` de cada item diz de quais preferências ele é dono. É o
   * que permite o selo "alterado", a contagem por seção e o "restaurar esta
   * seção" existirem sem uma segunda tabela dizendo a mesma coisa.
   */
  _definicoes() {
    if (this._cacheDefinicoes) return this._cacheDefinicoes;

    const secoes = [
      {
        id: "aparencia",
        titulo: "Aparência",
        icone: "paleta",
        descricao: "Como o Gestor se parece. Comece por um perfil, ajuste o resto se quiser.",
        itens: [
          {
            tipo: "perfis",
            titulo: "Perfil",
            ajuda: "Um clique arruma vários ajustes de uma vez. Nada aqui é definitivo.",
            busca: "perfil predefinido modo padrão operação leitura acessível conjunto",
          },
          {
            tipo: "temas",
            titulo: "Tema",
            ajuda: '"Sistema" acompanha a configuração do seu computador.',
            chaves: ["tema"],
            busca: "tema claro escuro noturno modo sistema cor de fundo",
          },
          {
            tipo: "cores",
            titulo: "Cor de destaque",
            ajuda: "A cor dos botões, links e da aba ativa.",
            chaves: ["realce"],
            busca: "cor destaque realce accent azul verde roxo violeta rosa âmbar",
          },
          {
            tipo: "segmentado",
            titulo: "Tamanho do texto",
            ajuda: "Aumenta tudo junto, sem desalinhar a interface.",
            nome: "cfg-escala",
            chaves: ["escalaTexto"],
            busca: "tamanho do texto letra fonte zoom acessibilidade enxergar",
            opcoes: ESCALAS.map((e) => ({ valor: e.valor, rotulo: e.rotulo })),
            atual: () => aparencia.escalaTexto(),
            aoEscolher: (valor) => aparencia.aplicar({ escalaTexto: valor }),
          },
          {
            tipo: "segmentado",
            titulo: "Fundo da tela",
            ajuda: "A grade discreta atrás do conteúdo, com o brilho no topo.",
            nome: "cfg-fundo",
            chaves: ["fundoTela"],
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
            chaves: ["densidade"],
            busca: "densidade linha altura da linha compacta confortável espaçamento apertada",
            opcoes: DENSIDADES.map((d) => ({ valor: d.valor, rotulo: d.rotulo })),
            atual: () => aparencia.densidade(),
            aoEscolher: (valor) => aparencia.aplicar({ densidade: valor }),
          },
          {
            tipo: "segmentado",
            titulo: "Altura das tabelas",
            ajuda: "Quanto da tela a tabela ocupa antes de precisar rolar por dentro.",
            nome: "cfg-altura",
            chaves: ["alturaTabela"],
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
            chaves: ["linhasPorPagina"],
            busca: "linhas por página paginação quantidade registros",
            opcoes: LINHAS_OPCOES.map((n) => ({ valor: String(n), rotulo: String(n) })),
            atual: () => String(aparencia.linhasPorPagina()),
            aoEscolher: (valor) => {
              aparencia.aplicar({ linhasPorPagina: Number(valor) });
              this.aoMudarLinhas();
            },
          },
          {
            tipo: "segmentado",
            titulo: "Linhas alternadas",
            ajuda: "A faixa clara em uma linha sim, outra não, para não pular de linha numa tabela larga.",
            nome: "cfg-zebra",
            chaves: ["zebra"],
            busca: "zebra listrado linhas alternadas faixa risca lisa",
            opcoes: ZEBRAS.map((z) => ({ valor: z.valor, rotulo: z.rotulo })),
            atual: () => aparencia.zebra(),
            aoEscolher: (valor) => aparencia.aplicar({ zebra: valor }),
          },
        ],
      },

      {
        id: "acessibilidade",
        titulo: "Acessibilidade",
        icone: "acessibilidade",
        descricao: "Enxergar melhor, cansar menos e deixar a tela mais leve na máquina.",
        itens: [
          {
            tipo: "segmentado",
            titulo: "Contraste",
            ajuda: "Reforça bordas e textos de apoio, sem trocar o tema que você escolheu.",
            nome: "cfg-contraste",
            chaves: ["contraste"],
            busca: "contraste alto enxergar legibilidade borda fraca claro demais acessibilidade",
            opcoes: CONTRASTES.map((c) => ({ valor: c.valor, rotulo: c.rotulo })),
            atual: () => aparencia.contraste(),
            aoEscolher: (valor) => aparencia.aplicar({ contraste: valor }),
          },
          {
            tipo: "segmentado",
            titulo: "Animações",
            ajuda: "Transições, deslizes e o fade das janelas.",
            nome: "cfg-movimento",
            chaves: ["movimento"],
            busca: "animação movimento transição efeito reduzir enjoo vertigem",
            opcoes: [
              { valor: "normal", rotulo: "Normais" },
              { valor: "reduzido", rotulo: "Reduzidas" },
            ],
            atual: () => aparencia.movimento(),
            aoEscolher: (valor) => aparencia.aplicar({ movimento: valor }),
          },
          {
            tipo: "segmentado",
            titulo: "Superfícies",
            ajuda: "O vidro fosco da barra lateral e das janelas. Sólidas pesam menos em máquina fraca.",
            nome: "cfg-transparencia",
            chaves: ["transparencia"],
            busca: "transparência desfoque blur vidro fosco desempenho lento travando sólido",
            opcoes: TRANSPARENCIAS.map((t) => ({ valor: t.valor, rotulo: t.rotulo })),
            atual: () => aparencia.transparencia(),
            aoEscolher: (valor) => aparencia.aplicar({ transparencia: valor }),
          },
        ],
      },

      {
        id: "comportamento",
        titulo: "Comportamento",
        icone: "ajustes",
        descricao: "Onde o app abre e o que ele lembra de uma tela para outra.",
        itens: [
          {
            // Nove telas não cabem num trilho de opções: nove botões colados
            // não seriam legíveis nem caberiam na largura. A regra aqui é a
            // largura do que se escolhe, não a consistência pela consistência.
            tipo: "select",
            titulo: "Tela inicial",
            ajuda: "Onde o sistema abre quando você entra.",
            chaves: ["abaInicial"],
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
            chaves: ["sidebarRecolhida"],
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
            chaves: ["lembrarFiltros"],
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
            chaves: ["ritmoPainel"],
            busca: "atualizar sozinha automático distribuição agentes intervalo tempo",
            oculto: () => !this.atualizadorHabilitado,
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
            ajuda: "Notificação do sistema, mesmo com o Gestor em outra aba. Vale só nesta máquina.",
            nome: "cfg-notificacoes",
            busca: "notificação aviso falha erro agente windows alerta som",
            oculto: () => !notificacoes.suportado() || !this.atualizadorHabilitado,
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
            chaves: ["posicaoAvisos"],
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

      /*
       * "Conta" no lugar de duas seções que não diziam o que tinham:
       *  - "Segurança" era uma lista de links para modais de administração
       *    (usuários, backups, chave dos agentes, diagnóstico, Atualizador),
       *    tudo da EQUIPE dentro do painel de preferências PESSOAIS. Foi para
       *    a tela Administração, só de admin;
       *  - "Sistema" tinha o cartão da conta, exportar/importar e os atalhos --
       *    nada de sistema. É a conta de quem está usando.
       * A troca da própria senha, que estava escondida dentro de "Usuários e
       * Permissões", veio para cá: é da pessoa, e todo papel tem.
       */
      {
        id: "conta",
        titulo: "Conta",
        icone: "conta",
        descricao: "Com que conta você entrou, sua senha e como levar estas preferências para outra máquina.",
        itens: [
          {
            tipo: "conta",
            busca: "conta usuário logado perfil quem sou permissão papel",
            oculto: () => !this.usuario,
          },
          {
            tipo: "link",
            titulo: "Trocar minha senha",
            ajuda: "Quem estiver usando a sua conta em outro computador é desconectado",
            icone: "chave",
            busca: "senha trocar mudar alterar segurança password",
            acao: () => this.trocarSenha?.(),
            oculto: () => typeof this.trocarSenha !== "function",
          },
          {
            tipo: "link",
            titulo: "Administração da equipe",
            ajuda: "Usuários, histórico de alterações, regras da equipe, backups e saúde do servidor",
            icone: "escudo",
            busca: "administração admin usuários permissões backup histórico regras discord atualizador saúde",
            acao: () => this.abrirAdministracao?.(),
            oculto: () => typeof this.abrirAdministracao !== "function",
          },
          {
            tipo: "link",
            titulo: "Exportar preferências",
            ajuda: "Salva um arquivo com tudo que está escolhido aqui",
            icone: "download",
            busca: "exportar salvar arquivo json preferências levar copiar backup ajustes",
            fecharAntes: false,
            acao: () => this._exportar(),
          },
          {
            tipo: "link",
            titulo: "Importar preferências",
            ajuda: "Aplica um arquivo exportado de outra máquina",
            icone: "upload",
            busca: "importar carregar arquivo json preferências restaurar ajustes de outra máquina",
            fecharAntes: false,
            acao: () => this._importar(),
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
    // sai da lista AQUI, antes de qualquer um dos consumidores -- assim a
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
    botao.innerHTML = `
      <span class="cfg__nav-icon">${icon(secao.icone)}</span>
      <span class="cfg__nav-texto">${escapeHtml(secao.titulo)}</span>
      <span class="cfg__nav-count" hidden></span>
    `;
    botao.addEventListener("click", () => this._irPara(secao.id));
    this.nav.appendChild(botao);

    const painel = document.createElement("section");
    painel.className = "cfg__section";
    painel.dataset.secao = secao.id;
    painel.hidden = true;
    painel.innerHTML = `
      <div class="cfg__section-head">
        <div class="cfg__section-titles">
          <h4>${escapeHtml(secao.titulo)}</h4>
          <p>${escapeHtml(secao.descricao)}</p>
        </div>
        <button type="button" class="btn btn--ghost btn--small cfg__restaurar-secao"
                data-role="restaurarSecao" hidden>Restaurar esta seção</button>
      </div>
      <div class="cfg__rows"></div>
    `;
    const linhas = painel.querySelector(".cfg__rows");
    for (const item of secao.itens) linhas.appendChild(this._montarItem(item, secao));

    // Só aparece quando há o que restaurar (ver `_atualizarSelos`): um botão
    // permanentemente sem efeito ensina a ignorá-lo.
    painel
      .querySelector('[data-role="restaurarSecao"]')
      .addEventListener("click", () => this._restaurarSecao(secao));

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
    linha.dataset.chaves = (item.chaves || []).join(",");
    return linha;
  }

  _porTipo(item) {
    if (item.tipo === "perfis") return this._perfis(item);
    if (item.tipo === "temas") return this._temas(item);
    if (item.tipo === "cores") return this._cores(item);
    if (item.tipo === "select") return this._select(item);
    if (item.tipo === "link") return this._link(item);
    if (item.tipo === "conta") return this._conta();
    return this._segmentado(item);
  }

  /**
   * Rótulo à esquerda + controle à direita, a forma padrão de uma linha.
   *
   * O selo "alterado" nasce escondido em toda linha que tem rótulo, e é
   * `_atualizarSelos` quem decide quais aparecem. Criar todos de uma vez e
   * apenas mostrar/esconder evita a alternativa: inserir e remover elementos a
   * cada clique, que é como se perde o foco do controle que acabou de ser
   * usado.
   */
  _linha(titulo, ajuda) {
    const linha = document.createElement("div");
    linha.className = "cfg-group";
    const legenda = document.createElement("div");
    legenda.className = "cfg-group__labels";
    legenda.innerHTML = `
      <span class="cfg-group__title-row">
        <span class="cfg-group__title"></span>
        <span class="cfg-group__selo" hidden>alterado</span>
      </span>
      <span class="cfg-group__help"></span>
    `;
    legenda.querySelector(".cfg-group__title").textContent = titulo;
    legenda.querySelector(".cfg-group__help").textContent = ajuda || "";
    linha.appendChild(legenda);
    return linha;
  }

  /**
   * Os perfis, como cartões escolhíveis.
   *
   * Cada um traz uma amostra desenhada em CSS -- três traços finos e juntos
   * para "Operação", dois grossos e espaçados para "Leitura" -- pelo mesmo
   * motivo das miniaturas de tema: o que o perfil faz é VISUAL, e mostrar o
   * resultado é sempre mais direto do que descrevê-lo em duas linhas de texto
   * que a pessoa vai ter que imaginar.
   */
  _perfis({ titulo, ajuda }) {
    const linha = this._linha(titulo, ajuda);
    linha.classList.add("cfg-group--largo");

    const grade = document.createElement("div");
    grade.className = "cfg-perfis";
    for (const perfil of PERFIS) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "cfg-perfil";
      botao.dataset.perfil = perfil.valor;
      botao.setAttribute("aria-pressed", "false");
      botao.innerHTML = `
        <span class="cfg-perfil__amostra cfg-perfil__amostra--${perfil.valor}" aria-hidden="true">
          <i></i><i></i><i></i><i></i>
        </span>
        <span class="cfg-perfil__nome"></span>
        <span class="cfg-perfil__desc"></span>
        <span class="cfg-perfil__check" aria-hidden="true">${icon("check")}</span>
      `;
      botao.querySelector(".cfg-perfil__nome").textContent = perfil.rotulo;
      botao.querySelector(".cfg-perfil__desc").textContent = perfil.descricao;
      botao.addEventListener("click", () => {
        aparencia.aplicarPerfil(perfil.valor);
        this._aplicarEmLote();
        toast.success(`Perfil "${perfil.rotulo}" aplicado.`);
      });
      grade.appendChild(botao);
    }

    linha.appendChild(grade);
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
        if (!input.checked) return;
        // `Promise.resolve` porque um dos manipuladores é assíncrono (a
        // permissão de notificação): sem esperar, o selo seria recalculado
        // antes de a escolha ter de fato valido.
        Promise.resolve(aoEscolher(opcao.valor, trilho)).then(() => this._atualizarSelos());
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
        if (!input.checked) return;
        theme.aplicar(opcao.valor);
        this._atualizarSelos();
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
        if (!input.checked) return;
        aparencia.aplicar({ realce: cor.valor });
        this._atualizarSelos();
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
    select.addEventListener("change", () => {
      aoEscolher(select.value);
      this._atualizarSelos();
    });
    linha.appendChild(select);
    return linha;
  }

  /**
   * Linha clicável (ícone, rótulo, seta) -- "isto leva a outro lugar".
   *
   * `fecharAntes` decide se o painel some ao clicar. Backups e Usuários abrem
   * DIÁLOGOS, e dois diálogos empilhados prendem o foco no de cima e escondem
   * o de baixo pela metade. Exportar e importar preferências não abrem nada --
   * é um arquivo indo ou vindo --, e fechar o painel neles seria expulsar a
   * pessoa da tela que ela ainda está usando.
   */
  _link({ titulo, ajuda, icone, acao, fecharAntes = true }) {
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
    botao.addEventListener("click", () => {
      if (fecharAntes) this.close();
      acao();
    });
    return botao;
  }

  /**
   * Quem está usando. Não é ajuste nenhum -- está aqui porque "com que conta
   * eu entrei?" era, até agora, uma pergunta que só o canto do cabeçalho
   * respondia, e é a primeira coisa que se quer confirmar antes de trocar a
   * senha, logo abaixo.
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
    caixa.querySelector(".cfg-conta__texto span").textContent = `@${usuario} — ${rotuloPapel(role)}`;
    return caixa;
  }

  // ==========================================================================
  // O QUE FOI ALTERADO
  // ==========================================================================

  /**
   * Repassa a tela inteira marcando o que está fora do padrão: o selo de cada
   * linha, a contagem de cada seção, o botão de restaurar seção, o resumo do
   * rodapé e o perfil em vigor.
   *
   * Roda inteiro a cada mudança em vez de atualizar só o que mexeu. São
   * dezoito linhas num painel que já está aberto na frente da pessoa -- o
   * custo é irrelevante, e a alternativa (cada controle sabendo quais selos ele
   * afeta) é o tipo de dependência cruzada que quebra em silêncio quando um
   * perfil muda seis preferências de uma vez.
   */
  _atualizarSelos() {
    const mudadas = aparencia.diferencas();
    let total = 0;

    for (const [id, painel] of this.secoes) {
      let naSecao = 0;
      for (const linha of painel.querySelectorAll(".cfg__row")) {
        const chaves = (linha.dataset.chaves || "").split(",").filter(Boolean);
        const alterada = chaves.some((chave) => mudadas.has(chave));
        linha.classList.toggle("is-alterado", alterada);
        const selo = linha.querySelector(".cfg-group__selo");
        if (selo) selo.hidden = !alterada;
        if (alterada) naSecao += 1;
      }
      total += naSecao;

      painel.querySelector('[data-role="restaurarSecao"]').hidden = naSecao === 0;
      const contador = this.nav.querySelector(`[data-secao="${id}"] .cfg__nav-count`);
      if (contador) {
        contador.textContent = String(naSecao);
        contador.hidden = naSecao === 0;
        contador.title = `${naSecao} ajuste(s) fora do padrão nesta seção`;
      }
    }

    this.resumo.textContent =
      total === 0 ? "Tudo como vem de fábrica." : `${total} ${total === 1 ? "ajuste" : "ajustes"} fora do padrão.`;

    this._marcarPerfil();
  }

  /** Marca (ou desmarca) o cartão do perfil que descreve o estado atual. */
  _marcarPerfil() {
    const ativo = aparencia.perfilAtivo();
    for (const cartao of this.pane.querySelectorAll(".cfg-perfil")) {
      const marcado = cartao.dataset.perfil === ativo;
      cartao.classList.toggle("is-active", marcado);
      cartao.setAttribute("aria-pressed", String(marcado));
    }
  }

  // ==========================================================================
  // MUDANÇAS EM LOTE
  // ==========================================================================

  /**
   * O que fazer depois de mexer em muitas preferências de uma vez.
   *
   * A versão anterior resolvia isso com `location.reload()`, e a justificativa
   * era boa: tema, menu e densidade são aplicados em pontos diferentes do
   * arranque, e desfazer cada um na mão seria reimplementar a inicialização.
   * Só que recarregar cobra caro pelo que entrega -- a página pisca inteira, o
   * painel fecha, a aba e a rolagem voltam ao começo, e quem estava explorando
   * perfis perde o lugar a cada clique.
   *
   * Agora existem os três chamados que a inicialização também faz, e eles
   * cabem em três linhas: repintar o tema, repintar a aparência e pedir ao App
   * que alinhe o que é dele (menu lateral e dados da aba). O quarto -- remontar
   * os controles do painel -- é o que faz eles pararem de mostrar os valores
   * antigos.
   */
  _aplicarEmLote() {
    theme.aplicar();
    reaplicarAparencia();
    this.aoMudarVarias();
    this._remontar();
  }

  /** Redesenha nav e seções a partir das definições, mantendo onde se estava. */
  _remontar() {
    const secaoAnterior = this.secaoAtual;
    this._cacheDefinicoes = null;
    this.secoes.clear();
    this.nav.replaceChildren();
    for (const painel of this.pane.querySelectorAll(".cfg__section")) painel.remove();

    for (const secao of this._definicoes()) this._montarSecao(secao);
    this._irPara(this.secoes.has(secaoAnterior) ? secaoAnterior : this._definicoes()[0].id);
    this._atualizarSelos();
    // Uma busca em curso precisa continuar valendo depois da remontagem: as
    // linhas são outras, e nasceram todas visíveis. Reaproveitar o próprio
    // manipulador do campo evita repetir aqui a regra de filtragem.
    if (this.busca.value) this.busca.dispatchEvent(new Event("input"));
  }

  _restaurarSecao(secao) {
    const chaves = secao.itens.flatMap((item) => item.chaves || []);
    if (chaves.length === 0) return;
    aparencia.restaurarPadroes(chaves);
    this._aplicarEmLote();
    toast.success(`"${secao.titulo}" voltou aos padrões.`);
  }

  async _restaurarTudo() {
    const ok = await Modal.confirm(
      "Restaurar padrões",
      "Todas as preferências da sua conta voltam ao estado original: tema, cor de destaque, tamanho do texto, contraste, densidade, altura, linhas por página, tela inicial, menu e avisos.\n\nNenhum dado do sistema é afetado.",
      { confirmLabel: "Restaurar", danger: false }
    );
    if (!ok) return;
    aparencia.restaurarPadroes();
    this._aplicarEmLote();
    toast.success("Preferências restauradas.");
  }

  // ==========================================================================
  // LEVAR PARA OUTRA MÁQUINA
  // ==========================================================================

  _exportar() {
    const agora = new Date();
    const carimbo = [
      agora.getFullYear(),
      String(agora.getMonth() + 1).padStart(2, "0"),
      String(agora.getDate()).padStart(2, "0"),
    ].join("-");
    baixarTexto(JSON.stringify(aparencia.exportar(), null, 2), `preferencias-gestor-${carimbo}.json`);
    toast.success("Arquivo de preferências salvo.");
  }

  async _importar() {
    const arquivo = await escolherArquivo({ accept: "application/json,.json" });
    if (!arquivo) return; // diálogo cancelado: nada a dizer

    let conteudo;
    try {
      conteudo = JSON.parse(await arquivo.text());
    } catch {
      toast.error("Arquivo inválido: não é um JSON legível.");
      return;
    }

    let resultado;
    try {
      resultado = aparencia.importar(conteudo);
    } catch (erro) {
      // As mensagens de `importar` são escritas para serem lidas por quem
      // escolheu o arquivo -- repassar direto é melhor que traduzir aqui.
      toast.error(erro.message);
      return;
    }

    this._aplicarEmLote();
    toast.success(
      resultado.ignoradas > 0
        ? `${resultado.aplicadas} preferências aplicadas. ${resultado.ignoradas} não foram reconhecidas.`
        : `${resultado.aplicadas} preferências aplicadas.`
    );
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
   *
   * Fica no elemento da trilha, e não em cada botão, porque a trilha é
   * remontada inteira quando um perfil é aplicado: um listener no pai
   * sobrevive à troca dos filhos, dezenas de listeners nos filhos não.
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
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Abre o painel. Wrapper minúsculo, mas evita repetir a montagem nos três
 * lugares que chegam até aqui (botão da barra lateral, menu da conta e paleta
 * de comandos).
 */
export function abrirConfiguracoes({
  aoMudarLinhas,
  aoMudarSidebar,
  aoMudarVarias,
  abas,
  usuario,
  atualizadorHabilitado,
  trocarSenha,
  abrirAdministracao,
} = {}) {
  new ConfiguracoesPanel({
    aoMudarSidebar,
    aoMudarVarias,
    abas,
    usuario,
    atualizadorHabilitado,
    trocarSenha,
    abrirAdministracao,
    aoMudarLinhas: () => {
      aoMudarLinhas?.();
      // As outras preferências se explicam sozinhas na tela (o tema muda a
      // cor, a densidade muda a linha). O tamanho de página é o único cujo
      // efeito acontece atrás do painel aberto, onde não dá para ver.
      toast.info("Tamanho de página atualizado.");
    },
  }).open();
}
