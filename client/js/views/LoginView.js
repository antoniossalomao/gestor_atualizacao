import { ApiError } from "../api/ApiClient.js";
import { marcarOcupado } from "../utils/guard.js";
import { icon, simboloMarca } from "../utils/icons.js";

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
      <div class="auth-screen__brand-mark">${simboloMarca()}</div>
      <strong class="auth-screen__brand-name">Gestor de Atualizações</strong>
      <p class="auth-screen__brand-tagline">Bredas Sistemas · Atualizações dos clientes, num só lugar.</p>
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
      <div class="auth-card__logo">${simboloMarca()}</div>
      <h2>${isSetup ? "Criar conta de administrador" : "Entrar"}</h2>
      <p class="auth-card__subtitle">${
        isSetup
          ? "Esta é a primeira vez que o sistema é aberto. Crie a conta principal para começar a usar."
          : "Gestor de Atualizações"
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
          <!--
            O olho de "mostrar senha" não é enfeite: a senha é digitada às
            cegas, e quando ela é longa (ou o teclado é de notebook, com o
            número em cima da letra) o erro mais comum não é esquecer a senha,
            é digitá-la errado duas vezes seguidas sem nunca ver o que saiu.
          -->
          <div class="input-com-acao">
            <input class="input" type="password" name="senha" required
                   autocomplete="${isSetup ? "new-password" : "current-password"}" />
            <button type="button" class="input-acao" data-action="ver-senha"
                    aria-label="Mostrar a senha" aria-pressed="false" title="Mostrar a senha">${icon("olho")}</button>
          </div>
          <!--
            Caps Lock ligado é a causa silenciosa de metade dos "minha senha
            parou de funcionar": a senha some atrás das bolinhas, e a tecla que
            a estragou fica acesa num canto do teclado que ninguém olha.
          -->
          <p class="field__aviso" data-role="capslock" hidden>Caps Lock está ligado.</p>
        </div>
        <button type="submit" class="btn btn--accent">${isSetup ? "Criar conta e entrar" : "Entrar"}</button>
      </form>
    `;
    screen.appendChild(card);
    this.root.appendChild(screen);

    this.errorBox = card.querySelector(".auth-card__error");
    card.querySelector("form").addEventListener("submit", (e) => this._onSubmit(e));
    this._ligarSenha(card);
    card.querySelector('input[name="usuario"]').focus();
  }

  /**
   * Mostrar/esconder a senha e avisar sobre o Caps Lock.
   *
   * O aviso escuta `keyup` além de `keydown` porque o próprio pressionar da
   * tecla Caps Lock só muda o estado DEPOIS de ela subir: sem o `keyup`, o
   * aviso aparece um caractere atrasado -- ou seja, some justamente quando a
   * pessoa desliga a tecla para consertar o problema.
   */
  _ligarSenha(card) {
    const campo = card.querySelector('input[name="senha"]');
    const botao = card.querySelector('[data-action="ver-senha"]');
    const aviso = card.querySelector('[data-role="capslock"]');

    botao.addEventListener("click", () => {
      const mostrando = campo.type === "text";
      campo.type = mostrando ? "password" : "text";
      botao.innerHTML = icon(mostrando ? "olho" : "olhoRiscado");
      botao.setAttribute("aria-pressed", String(!mostrando));
      const rotulo = mostrando ? "Mostrar a senha" : "Esconder a senha";
      botao.setAttribute("aria-label", rotulo);
      botao.title = rotulo;
      // O foco volta para o campo, na mesma posição: quem clicou no olho está
      // no meio da digitação, e sair do campo obrigaria a clicar de volta.
      campo.focus();
    });

    const conferirCaps = (e) => {
      if (typeof e.getModifierState !== "function") return;
      aviso.hidden = !e.getModifierState("CapsLock");
    };
    campo.addEventListener("keydown", conferirCaps);
    campo.addEventListener("keyup", conferirCaps);
    // Sair do campo esconde o aviso: ele fala do que está sendo digitado ali,
    // e continuar na tela depois disso viraria um alerta sem dono.
    campo.addEventListener("blur", () => {
      aviso.hidden = true;
    });
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
