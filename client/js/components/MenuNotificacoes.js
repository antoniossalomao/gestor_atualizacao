import { icon } from "../utils/icons.js";
import { escapeHtml, escapeAttr } from "../utils/html.js";
import { prefs } from "../app/prefs.js";
import { totalDe } from "../domain/notificacoes.js";

/**
 * Quando o usuário deu as notificações por vistas. Fica em `sessionStorage`
 * (ver prefs.js), e é isso que faz a regra ser "até amanhã OU até abrir o app
 * de novo": fechar a aba esquece, e no dia seguinte a data não bate mais.
 *
 * O nome mudou de "lembretes-fechados-em" junto com o que a chave cobre --
 * agora são todos os avisos, não só os de agendamento. Trocar a chave não
 * custa migração nenhuma justamente por ser de sessão.
 */
const CHAVE_VISTAS = "notificacoes-vistas-em";

/**
 * O sino do cabeçalho, ao lado do nome de quem está logado.
 *
 * Substitui duas coisas que gritavam mais do que a informação merecia: a
 * faixa amarela que ficava entre o cabeçalho e o conteúdo de TODA aba, e o
 * bloco "Precisa de Atenção" que abria o Resumo com uma grade de cards
 * grandes. Somadas, as duas custavam a primeira dobra da tela inicial para
 * dizer o que cabe num número de dois dígitos.
 *
 * O que se perde com isso é o "não dá para não ver", e é uma perda de
 * verdade. Duas coisas compensam: o contador no sino, que é a única coisa
 * colorida daquele canto, e o `(2)` no título da aba do navegador (ver
 * App._atualizarTitulo), que é o que alcança quem está com o Gestor atrás do
 * ERP e do WhatsApp -- justamente quem a faixa nunca alcançou.
 *
 * "Marcar como vistas" apaga o contador, não a lista: o que está pendente
 * continua pendente e continua aqui dentro para consultar. É a mesma regra
 * que o ✕ da faixa antiga tinha, e é o que impede o sino de virar um ponto
 * vermelho permanente -- que é como um aviso morre.
 */
export class MenuNotificacoes {
  /**
   * @param {HTMLElement} container elemento vazio onde o sino é montado
   * @param {{aoAbrir?: () => void, aoMarcarVistas?: () => void,
   *          aoIr: (destino: string, params: object|null) => void}} acoes
   *   `aoAbrir` é a deixa para buscar dados frescos -- quem abre o sino quer
   *   o estado de agora, não o do login.
   */
  constructor(container, acoes) {
    this.container = container;
    this.acoes = acoes;
    this.aberto = false;
    /** @type {Array<import('../domain/notificacoes.js').Notificacao>} */
    this.notificacoes = [];
    this._montar();
  }

  _montar() {
    this.container.className = "app-notificacoes";
    this.container.innerHTML = `
      <button type="button" class="app-notificacoes__sino" data-role="gatilho"
              aria-haspopup="true" aria-expanded="false" aria-controls="menu-notificacoes">
        <span class="app-notificacoes__icone" aria-hidden="true">${icon("sino")}</span>
        <span class="app-notificacoes__contador" data-role="contador" aria-hidden="true" hidden>0</span>
      </button>

      <div class="app-menu app-menu--avisos" id="menu-notificacoes" role="menu" data-role="menu" hidden>
        <div class="app-menu__cabecalho">
          <span class="app-menu__rotulo">Notificações</span>
          <button type="button" class="app-menu__marcar" data-acao="marcar" hidden>Marcar como vistas</button>
        </div>
        <div class="app-menu__sep" role="separator"></div>
        <div data-role="lista"></div>
      </div>
    `;

    this.gatilho = this.container.querySelector('[data-role="gatilho"]');
    this.menu = this.container.querySelector('[data-role="menu"]');
    this.contador = this.container.querySelector('[data-role="contador"]');
    this.lista = this.container.querySelector('[data-role="lista"]');
    this.botaoMarcar = this.container.querySelector('[data-acao="marcar"]');

    this.gatilho.addEventListener("click", () => (this.aberto ? this.fechar() : this.abrir()));
    this.botaoMarcar.addEventListener("click", () => {
      this._marcarVistas();
      this.gatilho.focus();
    });

    // Delegação: a lista é redesenhada a cada atualização de dados, e um
    // listener por linha teria que ser religado toda vez.
    this.lista.addEventListener("click", (event) => {
      const item = event.target.closest("[data-destino]");
      if (!item) return;
      this.fechar();
      // Clicar num aviso É tê-lo visto -- a faixa antiga fazia o mesmo quando
      // se clicava em "Ver Agendamentos".
      this._marcarVistas();
      const params = item.dataset.params ? JSON.parse(item.dataset.params) : null;
      this.acoes.aoIr(item.dataset.destino, params);
    });

    // Mesmos dois gestos do menu da conta, registrados o tempo todo pelo
    // mesmo motivo (ver MenuConta): a condição de uma linha custa menos que
    // ligar e desligar listener a cada abertura.
    this._aoClicarFora = (e) => {
      if (this.aberto && !this.container.contains(e.target)) this.fechar();
    };
    this._aoTeclar = (e) => {
      if (!this.aberto) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        this.fechar({ devolverFoco: true });
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this._mover(e.key === "ArrowDown" ? 1 : -1);
      }
    };
    document.addEventListener("pointerdown", this._aoClicarFora);
    document.addEventListener("keydown", this._aoTeclar);

