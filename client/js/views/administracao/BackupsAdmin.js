import { View } from "../../app/View.js";
import { Modal } from "../../components/Modal.js";
import { toast } from "../../components/Toast.js";
import { emptyState } from "../../components/EmptyState.js";
import { html } from "../../utils/html.js";
import { iconHtml } from "../../utils/icons.js";
import { marcarOcupado } from "../../utils/guard.js";
import { cabecalhoSecao, tituloCartao } from "../../templates/secao.js";
import { linhaBackup } from "../../templates/administracao.js";
import { mensagem } from "./FormularioRegras.js";

/**
 * Seção Backups e recuperação da Administração:
 * Cópias de segurança automáticas, retenção e restauração com dupla confirmação.
 */
export class BackupsAdmin extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.backups = [];
    this.retencaoAtual = 10;
    this._desenharBase();
  }

  _desenharBase() {
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Backups e recuperação",
        descricao: "Cópias automáticas do banco, conferência de integridade e restauração do sistema.",
        acoes: html`<a class="btn" href="/api/backups/atual/download" download>${iconHtml("download")} Baixar o banco de agora</a>`,
      })}
      <div class="admin-grade-vertical">
        <section class="card secao-card">
          ${tituloCartao({
            titulo: "Política de retenção",
            descricao: "Uma cópia é feita automaticamente toda vez que o servidor inicia.",
          })}
          <div class="cfg-linhas">
            <div class="cfg-group">
              <div class="cfg-group__labels">
                <label class="cfg-group__title" for="regra-backupsManter">Manter cópias automáticas</label>
                <span class="cfg-group__help">As cópias mais antigas que este limite são descartadas quando uma nova cópia é criada.</span>
              </div>
              <div class="form-actions">
                <div class="input-unidade">
                  <input type="number" class="input" id="regra-backupsManter" data-role="retencao" value="${this.retencaoAtual}"
                         min="1" max="100" step="1" inputmode="numeric" />
                  <span>cópias</span>
                </div>
                <button type="button" class="btn btn--small" data-action="salvar-retencao" disabled>Salvar</button>
              </div>
            </div>
          </div>
        </section>

        <section class="card secao-card">
          ${tituloCartao({
            titulo: "Cópias armazenadas",
            descricao: "Cópias disponíveis no servidor para download ou restauração imediata.",
          })}
          <div data-role="conteudo"></div>
        </section>
      </div>`;

    this.conteudo = this.container.querySelector('[data-role="conteudo"]');
    this.campoRetencao = this.container.querySelector('[data-role="retencao"]');
    this.btnSalvarRetencao = this.container.querySelector('[data-action="salvar-retencao"]');

    this.conteudo.addEventListener("click", (e) => {
      const botao = e.target.closest('[data-action="restaurar"]');
      if (botao) this._confirmar(botao.dataset.arquivo);
    });

    this.campoRetencao.addEventListener("input", () => {
      const val = Number(this.campoRetencao.value);
      this.btnSalvarRetencao.disabled = !val || val === this.retencaoAtual;
    });

    this.btnSalvarRetencao.addEventListener("click", () => this._salvarRetencao());
  }

  async refresh() {
    try {
      const [backups, config] = await Promise.all([
        this.api.get("/backups"),
        this.api.get("/configuracao-sistema/completa").catch(() => null),
      ]);
      this.backups = backups;
      if (config?.valores?.backupsManter != null) {
        this.retencaoAtual = Number(config.valores.backupsManter);
        if (this.campoRetencao) this.campoRetencao.value = String(this.retencaoAtual);
        if (this.btnSalvarRetencao) this.btnSalvarRetencao.disabled = true;
      }
    } catch (err) {
      if (err?.cancelled) return;
      toast.error(mensagem(err));
      return;
    }

    if (this.backups.length === 0) {
      this.conteudo.replaceChildren(
        emptyState({
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

  async _salvarRetencao() {
    const valor = Number(this.campoRetencao.value);
    if (!valor || valor < 1) return;
    const liberar = marcarOcupado(this.btnSalvarRetencao);
    try {
      await this.api.put("/configuracao-sistema", { backupsManter: valor });
      this.retencaoAtual = valor;
      this.btnSalvarRetencao.disabled = true;
      toast.success("Política de retenção atualizada.");
    } catch (err) {
      Modal.alert("Erro ao salvar retenção", mensagem(err), "error");
    } finally {
      liberar();
    }
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
        toast.success(`Banco restaurado para ${b.label}. Recarregando…`);
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        liberar();
        Modal.alert("Não foi possível restaurar", mensagem(err), "error");
      }
    });
  }
}
