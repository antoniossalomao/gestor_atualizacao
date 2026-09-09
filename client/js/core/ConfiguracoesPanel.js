import { Modal } from "./Modal.js";
import { theme } from "./theme.js";
import { aparencia, DENSIDADES, LINHAS_OPCOES, ALTURAS, RITMOS } from "./appearance.js";
import { settings } from "./prefs.js";
import { mostrarAtalhos } from "./Shortcuts.js";
import { notificacoes } from "./notify.js";
import { icon } from "./icons.js";
import { toast } from "./Toast.js";

/**
 * Painel de Configurações.
 *
 * Existe porque as preferências do app estavam espalhadas e, pior, escondidas
 * atrás de gestos que ninguém descobre sozinho: o tema era um botão de ícone
 * que CICLAVA entre três estados (clicar uma vez para ver o que acontece é a
 * única forma de aprender o que ele faz, e não há como saber que existe um
 * terceiro estado até passar por ele duas vezes), e recolher o menu era um
 * botãozinho sem rótulo na barra lateral. Nada disso é descobrível.
 *
 * Aqui as três viram o que já eram por dentro: escolhas com opções visíveis
 * lado a lado, cada uma dizendo o que faz. Ver as três alternativas ao mesmo
 * tempo é o que transforma "um botão misterioso" em "uma decisão".
 *
 * As duas de baixo são novas e valem por si:
 *
 *  - **densidade das tabelas**, porque este é um app de ler tabela o dia
 *    inteiro, e "quantas linhas cabem na tela sem rolar" é preferência
 *    pessoal, não uma constante que alguém acerta para todo mundo;
 *  - **linhas por página**, que já existia no servidor (o `pageSize` sempre
 *    foi aceito na query string) e simplesmente nunca tinha sido oferecida a
 *    ninguém -- o front mandava o padrão e pronto.
 *
 * Tudo se aplica na hora, sem botão de "Salvar": são preferências reversíveis
 * de um clique, e nenhuma delas destrói nada. Pedir confirmação para escolher
 * um tema seria cerimônia sem risco nenhum por trás.
 */
export class ConfiguracoesPanel {
  /**
   * @param {{aoMudarLinhas?: () => void, aoMudarSidebar?: (recolhida: boolean) => void}} [acoes]
   *   O painel não mexe no shell por conta própria: quem sabe atualizar o
   *   rótulo do botão de recolher e recarregar a aba aberta é o App, então ele
   *   entrega essas duas ações aqui em vez de o painel ir procurar elementos
   *   pela tela e adivinhar como cada um se comporta.
   */
  constructor({ aoMudarLinhas, aoMudarSidebar, abas, abrirBackups, abrirUsuarios } = {}) {
    this.aoMudarLinhas = aoMudarLinhas || (() => {});
    this.aoMudarSidebar = aoMudarSidebar || (() => {});
    /** @type {Array<{key: string, label: string}>} para o seletor de tela inicial */
    this.abas = abas || [];
    this.abrirBackups = abrirBackups || null;
    this.abrirUsuarios = abrirUsuarios || null;
  }

