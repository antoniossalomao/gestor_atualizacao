import { ApiError } from "../api/ApiClient.js";
import { Modal } from "../core/Modal.js";
import { toast } from "../core/Toast.js";
import { icon } from "../core/icons.js";
import { escapeHtml, copyToClipboard } from "../core/html.js";
import { marcarOcupado } from "../core/guard.js";
import { emptyState } from "../core/EmptyState.js";

/**
 * Janela flutuante com os acessos remotos (AnyDesk / Suporte Bredas) das
 * máquinas de UM cliente, aberta pelo botão "Acessos" da aba Clientes (ver
 * ClientesView) com o cliente já selecionado na tabela. Mesmo padrão de
 * `Modal.abrirCaixa` usado por UsersPanel/BackupsPanel -- uma janela por
 * cima da tela, não uma aba fixa.
 */
export class AcessosModal {
  /** @param {import('../api/ApiClient').ApiClient} api @param {{id:number, nome:string}} cliente */
  constructor(api, cliente) {
    this.api = api;
    this.cliente = cliente;
    this.editingId = null;
  }

  async open() {
    const { box, close } = Modal.abrirCaixa({ largura: 560 });
    this.box = box;
    this.close = close;

    box.innerHTML = `
      <h3 class="modal-box__title" id="acessos-titulo">Acessos — ${escapeHtml(this.cliente.nome)}</h3>
      <p class="modal-box__message">AnyDesk e Suporte Bredas de cada máquina deste cliente.</p>
      <div class="users-list" data-role="list"></div>
      <button type="button" class="btn btn--small" data-action="toggle-form" aria-expanded="false" aria-controls="nova-maquina">
        ${icon("plus")} Nova Máquina
      </button>
      <form class="users-new" id="nova-maquina" data-role="form" hidden>
        <div class="form-grid form-grid--2">
          <div class="field"><label class="field__label" for="ac-maquina">Máquina</label><input type="text" class="input" id="ac-maquina" data-field="maquina" placeholder="ex.: Servidor" required /></div>
          <div class="field"><label class="field__label" for="ac-anydesk">AnyDesk</label><input type="text" class="input" id="ac-anydesk" data-field="anydesk" placeholder="ex.: 219 871 787" /></div>
          <div class="field"><label class="field__label" for="ac-suporte">Suporte Bredas</label><input type="text" class="input" id="ac-suporte" data-field="suporteBredas" placeholder="ex.: 40 727 813" /></div>
          <div class="field"><label class="field__label" for="ac-obs">Observações</label><input type="text" class="input" id="ac-obs" data-field="observacoes" /></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn--accent" data-action="salvar">Adicionar Máquina</button>
          <button type="button" class="btn btn--ghost" data-action="cancelar-edicao" hidden>Cancelar edição</button>
        </div>
      </form>
      <div class="modal-box__actions">
        <button type="button" class="btn" data-action="close">Fechar</button>
      </div>
    `;
    box.setAttribute("aria-labelledby", "acessos-titulo");

    box.querySelector('[data-action="close"]').addEventListener("click", () => close());

    this.list = box.querySelector('[data-role="list"]');
    this.form = box.querySelector('[data-role="form"]');
    this.toggleBtn = box.querySelector('[data-action="toggle-form"]');
    this.salvarBtn = this.form.querySelector('[data-action="salvar"]');
    this.cancelarEdicaoBtn = this.form.querySelector('[data-action="cancelar-edicao"]');
    this.fields = {
      maquina: this.form.querySelector('[data-field="maquina"]'),
      anydesk: this.form.querySelector('[data-field="anydesk"]'),
      suporteBredas: this.form.querySelector('[data-field="suporteBredas"]'),
      observacoes: this.form.querySelector('[data-field="observacoes"]'),
    };

    this.toggleBtn.addEventListener("click", () => {
      const visible = !this.form.hidden;
      if (visible) this._resetForm();
      else this._toggleForm(true);
    });
    this.cancelarEdicaoBtn.addEventListener("click", () => this._resetForm());
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this._submit();
    });

    await this._reload();
  }

  async _reload() {
    const acessos = await this.api.get(`/clientes/${this.cliente.id}/acessos`);
    const list = this.box.querySelector('[data-role="list"]');
    list.replaceChildren();

    if (acessos.length === 0) {
      list.appendChild(
        emptyState({
          titulo: "Nenhuma máquina cadastrada",
          descricao: "Use o formulário abaixo para adicionar a primeira.",
          icone: "acessos",
        })
      );
    }

    for (const a of acessos) {
      const row = document.createElement("div");
      row.className = "users-list__row";
      row.dataset.id = String(a.id);
      row.classList.toggle("is-editing", a.id === this.editingId);

      const info = document.createElement("div");
      info.className = "users-list__info";
      const nome = document.createElement("div");
      nome.className = "users-list__name";
      nome.textContent = a.maquina;
      info.appendChild(nome);

      if (a.anydesk) info.appendChild(this._linhaComCopiar("AnyDesk", a.anydesk));
      if (a.suporteBredas) info.appendChild(this._linhaComCopiar("Suporte Bredas", a.suporteBredas));
      if (a.observacoes) {
        const obs = document.createElement("div");
        obs.className = "text-muted users-list__handle";
        obs.textContent = a.observacoes;
        info.appendChild(obs);
      }
      row.appendChild(info);

      const acoes = document.createElement("div");
      acoes.className = "form-actions";
      const editar = document.createElement("button");
      editar.type = "button";
      editar.className = "btn btn--small btn--ghost";
      editar.textContent = "Editar";
      editar.addEventListener("click", () => this._editar(a));
      const remover = document.createElement("button");
      remover.type = "button";
      remover.className = "btn btn--small btn--danger";
      remover.textContent = "Remover";
      remover.addEventListener("click", () => this._remover(a, remover));
      acoes.append(editar, remover);
      row.appendChild(acoes);

      list.appendChild(row);
    }
  }

  /** Uma linha "Rótulo: valor" com um botão de copiar ao lado -- evita ter que selecionar o texto na mão pra colar no AnyDesk/SuporteBredas. */
  _linhaComCopiar(rotulo, valor) {
    const linha = document.createElement("div");
    linha.className = "text-muted users-list__handle acesso-linha";

    const texto = document.createElement("span");
    texto.textContent = `${rotulo}: ${valor}`;
    linha.appendChild(texto);

    const copiar = document.createElement("button");
    copiar.type = "button";
    copiar.className = "btn btn--small btn--ghost acesso-linha__copiar";
    copiar.innerHTML = icon("copiar");
    copiar.setAttribute("aria-label", `Copiar ${rotulo}`);
    copiar.title = `Copiar ${rotulo}`;
    copiar.addEventListener("click", async () => {
      const ok = await copyToClipboard(valor);
      toast[ok ? "success" : "error"](ok ? `${rotulo} copiado.` : "Não foi possível copiar.");
    });
    linha.appendChild(copiar);

    return linha;
  }

  _toggleForm(visivel) {
    this.form.hidden = !visivel;
    this.toggleBtn.setAttribute("aria-expanded", String(visivel));
    if (visivel) this.fields.maquina.focus();
  }

  _editar(acesso) {
    this.editingId = acesso.id;
    this.fields.maquina.value = acesso.maquina;
    this.fields.anydesk.value = acesso.anydesk || "";
    this.fields.suporteBredas.value = acesso.suporteBredas || "";
    this.fields.observacoes.value = acesso.observacoes || "";
    this.salvarBtn.textContent = "Salvar Máquina";
    this.cancelarEdicaoBtn.hidden = false;
    this.toggleBtn.textContent = "";
    this.toggleBtn.innerHTML = `${icon("minus")} Nova Máquina`;
    this._toggleForm(true);
    this._marcarEdicao();
  }

  /** Acende a linha da lista que corresponde ao `editingId` atual (ou apaga todas, se nenhum). */
  _marcarEdicao() {
    for (const row of this.list.children) {
      row.classList.toggle("is-editing", row.dataset.id === String(this.editingId));
    }
  }

  _resetForm() {
    this.editingId = null;
    for (const input of Object.values(this.fields)) input.value = "";
    this.salvarBtn.textContent = "Adicionar Máquina";
    this.cancelarEdicaoBtn.hidden = true;
    this.toggleBtn.innerHTML = `${icon("plus")} Nova Máquina`;
    this._toggleForm(false);
    this._marcarEdicao();
  }

  async _submit() {
    const maquina = this.fields.maquina.value.trim();
    if (!maquina) {
      Modal.alert("Validação", "Campo 'Máquina' é obrigatório.", "warning");
      this.fields.maquina.focus();
      return;
    }
    const data = {
      maquina,
      anydesk: this.fields.anydesk.value.trim(),
      suporteBredas: this.fields.suporteBredas.value.trim(),
      observacoes: this.fields.observacoes.value.trim(),
    };

    const liberar = marcarOcupado(this.salvarBtn);
    try {
      if (this.editingId == null) {
        await this.api.post(`/clientes/${this.cliente.id}/acessos`, data);
        toast.success(`Máquina "${maquina}" adicionada.`);
      } else {
        await this.api.put(`/clientes/acessos/${this.editingId}`, data);
        toast.success(`Máquina "${maquina}" atualizada.`);
      }
      this._resetForm();
      await this._reload();
    } catch (err) {
      Modal.alert("Validação", errorMessage(err), "warning");
    } finally {
      liberar();
    }
  }

  async _remover(acesso, botao) {
    const ok = await Modal.confirm(
      "Remover máquina",
      `Remover os acessos de "${acesso.maquina}"?`,
      { confirmLabel: "Remover" }
    );
    if (!ok) return;

    const liberar = marcarOcupado(botao);
    try {
      await this.api.delete(`/clientes/acessos/${acesso.id}`);
      await this._reload();
      toast.success(`Máquina "${acesso.maquina}" removida.`);
    } catch (err) {
      liberar();
      Modal.alert("Erro", errorMessage(err), "error");
    }
  }
}

function errorMessage(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
