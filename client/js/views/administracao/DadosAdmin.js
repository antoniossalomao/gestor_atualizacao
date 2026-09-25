import { View } from "../../app/View.js";
import { Modal } from "../../components/Modal.js";
import { toast } from "../../components/Toast.js";
import { marcarOcupado } from "../../utils/guard.js";
import { html, plural } from "../../utils/html.js";
import { iconHtml } from "../../utils/icons.js";
import { cabecalhoSecao, tituloCartao } from "../../templates/secao.js";
import { escolherArquivo, baixarBlob } from "../../utils/arquivo.js";

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
            titulo: "Atendimentos e atualizações",
            descricao: "Exporte todo o histórico gravado em planilha Excel (.xlsx) ou importe novos atendimentos em lote.",
          })}
          <div class="cfg-linhas">
            <div class="cfg-group">
              <div class="cfg-group__labels">
                <span class="cfg-group__title">Exportar todos os atendimentos</span>
                <span class="cfg-group__help">Gera um arquivo .xlsx com todos os registros cadastrados na base, sem recortes de data.</span>
              </div>
              <button type="button" class="btn btn--small" data-action="exportar-todos">
                ${iconHtml("download")} Exportar (.xlsx)
              </button>
            </div>

            <div class="cfg-group">
              <div class="cfg-group__labels">
                <span class="cfg-group__title">Importar planilha de atendimentos</span>
                <span class="cfg-group__help">Acrescenta registros ao histórico a partir de um arquivo .xlsx. Registros existentes não são apagados.</span>
              </div>
              <button type="button" class="btn btn--small btn--accent" data-action="importar-planilha">
                ${iconHtml("upload")} Importar planilha
              </button>
            </div>
          </div>
        </section>

        <section class="card secao-card">
          ${tituloCartao({
            titulo: "Base de dados e integridade",
            descricao: "Cópia direta do banco de dados operacional SQLite e atalhos para validação de cadastros.",
          })}
          <div class="cfg-linhas">
            <div class="cfg-group">
              <div class="cfg-group__labels">
                <span class="cfg-group__title">Baixar banco de dados de agora</span>
                <span class="cfg-group__help">Cópia do arquivo SQLite com todas as tabelas, configurações e usuários no estado exato deste momento.</span>
              </div>
              <a class="btn btn--small" href="/api/backups/atual/download" download>
                ${iconHtml("download")} Baixar banco (.sqlite)
              </a>
            </div>

            <div class="cfg-group">
              <div class="cfg-group__labels">
                <span class="cfg-group__title">Conferência de cadastros</span>
                <span class="cfg-group__help">Verifique clientes sem sistemas vinculados ou sistemas sem versão oficial cadastrada.</span>
              </div>
              <div class="form-actions">
                <button type="button" class="btn btn--small btn--ghost" data-action="ir-clientes">
                  ${iconHtml("users")} Ver clientes
                </button>
                <button type="button" class="btn btn--small btn--ghost" data-action="ir-sistemas">
                  ${iconHtml("sistemas")} Ver sistemas
                </button>
              </div>
            </div>
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
      this._importar(e.currentTarget);
    });

    this.container.querySelector('[data-action="ir-clientes"]')?.addEventListener("click", () => {
      this.navigate("clientes");
    });

    this.container.querySelector('[data-action="ir-sistemas"]')?.addEventListener("click", () => {
      this.navigate("sistemas");
    });
  }

  async _exportar(botao) {
    const liberar = marcarOcupado(botao);
    try {
      const blob = await this.api.getFile("/atualizacoes/export");
      const agora = new Date();
      const carimbo = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
      baixarBlob(blob, `atualizacoes_completo_${carimbo}.xlsx`);
      toast.success("Planilha completa de atendimentos exportada com sucesso.");
    } catch (err) {
      Modal.alert("Erro ao exportar", err.message || "Não foi possível baixar os dados.", "error");
    } finally {
      liberar();
    }
  }

  async _importar(botao) {
    const file = await escolherArquivo({ accept: ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (!file) return;

    const ok = await Modal.confirm(
      "Importar planilha",
      `Importar "${file.name}"?\n\nOs registros da planilha são acrescentados aos que já existem — nada é substituído.`,
      { confirmLabel: "Importar", danger: false }
    );
    if (!ok) return;

    const liberar = marcarOcupado(botao);
    try {
      const resultado = await this.api.postFile("/atualizacoes/import", file);
      for (const chave of ["resumo", "atualizacoes:", "consulta:", "sistemas:"]) this.cache?.invalidar(chave);

      let msg = `${plural(resultado.inserted, "registro")} importado(s).`;
      if (resultado.naoCadastrados?.length > 0) {
        const exemplos = resultado.naoCadastrados.slice(0, 5).join(", ");
        const reticencias = resultado.naoCadastrados.length > 5 ? "..." : "";
        msg +=
          `\n\nAtenção: ${plural(resultado.naoCadastrados.length, "cliente")} da planilha não ` +
          `${resultado.naoCadastrados.length === 1 ? "está cadastrado" : "estão cadastrados"} na aba Clientes ` +
          `(${exemplos}${reticencias}). Esses registros foram salvos, mas não vão aparecer no Resumo nem na ` +
          "Consulta até o cliente ser cadastrado com o nome exatamente igual.";
        Modal.alert("Importar", msg, "warning");
      } else {
        toast.success(msg);
      }
    } catch (err) {
      Modal.alert("Erro ao importar", err.message || "Não foi possível importar a planilha.", "error");
    } finally {
      liberar();
    }
  }
}
