import { ApiError } from "../api/ApiClient.js";
import { marcarOcupado } from "../core/guard.js";
import { icon } from "../core/icons.js";

/**
 * Tela cheia de autenticação -- funciona em dois modos:
 *  - "setup": mostrada quando ainda não existe nenhuma conta (primeira vez
 *    que o servidor sobe); cria a conta de administrador.
 *  - "login": tela normal de login, para todas as vezes depois disso.
 *
 * Não existia equivalente no app Python original (uso individual, sem
 * conceito de conta) -- é a peça nova exigida pelo modo "servidor com
 * vários usuários" combinado com o pedido do usuário.
 */
export class LoginView {
  /**
   * @param {HTMLElement} root
   * @param {import('../api/ApiClient').ApiClient} api
   * @param {"setup"|"login"} mode
   * @param {(user: {id:number, nome:string, usuario:string}) => void} onSuccess
   */
  constructor(root, api, mode, onSuccess) {
    this.root = root;
    this.api = api;
    this.mode = mode;
    this.onSuccess = onSuccess;
    this._render();
  }

  _render() {
    const isSetup = this.mode === "setup";
    this.root.innerHTML = "";

    const screen = document.createElement("div");
    screen.className = "auth-screen";

    // Só aparece em telas largas (ver o media query em components.css) --
    // reaproveita os mesmos três nomes de aba do resto do app (Clientes,
    // Atualizações, Distribuição), então não é propaganda inventada, é o que
    // o sistema de fato faz.
    const brand = document.createElement("div");
    brand.className = "auth-screen__brand";
    brand.innerHTML = `
      <div class="auth-screen__brand-mark"><img src="/assets/logo.png" alt="" width="48" height="48" /></div>
      <strong class="auth-screen__brand-name">ATUALIZADOR</strong>
      <p class="auth-screen__brand-tagline">Gestor de atualizações de clientes, num só lugar.</p>
      <ul class="auth-screen__brand-list">
        <li>${icon("clientes")} Cadastro de clientes e sistemas</li>
        <li>${icon("atualizacoes")} Histórico de atualizações</li>
        <li>${icon("distribuicao")} Distribuição automática de versões</li>
      </ul>
    `;
    screen.appendChild(brand);

    const card = document.createElement("div");
    card.className = "auth-card";
    card.innerHTML = `
      <!-- O mesmo logo da barra lateral. Era um "GA" digitado à mão, então a
           primeira tela do sistema (a única que quem chega de fora sempre vê)
           era justamente a que não mostrava a marca que o resto do app usa. -->
      <div class="auth-card__logo"><img src="/assets/logo.png" alt="" width="44" height="44" /></div>
      <h2>${isSetup ? "Criar conta de administrador" : "Entrar"}</h2>
      <p class="auth-card__subtitle">${
        isSetup
          ? "Esta é a primeira vez que o sistema é aberto. Crie a conta principal para começar a usar."
          : "Gestor de Atualizações de Clientes"
      }</p>
      <div class="auth-card__error"></div>
      <form>
        ${isSetup ? `<div class="field"><label class="field__label">Seu nome</label><input class="input" type="text" name="nome" required autocomplete="name" /></div>` : ""}
        <div class="field">
          <label class="field__label">Usuário</label>
          <input class="input" type="text" name="usuario" required autocomplete="username" />
        </div>
        <div class="field">
          <label class="field__label">Senha</label>
          <input class="input" type="password" name="senha" required autocomplete="${isSetup ? "new-password" : "current-password"}" />
        </div>
        <button type="submit" class="btn btn--accent">${isSetup ? "Criar conta e entrar" : "Entrar"}</button>
      </form>
    `;
    screen.appendChild(card);
    this.root.appendChild(screen);

    this.errorBox = card.querySelector(".auth-card__error");
    card.querySelector("form").addEventListener("submit", (e) => this._onSubmit(e));
    card.querySelector('input[name="usuario"]').focus();
  }

  async _onSubmit(event) {
    event.preventDefault();
    this._hideError();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const submitBtn = form.querySelector('button[type="submit"]');
    // Spinner em vez de só desabilitar: o login é a primeira coisa que a
    // pessoa faz no app, e um botão que apenas fica cinza por dois segundos
    // se parece com "não funcionou".
    const liberar = marcarOcupado(submitBtn);
    try {
      const path = this.mode === "setup" ? "/auth/setup" : "/auth/login";
      const { user } = await this.api.post(path, data);
      this.onSuccess(user);
    } catch (err) {
      this._showError(err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.");
      // O foco volta para a senha: é o campo que quase sempre precisa mudar,
      // e sem isso a pessoa tem que pegar o mouse depois de cada erro.
      form.querySelector('input[name="senha"]').select();
    } finally {
      liberar();
    }
  }

  _showError(message) {
    this.errorBox.textContent = message;
    this.errorBox.classList.add("is-visible");
  }

  _hideError() {
    this.errorBox.classList.remove("is-visible");
  }
}
