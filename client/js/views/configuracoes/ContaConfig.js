import { ApiError } from "../../api/ApiClient.js";
import { Modal } from "../../components/Modal.js";
import { toast } from "../../components/Toast.js";
import { html } from "../../utils/html.js";
import { iconHtml } from "../../utils/icons.js";
import { marcarOcupado } from "../../utils/guard.js";
import { cabecalhoSecao, tituloCartao } from "../../templates/secao.js";
import { cartaoPerfil, listaSessoes } from "../../templates/configuracoes.js";

const SENHA_MINIMA = 8;

/**
 * Configurações > Conta: quem está logado, a senha e onde a conta está
 * aberta, mais o que se faz com as preferências como um todo (levar para
 * outra máquina, voltar ao padrão).
 *
 * A troca de senha era um modal aberto por um link; aqui é um formulário no
 * próprio cartão, como o resto da tela. A lista de sessões é nova: a troca de
 * senha já derrubava as sessões dos outros aparelhos, mas não havia como
 * VER que aparelhos eram esses -- e "minha conta ficou aberta no computador
 * do balcão?" era uma pergunta sem resposta.
 */
export class ContaConfig {
  /**
   * @param {HTMLElement} container
   * @param {import('../../api/ApiClient').ApiClient} api
   * @param {{
   *   usuario: {id: number, nome: string, usuario: string, role?: string},
   *   navigate: (aba: string, params?: object) => void,
   *   aoMudarNome: (nome: string) => void,
   *   exportar: () => void,
   *   importar: () => void,
   *   restaurarTudo: () => void,
   *   resumoAlteracoes: () => string,
   * }} opcoes
   */
  constructor(container, api, opcoes) {
    this.container = container;
    this.api = api;
    this.opcoes = opcoes;
    // Desenha na hora com o que a sessão já sabe; "membro desde" chega com
    // a resposta do servidor, alguns milissegundos depois.
    this.perfil = { ...opcoes.usuario, criado_em: null };
    this._desenhar();
  }

