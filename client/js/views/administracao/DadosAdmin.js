import { View } from "../../app/View.js";
import { Modal } from "../../components/Modal.js";
import { avisoRapido } from "../../components/AvisosRapidos.js";
import { marcarOcupado } from "../../components/botaoOcupado.js";
import { html } from "../../utils/html.js";
import { iconeHtml } from "../../utils/icones.js";
import { cabecalhoSecao, tituloCartao } from "../../templates/secao.js";
import { baixarBlob } from "../../components/arquivos.js";
import { ImportacaoModal } from "../../components/ImportacaoModal.js";
import { conferenciaCadastros } from "../../templates/administracao.js";
import { sistemasSemReferencia } from "../../domain/administracao.js";
import { mensagem } from "./FormularioRegras.js";

/**
 * Seção Dados da Administração:
 * Reúne fluxos administrativos de exportação, importação em lote e integridade da base.
 */
export class DadosAdmin extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this._desenhar();
  }

  _desenhar() {
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Dados e importação",
        descricao: "Exportação completa de registros, carga de planilhas e integridade da base.",
      })}
      <div class="admin-grade-vertical">
        <section class="card secao-card">
          ${tituloCartao({
            titulo: "Histórico de atualizações",
            descricao: "Exporte todo o histórico gravado em planilha Excel (.xlsx) ou importe novas atualizações em lote.",
          })}
          <div class="cfg-linhas">
            <div class="cfg-group">
              <div class="cfg-group__labels">
                <span class="cfg-group__title">Exportar todas as atualizações</span>
                <span class="cfg-group__help">Gera um arquivo .xlsx com todos os registros cadastrados na base, sem recortes de data.</span>
              </div>
              <button type="button" class="btn btn--small" data-action="exportar-todos">
                ${iconeHtml("download")} Exportar (.xlsx)
              </button>
            </div>

            <div class="cfg-group">
              <div class="cfg-group__labels">
                <span class="cfg-group__title">Importar planilha de atualizações</span>
                <span class="cfg-group__help">Acrescenta registros ao histórico a partir de um arquivo .xlsx, com prévia antes de gravar. Registros existentes não são alterados.</span>
              </div>
              <button type="button" class="btn btn--small btn--accent" data-action="importar-planilha">
                ${iconeHtml("upload")} Importar planilha
              </button>
            </div>
          </div>
        </section>

        <section class="card secao-card">
          ${tituloCartao({
            titulo: "Conferência de cadastros",
            descricao: "O que fica fora da conta de situação sem ninguém perceber.",
          })}
          <div class="cfg-linhas" data-role="conferencia">
            <p class="text-muted admin-conferencia__carregando">Conferindo…</p>
          </div>
        </section>
      </div>`;

    this._ligarAcoes();
  }

  _ligarAcoes() {
    this.container.querySelector('[data-action="exportar-todos"]')?.addEventListener("click", (e) => {
      this._exportar(e.currentTarget);
    });

    this.container.querySelector('[data-action="importar-planilha"]')?.addEventListener("click", (e) => {
      this._importar();
    });

    // Os botões da conferência são redesenhados a cada `refresh`: um ouvinte
    // só, no contêiner.
    this.container.querySelector('[data-role="conferencia"]').addEventListener("click", (e) => {
      const alvo = /** @type {HTMLElement} */ (e.target).closest("[data-ir]");
      if (!(alvo instanceof HTMLElement)) return;
      if (alvo.dataset.ir === "operacao") this.navigate("administracao", { aba: "operacao" });
      else this.navigate(alvo.dataset.ir);
    });
  }

  /**
   * Antes, "Conferência de cadastros" eram dois botões que só abriam
   * Clientes e Sistemas -- a pessoa tinha que procurar sozinha. Agora a
   * conta vem pronta, com os nomes.
   */
  async refresh() {
    const alvo = /** @type {HTMLElement} */ (this.container.querySelector('[data-role="conferencia"]'));
    try {
      const [semSistema, catalogo] = await Promise.all([this.api.get("/clientes/sem-sistema"), this.api.get("/sistemas/catalogo")]);
      alvo.innerHTML = conferenciaCadastros({ clientesSemSistema: semSistema, sistemasSemReferencia: sistemasSemReferencia(catalogo) }).toString();
    } catch (err) {
      if (err?.cancelled) return;
      alvo.innerHTML = html`<p class="text-muted admin-conferencia__carregando">Não foi possível conferir agora: ${mensagem(err)}</p>`.toString();
    }
  }

  async _exportar(botao) {
    const liberar = marcarOcupado(botao);
    try {
      const blob = await this.api.getFile("/atualizacoes/export");
      const agora = new Date();
      const carimbo = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
      baixarBlob(blob, `atualizacoes_completo_${carimbo}.xlsx`);
      avisoRapido.sucesso("Planilha completa de atualizações exportada com sucesso.");
    } catch (err) {
      Modal.alert("Erro ao exportar", err.message || "Não foi possível baixar os dados.", "error");
    } finally {
      liberar();
    }
  }

  /** Mesmo fluxo de Atualizações: orientação, prévia e resultado (components/ImportacaoModal.js). */
  _importar() {
    new ImportacaoModal(this.api, {
      aoImportar: (resultado) => {
        if (!resultado.inserted) return;
        for (const chave of ["resumo", "atualizacoes:", "consulta:", "sistemas:", "campanhas:"]) this.cache?.invalidar(chave);
      },
    }).open();
  }
}
