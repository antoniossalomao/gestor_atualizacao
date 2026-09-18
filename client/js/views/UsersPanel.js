import { ApiError } from "../api/ApiClient.js";
import { Modal } from "../components/Modal.js";
import { toast } from "../components/Toast.js";
import { icon } from "../utils/icons.js";
import { escapeHtml } from "../utils/html.js";
import { marcarOcupado } from "../utils/guard.js";
import { formatarDataHora, tempoRelativo } from "../utils/date.js";
import { rotuloPapel } from "../domain/pessoa.js";

/**
 * Painel de gerenciamento de contas, aberto pelo botão "Usuários".
 */
export class UsersPanel {
  /** @param {import('../api/ApiClient').ApiClient} api @param {{id:number, nome:string, role:string}} usuarioAtual */
  constructor(api, usuarioAtual) {
    this.api = api;
    this.usuarioAtual = usuarioAtual;
  }

  async open() {
    const { box, close } = Modal.abrirCaixa({ largura: 560 });
    this.box = box;
    this.close = close;

    const isAdmin = this.usuarioAtual.role === "admin";

    box.innerHTML = `
      <h3 class="modal-box__title" id="usuarios-titulo">Usuários e Permissões</h3>
      <p class="modal-box__message">Quem tem acesso ao sistema e quais permissões possui.</p>
      <div class="users-list" data-role="list"></div>
      ${
        isAdmin
          ? `
      <button type="button" class="btn btn--small" data-action="toggle-new" aria-expanded="false" aria-controls="novo-usuario">
        ${icon("plus")} Convidar Pessoa
      </button>
      <form class="users-new" id="novo-usuario" data-role="new-form" hidden>
        <div class="form-grid">
          <div class="field"><label class="field__label" for="u-nome">Nome</label><input type="text" class="input" id="u-nome" data-field="nome" required /></div>
          <div class="field"><label class="field__label" for="u-usuario">Usuário</label><input type="text" class="input" id="u-usuario" data-field="usuario" required autocomplete="off" /></div>
          <div class="field"><label class="field__label" for="u-senha">Senha</label><input type="password" class="input" id="u-senha" data-field="senha" required autocomplete="new-password" /></div>
          <div class="field">
            <label class="field__label" for="u-role">Papel</label>
            <select class="input" id="u-role" data-field="role">
              <option value="operador" selected>Operador (CRUD operacional)</option>
              <option value="consulta">Consulta (Somente leitura)</option>
              <option value="admin">Administrador (Acesso total)</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn--accent" data-action="create">Criar Conta</button>
        </div>
      </form>
      <hr class="separator" />`
          : ""
      }

      <button type="button" class="btn btn--small" data-action="toggle-senha" aria-expanded="false" aria-controls="trocar-senha">
        ${icon("plus")} Trocar minha senha
      </button>
      <form class="users-new" id="trocar-senha" data-role="senha-form" hidden>
        <div class="form-grid">
          <div class="field"><label class="field__label" for="u-senha-atual">Senha atual</label><input type="password" class="input" id="u-senha-atual" data-field="senhaAtual" required autocomplete="current-password" /></div>
          <div class="field"><label class="field__label" for="u-senha-nova">Senha nova</label><input type="password" class="input" id="u-senha-nova" data-field="senhaNova" required autocomplete="new-password" /></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn--accent" data-action="trocar-senha">Salvar Senha Nova</button>
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
    if (toggle && newForm) {
      toggle.addEventListener("click", () => {
        const visible = !newForm.hidden;
        newForm.hidden = visible;
        toggle.setAttribute("aria-expanded", String(!visible));
        toggle.innerHTML = visible ? `${icon("plus")} Convidar Pessoa` : `${icon("minus")} Ocultar Formulário`;
        if (!visible) box.querySelector('[data-field="nome"]').focus();
      });
      newForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this._createUser(newForm);
      });
    }

    const senhaForm = box.querySelector('[data-role="senha-form"]');
    const toggleSenha = box.querySelector('[data-action="toggle-senha"]');
    toggleSenha.addEventListener("click", () => {
      const visible = !senhaForm.hidden;
      senhaForm.hidden = visible;
      toggleSenha.setAttribute("aria-expanded", String(!visible));
      toggleSenha.innerHTML = visible ? `${icon("plus")} Trocar minha senha` : `${icon("minus")} Ocultar Formulário`;
      if (!visible) box.querySelector('[data-field="senhaAtual"]').focus();
    });
    senhaForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this._trocarSenha(senhaForm);
    });

    await this._reload();
  }

  async _reload() {
    let usuarios = [];
    try {
      usuarios = await this.api.get("/usuarios");
    } catch {
      // Se não tiver permissão para listar todos (ex: perfil não admin), exibe pelo menos o usuário atual
      usuarios = [this.usuarioAtual];
    }
    const list = this.box.querySelector('[data-role="list"]');
    list.replaceChildren();

    for (const u of usuarios) {
      const isSelf = u.id === this.usuarioAtual.id;
      const papel = u.role === "admin" ? "admin" : (u.role === "consulta" ? "consulta" : "operador");
      const badgeClass = papel === "admin" ? "badge--accent" : (papel === "consulta" ? "badge--neutral" : "badge--info");

      const row = document.createElement("div");
      row.className = "users-list__row";
      row.innerHTML = `
        <div class="users-list__info">
          <div class="users-list__name">
            ${escapeHtml(u.nome)}
            ${isSelf ? '<span class="text-muted">(você)</span>' : ""}
            <span class="badge ${badgeClass} users-list__tag">${rotuloPapel(papel)}</span>
          </div>
          <div class="text-muted users-list__handle">@${escapeHtml(u.usuario)}</div>
          <div class="text-muted users-list__handle" data-role="ultimo-login"></div>
        </div>
      `;
      const ultimoLoginEl = row.querySelector('[data-role="ultimo-login"]');
      if (u.ultimo_login) {
        ultimoLoginEl.textContent = `Último acesso: ${tempoRelativo(u.ultimo_login)}`;
        ultimoLoginEl.title = formatarDataHora(u.ultimo_login);
      } else {
        ultimoLoginEl.textContent = "Nunca acessou";
      }

      if (!isSelf && this.usuarioAtual.role === "admin") {
        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.alignItems = "center";
        actions.style.gap = "8px";

        const roleSelect = document.createElement("select");
        roleSelect.className = "input";
        roleSelect.style.padding = "4px 8px";
        roleSelect.style.fontSize = "0.85rem";
        roleSelect.style.width = "auto";
        roleSelect.innerHTML = `
          <option value="operador"${papel === "operador" ? " selected" : ""}>Operador</option>
          <option value="consulta"${papel === "consulta" ? " selected" : ""}>Consulta</option>
          <option value="admin"${papel === "admin" ? " selected" : ""}>Administrador</option>
        `;
        roleSelect.addEventListener("change", async () => {
          const novoPapel = roleSelect.value;
          try {
            await this.api.put(`/usuarios/${u.id}`, { role: novoPapel });
            toast.success(`Papel de "${u.nome}" alterado para ${rotuloPapel(novoPapel)}.`);
            await this._reload();
          } catch (err) {
            roleSelect.value = papel;
            Modal.alert("Erro", errorMessage(err), "error");
          }
        });
        actions.appendChild(roleSelect);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn--small btn--danger";
        removeBtn.textContent = "Remover";
        removeBtn.addEventListener("click", () => this._removeUser(u, removeBtn));
        actions.appendChild(removeBtn);

        row.appendChild(actions);
      }
      list.appendChild(row);
    }
  }

  async _createUser(form) {
    const nome = this.box.querySelector('[data-field="nome"]').value.trim();
    const usuario = this.box.querySelector('[data-field="usuario"]').value.trim();
    const senha = this.box.querySelector('[data-field="senha"]').value;
    const role = this.box.querySelector('[data-field="role"]')?.value || "operador";
    const botao = form.querySelector('[data-action="create"]');

    const liberar = marcarOcupado(botao);
    try {
      await this.api.post("/usuarios", { nome, usuario, senha, role });
      for (const campo of ["nome", "usuario", "senha"]) this.box.querySelector(`[data-field="${campo}"]`).value = "";
      await this._reload();
      toast.success(`Conta de "${nome}" criada como [${rotuloPapel(role)}].`);
    } catch (err) {
      Modal.alert("Validação", errorMessage(err), "warning");
    } finally {
      liberar();
    }
  }

  async _trocarSenha(form) {
    const senhaAtual = this.box.querySelector('[data-field="senhaAtual"]').value;
    const senhaNova = this.box.querySelector('[data-field="senhaNova"]').value;
    const botao = form.querySelector('[data-action="trocar-senha"]');

    const liberar = marcarOcupado(botao);
    try {
      await this.api.put("/usuarios/me/senha", { senhaAtual, senhaNova });
      for (const campo of ["senhaAtual", "senhaNova"]) this.box.querySelector(`[data-field="${campo}"]`).value = "";
      form.hidden = true;
      this.box.querySelector('[data-action="toggle-senha"]').setAttribute("aria-expanded", "false");
      toast.success("Senha alterada.");
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
