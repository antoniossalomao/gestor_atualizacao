import { icon } from "../utils/icons.js";
import { escapeHtml } from "../utils/html.js";
import { theme } from "../app/theme.js";
import { iniciais, rotuloPapel } from "../domain/pessoa.js";

/**
 * O menu da conta, no canto do cabeçalho.
 *
 * Antes havia três coisas soltas ali: um bloco de texto com o nome de quem
 * estava logado (que não fazia nada), um ícone de engrenagem e um ícone de
 * porta. Dois ícones sem rótulo disputando o mesmo canto, e um dos dois -- a
 * porta -- encerrando a sessão de quem errasse o alvo por seis pixels.
 *
 * Agora é UM alvo: o avatar com o nome. Ele abre um menu onde cada item está
 * escrito por extenso, com o atalho de teclado ao lado (que é como um atalho
 * deixa de ser folclore e vira coisa que se aprende), e onde "Sair" fica
 * separado do resto por uma divisória, longe do que se clica sem pensar.
 *
 * O tema mora aqui dentro como três opções lado a lado, e não como o botão que
 * CICLAVA entre os três estados: o problema daquele botão nunca foi estar no
 * cabeçalho, foi esconder três escolhas atrás de um ícone que não dizia em
 * qual delas você estava.
 */
export class MenuConta {
  /**
   * @param {HTMLElement} container elemento vazio onde o menu é montado
   * @param {{nome: string, usuario: string, role?: string}} usuario
   * @param {{aoConfigurar: () => void, aoAtalhos: () => void, aoSair: () => void,
   *          aoAtualizar: () => void}} acoes
   */
  constructor(container, usuario, acoes) {
    this.container = container;
    this.usuario = usuario;
    this.acoes = acoes;
    this.aberto = false;
    this._montar();
  }

  _montar() {
    const { nome, usuario, role } = this.usuario;
    this.container.className = "app-account";
    this.container.innerHTML = `
      <button type="button" class="app-account__trigger" data-role="gatilho"
              aria-haspopup="true" aria-expanded="false" aria-controls="menu-conta">
        <span class="app-account__avatar" aria-hidden="true">${escapeHtml(iniciais(nome || usuario))}</span>
        <span class="app-account__nome">
          <strong>${escapeHtml(nome || usuario)}</strong>
          <span>@${escapeHtml(usuario)}</span>
        </span>
        <span class="app-account__chevron" aria-hidden="true">${icon("seta")}</span>
      </button>

      <div class="app-menu" id="menu-conta" role="menu" data-role="menu" hidden>
        <div class="app-menu__conta">
          <span class="app-menu__avatar" aria-hidden="true">${escapeHtml(iniciais(nome || usuario))}</span>
          <span class="app-menu__conta-texto">
            <strong>${escapeHtml(nome || usuario)}</strong>
            <span>@${escapeHtml(usuario)} — ${escapeHtml(rotuloPapel(role))}</span>
          </span>
        </div>

        <div class="app-menu__sep" role="separator"></div>

        <div class="app-menu__tema">
          <span class="app-menu__rotulo">Tema</span>
          <div class="segmented segmented--mini" role="radiogroup" aria-label="Tema" data-role="tema"></div>
        </div>

        <div class="app-menu__sep" role="separator"></div>

        <button type="button" class="app-menu__item" role="menuitem" data-acao="atualizar">
          <span class="app-menu__icon">${icon("atualizar")}</span>
          <span>Atualizar os dados desta tela</span>
        </button>
        <button type="button" class="app-menu__item" role="menuitem" data-acao="config">
          <span class="app-menu__icon">${icon("config")}</span>
          <span>Configurações</span>
          <span class="app-menu__atalho"><kbd>Ctrl</kbd><kbd>,</kbd></span>
        </button>
        <button type="button" class="app-menu__item" role="menuitem" data-acao="atalhos">
          <span class="app-menu__icon">${icon("teclado")}</span>
          <span>Atalhos de teclado</span>
          <span class="app-menu__atalho"><kbd>?</kbd></span>
        </button>

        <div class="app-menu__sep" role="separator"></div>

        <button type="button" class="app-menu__item app-menu__item--sair" role="menuitem" data-acao="sair">
          <span class="app-menu__icon">${icon("logout")}</span>
          <span>Sair da conta</span>
        </button>
      </div>
    `;

    this.gatilho = this.container.querySelector('[data-role="gatilho"]');
    this.menu = this.container.querySelector('[data-role="menu"]');

    this._montarTema();

    this.gatilho.addEventListener("click", () => (this.aberto ? this.fechar() : this.abrir()));

    for (const item of this.menu.querySelectorAll(".app-menu__item")) {
      item.addEventListener("click", () => {
        // Fecha ANTES de executar: "Sair" abre uma confirmação, e um menu
        // ainda aberto atrás dela rouba o clique de quem quiser cancelar.
        this.fechar();
        const acoes = {
          atualizar: this.acoes.aoAtualizar,
          config: this.acoes.aoConfigurar,
          atalhos: this.acoes.aoAtalhos,
          sair: this.acoes.aoSair,
        };
        acoes[item.dataset.acao]?.();
      });
    }

    // Fechar por fora e por Escape são os dois gestos que todo mundo já tenta
    // sem pensar. Ficam registrados o tempo todo (não só com o menu aberto):
    // ligar e desligar listener a cada abertura custa mais código do que a
    // condição de uma linha que eles fazem quando o menu está fechado.
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
  }

