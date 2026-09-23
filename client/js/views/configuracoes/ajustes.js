import {
  aparencia,
  DENSIDADES,
  LINHAS_OPCOES,
  ALTURAS,
  RITMOS,
  ESCALAS,
  POSICOES_AVISO,
  CONTRASTES,
  TRANSPARENCIAS,
  ZEBRAS,
  FONTES,
  LARGURAS,
  FOCOS,
  DURACOES_AVISO,
  PERIODOS_INICIAIS,
} from "../../app/appearance.js";
import { settings, prefs } from "../../app/prefs.js";
import { notificacoes } from "../../app/notify.js";
import { ATALHOS } from "../../app/Shortcuts.js";
import { toast } from "../../components/Toast.js";

/**
 * Tudo o que a tela Configurações oferece, como dados.
 *
 * Está escrito assim -- e não como uma sequência de chamadas que empurram
 * elementos numa div -- porque várias coisas diferentes precisam percorrer a
 * MESMA lista: o desenho de cada aba, a busca, o contador de "fora do padrão"
 * de cada aba e o "restaurar esta seção". Com a lista sendo dado, todas leem
 * a mesma fonte; com ela sendo código, cada uma teria que ser mantida em
 * sincronia na mão, e a busca seria a primeira a ficar desatualizada quando
 * um ajuste novo entrasse.
 *
 * O campo `chaves` de cada item diz de quais preferências ele é dono. É o que
 * permite o selo "alterado", a contagem por aba e o "restaurar esta seção"
 * existirem sem uma segunda tabela dizendo a mesma coisa.
 *
 * O `busca` guarda sinônimos: ninguém procura "realce", procura "cor";
 * ninguém procura "densidade", procura "linha apertada".
 *
 * A aba Conta é montada à mão (ContaConfig.js) -- tem formulário, lista de
 * sessões, coisas que não são preferências. Os itens dela aqui existem só
 * para a busca achar "senha" e "sessões" e levar até lá.
 *
 * @param {{
 *   abasDoMenu: Array<{key: string, label: string}>,
 *   atualizadorHabilitado: boolean,
 *   definirSidebar: (recolhida: boolean) => void,
 * }} opcoes
 */
