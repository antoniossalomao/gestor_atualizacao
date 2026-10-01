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
  ESCOPOS_AGENDA,
  HORARIOS,
  ABAS_RELATORIO,
} from "../../app/aparencia.js";
import { duradouras, prefs } from "../../app/preferencias.js";
import { notificacoes } from "../../app/notificacoesDoSistema.js";
import { ATALHOS } from "../../app/atalhos.js";
import { COMO_USAR_TELAS, NOVIDADES, explicacaoSituacoes } from "../../domain/ajuda.js";
import { toast } from "../../components/AvisosRapidos.js";

/**
 * Definição central de todas as preferências das Configurações (Seção 12 do planejamento).
 *
 * Organizada por finalidade:
 *  1. Minha conta: Nome, senha, sessões abertas, exportar/importar preferências.
 *  2. Trabalho diário: Tela inicial, filtros, menu e linhas por página.
 *  3. Notificações: Avisos em tela, contador na aba do navegador e alertas no Windows.
 *  4. Interface e acessibilidade: Tema, cores, densidade de tabelas, texto, foco e movimento.
 *  5. Regras da equipe: Orientação clara pessoal vs. global e atalho para Administração.
 *  6. Sobre e ajuda: Versão e novidades, como usar cada tela, atalhos, como a situação é calculada e suporte.
 *
 * @param {{
 *   abasDoMenu: Array<{key: string, label: string}>,
 *   regras?: {prazoVersaoDias?: number},
 *   versao?: () => string | null,
 *   atualizadorHabilitado: boolean,
 *   definirSidebar: (recolhida: boolean) => void,
 * }} opcoes
 */
