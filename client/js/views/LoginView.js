import { ErroApi } from "../api/ApiPainel.js";
import { marcarOcupado } from "../components/botaoOcupado.js";
import { iconeSvg, simboloMarca } from "../utils/icones.js";

/**
 * Tela cheia de autenticação -- funciona em dois modos:
 *  - "setup": mostrada quando ainda não existe nenhuma conta (primeira vez
 *    que o servidor sobe); cria a conta de administrador.
 *  - "login": tela normal de login, para todas as vezes depois disso.
 */
export class LoginView {
  /**
   * @param {HTMLElement} root
   * @param {import('../api/ApiPainel').ApiPainel} api
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
      <div class="auth-screen__brand-mark" aria-hidden="true">${simboloMarca()}</div>
      <strong class="auth-screen__brand-name">Gestor de Atualizações</strong>
      <p class="auth-screen__brand-tagline">Bredas Sistemas · Atualizações dos clientes, num só lugar.</p>
      <ul class="auth-screen__brand-list">
        <li>${iconeSvg("clientes")} Cadastro de clientes e sistemas</li>
        <li>${iconeSvg("atualizacoes")} Histórico de atualizações</li>
        <li>${iconeSvg("distribuicao")} Distribuição automática de versões</li>
      </ul>
    `;
    screen.appendChild(brand);

    const card = document.createElement("div");
    card.className = "auth-card";
    card.innerHTML = `
      <!-- O mesmo logo da barra lateral. Era um "GA" digitado à mão, então a
           primeira tela do sistema (a única que quem chega de fora sempre vê)
           era justamente a que não mostrava a marca que o resto do app usa. -->
      <!-- No celular o painel de marca some, e esta linha é o que diz que
           sistema é este; em tela larga ela some e o painel fala por ela. -->
      <div class="auth-card__marca">
        <span class="auth-card__logo" aria-hidden="true">${simboloMarca()}</span>
        <span class="auth-card__marca-nome">Gestor de Atualizações</span>
      </div>
      <h2>${isSetup ? "Criar conta de administrador" : "Entrar"}</h2>
      <p class="auth-card__subtitle">${
        isSetup
          ? "Esta é a primeira vez que o sistema é aberto. Crie a conta principal para começar a usar."
          : "Use o seu usuário e a senha da equipe."
      }</p>
      <div class="auth-card__error" role="alert" id="login-erro"></div>
      <form>
        ${isSetup ? `<div class="field"><label class="field__label" for="login-nome">Seu nome</label><input class="input" type="text" id="login-nome" name="nome" required autocomplete="name" /></div>` : ""}
        <div class="field">
          <!-- for/id: sem eles, o leitor de tela anunciava só "caixa de texto"
               nos três campos (achado pelo teste de navegador). -->
          <label class="field__label" for="login-usuario">Usuário</label>
          <input class="input" type="text" id="login-usuario" name="usuario" required autocomplete="username" />
        </div>
        <div class="field">
          <label class="field__label" for="login-senha">Senha</label>
          <!--
            O olho de "mostrar senha" não é enfeite: a senha é digitada às
            cegas, e quando ela é longa (ou o teclado é de notebook, com o
            número em cima da letra) o erro mais comum não é esquecer a senha,
            é digitá-la errado duas vezes seguidas sem nunca ver o que saiu.
          -->
          <div class="input-com-acao">
            <input class="input" type="password" id="login-senha" name="senha" required
                   autocomplete="${isSetup ? "new-password" : "current-password"}" />
            <button type="button" class="input-acao" data-action="ver-senha"
                    aria-label="Mostrar a senha" aria-pressed="false" title="Mostrar a senha">${iconeSvg("olho")}</button>
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
    card.querySelector("form").addEventListener("submit", (e) => this._aoEnviar(e));
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
      botao.innerHTML = iconeSvg(mostrando ? "olho" : "olhoRiscado");
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

  async _aoEnviar(event) {
    event.preventDefault();
    this._esconderErro();
    const form = event.currentTarget;
    const dados = Object.fromEntries(new FormData(form).entries());
    const submitBtn = form.querySelector('button[type="submit"]');
    // Spinner em vez de só desabilitar: o login é a primeira coisa que a
    // pessoa faz no app, e um botão que apenas fica cinza por dois segundos
    // se parece com "não funcionou".
    const liberar = marcarOcupado(submitBtn);
    // O spinner sozinho num botão largo dizia pouco; com o texto fica claro
    // que o clique foi aceito, e os campos travam para ninguém editar o que
    // já foi enviado (readOnly, e não disabled, para o foco não se perder).
    submitBtn.append(this.mode === "setup" ? " Criando a conta…" : " Entrando…");
    const campos = [...form.querySelectorAll("input")];
    for (const campo of campos) campo.readOnly = true;
    form.setAttribute("aria-busy", "true");
    try {
      const path = this.mode === "setup" ? "/auth/setup" : "/auth/login";
      const { user } = await this.api.post(path, dados);
      this.onSuccess(user);
    } catch (err) {
      this._mostrarErro(err instanceof ErroApi ? err.message : "Não foi possível conectar ao servidor.");
      // O foco volta para a senha: é o campo que quase sempre precisa mudar,
      // e sem isso a pessoa tem que pegar o mouse depois de cada erro.
      form.querySelector('input[name="senha"]').select();
    } finally {
      for (const campo of campos) campo.readOnly = false;
      form.removeAttribute("aria-busy");
      liberar();
    }
  }

  /**
   * O erro também marca os campos (borda vermelha, `aria-invalid` e o texto
   * ligado por `aria-describedby`): quem volta ao campo com o leitor de tela
   * ouve de novo por que o login falhou, e a marca some assim que a pessoa
   * começa a corrigir.
   */
  _mostrarErro(message) {
    this.errorBox.textContent = message;
    this.errorBox.classList.add("is-visible");
    for (const campo of this._camposDeEntrada()) {
      campo.setAttribute("aria-invalid", "true");
      campo.setAttribute("aria-describedby", "login-erro");
      campo.addEventListener("input", () => this._esconderErro(), { once: true });
    }
  }

  _esconderErro() {
    this.errorBox.classList.remove("is-visible");
    for (const campo of this._camposDeEntrada()) {
      campo.removeAttribute("aria-invalid");
      campo.removeAttribute("aria-describedby");
    }
  }

  _camposDeEntrada() {
    return this.root.querySelectorAll('.auth-card input[name="usuario"], .auth-card input[name="senha"]');
  }
}