  open() {
    const { box, close } = Modal.abrirCaixa({ largura: 520 });
    this.close = close;

    box.innerHTML = `
      <div class="painel__head">
        <div class="painel__icon" aria-hidden="true">${icon("config")}</div>
        <div>
          <h3 class="modal-box__title" id="config-titulo">Configurações</h3>
          <p class="modal-box__message">Valem só para este navegador, e mudam na hora.</p>
        </div>
      </div>

      <div class="config-list" data-role="lista"></div>

      <div class="config-section" data-role="sistema" hidden>
        <div class="config-section__title">Sistema</div>
        <div class="config-links" data-role="links"></div>
      </div>

      <div class="modal-box__actions config-actions">
        <button type="button" class="btn btn--ghost btn--small" data-action="restaurar">Restaurar padrões</button>
        <span class="toolbar-spacer"></span>
        <button type="button" class="btn btn--ghost" data-action="atalhos">${icon("teclado")} Atalhos</button>
        <button type="button" class="btn btn--accent" data-action="fechar">Concluído</button>
      </div>
    `;
    box.setAttribute("aria-labelledby", "config-titulo");

    const lista = box.querySelector('[data-role="lista"]');

    lista.appendChild(
      this._grupo({
        titulo: "Tema",
        ajuda: '"Sistema" acompanha a configuração do seu computador.',
        nome: "cfg-tema",
        opcoes: [
          { valor: "sistema", rotulo: "Sistema" },
          { valor: "claro", rotulo: "Claro" },
          { valor: "escuro", rotulo: "Escuro" },
        ],
        atual: theme.atual(),
        aoEscolher: (valor) => theme.aplicar(valor),
      })
    );

    lista.appendChild(
      this._grupo({
        titulo: "Densidade das tabelas",
        ajuda: "Quanto respiro cada linha tem. Compacta mostra mais registros sem rolar.",
        nome: "cfg-densidade",
        opcoes: DENSIDADES.map((d) => ({ valor: d.valor, rotulo: d.rotulo })),
        atual: aparencia.densidade(),
        aoEscolher: (valor) => aparencia.aplicar({ densidade: valor }),
      })
    );

    lista.appendChild(
      this._grupo({
        titulo: "Altura das tabelas",
        ajuda: "Quanto da tela a tabela ocupa antes de precisar rolar por dentro.",
        nome: "cfg-altura",
        opcoes: ALTURAS.map((a) => ({ valor: a.valor, rotulo: a.rotulo })),
        atual: aparencia.altura(),
        aoEscolher: (valor) => aparencia.aplicar({ altura: valor }),
      })
    );

    lista.appendChild(
      this._grupo({
        titulo: "Linhas por página",
        ajuda: "Vale para Atualizações, Clientes, Agendamentos e Histórico.",
        nome: "cfg-linhas",
        opcoes: LINHAS_OPCOES.map((n) => ({ valor: String(n), rotulo: String(n) })),
        atual: String(aparencia.linhasPorPagina()),
        aoEscolher: (valor) => {
          aparencia.aplicar({ linhasPorPagina: Number(valor) });
          this.aoMudarLinhas();
        },
      })
    );

    lista.appendChild(
      this._grupo({
        titulo: "Atualizar a Distribuição sozinha",
        ajuda: "De quanto em quanto tempo o painel busca o retorno dos agentes.",
        nome: "cfg-ritmo",
        opcoes: RITMOS.map((r) => ({ valor: String(r.valor), rotulo: r.rotulo })),
        atual: String(aparencia.ritmoPainel()),
        aoEscolher: (valor) => aparencia.aplicar({ ritmoPainel: Number(valor) }),
      })
    );

    if (notificacoes.suportado()) {
      lista.appendChild(
        this._grupo({
          titulo: "Avisar quando um agente falhar",
          ajuda: "Notificação do sistema, mesmo com o Gestor em outra aba.",
          nome: "cfg-notificacoes",
          opcoes: [
            { valor: "nao", rotulo: "Não" },
            { valor: "sim", rotulo: "Sim" },
          ],
          atual: notificacoes.ligadas() ? "sim" : "nao",
          aoEscolher: async (valor, grupo) => {
            const ligou = await notificacoes.definir(valor === "sim");
            // Se o navegador recusou a permissão, a opção volta sozinha para
            // "Não": deixar "Sim" marcado prometeria avisos que nunca viriam,
            // e a pessoa só descobriria isso na hora em que mais precisava.
            if (valor === "sim" && !ligou) {
              grupo.querySelector('input[value="nao"]').checked = true;
              toast.error("O navegador bloqueou as notificações para este site.");
            }
          },
        })
      );
    }

    lista.appendChild(
      this._grupo({
        titulo: "Menu lateral",
        ajuda: "Recolhido, sobra bastante largura para as tabelas.",
        nome: "cfg-menu",
        opcoes: [
          { valor: "aberto", rotulo: "Aberto" },
          { valor: "recolhido", rotulo: "Recolhido" },
        ],
        atual: settings.get("sidebarRecolhida", false) ? "recolhido" : "aberto",
        aoEscolher: (valor) => this.aoMudarSidebar(valor === "recolhido"),
      })
    );

    // Aba inicial: um <select>, não um trilho de opções -- são nove telas, e
    // nove botões colados não caberiam nem seriam legíveis. A regra aqui é a
    // largura do que se escolhe, não a consistência pela consistência.
    if (this.abas.length) {
      const grupo = document.createElement("div");
      grupo.className = "config-group";
      grupo.innerHTML = `
        <div class="config-group__labels">
          <span class="config-group__title">Tela inicial</span>
          <span class="config-group__help">Onde o sistema abre quando você entra.</span>
        </div>
        <select class="input config-group__select" data-role="aba-inicial"></select>
      `;
      const select = grupo.querySelector("select");
      select.innerHTML =
        `<option value="">Primeira da lista (Resumo)</option>` +
        this.abas.map((a) => `<option value="${a.key}">${a.label}</option>`).join("");
      select.value = aparencia.abaInicial();
      select.addEventListener("change", () => aparencia.aplicar({ abaInicial: select.value }));
      lista.appendChild(grupo);
    }

    /*
     * Backups e Usuários. Não são preferências -- são telas que se abrem -- e
     * por isso ficam numa seção própria embaixo, com aparência de link e não
     * de ajuste. Misturá-las no trilho de opções acima diria que são coisas do
     * mesmo tipo dos ajustes, e não são: um ajuste muda como o app se comporta,
     * estas duas levam a outro lugar.
     */
    const links = box.querySelector('[data-role="links"]');
    const atalhosDeSistema = [
      { rotulo: "Backups", ajuda: "Salvar e restaurar cópias do banco", icone: "backups", acao: this.abrirBackups },
      { rotulo: "Usuários", ajuda: "Quem tem acesso e com qual permissão", icone: "users", acao: this.abrirUsuarios },
    ].filter((item) => typeof item.acao === "function");

    for (const item of atalhosDeSistema) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "config-link";
      botao.innerHTML = `
        <span class="config-link__icon">${icon(item.icone)}</span>
        <span class="config-link__labels">
          <strong></strong>
          <span></span>
        </span>
        <span class="config-link__seta">${icon("seta")}</span>
      `;
      botao.querySelector("strong").textContent = item.rotulo;
      botao.querySelector(".config-link__labels span").textContent = item.ajuda;
      // Fecha este painel antes de abrir o outro, como o botão de atalhos:
      // dois diálogos empilhados prendem o foco no de cima e escondem o de
      // baixo pela metade.
      botao.addEventListener("click", () => {
        close();
        item.acao();
      });
      links.appendChild(botao);
    }
    box.querySelector('[data-role="sistema"]').hidden = atalhosDeSistema.length === 0;

