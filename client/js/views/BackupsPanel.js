import { Modal } from "../components/Modal.js";
import { toast } from "../components/Toast.js";
import { emptyState } from "../components/EmptyState.js";
import { marcarOcupado } from "../utils/guard.js";
import { icon } from "../utils/icons.js";
import { formatarBytes } from "../utils/arquivo.js";

/**
 * Painel de Backups e Restauração Protegida.
 * Restrito ao perfil de Administrador com confirmação de senha e palavra de segurança.
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
      Modal.alert("Erro", "Não foi possível carregar a lista de backups. Acesso restrito a administradores.", "error");
      return;
    }

    const { box, close } = Modal.abrirCaixa({ largura: 540 });
    box.innerHTML = `
      <h3 class="modal-box__title" id="backups-titulo">Backups e Segurança do Banco</h3>
      <p class="modal-box__message">Uma cópia do banco é feita automaticamente a cada início do servidor.</p>
      
      <div style="margin: var(--sp-3) 0; display: flex; gap: 8px;">
        <a href="/api/backups/atual/download" download class="btn btn--small" style="display: inline-flex; align-items: center; gap: 6px;">
          ${icon("download")} Baixar Cópia do Banco Atual (.db)
        </a>
      </div>

      <div class="consulta-matches" data-role="list" style="margin-top: var(--sp-2); max-height: 280px"
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
        const item = document.createElement("div");
        item.className = "consulta-matches__item" + (idx === 0 ? " is-active" : "");
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.justifyContent = "space-between";
        item.style.cursor = "pointer";

        const info = document.createElement("div");
        info.style.display = "flex";
        info.style.alignItems = "center";
        info.style.gap = "8px";
        info.innerHTML = `
          <strong>${b.label}</strong>
          ${b.tamanhoBytes ? `<span class="text-muted" style="font-size: 0.85rem">(${formatarBytes(b.tamanhoBytes)})</span>` : ""}
        `;

        if (b.integro === false) {
          const aviso = document.createElement("span");
          aviso.className = "badge badge--danger";
          aviso.textContent = "Corrompido";
          aviso.title = "Falhou na verificação de integridade logo após ser criado.";
          info.appendChild(aviso);
        }

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.alignItems = "center";
        actions.style.gap = "6px";

        const downloadLink = document.createElement("a");
        downloadLink.href = `/api/backups/${encodeURIComponent(b.arquivo)}/download`;
        downloadLink.download = b.arquivo;
        downloadLink.className = "btn btn--small";
        downloadLink.title = "Baixar este backup";
        downloadLink.innerHTML = icon("download");
        downloadLink.addEventListener("click", (e) => e.stopPropagation());
        actions.appendChild(downloadLink);

        item.appendChild(info);
        item.appendChild(actions);

        item.addEventListener("click", () => {
          selected = b;
          for (const el of list.querySelectorAll(".consulta-matches__item")) {
            el.classList.remove("is-active");
          }
          item.classList.add("is-active");
        });
        list.appendChild(item);
      });
    }

    box.querySelector('[data-action="close"]').addEventListener("click", () => close());

    const restoreBtn = box.querySelector('[data-action="restore"]');
    restoreBtn.addEventListener("click", async () => {
      if (!selected || restoreBtn.disabled) return;
      this._confirmarRestauracao(selected, close);
    });
  }

  async _confirmarRestauracao(selected, closeParent) {
    const { box, close } = Modal.abrirCaixa({ largura: 480 });
    box.innerHTML = `
      <h3 class="modal-box__title" style="color: var(--color-danger)">Atenção: Restauração Crítica</h3>
      <p class="modal-box__message">
        Esta operação <strong>substituirá integralmente o banco de dados</strong> pelo backup de <strong>${selected.label}</strong>.
        Todas as alterações feitas após essa data serão perdidas.
      </p>

      <form data-role="restore-form" style="margin-top: var(--sp-4);">
        <div class="form-grid">
          <div class="field">
            <label class="field__label" for="rest-conf">Digite <strong>RESTAURAR</strong> em maiúsculas para confirmar:</label>
            <input type="text" class="input" id="rest-conf" data-field="confirmacao" required placeholder="RESTAURAR" autocomplete="off" />
          </div>
          <div class="field">
            <label class="field__label" for="rest-pwd">Sua senha atual de Administrador:</label>
            <input type="password" class="input" id="rest-pwd" data-field="senha" required autocomplete="current-password" placeholder="Senha do administrador" />
          </div>
        </div>
        <div class="modal-box__actions" style="margin-top: var(--sp-4);">
          <button type="button" class="btn" data-action="cancel">Cancelar</button>
          <button type="submit" class="btn btn--danger" data-action="exec-restore">Autorizar Restauração</button>
        </div>
      </form>
    `;

    box.querySelector('[data-action="cancel"]').addEventListener("click", () => close());

    const form = box.querySelector('[data-role="restore-form"]');
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const confirmacao = box.querySelector('[data-field="confirmacao"]').value.trim();
      const senha = box.querySelector('[data-field="senha"]').value;
      const submitBtn = form.querySelector('[data-action="exec-restore"]');

      if (confirmacao !== "RESTAURAR") {
        Modal.alert("Confirmação inválida", 'Você precisa digitar exatamente a palavra "RESTAURAR".', "warning");
        return;
      }

      const liberar = marcarOcupado(submitBtn);
      try {
        await this.api.post(`/backups/${encodeURIComponent(selected.arquivo)}/restore`, { confirmacao, senha });
        close();
        closeParent();
        toast.success(`Banco restaurado com sucesso para ${selected.label}. Recarregando aplicação...`);
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        liberar();
        Modal.alert("Erro na restauração", err instanceof Error ? err.message : "Não foi possível restaurar o backup.", "error");
      }
    });
  }
}