  _desenhar() {
    const ehAdmin = this.opcoes.usuario.role === "admin";
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Conta",
        descricao: "Quem você é no Gestor, a sua senha e em que aparelhos a sua conta está aberta.",
      })}
      <div class="cfg-cartoes">
        <section class="card secao-card cfg-cartao" data-ajuste="nome">
          ${tituloCartao({ titulo: "Perfil" })}
          <div class="cfg-linhas" data-role="perfil"></div>
        </section>

        <section class="card secao-card cfg-cartao" data-ajuste="senha">
          ${tituloCartao({
            titulo: "Senha",
            descricao: `Pelo menos ${SENHA_MINIMA} caracteres. Trocar a senha desconecta a sua conta em todos os outros aparelhos.`,
          })}
          <form class="cfg-senha" data-role="form-senha" novalidate>
            <div class="cfg-senha__campos">
              <div class="field">
                <label class="field__label" for="cfg-senha-atual">Senha atual</label>
                <input type="password" class="input" id="cfg-senha-atual" data-campo="senhaAtual" autocomplete="current-password" />
              </div>
              <div class="field">
                <label class="field__label" for="cfg-senha-nova">Nova senha</label>
                <input type="password" class="input" id="cfg-senha-nova" data-campo="senhaNova" autocomplete="new-password" />
              </div>
              <div class="field">
                <label class="field__label" for="cfg-senha-repetida">Repita a nova senha</label>
                <input type="password" class="input" id="cfg-senha-repetida" data-campo="senhaRepetida" autocomplete="new-password" />
              </div>
            </div>
            <footer class="admin-form__rodape">
              <span class="admin-form__estado" data-role="estado-senha" aria-live="polite"></span>
              <button type="submit" class="btn btn--accent" data-action="trocar-senha" disabled>Trocar senha</button>
            </footer>
          </form>
        </section>

        <section class="card secao-card cfg-cartao" data-ajuste="sessoes">
          ${tituloCartao({
            titulo: "Onde sua conta está aberta",
            descricao: "Cada navegador em que você entrou e ainda não saiu.",
            acoes: html`<button type="button" class="btn btn--small btn--danger" data-action="encerrar-outras" disabled>
              Encerrar as outras</button>`,
          })}
          <div data-role="sessoes"><p class="cfg-sessoes__resumo">Carregando…</p></div>
        </section>

        <section class="card secao-card cfg-cartao">
          ${tituloCartao({ titulo: "Suas preferências", descricao: "Acompanham a sua conta em qualquer máquina em que você entrar." })}
          <div class="cfg-linhas">
            <div class="cfg-group cfg-linha" data-ajuste="exportar">
              <div class="cfg-group__labels">
                <span class="cfg-group__title">Levar para outra conta</span>
                <span class="cfg-group__help">Um arquivo com todas as suas escolhas, para aplicar em outra conta ou guardar.</span>
              </div>
              <div class="cfg-botoes">
                <button type="button" class="btn btn--small" data-action="exportar">${iconHtml("download")} Exportar</button>
                <button type="button" class="btn btn--small" data-action="importar">${iconHtml("upload")} Importar</button>
              </div>
            </div>
            <div class="cfg-group cfg-linha" data-ajuste="restaurar">
              <div class="cfg-group__labels">
                <span class="cfg-group__title">Voltar ao padrão</span>
                <span class="cfg-group__help" data-role="resumo"></span>
              </div>
              <button type="button" class="btn btn--small btn--danger" data-action="restaurar-tudo">
                ${iconHtml("restaurar")} Restaurar tudo</button>
            </div>
          </div>
        </section>

        ${
          ehAdmin &&
          html`<button type="button" class="card cfg-link cfg-link--cartao" data-action="administracao">
            <span class="cfg-link__icon">${iconHtml("escudo")}</span>
            <span class="cfg-link__labels">
              <strong>Administração da equipe</strong>
              <span>Usuários e papéis, histórico de alterações, regras da equipe, backups e saúde do servidor.</span>
            </span>
            <span class="cfg-link__seta">${iconHtml("seta")}</span>
          </button>`
        }
      </div>`.toString();

    this._pintarPerfil();
    this._ligarSenha();
    this._ligarSessoes();
    this.atualizarResumo();

    const on = (acao, fn) => this.container.querySelector(`[data-action="${acao}"]`)?.addEventListener("click", fn);
    on("exportar", () => this.opcoes.exportar());
    on("importar", () => this.opcoes.importar());
    on("restaurar-tudo", () => this.opcoes.restaurarTudo());
    on("administracao", () => this.opcoes.navigate("administracao"));
  }

  async refresh() {
    // Perfil e sessões a cada vez que a aba aparece: as sessões mudam sozinhas
    // (um login em outro lugar, uma que expirou), e é justamente quando alguém
    // volta a esta aba que quer a lista de agora.
    const [perfil, sessoes] = await Promise.all([
      this.api.get("/usuarios/me").catch(() => null),
      this.api.get("/usuarios/me/sessoes").catch(() => null),
    ]);
    if (perfil && !this._nomeSujo()) {
      this.perfil = perfil;
      this._pintarPerfil();
    }
    this._pintarSessoes(sessoes);
    this.atualizarResumo();
  }

  /** O texto "3 ajustes fora do padrão", que a tela recalcula a cada mudança. */
  atualizarResumo() {
    const alvo = this.container.querySelector('[data-role="resumo"]');
    if (alvo) alvo.textContent = this.opcoes.resumoAlteracoes();
  }

  /** @param {string} id ver SecaoAjustes.destacar */
  destacar(id) {
    const alvo = /** @type {HTMLElement|null} */ (this.container.querySelector(`[data-ajuste="${CSS.escape(id)}"]`));
    if (!alvo) return;
    alvo.scrollIntoView({ block: "center", behavior: "smooth" });
    alvo.classList.remove("is-destacado");
    void alvo.offsetWidth;
    alvo.classList.add("is-destacado");
    /** @type {HTMLElement|null} */ (alvo.querySelector("input, button:not([disabled])"))?.focus({ preventScroll: true });
  }

  // ==========================================================================
  // PERFIL
  // ==========================================================================

  _pintarPerfil() {
    const alvo = /** @type {HTMLElement} */ (this.container.querySelector('[data-role="perfil"]'));
    alvo.innerHTML = cartaoPerfil(this.perfil).toString();
    const form = /** @type {HTMLFormElement} */ (alvo.querySelector('[data-role="form-nome"]'));
    const campo = /** @type {HTMLInputElement} */ (form.querySelector('[data-role="nome"]'));
    const salvar = /** @type {HTMLButtonElement} */ (form.querySelector('[data-action="salvar-nome"]'));
    campo.addEventListener("input", () => {
      salvar.disabled = !this._nomeSujo();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!this._nomeSujo()) return;
      const liberar = marcarOcupado(salvar);
      try {
        this.perfil = await this.api.put("/usuarios/me", { nome: campo.value });
        this._pintarPerfil();
        this.opcoes.aoMudarNome(this.perfil.nome);
        toast.success("Nome atualizado.");
      } catch (err) {
        liberar();
        Modal.alert("Não foi possível trocar o nome", mensagem(err), "warning");
      }
    });
  }

  _nomeSujo() {
    const campo = /** @type {HTMLInputElement|null} */ (this.container.querySelector('[data-role="nome"]'));
    if (!campo) return false;
    const nome = campo.value.trim().replace(/\s+/g, " ");
    return nome.length > 0 && nome !== this.perfil.nome;
  }

  // ==========================================================================
  // SENHA
  // ==========================================================================

  _ligarSenha() {
    const form = /** @type {HTMLFormElement} */ (this.container.querySelector('[data-role="form-senha"]'));
    const estado = /** @type {HTMLElement} */ (form.querySelector('[data-role="estado-senha"]'));
    const botao = /** @type {HTMLButtonElement} */ (form.querySelector('[data-action="trocar-senha"]'));
    const valor = (campo) => /** @type {HTMLInputElement} */ (form.querySelector(`[data-campo="${campo}"]`)).value;

    // A conferência acontece enquanto se digita, e diz O QUE falta -- em vez
    // de deixar o botão cinza sem explicação, ou de só reclamar depois do
    // clique. O servidor confere tudo de novo; isto aqui é só para não fazer
    // a pessoa perder uma ida e volta.
    const conferir = () => {
      const atual = valor("senhaAtual");
      const nova = valor("senhaNova");
      const repetida = valor("senhaRepetida");
      let problema = "";
      if (nova && nova.length < SENHA_MINIMA) problema = `A nova senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`;
      else if (nova && repetida && nova !== repetida) problema = "As duas senhas novas não são iguais.";
      else if (nova && atual && nova === atual) problema = "A nova senha é igual à atual.";
      estado.textContent = problema;
      estado.classList.toggle("is-erro", Boolean(problema));
      botao.disabled = Boolean(problema) || !atual || !nova || !repetida;
    };
    form.addEventListener("input", conferir);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (botao.disabled) return;
      const liberar = marcarOcupado(botao);
      try {
        await this.api.put("/usuarios/me/senha", { senhaAtual: valor("senhaAtual"), senhaNova: valor("senhaNova") });
        form.reset();
        estado.textContent = "";
        toast.success("Senha trocada. A sua conta foi desconectada nos outros aparelhos.");
        this._pintarSessoes(await this.api.get("/usuarios/me/sessoes").catch(() => null));
      } catch (err) {
        estado.textContent = mensagem(err);
        estado.classList.add("is-erro");
        if (/atual/i.test(estado.textContent)) /** @type {HTMLInputElement} */ (form.querySelector('[data-campo="senhaAtual"]')).select();
      } finally {
        liberar();
        botao.disabled = true;
      }
    });
  }

  // ==========================================================================
  // SESSÕES
  // ==========================================================================

  _ligarSessoes() {
    const cartao = /** @type {HTMLElement} */ (this.container.querySelector('[data-ajuste="sessoes"]'));
    cartao.addEventListener("click", async (e) => {
      const alvo = /** @type {HTMLElement} */ (e.target);
      const encerrar = alvo.closest('[data-action="encerrar-sessao"]');
      if (encerrar instanceof HTMLButtonElement) {
        const liberar = marcarOcupado(encerrar);
        try {
          await this.api.delete(`/usuarios/me/sessoes/${encodeURIComponent(encerrar.dataset.id || "")}`);
          toast.success("Sessão encerrada. Aquele aparelho vai pedir login de novo.");
        } catch (err) {
          liberar();
          toast.error(mensagem(err));
        }
        this._pintarSessoes(await this.api.get("/usuarios/me/sessoes").catch(() => null));
        return;
      }
      if (alvo.closest('[data-action="encerrar-outras"]')) this._encerrarOutras();
    });
  }

  async _encerrarOutras() {
    const outras = (this.sessoes || []).filter((s) => !s.atual).length;
    const ok = await Modal.confirm(
      "Encerrar as outras sessões",
      `A sua conta será desconectada em ${outras === 1 ? "1 outro aparelho" : `${outras} outros aparelhos`}. Este continua conectado.\n\nSe você acha que alguém usou a sua conta, troque a senha também.`,
      { confirmLabel: "Encerrar" }
    );
    if (!ok) return;
    try {
      const { encerradas } = await this.api.delete("/usuarios/me/sessoes");
      toast.success(encerradas === 1 ? "1 sessão encerrada." : `${encerradas} sessões encerradas.`);
    } catch (err) {
      toast.error(mensagem(err));
    }
    this._pintarSessoes(await this.api.get("/usuarios/me/sessoes").catch(() => null));
  }

  /** @param {Array<any>|null} sessoes `null` quando a busca falhou */
  _pintarSessoes(sessoes) {
    const alvo = /** @type {HTMLElement} */ (this.container.querySelector('[data-role="sessoes"]'));
    const botao = /** @type {HTMLButtonElement} */ (this.container.querySelector('[data-action="encerrar-outras"]'));
    if (!sessoes) {
      alvo.innerHTML = html`<p class="cfg-sessoes__resumo">Não foi possível carregar as sessões agora.</p>`.toString();
      botao.disabled = true;
      return;
    }
    this.sessoes = sessoes;
    alvo.innerHTML = listaSessoes(sessoes).toString();
    botao.disabled = !sessoes.some((s) => !s.atual);
  }
}

function mensagem(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