export function definirAbas({ abasDoMenu, atualizadorHabilitado, definirSidebar }) {
  const abas = [
    {
      key: "conta",
      rotulo: "Conta",
      icone: "conta",
      titulo: "Conta",
      descricao: "Quem você é no Gestor, a sua senha e em que aparelhos a sua conta está aberta.",
      manual: true,
      cartoes: [
        {
          titulo: "Perfil",
          itens: [
            { id: "nome", titulo: "Nome de exibição", ajuda: "Como o seu nome aparece no menu, no Histórico e nos registros novos.", busca: "nome perfil apelido exibição trocar nome papel permissão" },
          ],
        },
        {
          titulo: "Senha",
          itens: [{ id: "senha", titulo: "Trocar a senha", busca: "senha password trocar mudar alterar segurança" }],
        },
        {
          titulo: "Onde sua conta está aberta",
          itens: [
            { id: "sessoes", titulo: "Sessões abertas", ajuda: "Veja e encerre a sua conta em outros aparelhos.", busca: "sessões aparelhos dispositivos computador celular desconectar sair de todos encerrar segurança" },
          ],
        },
        {
          titulo: "Suas preferências",
          itens: [
            { id: "exportar", titulo: "Exportar ou importar preferências", ajuda: "Leve as suas escolhas para outra conta num arquivo.", busca: "exportar importar salvar carregar arquivo json levar copiar backup outra máquina" },
            { id: "restaurar", titulo: "Restaurar tudo ao padrão", ajuda: "Todas as preferências voltam ao estado original.", busca: "restaurar padrão fábrica resetar zerar desfazer tudo" },
          ],
        },
      ],
    },

    {
      key: "aparencia",
      rotulo: "Aparência",
      icone: "paleta",
      titulo: "Aparência",
      descricao: "Como o Gestor se parece para você. Comece por um perfil e ajuste o resto se quiser.",
      cartoes: [
        {
          titulo: "Perfil rápido",
          descricao: "Um clique arruma vários ajustes de uma vez. Nada aqui é definitivo: cada ajuste continua mudando sozinho.",
          itens: [
            { id: "perfil", tipo: "perfis", titulo: "Perfil rápido", ajuda: "Equilibrado, Operação, Leitura ou Alto contraste.", busca: "perfil predefinido modo padrão operação leitura acessível conjunto" },
          ],
        },
        {
          titulo: "Tema e cores",
          itens: [
            {
              id: "tema",
              tipo: "temas",
              titulo: "Tema",
              ajuda: '"Sistema" acompanha a configuração do seu computador.',
              chaves: ["tema"],
              busca: "tema claro escuro noturno modo sistema cor de fundo",
            },
            {
              id: "realce",
              tipo: "cores",
              titulo: "Cor de destaque",
              ajuda: "A cor dos botões, dos links e da aba ativa.",
              chaves: ["realce"],
              busca: "cor destaque realce accent azul verde roxo violeta rosa âmbar",
            },
            {
              id: "fundo",
              titulo: "Fundo da tela",
              ajuda: "A grade discreta atrás do conteúdo, com o brilho no topo.",
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
          titulo: "Texto",
          itens: [
            {
              id: "escala",
              titulo: "Tamanho do texto",
              ajuda: "Aumenta tudo junto, sem desalinhar a interface.",
              chaves: ["escalaTexto"],
              busca: "tamanho do texto letra fonte zoom acessibilidade enxergar",
              opcoes: ESCALAS,
              atual: () => aparencia.escalaTexto(),
              aoEscolher: (valor) => aparencia.aplicar({ escalaTexto: valor }),
            },
            {
              id: "fonte",
              titulo: "Fonte",
              ajuda: "A Inter vem da internet. A do sistema (Segoe UI) já está no Windows e aparece na hora, mesmo sem internet.",
              chaves: ["fonte"],
              busca: "fonte letra tipografia inter segoe windows sistema",
              opcoes: FONTES,
              atual: () => aparencia.fonte(),
              aoEscolher: (valor) => aparencia.aplicar({ fonte: valor }),
            },
          ],
        },
        {
          titulo: "Espaço na tela",
          itens: [
            {
              id: "menu",
              titulo: "Menu lateral",
              ajuda: "Recolhido, sobra largura para as tabelas. Ctrl + B alterna sem vir até aqui.",
              chaves: ["sidebarRecolhida"],
              busca: "menu lateral barra sidebar recolher esconder largura",
              opcoes: [
                { valor: "aberto", rotulo: "Aberto" },
                { valor: "recolhido", rotulo: "Recolhido" },
              ],
              atual: () => (settings.get("sidebarRecolhida", false) ? "recolhido" : "aberto"),
              aoEscolher: (valor) => definirSidebar(valor === "recolhido"),
            },
            {
              id: "largura",
              titulo: "Largura do conteúdo",
              ajuda: 'Num monitor largo, "Tela inteira" deixa as tabelas usarem o espaço todo.',
              chaves: ["largura"],
              busca: "largura tela inteira monitor largo ultrawide espaço máximo",
              opcoes: LARGURAS,
              atual: () => aparencia.largura(),
              aoEscolher: (valor) => aparencia.aplicar({ largura: valor }),
            },
          ],
        },
      ],
    },

    {
      key: "tabelas",
      rotulo: "Tabelas",
      icone: "tabela",
      titulo: "Tabelas",
      descricao: "Este é um app de ler tabela o dia inteiro. Aqui é onde isso se ajusta -- a prévia ao lado muda junto.",
      previa: true,
      cartoes: [
        {
          titulo: "Linhas",
          itens: [
            {
              id: "densidade",
              titulo: "Densidade",
              ajuda: "Quanto respiro cada linha tem. Compacta mostra mais registros sem rolar.",
              chaves: ["densidade"],
              busca: "densidade linha altura da linha compacta confortável espaçamento apertada",
              opcoes: DENSIDADES,
              atual: () => aparencia.densidade(),
              aoEscolher: (valor) => aparencia.aplicar({ densidade: valor }),
            },
            {
              id: "zebra",
              titulo: "Linhas alternadas",
              ajuda: "A faixa clara em uma linha sim, outra não, para não pular de linha numa tabela larga.",
              chaves: ["zebra"],
              busca: "zebra listrado linhas alternadas faixa risca lisa",
              opcoes: ZEBRAS,
              atual: () => aparencia.zebra(),
              aoEscolher: (valor) => aparencia.aplicar({ zebra: valor }),
            },
          ],
        },
        {
          titulo: "Tamanho",
          itens: [
            {
              id: "altura",
              titulo: "Altura das tabelas",
              ajuda: "Quanto da tela a tabela ocupa antes de precisar rolar por dentro.",
              chaves: ["alturaTabela"],
              busca: "altura tabela rolagem scroll tela cheia",
              opcoes: ALTURAS,
              atual: () => aparencia.altura(),
              aoEscolher: (valor) => aparencia.aplicar({ altura: valor }),
            },
            {
              id: "linhas",
              titulo: "Linhas por página",
              ajuda: "Vale para Atualizações, Clientes, Agendamentos e o Histórico.",
              chaves: ["linhasPorPagina"],
              busca: "linhas por página paginação quantidade registros",
              opcoes: LINHAS_OPCOES.map((n) => ({ valor: String(n), rotulo: String(n) })),
              atual: () => String(aparencia.linhasPorPagina()),
              aoEscolher: (valor) => {
                aparencia.aplicar({ linhasPorPagina: Number(valor) });
                // As outras preferências se explicam sozinhas na prévia. O
                // tamanho de página é o único cujo efeito acontece em OUTRA
                // tela, onde não dá para ver daqui.
                toast.info(`As tabelas passam a mostrar ${valor} linhas por página.`);
              },
            },
          ],
        },
      ],
    },

    {
      key: "navegacao",
      rotulo: "Navegação",
      icone: "bussola",
      titulo: "Navegação e comportamento",
      descricao: "Onde o Gestor abre, o que ele lembra de uma tela para outra e o que ele pergunta antes de agir.",
      cartoes: [
        {
          titulo: "Ao entrar",
          itens: [
            {
              id: "tela-inicial",
              tipo: "select",
              titulo: "Tela inicial",
              ajuda: "Onde o Gestor abre quando você entra.",
              chaves: ["abaInicial"],
              busca: "tela inicial abertura página inicial padrão entrar",
              oculto: () => abasDoMenu.length === 0,
              opcoes: [
                { valor: "", rotulo: `Primeira do menu (${abasDoMenu[0]?.label || "Resumo"})` },
                ...abasDoMenu.map((a) => ({ valor: a.key, rotulo: a.label })),
              ],
              atual: () => aparencia.abaInicial(),
              aoEscolher: (valor) => aparencia.aplicar({ abaInicial: valor }),
            },
            {
              id: "periodo",
              tipo: "select",
              titulo: "Período inicial em Atualizações",
              ajuda: "A lista já abre filtrada neste período. Vale na primeira visita de cada sessão; depois, vale o filtro que você deixou.",
              chaves: ["periodoAtualizacoes"],
              busca: "período data filtro hoje semana mês atualizações abrir filtrada",
              opcoes: PERIODOS_INICIAIS,
              atual: () => aparencia.periodoAtualizacoes(),
              aoEscolher: (valor) => aparencia.aplicar({ periodoAtualizacoes: valor }),
            },
          ],
        },
        {
          titulo: "Entre uma tela e outra",
          itens: [
            {
              id: "lembrar-filtros",
              tipo: "alternar",
              titulo: "Lembrar filtros ao trocar de tela",
              ajuda: "Busca, filtro e ordenação continuam como estavam ao voltar. Somem quando o navegador fecha.",
              chaves: ["lembrarFiltros"],
              busca: "lembrar filtros busca ordenação memória limpar sessão",
              atual: () => aparencia.lembrarFiltros(),
              aoEscolher: (lembrar) => {
                aparencia.aplicar({ lembrarFiltros: lembrar });
                // Desligar sem varrer o que já estava guardado deixaria os
                // filtros de antes presos na sessão: invisíveis para o app, mas
                // de volta assim que alguém religasse a opção.
                if (!lembrar) prefs.limparTudo();
              },
            },
          ],
        },
        {
          titulo: "Ao sair",
          itens: [
            {
              id: "confirmar-saida",
              tipo: "alternar",
              titulo: "Confirmar antes de sair da conta",
              ajuda: 'Pergunta "Deseja encerrar sua sessão?" antes de sair. Desligue se você sempre sai de propósito.',
              chaves: ["confirmarSaida"],
              busca: "sair logout confirmar pergunta encerrar sessão",
              atual: () => aparencia.confirmarSaida(),
              aoEscolher: (valor) => aparencia.aplicar({ confirmarSaida: valor }),
            },
          ],
        },
        {
          titulo: "Distribuição",
          itens: [
            {
              id: "ritmo",
              titulo: "Atualizar a Distribuição sozinha",
              ajuda: "De quanto em quanto tempo a tela busca o retorno dos agentes.",
              chaves: ["ritmoPainel"],
              busca: "atualizar sozinha automático distribuição agentes intervalo tempo",
              // Sem o Atualizador, é o ajuste de uma tela que não existe.
              oculto: () => !atualizadorHabilitado,
              opcoes: RITMOS.map((r) => ({ valor: String(r.valor), rotulo: r.rotulo })),
              atual: () => String(aparencia.ritmoPainel()),
              aoEscolher: (valor) => aparencia.aplicar({ ritmoPainel: Number(valor) }),
            },
          ],
        },
      ],
    },

    {
      key: "notificacoes",
      rotulo: "Notificações",
      icone: "sino",
      titulo: "Notificações",
      descricao: "O que o Gestor pode interromper para contar, onde e por quanto tempo.",
      cartoes: [
        {
          titulo: "Avisos na tela",
          descricao: 'Os recados rápidos, como "Registro salvo".',
          itens: [
            {
              id: "posicao-avisos",
              titulo: "Onde aparecem",
              ajuda: "Embaixo eles passam por cima da paginação; em cima, por cima do título.",
              chaves: ["posicaoAvisos"],
              busca: "avisos toast posição canto topo rodapé onde aparecem",
              opcoes: POSICOES_AVISO,
              atual: () => aparencia.posicaoAvisos(),
              aoEscolher: (valor) => {
                aparencia.aplicar({ posicaoAvisos: valor });
                // O único ajuste cujo efeito é invisível até algo acontecer:
                // mostrar um aviso na hora é a demonstração, não um parabéns.
                toast.info(valor === "topo" ? "Os avisos passam a aparecer aqui em cima." : "Os avisos voltam para o rodapé.");
              },
            },
            {
              id: "duracao-avisos",
              titulo: "Tempo na tela",
              ajuda: "Passar o mouse por cima segura o aviso, em qualquer escolha.",
              chaves: ["duracaoAvisos"],
              busca: "tempo duração aviso toast some rápido devagar ler",
              opcoes: DURACOES_AVISO,
              atual: () => aparencia.duracaoAvisos(),
              aoEscolher: (valor) => aparencia.aplicar({ duracaoAvisos: valor }),
            },
            {
              id: "aviso-exemplo",
              tipo: "acao",
              titulo: "Ver como fica",
              ajuda: "Mostra um aviso de exemplo, com a posição e o tempo escolhidos.",
              busca: "exemplo testar aviso toast",
              rotulo: "Mostrar um aviso",
              executar: () => toast.success("Este é um aviso de exemplo. É assim que o Gestor confirma o que você fez."),
            },
          ],
        },
        {
          titulo: "Aba do navegador",
          itens: [
            {
              id: "contador-titulo",
              tipo: "alternar",
              titulo: "Pendências no título da aba",
              ajuda: 'O "(2)" antes do nome da aba. Aparece na barra de tarefas mesmo com o Gestor atrás de outras janelas.',
              chaves: ["contadorNoTitulo"],
              busca: "título aba navegador contador número pendências barra de tarefas",
              atual: () => aparencia.contadorNoTitulo(),
              aoEscolher: (valor) => aparencia.aplicar({ contadorNoTitulo: valor }),
            },
          ],
        },
        {
          titulo: "Notificações do Windows",
          itens: [
            {
              id: "notificar-falhas",
              tipo: "alternar",
              titulo: "Avisar quando um agente falhar",
              ajuda: "Notificação do sistema, mesmo com o Gestor em outra aba. Vale só neste computador.",
              busca: "notificação aviso falha erro agente windows alerta som",
              oculto: () => !notificacoes.suportado() || !atualizadorHabilitado,
              atual: () => notificacoes.ligadas(),
              aoEscolher: async (ligar) => {
                const ligou = await notificacoes.definir(ligar);
                // Se o navegador recusou a permissão, o interruptor volta
                // sozinho (ver `alternar` em controles.js).
                if (ligar && !ligou) {
                  toast.error("O navegador bloqueou as notificações para este site.");
                  return false;
                }
                return true;
              },
            },
          ],
        },
      ],
    },

    {
      key: "acessibilidade",
      rotulo: "Acessibilidade",
      icone: "acessibilidade",
      titulo: "Acessibilidade",
      descricao: "Enxergar melhor, cansar menos e deixar a tela mais leve na máquina.",
      cartoes: [
        {
          titulo: "Enxergar",
          itens: [
            {
              id: "contraste",
              titulo: "Contraste",
              ajuda: "Reforça bordas e textos de apoio, sem trocar o tema que você escolheu.",
              chaves: ["contraste"],
              busca: "contraste alto enxergar legibilidade borda fraca claro demais",
              opcoes: CONTRASTES,
              atual: () => aparencia.contraste(),
              aoEscolher: (valor) => aparencia.aplicar({ contraste: valor }),
            },
            {
              id: "foco",
              titulo: "Anel de foco",
              ajuda: "O contorno que mostra onde o teclado está. Reforçado fica mais grosso e mais afastado do controle.",
              chaves: ["foco"],
              busca: "foco teclado contorno anel tab navegação visível",
              opcoes: FOCOS,
              atual: () => aparencia.foco(),
              aoEscolher: (valor) => aparencia.aplicar({ foco: valor }),
            },
          ],
        },
        {
          titulo: "Movimento e desempenho",
          itens: [
            {
              id: "movimento",
              titulo: "Animações",
              ajuda: "Transições, deslizes e o esmaecer das janelas.",
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
              id: "transparencia",
              titulo: "Superfícies",
              ajuda: "O vidro fosco do menu e das janelas. Sólidas pesam menos em máquina fraca.",
              chaves: ["transparencia"],
              busca: "transparência desfoque blur vidro fosco desempenho lento travando sólido",
              opcoes: TRANSPARENCIAS,
              atual: () => aparencia.transparencia(),
              aoEscolher: (valor) => aparencia.aplicar({ transparencia: valor }),
            },
          ],
        },
      ],
    },

    {
      key: "atalhos",
      rotulo: "Atalhos",
      icone: "teclado",
      titulo: "Atalhos de teclado",
      descricao: "Tudo o que dá para fazer sem tirar a mão do teclado. Esta lista também abre com ?, em qualquer tela.",
      cartoes: [
        {
          titulo: "Na tela",
          itens: [
            {
              id: "dicas-atalho",
              tipo: "alternar",
              titulo: "Mostrar as dicas de atalho",
              ajuda: 'As etiquetas "Alt+1" no menu, "Ctrl K" na busca e "Alt+N" na ação rápida. Os atalhos funcionam com ou sem elas.',
              chaves: ["dicasAtalho"],
              busca: "dicas etiquetas atalho kbd esconder mostrar",
              atual: () => aparencia.dicasAtalho(),
              aoEscolher: (valor) => aparencia.aplicar({ dicasAtalho: valor }),
            },
          ],
        },
        ...[...new Set(ATALHOS.map(([, , grupo]) => grupo))].map((grupo) => {
          const doGrupo = ATALHOS.filter(([, , g]) => g === grupo);
          return {
            titulo: grupo === "Global" ? "Em qualquer tela" : `Em ${grupo.toLowerCase()}`,
            itens: [
              {
                id: `atalhos-${grupo.toLowerCase()}`,
                tipo: "atalhos",
                titulo: `Atalhos: ${grupo}`,
                atalhos: doGrupo,
                busca: `atalhos teclado teclas ${doGrupo.map(([teclas, descricao]) => `${teclas} ${descricao}`).join(" ")}`,
              },
            ],
          };
        }),
      ],
    },
  ];

  // Um item escondido (sem abas para escolher, sem suporte a notificação,
  // Atualizador desligado) sai da lista AQUI, antes de qualquer consumidor --
  // assim a busca não encontra um ajuste que não existe nesta máquina, e um
  // cartão não nasce vazio sem ninguém perceber.
  for (const aba of abas) {
    for (const cartao of aba.cartoes) cartao.itens = cartao.itens.filter((item) => !item.oculto?.());
    aba.cartoes = aba.cartoes.filter((cartao) => cartao.itens.length > 0);
  }
  return abas;
}

/** As preferências de que uma aba inteira é dona -- o "restaurar esta seção". */
export function chavesDaAba(aba) {
  return aba.cartoes.flatMap((cartao) => cartao.itens.flatMap((item) => item.chaves || []));
}
