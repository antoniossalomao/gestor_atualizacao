import { View } from "../../app/View.js";
import { Modal } from "../../components/Modal.js";
import { toast } from "../../components/Toast.js";
import { emptyState } from "../../components/EmptyState.js";
import { html } from "../../utils/html.js";
import { iconHtml } from "../../utils/icons.js";
import { marcarOcupado } from "../../utils/guard.js";
import { cabecalhoSecao } from "../../templates/secao.js";
import { linhaBackup } from "../../templates/administracao.js";
import { mensagem } from "./FormularioRegras.js";

/**
 * Aba Backups: as cópias automáticas do banco, para baixar ou restaurar.
 *
 * A restauração continua exigindo a palavra RESTAURAR e a senha do
 * administrador (conferida de novo no servidor), e o servidor tira uma cópia
 * do estado atual antes de trocar o banco. O que mudou: cada cópia tem o seu
 * próprio botão na linha, em vez de "selecionar na lista e depois apertar
 * Restaurar Selecionado" -- dois passos em que o segundo agia sobre uma
 * seleção que nem sempre era a que a pessoa achava.
 */
export class BackupsAdmin extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Backups",
        descricao: "Uma cópia do banco é feita toda vez que o servidor liga. Quantas guardar é uma das Regras da equipe.",
        acoes: html`<a class="btn" href="/api/backups/atual/download" download>${iconHtml("download")} Baixar o banco de agora</a>`,
      })}
      <div class="card secao-card" data-role="conteudo"></div>`;
    this.conteudo = this.container.querySelector('[data-role="conteudo"]');
    this.conteudo.addEventListener("click", (e) => {
      const botao = e.target.closest('[data-action="restaurar"]');
      if (botao) this._confirmar(botao.dataset.arquivo);
    });
  }

  async refresh() {
    try {
      this.backups = await this.api.get("/backups");
    } catch (err) {
      if (err?.cancelled) return;
      toast.error(mensagem(err));
      return;
    }
    if (this.backups.length === 0) {
      this.conteudo.replaceChildren(
        emptyState({
          titulo: "Nenhuma cópia ainda",
          descricao: "A primeira é feita na próxima vez que o servidor ligar. Até lá, use \"Baixar o banco de agora\".",
          icone: "backups",
        })
      );
      return;
    }
    const tabela = document.createElement("table");
    tabela.className = "data-table admin-tabela";
    tabela.innerHTML = html`
      <thead><tr><th scope="col">Cópia</th><th scope="col">Tamanho</th><th scope="col">Verificação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody></tbody>`;
    const corpo = tabela.querySelector("tbody");
    for (const b of this.backups) {
      const tr = document.createElement("tr");
      tr.className = "is-readonly";
      tr.innerHTML = linhaBackup(b);
      corpo.appendChild(tr);
    }
    this.conteudo.replaceChildren(tabela);
  }

  _confirmar(arquivo) {
    const b = this.backups.find((x) => x.arquivo === arquivo);
    if (!b) return;
    const { box, close } = Modal.abrirCaixa({ largura: 480 });
    box.innerHTML = html`
      <h3 class="modal-box__title" id="restaurar-titulo">Restaurar a cópia de ${b.label}?</h3>
      <p class="modal-box__message">
        O banco inteiro volta a ser o daquele momento: <strong>tudo o que foi feito depois disso some</strong>,
        para todas as contas, e todo mundo é desconectado. Uma cópia do banco de agora é feita antes, por segurança.
      </p>
      <form class="form-grid" data-role="form">
        <div class="field field--full">
          <label class="field__label" for="rest-conf">Digite RESTAURAR para confirmar</label>
          <input type="text" class="input" id="rest-conf" data-field="confirmacao" required autocomplete="off" spellcheck="false" />
        </div>
        <div class="field field--full">
          <label class="field__label" for="rest-senha">Sua senha</label>
          <input type="password" class="input" id="rest-senha" data-field="senha" required autocomplete="current-password" />
        </div>
        <div class="modal-box__actions field--full">
          <button type="button" class="btn" data-action="cancelar">Cancelar</button>
          <button type="submit" class="btn btn--danger" data-action="restaurar" disabled>Restaurar</button>
        </div>
      </form>`;
    box.setAttribute("aria-labelledby", "restaurar-titulo");

    const form = box.querySelector('[data-role="form"]');
    const confirmacao = box.querySelector('[data-field="confirmacao"]');
    const senha = box.querySelector('[data-field="senha"]');
    const botao = box.querySelector('[data-action="restaurar"]');
    // O botão só acende com a palavra certa e alguma senha: melhor que deixar
    // clicar e responder "confirmação inválida" depois.
    const conferir = () => (botao.disabled = confirmacao.value.trim() !== "RESTAURAR" || !senha.value);
    form.addEventListener("input", conferir);
    box.querySelector('[data-action="cancelar"]').addEventListener("click", () => close());
    confirmacao.focus();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (botao.disabled) return;
      const liberar = marcarOcupado(botao);
      try {
        await this.api.post(`/backups/${encodeURIComponent(b.arquivo)}/restore`, {
          confirmacao: confirmacao.value.trim(),
          senha: senha.value,
        });
        close();
        toast.success(`Banco restaurado para ${b.label}. Recarregando…`);
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        liberar();
        Modal.alert("Não foi possível restaurar", mensagem(err), "error");
      }
    });
  }
}
