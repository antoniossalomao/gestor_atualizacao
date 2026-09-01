import { ApiError } from "../api/ApiClient.js";
import { Modal } from "../core/Modal.js";
import { toast } from "../core/Toast.js";
import { icon } from "../core/icons.js";
import { escapeHtml } from "../core/html.js";
import { marcarOcupado } from "../core/guard.js";

/**
 * Painel de gerenciamento de contas, aberto pelo botão "Usuários" na barra
 * lateral -- mesmo padrão do BackupsPanel (uma janela flutuante, não uma aba
 * fixa). Não existia no app Python original (uso individual).
 *
 * Qualquer pessoa logada pode convidar outra conta (mesma filosofia de "todo
 * login tem acesso completo" usada no resto do app) -- remover uma conta,
 * porém, é restrito a administradores (ver AuthService.deleteUser). As demais
 * travas (não poder se autoexcluir, não poder remover a última conta) também
 * são garantidas pelo backend.
 *
 * Como o BackupsPanel, agora usa `Modal.abrirCaixa` e herda dela todo o
 * cuidado de foco e teclado que o diálogo montado à mão não tinha.
 */
export class UsersPanel {
  /** @param {import('../api/ApiClient').ApiClient} api @param {{id:number, nome:string, role:string}} usuarioAtual */
  constructor(api, usuarioAtual) {
    this.api = api;
    this.usuarioAtual = usuarioAtual;
  }

  async open() {
    const { box, close } = Modal.abrirCaixa({ largura: 520 });
    this.box = box;
    this.close = close;

    box.innerHTML = `
      <h3 class="modal-box__title" id="usuarios-titulo">Usuários</h3>
      <p class="modal-box__message">Quem tem acesso ao sistema.</p>
      <div class="users-list" data-role="list"></div>
      <button type="button" class="btn btn--small" data-action="toggle-new" aria-expanded="false" aria-controls="novo-usuario">
        ${icon("plus")} Convidar Pessoa
      </button>
      <form class="users-new" id="novo-usuario" data-role="new-form" hidden>
        <div class="form-grid">
          <div class="field"><label class="field__label" for="u-nome">Nome</label><input type="text" class="input" id="u-nome" data-field="nome" required /></div>
          <div class="field"><label class="field__label" for="u-usuario">Usuário</label><input type="text" class="input" id="u-usuario" data-field="usuario" required autocomplete="off" /></div>
          <div class="field"><label class="field__label" for="u-senha">Senha</label><input type="password" class="input" id="u-senha" data-field="senha" required autocomplete="new-password" /></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn--accent" data-action="create">Criar Conta</button>
        </div>
      </form>
      <div class="modal-box__actions">
        <button type="button" class="btn" data-action="close">Fechar</button>
      </div>
    `;
    box.setAttribute("aria-labelledby", "usuarios-titulo");

    box.querySelector('[data-action="close"]').addEventListener("click", () => close());

    const newForm = box.querySelector('[data-role="new-form"]');
    const toggle = box.querySelector('[data-action="toggle-new"]');
    toggle.addEventListener("click", () => {
      const visible = !newForm.hidden;
      newForm.hidden = visible;
      toggle.setAttribute("aria-expanded", String(!visible));
      if (!visible) box.querySelector('[data-field="nome"]').focus();
    });
    // <form> de verdade: Enter em qualquer campo cria a conta, e o navegador
    // já sinaliza os campos obrigatórios vazios.
    newForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this._createUser(newForm);
    });

    await this._reload();
  }

  async _reload() {
    const usuarios = await this.api.get("/usuarios");
    const list = this.box.querySelector('[data-role="list"]');
    list.replaceChildren();

    for (const u of usuarios) {
      const isSelf = u.id === this.usuarioAtual.id;
      const isAdmin = u.role === "admin";
      const row = document.createElement("div");
      row.className = "users-list__row";
      row.innerHTML = `
        <div class="users-list__info">
          <div class="users-list__name">
            ${escapeHtml(u.nome)}
            ${isSelf ? '<span class="text-muted">(você)</span>' : ""}
            ${isAdmin ? '<span class="badge badge--accent users-list__tag">Admin</span>' : ""}
          </div>
          <div class="text-muted users-list__handle">@${escapeHtml(u.usuario)}</div>
        </div>
      `;
      if (!isSelf && this.usuarioAtual.role === "admin") {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn--small btn--danger";
        removeBtn.textContent = "Remover";
        removeBtn.addEventListener("click", () => this._removeUser(u, removeBtn));
        row.appendChild(removeBtn);
      }
      list.appendChild(row);
    }
  }

  async _createUser(form) {
    const nome = this.box.querySelector('[data-field="nome"]').value.trim();
    const usuario = this.box.querySelector('[data-field="usuario"]').value.trim();
    const senha = this.box.querySelector('[data-field="senha"]').value;
    const botao = form.querySelector('[data-action="create"]');

    const liberar = marcarOcupado(botao);
    try {
      await this.api.post("/usuarios", { nome, usuario, senha });
      for (const campo of ["nome", "usuario", "senha"]) this.box.querySelector(`[data-field="${campo}"]`).value = "";
      await this._reload();
      toast.success(`Conta de "${nome}" criada.`);
    } catch (err) {
      Modal.alert("Validação", errorMessage(err), "warning");
    } finally {
      liberar();
    }
  }

  async _removeUser(u, botao) {
    const ok = await Modal.confirm(
      "Remover acesso",
      `Remover o acesso de "${u.nome}" (@${u.usuario})?\n\nEle perde o login imediatamente. O histórico de ações dele continua registrado.`,
      { confirmLabel: "Remover" }
    );
    if (!ok) return;

    const liberar = marcarOcupado(botao);
    try {
      await this.api.delete(`/usuarios/${u.id}`);
      await this._reload();
      toast.success(`Acesso de "${u.nome}" removido.`);
    } catch (err) {
      liberar();
      Modal.alert("Erro", errorMessage(err), "error");
    }
  }
}

function errorMessage(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
