import { ApiError } from "../../api/ApiClient.js";
import { View } from "../../app/View.js";
import { Modal } from "../../components/Modal.js";
import { toast } from "../../components/Toast.js";
import { Drawer } from "../../components/Drawer.js";
import { html } from "../../utils/html.js";
import { iconHtml } from "../../utils/icons.js";
import { marcarOcupado } from "../../utils/guard.js";
import { rotuloPapel } from "../../domain/pessoa.js";
import { cabecalhoSecao } from "../../templates/secao.js";
import { legendaPapeis, linhaUsuario } from "../../templates/administracao.js";

/**
 * Aba Usuários da Administração: quem entra no sistema e com que papel.
 *
 * Mudanças em relação ao modal antigo, e por quê:
 *  - tabela em vez de cartões empilhados, com o papel editável na própria
 *    linha -- mudar o papel de alguém é a tarefa mais comum daqui;
 *  - o que cada papel pode fica escrito ao lado: escolher "Consulta" sem
 *    saber que ela não altera nada é como se escolhia antes;
 *  - "Convidar pessoa" virou "Nova conta": não há convite nenhum, a conta
 *    nasce com a senha que o administrador define;
 *  - "Trocar minha senha" saiu daqui para Configurações > Conta: é da
 *    pessoa, não da administração, e quem não é admin nem entra nesta tela.
 *
 * Rebaixar ou remover alguém derruba as sessões abertas dessa pessoa na hora
 * (AuthService no servidor) -- a tela avisa isso na confirmação.
 */
export class UsuariosAdmin extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Pessoas e permissões",
        descricao: "Quem entra no sistema, papéis de acesso e ações de conta.",
        acoes: html`<button type="button" class="btn btn--accent" data-action="nova">${iconHtml("plus")} Nova conta</button>`,
      })}
      <div class="admin-grade">
        <div class="card secao-card">
          <table class="data-table admin-tabela">
            <thead><tr><th scope="col">Pessoa</th><th scope="col">Papel</th><th scope="col">Último acesso</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
            <tbody data-role="lista"></tbody>
          </table>
        </div>
        <aside class="card secao-card secao-card--lateral">
          <h3 class="card__title">O que cada papel pode</h3>
          ${legendaPapeis()}
        </aside>
      </div>

      <form class="form-grid" data-role="form-nova" novalidate>
        <div class="field field--full"><label class="field__label" for="u-nome">Nome</label>
          <input type="text" class="input" id="u-nome" data-field="nome" required autocomplete="off" /></div>
        <div class="field"><label class="field__label" for="u-usuario">Usuário (para entrar)</label>
          <input type="text" class="input" id="u-usuario" data-field="usuario" required autocomplete="off" spellcheck="false" /></div>
        <div class="field"><label class="field__label" for="u-senha">Senha inicial</label>
          <input type="password" class="input" id="u-senha" data-field="senha" required autocomplete="new-password" minlength="8" />
          <p class="field__help">Pelo menos 8 caracteres. A pessoa pode trocar depois, em Configurações.</p></div>
        <div class="field field--full"><label class="field__label" for="u-role">Papel</label>
          <select class="input" id="u-role" data-field="role">
            <option value="operador" selected>${rotuloPapel("operador")}</option>
            <option value="consulta">${rotuloPapel("consulta")}</option>
            <option value="admin">${rotuloPapel("admin")}</option>
          </select></div>
        <div class="form-actions field--full">
          <button type="submit" class="btn btn--accent" data-action="criar">Criar conta</button>
        </div>
      </form>`;

    this.lista = this.container.querySelector('[data-role="lista"]');
    this.form = this.container.querySelector('[data-role="form-nova"]');
    this.drawer = new Drawer(this.form, { titulo: "Nova conta", descricao: "A pessoa entra com o usuário e a senha definidos aqui." });

    this.container.querySelector('[data-action="nova"]').addEventListener("click", () => {
      this.form.reset();
      this.drawer.marcarLimpa();
      this.drawer.abrir({ foco: this.form.querySelector('[data-field="nome"]') });
    });
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this._criar();
    });
    this.lista.addEventListener("change", (e) => {
      const select = e.target.closest('[data-action="papel"]');
      if (select) this._mudarPapel(select);
    });
    this.lista.addEventListener("click", (e) => {
      const botao = e.target.closest('[data-action="remover"]');
      if (botao) this._remover(botao);
    });
  }

  async refresh() {
    try {
      this.usuarios = await this.api.get("/usuarios");
    } catch (err) {
      if (err?.cancelled) return;
      toast.error(mensagem(err));
      return;
    }
    this._desenhar();
  }

  _desenhar() {
    this.lista.replaceChildren(
      ...this.usuarios.map((u) => {
        const tr = document.createElement("tr");
        tr.className = "is-readonly";
        tr.innerHTML = linhaUsuario(u, { ehVoce: u.id === this.user?.id });
        return tr;
      })
    );
  }

  async _criar() {
    const campo = (nome) => this.form.querySelector(`[data-field="${nome}"]`);
    const dados = {
      nome: campo("nome").value.trim(),
      usuario: campo("usuario").value.trim(),
      senha: campo("senha").value,
      role: campo("role").value,
    };
    const liberar = marcarOcupado(this.form.querySelector('[data-action="criar"]'));
    try {
      await this.api.post("/usuarios", dados);
      this.drawer.marcarLimpa();
      await this.drawer.fechar({ forcar: true });
      toast.success(`Conta de "${dados.nome}" criada como ${rotuloPapel(dados.role)}.`);
      await this.refresh();
    } catch (err) {
      Modal.alert("Não foi possível criar a conta", mensagem(err), "warning");
    } finally {
      liberar();
    }
  }

  async _mudarPapel(select) {
    const u = this.usuarios.find((x) => String(x.id) === select.dataset.id);
    if (!u) return;
    const novo = select.value;
    const rebaixando = u.role === "admin" && novo !== "admin";
    if (rebaixando) {
      const ok = await Modal.confirm(
        "Tirar o papel de administrador",
        `"${u.nome}" deixa de ser administrador e é desconectado na hora de todos os computadores em que estiver usando o sistema.`,
        { confirmLabel: "Tirar papel" }
      );
      if (!ok) {
        select.value = u.role;
        return;
      }
    }
    select.disabled = true;
    try {
      await this.api.put(`/usuarios/${u.id}`, { role: novo });
      toast.success(`"${u.nome}" agora é ${rotuloPapel(novo)}. Ele precisa entrar de novo para valer.`);
      await this.refresh();
    } catch (err) {
      select.value = u.role;
      select.disabled = false;
      Modal.alert("Não foi possível mudar o papel", mensagem(err), "error");
    }
  }

  async _remover(botao) {
    const u = this.usuarios.find((x) => String(x.id) === botao.dataset.id);
    if (!u) return;
    const ok = await Modal.confirm(
      "Remover acesso",
      `"${u.nome}" (@${u.usuario}) perde o acesso e é desconectado na hora. O que ele fez continua no Histórico.`,
      { confirmLabel: "Remover acesso" }
    );
    if (!ok) return;
    const liberar = marcarOcupado(botao);
    try {
      await this.api.delete(`/usuarios/${u.id}`);
      toast.success(`Acesso de "${u.nome}" removido.`);
      await this.refresh();
    } catch (err) {
      liberar();
      Modal.alert("Não foi possível remover", mensagem(err), "error");
    }
  }

  destroy() {
    this.drawer?.destroy();
    super.destroy();
  }
}

function mensagem(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
