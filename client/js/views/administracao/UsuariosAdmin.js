import { mensagemDeErro as mensagem } from "../../api/ApiPainel.js";
import { View } from "../../app/View.js";
import { Modal } from "../../components/Modal.js";
import { avisoRapido } from "../../components/AvisosRapidos.js";
import { Gaveta } from "../../components/Gaveta.js";
import { html } from "../../utils/html.js";
import { iconeHtml } from "../../utils/icones.js";
import { marcarOcupado } from "../../components/botaoOcupado.js";
import { rotuloPapel } from "../../domain/pessoa.js";
import { cabecalhoSecao, tituloCartao } from "../../templates/secao.js";
import { legendaPapeis, linhaUsuario, resumoPapeis } from "../../templates/administracao.js";
import { contarPapeis } from "../../domain/administracao.js";
import { filtrarPorBusca } from "../../utils/busca.js";

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
    this._montarDom();
  }

  _montarDom() {
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Pessoas e permissões",
        descricao: "Quem entra no sistema, papéis de acesso e ações de conta.",
        acoes: html`<button type="button" class="btn btn--accent" data-action="nova">${iconeHtml("plus")} Nova conta</button>`,
      })}
      <div class="admin-grade">
        <div class="admin-pessoas">
          <div class="admin-pessoas__barra">
            <div data-role="resumo"></div>
            <label class="cfg-busca admin-pessoas__busca">
              <span class="cfg-busca__icone" aria-hidden="true">${iconeHtml("busca")}</span>
              <input type="search" class="input" data-role="busca-pessoas" placeholder="Buscar por nome ou usuário…"
                     aria-label="Buscar pessoa" autocomplete="off" spellcheck="false" />
            </label>
          </div>
        <div class="card secao-card">
          <table class="data-table admin-tabela">
            <thead><tr><th scope="col">Pessoa</th><th scope="col">Papel</th><th scope="col">Último acesso</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
            <tbody data-role="lista"></tbody>
          </table>
          <p class="admin-pessoas__vazio text-muted" data-role="vazio" hidden></p>
        </div>
        </div>
        <aside class="card secao-card secao-card--lateral">
          ${tituloCartao({ titulo: "O que cada papel pode" })}
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
    this.busca = /** @type {HTMLInputElement} */ (this.container.querySelector('[data-role="busca-pessoas"]'));
    this.busca.addEventListener("input", () => this._desenhar());
    this.busca.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.busca.value) {
        e.stopPropagation();
        this.busca.value = "";
        this._desenhar();
      }
    });
    this.form = this.container.querySelector('[data-role="form-nova"]');
    this.drawer = new Gaveta(this.form, { titulo: "Nova conta", descricao: "A pessoa entra com o usuário e a senha definidos aqui." });

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
      avisoRapido.erro(mensagem(err));
      return;
    }
    this._desenhar();
  }

  _desenhar() {
    this.container.querySelector('[data-role="resumo"]').innerHTML = resumoPapeis(contarPapeis(this.usuarios)).toString();
    const termo = this.busca.value.trim();
    const visiveis = termo
      ? filtrarPorBusca(this.usuarios, termo, (u) => ({ titulo: u.nome || "", resto: `${u.usuario} ${rotuloPapel(u.role)}` }))
      : this.usuarios;
    const vazio = /** @type {HTMLElement} */ (this.container.querySelector('[data-role="vazio"]'));
    vazio.hidden = visiveis.length > 0;
    vazio.textContent = visiveis.length > 0 ? "" : `Ninguém com "${termo}" no nome ou no usuário.`;
    this.lista.replaceChildren(
      ...visiveis.map((u) => {
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
      avisoRapido.sucesso(`Conta de "${dados.nome}" criada como ${rotuloPapel(dados.role)}.`);
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
      avisoRapido.sucesso(`"${u.nome}" agora é ${rotuloPapel(novo)}. Ele precisa entrar de novo para valer.`);
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
      avisoRapido.sucesso(`Acesso de "${u.nome}" removido.`);
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