    this.atualizar([]);
  }

  /**
   * Troca o que o sino tem a dizer.
   * @param {Array<import('../domain/notificacoes.js').Notificacao>} notificacoes
   */
  atualizar(notificacoes) {
    this.notificacoes = notificacoes || [];
    this._renderLista();
    this._renderContador();
  }

  /** Quantas estão pendentes, tenham sido vistas ou não. */
  total() {
    return totalDe(this.notificacoes);
  }

  /**
   * O número que o contador mostra -- zero depois de "marcar como vistas",
   * mesmo com tudo ainda pendente. É o que o título da aba do navegador também
   * usa, para os dois nunca discordarem (ver App._atualizarTitulo).
   */
  pendentesNaoVistas() {
    return this._jaVistas() ? 0 : this.total();
  }

  _renderLista() {
    if (this.notificacoes.length === 0) {
      // Dizer "nada pendente" em vez de abrir um menu vazio: menu vazio
      // parece defeito, e a pessoa clica de novo para conferir.
      this.lista.innerHTML = `<p class="app-menu__vazio">${icon("check")} Nada pendente agora.</p>`;
      return;
    }
    this.lista.innerHTML = this.notificacoes
      .map((n) => {
        // `escapeAttr`, não `escapeHtml`: este vai DENTRO de um atributo entre
        // aspas, e `escapeHtml` (textContent -> innerHTML) não escapa aspas
        // duplas. O filtro é um JSON, que é feito delas -- com o escape
        // errado, o atributo fecharia no primeiro `"` e o resto do JSON viraria
        // atributo solto no botão. Nada quebra visivelmente: só o clique passa
        // a levar para a tela sem filtro nenhum.
        const params = n.params ? ` data-params="${escapeAttr(JSON.stringify(n.params))}"` : "";
        const detalhe = n.detalhe ? `<span>${escapeHtml(n.detalhe)}</span>` : "";
        return `
        <button type="button" class="app-menu__aviso app-menu__aviso--${n.tom}" role="menuitem"
                data-destino="${escapeAttr(n.destino)}"${params}>
          <span class="app-menu__aviso-icone">${icon(n.icone)}</span>
          <span class="app-menu__aviso-texto">
            <strong>${escapeHtml(n.titulo)}</strong>
            ${detalhe}
          </span>
          <span class="app-menu__aviso-seta">${icon("seta")}</span>
        </button>`;
      })
      .join("");
  }

  _renderContador() {
    const total = this.total();
    const visivel = this.pendentesNaoVistas() > 0;
    this.contador.hidden = !visivel;
    this.contador.textContent = total > 99 ? "99+" : String(total);
    this.container.classList.toggle("tem-novidade", visivel);
    this.botaoMarcar.hidden = !visivel;
    // O contador é `aria-hidden` (é decoração de um número que já está no
    // rótulo): quem usa leitor de tela ouve a frase inteira, não um "3" solto.
    this.gatilho.setAttribute(
      "aria-label",
      total === 0
        ? "Notificações: nada pendente"
        : `Notificações: ${total} ${total === 1 ? "pendente" : "pendentes"}${visivel ? "" : " (já vistas)"}`
    );
  }

  _jaVistas() {
    return prefs.get(CHAVE_VISTAS) === new Date().toDateString();
  }

  _marcarVistas() {
    prefs.set(CHAVE_VISTAS, new Date().toDateString());
    this._renderContador();
    this.acoes.aoMarcarVistas?.();
  }

  abrir() {
    this.aberto = true;
    this.menu.hidden = false;
    this.gatilho.setAttribute("aria-expanded", "true");
    this.container.classList.add("is-open");
    this.acoes.aoAbrir?.();
  }

  /** @param {{devolverFoco?: boolean}} [opcoes] */
  fechar({ devolverFoco = false } = {}) {
    if (!this.aberto) return;
    this.aberto = false;
    this.menu.hidden = true;
    this.gatilho.setAttribute("aria-expanded", "false");
    this.container.classList.remove("is-open");
    if (devolverFoco) this.gatilho.focus();
  }

  /** Setas percorrem os avisos; a partir do gatilho, entram na lista. */
  _mover(passo) {
    const itens = [...this.menu.querySelectorAll(".app-menu__aviso")];
    if (itens.length === 0) return;
    const atual = itens.indexOf(document.activeElement);
    const proximo = atual === -1 ? (passo > 0 ? 0 : itens.length - 1) : (atual + passo + itens.length) % itens.length;
    itens[proximo].focus();
  }

  destroy() {
    document.removeEventListener("pointerdown", this._aoClicarFora);
    document.removeEventListener("keydown", this._aoTeclar);
  }
}
