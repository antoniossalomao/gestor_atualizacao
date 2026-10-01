import { View } from "../../app/View.js";
import { Modal } from "../../components/Modal.js";
import { avisoRapido } from "../../components/AvisosRapidos.js";
import { estadoVazio } from "../../components/estadoVazio.js";
import { html } from "../../utils/html.js";
import { iconeHtml } from "../../utils/icones.js";
import { marcarOcupado } from "../../components/botaoOcupado.js";
import { cabecalhoSecao, tituloCartao } from "../../templates/secao.js";
import { linhaBackup, linhaRegraNumero, rodapeFormulario } from "../../templates/administracao.js";
import { FormularioRegras, mensagem } from "./FormularioRegras.js";

/**
 * Seção Backups e recuperação da Administração:
 * Cópias de segurança automáticas, retenção e restauração com dupla confirmação.
 */
export class BackupsAdmin extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.backups = [];
    this.ctx = ctx;
    this._desenharBase();
  }

  _desenharBase() {
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Backups e recuperação",
        descricao: "Cópias automáticas do banco, conferência de integridade e restauração do sistema.",
        acoes: html`<a class="btn" href="/api/backups/atual/download" download>${iconeHtml("download")} Baixar o banco de agora</a>`,
      })}
      <div class="admin-grade-vertical">
        <div data-role="retencao"></div>

        <section class="card secao-card">
          ${tituloCartao({
            titulo: "Cópias armazenadas",
            descricao: "Cópias disponíveis no servidor para download ou restauração imediata.",
          })}
          <div data-role="conteudo"></div>
        </section>
      </div>`;

    this.conteudo = this.container.querySelector('[data-role="conteudo"]');
    // A retenção é uma regra da equipe como as outras, então usa o mesmo
    // formulário: Desfazer, "1 alteração não salva", e o mínimo e o máximo
    // que vêm do servidor. Feita à mão, a tela aceitava 1 e 2 cópias, que o
    // servidor recusa (mínimo 3), e só dizia isso depois do clique.
    this.retencao = new RetencaoBackups(this.container.querySelector('[data-role="retencao"]'), this.api, this.ctx);

    this.conteudo.addEventListener("click", (e) => {
      const botao = e.target.closest('[data-action="restaurar"]');
      if (botao) this._confirmar(botao.dataset.arquivo);
    });

  }

  async refresh() {
    try {
      [this.backups] = await Promise.all([this.api.get("/backups"), this.retencao.refresh()]);
    } catch (err) {
      if (err?.cancelled) return;
      avisoRapido.erro(mensagem(err));
      return;
    }

    if (this.backups.length === 0) {
      this.conteudo.replaceChildren(
        estadoVazio({
          titulo: "Nenhuma cópia ainda",
          descricao: "A primeira cópia é realizada na próxima vez que o servidor iniciar. Até lá, use \"Baixar o banco de agora\".",
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

  destroy() {
    this.retencao?.destroy();
    super.destroy();
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
        avisoRapido.sucesso(`Banco restaurado para ${b.label}. Recarregando…`);
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        liberar();
        Modal.alert("Não foi possível restaurar", mensagem(err), "error");
      }
    });
  }
}

/** O cartão "Política de retenção": uma regra da equipe, `backupsManter`. */
class RetencaoBackups extends FormularioRegras {
  nomes = ["backupsManter"];

  desenhar({ valores, definicoes }) {
    this.container.innerHTML = html`
      <form class="card secao-card admin-form" data-role="form" novalidate>
        ${tituloCartao({
          titulo: "Política de retenção",
          descricao: "Uma cópia é feita automaticamente toda vez que o servidor inicia.",
        })}
        ${linhaRegraNumero({
          nome: "backupsManter",
          titulo: "Manter cópias automáticas",
          ajuda: "Quando uma cópia nova passa deste limite, a mais antiga é apagada.",
          unidade: "cópias",
          valor: valores.backupsManter,
          min: definicoes.backupsManter?.min,
          max: definicoes.backupsManter?.max,
        })}
        ${rodapeFormulario()}
      </form>`.toString();
  }
}