  /** As três opções de tema, escritas por extenso e marcando qual está valendo. */
  _montarTema() {
    const trilho = this.menu.querySelector('[data-role="tema"]');
    const atual = theme.atual();
    for (const opcao of [
      { valor: "sistema", rotulo: "Sistema" },
      { valor: "claro", rotulo: "Claro" },
      { valor: "escuro", rotulo: "Escuro" },
    ]) {
      const label = document.createElement("label");
      label.className = "cfg-group__option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "menu-tema";
      input.value = opcao.valor;
      input.checked = opcao.valor === atual;
      const texto = document.createElement("span");
      texto.textContent = opcao.rotulo;
      label.append(input, texto);
      input.addEventListener("change", () => {
        if (input.checked) theme.aplicar(opcao.valor);
      });
      trilho.appendChild(label);
    }

    // O tema também muda pelo painel de Configurações e pela paleta de
    // comandos. Sem ouvir o evento, o menu voltaria a abrir marcando a opção
    // que valia da última vez que ELE mesmo foi usado.
    this._aoTrocarTema = () => {
      const marcado = theme.atual();
      for (const input of trilho.querySelectorAll("input")) input.checked = input.value === marcado;
    };
    document.addEventListener("tema:mudou", this._aoTrocarTema);
  }

  abrir() {
    this.aberto = true;
    this.menu.hidden = false;
    this.gatilho.setAttribute("aria-expanded", "true");
    this.container.classList.add("is-open");
  }

  /** @param {{devolverFoco?: boolean}} [opcoes] */
  fechar({ devolverFoco = false } = {}) {
    if (!this.aberto) return;
    this.aberto = false;
    this.menu.hidden = true;
    this.gatilho.setAttribute("aria-expanded", "false");
    this.container.classList.remove("is-open");
    // Só devolve o foco quando ele estava DENTRO do menu (Escape, item
    // escolhido pelo teclado). Devolver sempre roubaria o foco de quem apenas
    // clicou em outro lugar da tela para continuar trabalhando.
    if (devolverFoco) this.gatilho.focus();
  }

  /** Setas percorrem os itens; a partir do gatilho, entram no menu. */
  _mover(passo) {
    const itens = [...this.menu.querySelectorAll(".app-menu__item")];
    if (itens.length === 0) return;
    const atual = itens.indexOf(document.activeElement);
    const proximo = atual === -1 ? (passo > 0 ? 0 : itens.length - 1) : (atual + passo + itens.length) % itens.length;
    itens[proximo].focus();
  }

  destroy() {
    document.removeEventListener("pointerdown", this._aoClicarFora);
    document.removeEventListener("keydown", this._aoTeclar);
    document.removeEventListener("tema:mudou", this._aoTrocarTema);
  }
}