export function definirAbas({ abasDoMenu, atualizadorHabilitado, definirSidebar, regras = {}, versao = () => null }) {
  const abas = [
    {
      key: "conta",
      rotulo: "Minha conta",
      icone: "conta",
      titulo: "Minha conta",
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
      key: "trabalho",
      rotulo: "Trabalho diário",
      icone: "bussola",
      titulo: "Trabalho diário",
      descricao: "Preferências para a sua rotina de trabalho diário: tela inicial, filtros e paginação.",
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
          titulo: "Listas e navegação",
          itens: [
            {
              id: "linhas",
              titulo: "Linhas por página",
              ajuda: "Quantidade de registros exibidos em Atualizações, Clientes, Agendamentos e Auditoria.",
              chaves: ["linhasPorPagina"],
              busca: "linhas por página paginação quantidade registros",
              opcoes: LINHAS_OPCOES.map((n) => ({ valor: String(n), rotulo: String(n) })),
              atual: () => String(aparencia.linhasPorPagina()),
              aoEscolher: (valor) => {
                aparencia.aplicar({ linhasPorPagina: Number(valor) });
                toast.info(`As tabelas passam a mostrar ${valor} linhas por página.`);
              },
            },
            {
              id: "menu",
              titulo: "Menu lateral",
              ajuda: "Recolhido, sobra largura para as tabelas. O atalho Ctrl + B alterna sem precisar abrir as Configurações.",
              chaves: ["sidebarRecolhida"],
              busca: "menu lateral barra sidebar recolher esconder largura",
              opcoes: [
                { valor: "aberto", rotulo: "Aberto" },
                { valor: "recolhido", rotulo: "Recolhido" },
              ],
              atual: () => (duradouras.get("sidebarRecolhida", false) ? "recolhido" : "aberto"),
              aoEscolher: (valor) => definirSidebar(valor === "recolhido"),
            },
          ],
        },
        {
          titulo: "Sessão e comportamento",
          itens: [
            {
              id: "lembrar-filtros",
              tipo: "alternar",
              titulo: "Lembrar filtros ao trocar de tela",
              ajuda: "Busca, filtro e ordenação continuam como estavam ao navegar. Somem ao fechar o navegador.",
              chaves: ["lembrarFiltros"],
              busca: "lembrar filtros busca ordenação memória limpar sessão",
              atual: () => aparencia.lembrarFiltros(),
              aoEscolher: (lembrar) => {
                aparencia.aplicar({ lembrarFiltros: lembrar });
                if (!lembrar) prefs.limparTudo();
              },
            },
            {
              id: "confirmar-saida",
              tipo: "alternar",
              titulo: "Confirmar antes de sair da conta",
              ajuda: 'Pergunta "Deseja encerrar sua sessão?" antes de deslogar.',
              chaves: ["confirmarSaida"],
              busca: "sair logout confirmar pergunta encerrar sessão",
              atual: () => aparencia.confirmarSaida(),
              aoEscolher: (valor) => aparencia.aplicar({ confirmarSaida: valor }),
            },
            {
              id: "ritmo",
              titulo: "Atualizar a Distribuição sozinha",
              ajuda: "Intervalo para buscar o retorno dos agentes automáticos.",
              chaves: ["ritmoPainel"],
              busca: "atualizar sozinha automático distribuição agentes intervalo tempo",
              oculto: () => !atualizadorHabilitado,
              opcoes: RITMOS.map((r) => ({ valor: String(r.valor), rotulo: r.rotulo })),
              atual: () => String(aparencia.ritmoPainel()),
              aoEscolher: (valor) => aparencia.aplicar({ ritmoPainel: Number(valor) }),
            },
          ],
        },
        {
          // Só COMO o relatório abre e fecha. O conteúdo do chamado tem formato
          // aprovado (seção 7.3 do planejamento) e não vira editor: nenhuma
          // opção aqui acrescenta ou tira campo do texto.
          titulo: "Relatórios",
          itens: [
            {
              id: "relatorio-aba",
              titulo: "Abrir o relatório em",
              ajuda: "Quando há uma atualização selecionada, qual aba aparece primeiro.",
              chaves: ["relatorioAba"],
              busca: "relatório aba inicial atualização cliente abrir",
              opcoes: ABAS_RELATORIO,
              atual: () => aparencia.relatorioAba(),
              aoEscolher: (valor) => aparencia.aplicar({ relatorioAba: valor }),
            },
            {
              id: "relatorio-fechar",
              tipo: "alternar",
              titulo: "Fechar o relatório depois de copiar",
              ajuda: "Desligado, o relatório continua aberto para você conferir ou imprimir.",
              chaves: ["relatorioFecharAoCopiar"],
              busca: "relatório copiar fechar chamado texto",
              atual: () => aparencia.relatorioFecharAoCopiar(),
              aoEscolher: (valor) => aparencia.aplicar({ relatorioFecharAoCopiar: valor }),
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
      descricao: "Avisos rápidos na tela, contadores na aba do navegador e alertas no computador.",
      cartoes: [
        {
          titulo: "Avisos na tela",
          descricao: 'Mensagens instantâneas de confirmação (ex: "Registro salvo").',
          itens: [
            {
              id: "posicao-avisos",
              titulo: "Onde aparecem",
              ajuda: "No topo eles chamam mais atenção; no rodapé, evitam cobrir cabeçalhos.",
              chaves: ["posicaoAvisos"],
              busca: "avisos toast posição canto topo rodapé onde aparecem",
              opcoes: POSICOES_AVISO,
              atual: () => aparencia.posicaoAvisos(),
              aoEscolher: (valor) => {
                aparencia.aplicar({ posicaoAvisos: valor });
                toast.info(valor === "topo" ? "Os avisos passam a aparecer aqui em cima." : "Os avisos voltam para o rodapé.");
              },
            },
            {
              id: "duracao-avisos",
              titulo: "Tempo na tela",
              ajuda: "Passar o mouse sobre o aviso suspende o fechamento automático.",
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
              ajuda: "Exibe uma notificação de teste com a posição e duração configuradas.",
              busca: "exemplo testar aviso toast",
              rotulo: "Mostrar um aviso",
              executar: () => toast.success("Este é um aviso de exemplo. É assim que o Gestor confirma as suas ações."),
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
              ajuda: 'Contador "(2)" antes do nome da aba no navegador, visível na barra de tarefas.',
              chaves: ["contadorNoTitulo"],
              busca: "título aba navegador contador número pendências barra de tarefas",
              atual: () => aparencia.contadorNoTitulo(),
              aoEscolher: (valor) => aparencia.aplicar({ contadorNoTitulo: valor }),
            },
          ],
        },
        {
          titulo: "O que aparece no sino",
          descricao: "O que fica desligado some do sino e do contador na aba do navegador.",
          itens: [
            {
              id: "sino-atrasados",
              tipo: "alternar",
              titulo: "Agendamentos atrasados",
              chaves: ["sinoAtrasados"],
              busca: "sino notificação agendamento atrasado vencido",
              atual: () => aparencia.sino().atrasados,
              aoEscolher: (valor) => aparencia.aplicar({ sinoAtrasados: valor }),
            },
            {
              id: "sino-hoje",
              tipo: "alternar",
              titulo: "Agendamentos para hoje",
              chaves: ["sinoHoje"],
              busca: "sino notificação agendamento hoje",
              atual: () => aparencia.sino().hoje,
              aoEscolher: (valor) => aparencia.aplicar({ sinoHoje: valor }),
            },
            {
              id: "sino-escopo",
              titulo: "Agendamentos de quem",
              ajuda: '"Só as minhas": tarefas em que o responsável é você.',
              chaves: ["sinoEscopo"],
              busca: "sino minhas tarefas equipe responsável agendamento",
              opcoes: ESCOPOS_AGENDA,
              atual: () => aparencia.sino().escopo,
              aoEscolher: (valor) => aparencia.aplicar({ sinoEscopo: valor }),
            },
            {
              id: "sino-agentes",
              tipo: "alternar",
              titulo: "Situação dos agentes",
              ajuda: "Agentes com falha, pendência, sem contato ou esperando autorização.",
              chaves: ["sinoAgentes"],
              busca: "sino notificação agente falha offline atualizador",
              oculto: () => !atualizadorHabilitado,
              atual: () => aparencia.sino().agentes,
              aoEscolher: (valor) => aparencia.aplicar({ sinoAgentes: valor }),
            },
          ],
        },
        {
          titulo: "Som",
          itens: [
            {
              id: "som",
              tipo: "alternar",
              titulo: "Tocar um som em pendência nova",
              ajuda: "Um toque curto quando o número do sino cresce ou quando chega um aviso de falha. Não toca no horário silencioso.",
              chaves: ["somAvisos"],
              busca: "som toque barulho alerta sonoro aviso",
              atual: () => aparencia.somAvisos(),
              aoEscolher: (valor) => {
                aparencia.aplicar({ somAvisos: valor });
                if (valor) notificacoes.tocarSom();
              },
            },
          ],
        },
        {
          titulo: "Horário silencioso",
          descricao: `Pelo relógio deste computador${fusoLocal()}.`,
          itens: [
            {
              id: "silencio",
              tipo: "alternar",
              titulo: "Silenciar em um horário",
              ajuda: "Sem som e sem notificação do sistema nesse intervalo. O sino continua contando.",
              chaves: ["silencioAtivo"],
              busca: "silencioso silêncio horário não perturbe noite madrugada",
              atual: () => aparencia.silencio().ativo,
              aoEscolher: (valor) => aparencia.aplicar({ silencioAtivo: valor }),
            },
            {
              id: "silencio-inicio",
              tipo: "select",
              titulo: "Das",
              chaves: ["silencioInicio"],
              busca: "silencioso início horário começa",
              opcoes: HORARIOS,
              atual: () => aparencia.silencio().inicio,
              aoEscolher: (valor) => aparencia.aplicar({ silencioInicio: valor }),
            },
            {
              id: "silencio-fim",
              tipo: "select",
              titulo: "Até as",
              ajuda: "Pode virar a noite (19:00 até 07:00). Início igual ao fim não silencia nada.",
              chaves: ["silencioFim"],
              busca: "silencioso fim horário termina",
              opcoes: HORARIOS,
              atual: () => aparencia.silencio().fim,
              aoEscolher: (valor) => aparencia.aplicar({ silencioFim: valor }),
            },
            {
              id: "silencio-criticos",
              tipo: "alternar",
              titulo: "Falhas de agente avisam mesmo assim",
              ajuda: "Ligado: a falha aparece no silêncio, sem som. Desligado: as falhas do período viram um aviso só quando o silêncio acaba.",
              chaves: ["silencioCriticos"],
              busca: "silencioso crítico falha agente urgente acumuladas",
              oculto: () => !atualizadorHabilitado,
              atual: () => aparencia.silencio().criticos,
              aoEscolher: (valor) => aparencia.aplicar({ silencioCriticos: valor }),
            },
          ],
        },
        {
          titulo: "Notificações do sistema",
          itens: [
            {
              id: "permissao-notificacoes",
              tipo: "estado",
              titulo: "Permissão do navegador",
              busca: "permissão notificação bloqueada navegador cadeado liberar",
              oculto: () => !atualizadorHabilitado,
              texto: () => notificacoes.estadoPermissao().texto,
              tom: () => ({ concedida: "boa", negada: "alta", indisponivel: "media", nao_pedida: "neutro" })[notificacoes.estadoPermissao().estado],
              observar: (fn) => notificacoes.aoMudarPermissao(fn),
            },
            {
              id: "notificar-falhas",
              tipo: "alternar",
              titulo: "Avisar quando um agente falhar",
              ajuda: "Notificação nativa do Windows quando o Atualizador reportar incidente. Vale apenas nesta máquina.",
              busca: "notificação aviso falha erro agente windows alerta som",
              oculto: () => !notificacoes.suportado() || !atualizadorHabilitado,
              atual: () => notificacoes.ligadas(),
              aoEscolher: async (ligar) => {
                const ligou = await notificacoes.definir(ligar);
                if (ligar && !ligou) {
                  toast.error(notificacoes.estadoPermissao().texto);
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
      key: "interface",
      rotulo: "Interface e acessibilidade",
      icone: "paleta",
      titulo: "Interface e acessibilidade",
      descricao: "Tema visual, cores, densidade de linhas, texto, contraste e foco. Prévia ao vivo ao lado.",
      previa: true,
      cartoes: [
        {
          titulo: "Tema e contraste",
          itens: [
            {
              id: "tema",
              tipo: "temas",
              titulo: "Tema",
              ajuda: '"Sistema" acompanha o tema claro ou escuro configurado no seu computador.',
              chaves: ["tema"],
              busca: "tema claro escuro noturno modo sistema cor de fundo",
            },
            {
              id: "realce",
              tipo: "cores",
              titulo: "Cor de destaque",
              ajuda: "Cor primária dos botões, links e abas ativas.",
              chaves: ["realce"],
              busca: "cor destaque realce accent azul verde roxo violeta rosa âmbar",
            },
            {
              id: "contraste",
              titulo: "Contraste",
              ajuda: "Reforça bordas e textos secundários sem alterar o tema escolhido.",
              chaves: ["contraste"],
              busca: "contraste alto enxergar legibilidade borda fraca claro demais",
              opcoes: CONTRASTES,
              atual: () => aparencia.contraste(),
              aoEscolher: (valor) => aparencia.aplicar({ contraste: valor }),
            },
          ],
        },
        {
          titulo: "Texto e tabelas",
          itens: [
            {
              id: "escala",
              titulo: "Tamanho do texto",
              ajuda: "Ajusta o tamanho das fontes proporcionalmente em toda a interface.",
              chaves: ["escalaTexto"],
              busca: "tamanho do texto letra fonte zoom acessibilidade enxergar",
              opcoes: ESCALAS,
              atual: () => aparencia.escalaTexto(),
              aoEscolher: (valor) => aparencia.aplicar({ escalaTexto: valor }),
            },
            {
              id: "densidade",
              titulo: "Densidade das linhas",
              ajuda: "Espaçamento vertical das tabelas. Compacta exibe mais linhas sem rolagem.",
              chaves: ["densidade"],
              busca: "densidade linha altura da linha compacta confortável espaçamento apertada",
              opcoes: DENSIDADES,
              atual: () => aparencia.densidade(),
              aoEscolher: (valor) => aparencia.aplicar({ densidade: valor }),
            },
            {
              id: "zebra",
              titulo: "Linhas alternadas",
              ajuda: "Faixas zebradas alternadas para facilitar a leitura horizontal de dados.",
              chaves: ["zebra"],
              busca: "zebra listrado linhas alternadas faixa risca lisa",
              opcoes: ZEBRAS,
              atual: () => aparencia.zebra(),
              aoEscolher: (valor) => aparencia.aplicar({ zebra: valor }),
            },
          ],
        },
        {
          titulo: "Foco e movimento",
          itens: [
            {
              id: "foco",
              titulo: "Anel de foco",
              ajuda: "Contorno indicador do foco do teclado. Reforçado melhora a visualização com Tab.",
              chaves: ["foco"],
              busca: "foco teclado contorno anel tab navegação visível acessibilidade",
              opcoes: FOCOS,
              atual: () => aparencia.foco(),
              aoEscolher: (valor) => aparencia.aplicar({ foco: valor }),
            },
            {
              id: "movimento",
              titulo: "Animações",
              ajuda: "Efeitos de transição e movimento de janelas.",
              chaves: ["movimento"],
              busca: "animação movimento transição efeito reduzir enjoo vertigem acessibilidade",
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
              ajuda: "Vidro fosco em menus e janelas. Superfícies sólidas melhoram o desempenho em computadores mais lentos.",
              chaves: ["transparencia"],
              busca: "transparência desfoque blur vidro fosco desempenho lento travando sólido",
              opcoes: TRANSPARENCIAS,
              atual: () => aparencia.transparencia(),
              aoEscolher: (valor) => aparencia.aplicar({ transparencia: valor }),
            },
          ],
        },
        {
          titulo: "Personalização avançada",
          descricao: "Ajustes opcionais de tipografia, textura de fundo e dimensões de tela.",
          itens: [
            {
              id: "perfil",
              tipo: "perfis",
              titulo: "Perfil rápido",
              ajuda: "Equilibrado, Operação, Leitura ou Alto contraste.",
              busca: "perfil predefinido modo padrão operação leitura acessível conjunto",
            },
            {
              id: "fonte",
              titulo: "Família de fonte",
              ajuda: "Inter (tipografia moderna carregada da web) ou Fonte do sistema (Segoe UI/Windows).",
              chaves: ["fonte"],
              busca: "fonte letra tipografia inter segoe windows sistema",
              opcoes: FONTES,
              atual: () => aparencia.fonte(),
              aoEscolher: (valor) => aparencia.aplicar({ fonte: valor }),
            },
            {
              id: "fundo",
              titulo: "Textura de fundo",
              ajuda: "Grade sutil no plano de fundo ou visual liso.",
              chaves: ["fundoTela"],
              busca: "fundo grade textura brilho halo liso plano",
              opcoes: [
                { valor: "grade", rotulo: "Com grade" },
                { valor: "liso", rotulo: "Liso" },
              ],
              atual: () => aparencia.fundoTela(),
              aoEscolher: (valor) => aparencia.aplicar({ fundoTela: valor }),
            },
            {
              id: "largura",
              titulo: "Largura do conteúdo",
              ajuda: 'Em monitores largos, "Tela inteira" permite que tabelas aproveitem todo o espaço horizontal.',
              chaves: ["largura"],
              busca: "largura tela inteira monitor largo ultrawide espaço máximo",
              opcoes: LARGURAS,
              atual: () => aparencia.largura(),
              aoEscolher: (valor) => aparencia.aplicar({ largura: valor }),
            },
            {
              id: "altura",
              titulo: "Altura das tabelas",
              ajuda: "Espaço vertical das caixas de dados antes de iniciar a rolagem interna.",
              chaves: ["alturaTabela"],
              busca: "altura tabela rolagem scroll tela cheia",
              opcoes: ALTURAS,
              atual: () => aparencia.altura(),
              aoEscolher: (valor) => aparencia.aplicar({ altura: valor }),
            },
          ],
        },
      ],
    },

    {
      key: "regras-equipe",
      rotulo: "Regras da equipe",
      icone: "ajustes",
      titulo: "Regras da equipe",
      descricao: "Diferença entre escolhas pessoais e regras globais, com acesso à Administração.",
      manual: true,
      cartoes: [
        {
          titulo: "Regras globais",
          itens: [
            {
              id: "regras-globais-info",
              titulo: "Regras globais da equipe",
              ajuda: "Prazos, arquivamento, classificação dos sistemas e backups afetam todos os usuários.",
              busca: "regras equipe globais administracao prazos arquivamento sistemas operacao",
            },
          ],
        },
      ],
    },

    {
      key: "ajuda",
      rotulo: "Sobre e ajuda",
      icone: "info",
      titulo: "Sobre e ajuda",
      descricao: "Versão e novidades, como usar cada tela, atalhos de teclado, como a situação é calculada e a quem pedir ajuda.",
      // Os textos que dependem do servidor (versão, prazo) são getters: as
      // definições nascem com o app, antes de o /auth/status de depois do
      // login voltar (ver App._onAuthenticated), e o getter só é lido quando
      // a aba é desenhada ou a busca roda.
      cartoes: [
        {
          titulo: "Versão e novidades",
          descricao: "O que mudou de visível nas últimas entregas.",
          itens: [
            {
              id: "versao-painel",
              tipo: "info",
              titulo: "Gestor de Atualizações",
              get ajuda() {
                const v = versao();
                return v ? `Versão ${v}.` : "Versão não informada pelo servidor.";
              },
              busca: "versão sistema painel gestor sobre release",
            },
            ...NOVIDADES.map((novidade, i) => ({
              id: `novidade-${i}`,
              tipo: "info",
              titulo: novidade.titulo,
              ajuda: `${novidade.data} · ${novidade.texto}`,
              busca: "novidades mudanças novo",
            })),
          ],
        },
        {
          titulo: "Como usar cada tela",
          descricao: "Para que serve cada item do menu e onde ficam as ações principais.",
          itens: [...abasDoMenu, { key: "configuracoes", label: "Configurações" }]
            .filter((tela) => COMO_USAR_TELAS[tela.key])
            .map((tela) => ({
              id: `como-usar-${tela.key}`,
              tipo: "info",
              titulo: tela.label,
              ajuda: COMO_USAR_TELAS[tela.key],
              busca: "como usar tela ajuda",
            })),
        },
        {
          titulo: "Atalhos de teclado",
          descricao: "Tudo o que dá para fazer sem tirar a mão do teclado. Digite ? em qualquer tela para ver esta lista.",
          itens: [
            {
              id: "dicas-atalho",
              tipo: "alternar",
              titulo: "Mostrar as dicas de atalho",
              ajuda: "Etiquetas indicadoras no menu, na busca e nas ações rápidas.",
              chaves: ["dicasAtalho"],
              busca: "dicas etiquetas atalho kbd esconder mostrar teclado",
              atual: () => aparencia.dicasAtalho(),
              aoEscolher: (valor) => aparencia.aplicar({ dicasAtalho: valor }),
            },
            // Um cartão só, com um título por grupo: antes cada grupo era um
            // cartão solto depois do "Atalhos de teclado", e a aba parecia
            // terminar nele.
            ...[...new Set(ATALHOS.map(([, , grupo]) => grupo))].map((grupo) => {
              const doGrupo = ATALHOS.filter(([, , g]) => g === grupo);
              return {
                id: `atalhos-${grupo.toLowerCase()}`,
                tipo: "atalhos",
                titulo: grupo === "Global" ? "Em qualquer tela" : `Em ${grupo.toLowerCase()}`,
                atalhos: doGrupo,
                busca: `atalhos teclado teclas ${doGrupo.map(([teclas, descricao]) => `${teclas} ${descricao}`).join(" ")}`,
              };
            }),
          ],
        },
        {
          titulo: "Como a situação é calculada",
          descricao: "Vale igual no Resumo, na aba Sistemas e na ficha do cliente.",
          itens: explicacaoSituacoes(null).map(({ titulo }, i) => ({
            id: `situacao-${i}`,
            tipo: "info",
            titulo,
            get ajuda() {
              return explicacaoSituacoes(regras.prazoVersaoDias)[i].texto;
            },
            busca: "situacao situacoes em dia aguardando desatualizado atrasado nunca atualizado prazo fixo significado legenda regra calculo",
          })),
        },
        {
          titulo: "Contato e suporte",
          itens: [
            {
              id: "suporte-duvidas",
              tipo: "info",
              titulo: "Dúvidas, acesso e regras da equipe",
              ajuda: "Fale com um administrador da equipe. É quem cria contas, troca papéis e muda prazos, arquivamento e a classificação dos sistemas.",
              busca: "contato suporte ajuda administrador acesso senha conta",
            },
            {
              id: "suporte-problema",
              tipo: "info",
              titulo: "Encontrou um problema no painel",
              get ajuda() {
                const v = versao();
                return `Anote a tela, o que você fez e a hora, e passe para um administrador${v ? ` (versão ${v})` : ""}. Em Administração, Auditoria mostra quem mudou o quê, e Diagnóstico mostra a saúde do servidor.`;
              },
              busca: "problema erro bug falha suporte diagnostico auditoria",
            },
          ],
        },
      ],
    },
  ];

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

/** " (America/Sao_Paulo)", só para informar -- o Gestor não converte fuso. */
function fusoLocal() {
  try {
    const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return fuso ? ` (${fuso})` : "";
  } catch {
    return "";
  }
}
