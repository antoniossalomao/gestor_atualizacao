import { ApiError } from "../api/ApiClient.js";
import { Modal } from "../components/Modal.js";
import { toast } from "../components/Toast.js";
import { html } from "../utils/html.js";
import { marcarOcupado } from "../utils/guard.js";

/**
 * Trocar a própria senha. Morava dentro de "Usuários e Permissões", que é da
 * administração: para quem não é admin, era a única coisa que existia na
 * seção "Segurança" das Configurações, escondida atrás de um título que não
 * dizia isso. Agora abre de Configurações > Conta e da paleta (Ctrl+K).
 *
 * A troca derruba as sessões da pessoa nos OUTROS computadores (ver
 * AuthService.changePassword) -- a tela diz isso, porque quem troca a senha
 * por suspeita de acesso indevido quer justamente saber que o outro caiu.
 */
export function abrirTrocaDeSenha(api) {
  const { box, close } = Modal.abrirCaixa({ largura: 420 });
  box.innerHTML = html`
    <h3 class="modal-box__title" id="senha-titulo">Trocar minha senha</h3>
    <p class="modal-box__message">Quem estiver entrado com a sua conta em outro computador é desconectado.</p>
    <form class="form-grid" data-role="form">
      <div class="field field--full">
        <label class="field__label" for="senha-atual">Senha atual</label>
        <input type="password" class="input" id="senha-atual" data-field="senhaAtual" required autocomplete="current-password" />
      </div>
      <div class="field field--full">
        <label class="field__label" for="senha-nova">Senha nova</label>
        <input type="password" class="input" id="senha-nova" data-field="senhaNova" required minlength="8" autocomplete="new-password" />
        <p class="field__help">Pelo menos 8 caracteres.</p>
      </div>
      <div class="modal-box__actions field--full">
        <button type="button" class="btn" data-action="cancelar">Cancelar</button>
        <button type="submit" class="btn btn--accent" data-action="salvar">Trocar senha</button>
      </div>
    </form>`;
  box.setAttribute("aria-labelledby", "senha-titulo");

  const form = box.querySelector('[data-role="form"]');
  box.querySelector('[data-action="cancelar"]').addEventListener("click", () => close());
  box.querySelector('[data-field="senhaAtual"]').focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const senhaAtual = box.querySelector('[data-field="senhaAtual"]').value;
    const senhaNova = box.querySelector('[data-field="senhaNova"]').value;
    const liberar = marcarOcupado(box.querySelector('[data-action="salvar"]'));
    try {
      await api.put("/usuarios/me/senha", { senhaAtual, senhaNova });
      close();
      toast.success("Senha trocada.");
    } catch (err) {
      liberar();
      Modal.alert("Não foi possível trocar a senha", err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.", "warning");
    }
  });
}
