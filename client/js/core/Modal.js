const ICONS = { info: "i", warning: "!", error: "×", question: "?" };

/**
 * Diálogos modais no tema do app (aviso / confirmação), em vez do
 * `alert()`/`confirm()` feio e não estilizável do navegador -- mesma ideia
 * de `gestor/dialogs.py` (CustomDialog) no app Tkinter original.
 *
 * O `_open` daqui é reaproveitado pelos painéis flutuantes (Backups,
 * Usuários), então tudo que ele faz de acessibilidade vale para eles também:
 *
 *  - `role="dialog"` + `aria-modal` + `aria-labelledby`, para o leitor de tela
 *    anunciar que abriu uma janela e ler o título dela;
 *  - **foco preso** dentro da caixa: `Tab` no último elemento volta para o
 *    primeiro, em vez de sair passeando pela página escondida atrás;
 *  - **foco devolvido** ao elemento que abriu o modal quando ele fecha -- sem
 *    isso, quem navega por teclado é jogado de volta ao começo da página;
 *  - **rolagem do corpo travada**, para a página de trás não deslizar junto;
 *  - o botão que recebe foco por padrão numa confirmação é o **Cancelar**, não
 *    o "Confirmar" destrutivo. Antes, um `Enter` reflexo confirmava a exclusão.
 */
export class Modal {
  /** Mostra um aviso/erro com um único botão "OK". @returns {Promise<void>} */
  static alert(title, message, kind = "info") {
    return new Promise((resolve) => {
      Modal._open({ title, message, kind, question: false, onResolve: () => resolve() });
    });
  }

  /**
   * Mostra uma confirmação Confirmar/Cancelar. @returns {Promise<boolean>}
   * @param {{confirmLabel?: string, danger?: boolean}} [opts]
   */
  static confirm(title, message, opts = {}) {
    return new Promise((resolve) => {
      Modal._open({ title, message, kind: "question", question: true, onResolve: resolve, ...opts });
    });
  }

  static _open({ title, message, kind, question, onResolve, confirmLabel = "Confirmar", danger = true }) {
    // `resultado` é `undefined` quando o diálogo foi fechado por fora (Escape,
    // clique no fundo) -- numa confirmação isso significa "não", nunca "sim".
    // Quando os botões fecham, eles passam true/false explicitamente, e é esse
    // valor que precisa chegar a quem chamou.
    const { overlay, box, close } = Modal.abrirCaixa({
      largura: 420,
      onClose: (resultado) => onResolve(resultado === undefined && question ? false : resultado),
    });

    const tituloId = `modal-titulo-${Math.random().toString(36).slice(2, 8)}`;
    box.innerHTML = `
      <div class="modal-box__icon modal-box__icon--${kind}" aria-hidden="true">${ICONS[kind] || "i"}</div>
      <h3 class="modal-box__title" id="${tituloId}"></h3>
      <p class="modal-box__message"></p>
      <div class="modal-box__actions"></div>
    `;
    box.setAttribute("aria-labelledby", tituloId);
    box.querySelector(".modal-box__title").textContent = title;
    box.querySelector(".modal-box__message").textContent = message;

    const actions = box.querySelector(".modal-box__actions");
    if (question) {
      const cancelar = button("Cancelar", "btn", () => close(false));
      const confirmar = button(confirmLabel, danger ? "btn btn--danger" : "btn btn--accent", () => close(true));
      actions.append(cancelar, confirmar);
      // Foco no Cancelar: numa confirmação de exclusão, o caminho de menor
      // dano tem que ser o que a tecla Enter alcança primeiro.
      cancelar.focus();
    } else {
      const ok = button("OK", "btn btn--accent", () => close());
      actions.append(ok);
      ok.focus();
    }

    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !question && e.target.tagName !== "BUTTON") close();
    });
  }

  /**
   * Monta a casca de um diálogo (overlay + caixa + acessibilidade) e devolve
   * os pedaços para quem quiser preencher o miolo. É o que BackupsPanel e
   * UsersPanel usam -- antes cada um recriava overlay e caixa na mão, sem
   * nenhum dos cuidados de foco/teclado deste arquivo.
   *
   * @param {{largura?: number, onClose?: (resultado?: any) => void, fecharPorFora?: boolean}} opts
   */
  static abrirCaixa({ largura = 420, onClose = () => {}, fecharPorFora = true } = {}) {
    const focoAnterior = document.activeElement;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const box = document.createElement("div");
    box.className = "modal-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.tabIndex = -1;
    box.style.width = `min(${largura}px, calc(100vw - 32px))`;

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    Modal._travarRolagem(true);

    let fechado = false;
    const close = (resultado) => {
      if (fechado) return;
      fechado = true;
      document.removeEventListener("keydown", onKeydown, true);
      overlay.remove();
      Modal._travarRolagem(false);
      // Devolve o foco a quem abriu -- quem navega por teclado continua de
      // onde parou, em vez de recomeçar do topo da página.
      if (focoAnterior instanceof HTMLElement && document.contains(focoAnterior)) focoAnterior.focus();
      onClose(resultado);
    };

    function onKeydown(e) {
      if (!document.contains(overlay)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        close(undefined);
        return;
      }
      if (e.key === "Tab") Modal._prenderFoco(e, box);
    }
    // `capture: true` para pegar o Escape antes dos handlers das telas de
    // fundo (que usam Escape para limpar formulário) -- fechar o modal aberto
    // é sempre o que a pessoa quer nesse momento.
    document.addEventListener("keydown", onKeydown, true);

    if (fecharPorFora) {
      overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) close(undefined);
      });
    }

    return { overlay, box, close };
  }

  /** Faz o `Tab` circular dentro da caixa em vez de escapar para a página de trás. */
  static _prenderFoco(evento, box) {
    const focaveis = [
      ...box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  /**
   * Trava a rolagem do corpo enquanto houver algum modal aberto. Conta quantos
   * estão abertos porque um modal pode abrir outro (o painel de Backups abre
   * uma confirmação por cima) -- destravar no fechamento do de cima liberaria
   * a rolagem com o de baixo ainda na tela.
   */
  static _travarRolagem(travar) {
    Modal._abertos = (Modal._abertos || 0) + (travar ? 1 : -1);
    document.body.classList.toggle("has-modal", Modal._abertos > 0);
  }
}

function button(text, className, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}