    box.querySelector('[data-action="fechar"]').addEventListener("click", () => close());
    box.querySelector('[data-action="restaurar"]').addEventListener("click", async () => {
      const ok = await Modal.confirm(
        "Restaurar padrões",
        "Todas as preferências deste navegador voltam ao estado original: tema, densidade, altura, linhas por página, tela inicial e avisos.\n\nNenhum dado do sistema é afetado.",
        { confirmLabel: "Restaurar", danger: false }
      );
      if (!ok) return;
      aparencia.restaurarPadroes();
      // Recarregar é honesto aqui: o tema, o menu e a densidade são aplicados
      // em pontos diferentes do arranque, e desfazer cada um na mão seria
      // reimplementar a inicialização inteira só para esta tecla.
      location.reload();
    });
    box.querySelector('[data-action="atalhos"]').addEventListener("click", () => {
      // Fecha este antes de abrir o outro: dois diálogos empilhados prendem o
      // foco no de cima e escondem o de baixo pela metade, e aqui um substitui
      // o outro naturalmente -- ninguém quer os dois ao mesmo tempo.
      close();
      mostrarAtalhos();
    });

    // O foco vai para a opção JÁ MARCADA do primeiro grupo, não para a
    // primeira da fila: num grupo de radios é a marcada que representa o
    // estado atual, e é dela que as setas devem partir.
    box.querySelector(".config-group input:checked")?.focus();
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
  _grupo({ titulo, ajuda, nome, opcoes, atual, aoEscolher }) {
    const grupo = document.createElement("div");
    grupo.className = "config-group";

    const legenda = document.createElement("div");
    legenda.className = "config-group__labels";
    legenda.innerHTML = `<span class="config-group__title"></span><span class="config-group__help"></span>`;
    legenda.querySelector(".config-group__title").textContent = titulo;
    legenda.querySelector(".config-group__help").textContent = ajuda;

    const segmentos = document.createElement("div");
    segmentos.className = "segmented";
    segmentos.setAttribute("role", "radiogroup");
    segmentos.setAttribute("aria-label", titulo);

    for (const opcao of opcoes) {
      const label = document.createElement("label");
      label.className = "config-group__option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = nome;
      input.value = opcao.valor;
      input.checked = opcao.valor === atual;
      const texto = document.createElement("span");
      texto.textContent = opcao.rotulo;
      label.append(input, texto);
      segmentos.appendChild(label);

      // O `grupo` vai junto porque alguns ajustes podem falhar depois de
      // marcados (a permissão de notificação, que quem decide é o navegador) e
      // precisam desmarcar a opção de volta.
      input.addEventListener("change", () => {
        if (!input.checked) return;
        aoEscolher(opcao.valor, grupo);
      });
    }

    grupo.append(legenda, segmentos);
    return grupo;
  }
}

/**
 * Abre o painel. Wrapper minúsculo, mas evita repetir a montagem nos três
 * lugares que chegam até aqui (botão do cabeçalho, botão da barra lateral e
 * paleta de comandos).
 */
export function abrirConfiguracoes({ aoMudarLinhas, aoMudarSidebar, abas, abrirBackups, abrirUsuarios } = {}) {
  new ConfiguracoesPanel({
    aoMudarSidebar,
    abas,
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
