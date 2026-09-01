import { Modal } from "../core/Modal.js";
import { toast } from "../core/Toast.js";
import { emptyState } from "../core/EmptyState.js";
import { marcarOcupado } from "../core/guard.js";

/**
 * Painel de Backups, aberto pelo botão na barra lateral (não é uma aba fixa,
 * igual ao botão "Backups" no canto da janela do app original -- ver
 * gestor/dialogs.py, show_backups_dialog).
 *
 * Depois de restaurar um backup, TODOS os dados da página podem ter mudado (é
 * a mesma ação de "trocar o banco de dados inteiro" por baixo), então em vez
 * de tentar atualizar cada tela individualmente, a forma mais simples e
 * segura de garantir que nada fique com informação velha na tela é recarregar
 * a página inteira.
 *
 * A casca do diálogo agora vem de `Modal.abrirCaixa`, e não é mais montada na
 * mão aqui: assim este painel herda foco preso, `Escape`, `role="dialog"`,
 * devolução do foco e trava de rolagem, que antes ele não tinha.
 */
export class BackupsPanel {
  /** @param {import('../api/ApiClient').ApiClient} api */
  constructor(api) {
    this.api = api;
  }

  async open() {
    let backups;
    try {
      backups = await this.api.get("/backups");
    } catch {
      Modal.alert("Erro", "Não foi possível carregar a lista de backups.", "error");
      return;
    }

    const { box, close } = Modal.abrirCaixa({ largura: 480 });
    box.innerHTML = `
      <h3 class="modal-box__title" id="backups-titulo">Backups Automáticos</h3>
      <p class="modal-box__message">Uma cópia do banco é feita a cada início do servidor. Escolha uma data/hora para restaurar.</p>
      <div class="consulta-matches" data-role="list" style="margin-top: var(--sp-4); max-height: 280px"
           role="listbox" aria-label="Backups disponíveis"></div>
      <div class="modal-box__actions">
        <button type="button" class="btn" data-action="close">Fechar</button>
        <button type="button" class="btn btn--danger" data-action="restore" ${backups.length === 0 ? "disabled" : ""}>Restaurar Selecionado</button>
      </div>
    `;
    box.setAttribute("aria-labelledby", "backups-titulo");

    const list = box.querySelector('[data-role="list"]');
    let selected = backups[0] || null;

    if (backups.length === 0) {
      list.appendChild(
        emptyState({
          titulo: "Nenhum backup ainda",
          descricao: "O primeiro é criado na próxima vez que o servidor iniciar.",
          icone: "backups",
        })
      );
    } else {
      backups.forEach((b, idx) => {
        // <button> em vez de <div>: a lista inteira era inalcançável por
        // teclado, o que num diálogo de restauração de banco é sério.
        const item = document.createElement("button");
        item.type = "button";
        item.className = "consulta-matches__item" + (idx === 0 ? " is-active" : "");
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(idx === 0));
        item.textContent = b.label;
        item.addEventListener("click", () => {
          selected = b;
          for (const el of list.querySelectorAll(".consulta-matches__item")) {
            el.classList.remove("is-active");
            el.setAttribute("aria-selected", "false");
          }
          item.classList.add("is-active");
          item.setAttribute("aria-selected", "true");
        });
        list.appendChild(item);
      });
    }

    box.querySelector('[data-action="close"]').addEventListener("click", () => close());

    const restoreBtn = box.querySelector('[data-action="restore"]');
    restoreBtn.addEventListener("click", async () => {
      if (!selected || restoreBtn.disabled) return;
      const ok = await Modal.confirm(
        "Confirmar restauração",
        `Isso vai substituir os dados atuais pelos do backup de ${selected.label}.\n\n` +
          "Um backup do estado atual é feito automaticamente antes de restaurar, mas essa ação não pode ser " +
          "desfeita pela tela. Deseja continuar?",
        { confirmLabel: "Restaurar" }
      );
      if (!ok) return;

      const liberar = marcarOcupado(restoreBtn);
      try {
        await this.api.post(`/backups/${encodeURIComponent(selected.arquivo)}/restore`);
        close();
        toast.success(`Dados restaurados para o backup de ${selected.label}. Recarregando...`);
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        liberar();
        Modal.alert("Erro", err instanceof Error ? err.message : "Não foi possível restaurar o backup.", "error");
      }
    });
  }
}
