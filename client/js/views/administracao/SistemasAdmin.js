import { View } from "../../app/View.js";
import { Modal } from "../../components/Modal.js";
import { toast } from "../../components/Toast.js";
import { marcarOcupado } from "../../utils/guard.js";
import { html } from "../../utils/html.js";
import { cabecalhoSecao, tituloCartao } from "../../templates/secao.js";

/** A classificação é da equipe inteira e só o administrador pode mudá-la. */
export class SistemasAdmin extends View {
  async refresh() {
    try {
      this.sistemas = (await this.api.get("/sistemas/catalogo")).filter((s) => s.ativo);
    } catch (err) {
      if (!err?.cancelled) toast.error("Não foi possível carregar a classificação dos sistemas.");
      return;
    }
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Classificação dos sistemas",
        descricao: "Defina quais sistemas têm versão oficial e entram na avaliação dos clientes.",
      })}
      <div class="card secao-card">
        ${tituloCartao({
          titulo: "Controle de versão",
          descricao: "Componentes fixos continuam no cadastro e no histórico. Referências antigas são preservadas, mas deixam de contar.",
        })}
        ${this.sistemas.map((s) => html`
          <div class="cfg-group">
            <div class="cfg-group__labels">
              <label class="cfg-group__title" for="classificacao-${s.id}">${s.nome}</label>
              <span class="cfg-group__help">${s.ultimaVersao ? `Referência preservada: ${s.ultimaVersao}` : "Sem referência oficial"}</span>
            </div>
            <div class="form-actions">
              <select class="input" id="classificacao-${s.id}" data-id="${s.id}" aria-label="Classificação de ${s.nome}">
                <option value="1">Atualizável</option>
                <option value="0">Componente fixo</option>
              </select>
              <button type="button" class="btn btn--small" data-action="salvar-classificacao" data-id="${s.id}" disabled>Salvar</button>
            </div>
          </div>`)}
      </div>`;

    for (const sistema of this.sistemas) {
      const campo = this.container.querySelector(`select[data-id="${sistema.id}"]`);
      campo.value = String(sistema.controlaVersao);
    }
    this.container.querySelectorAll("select[data-id]").forEach((campo) => {
      campo.addEventListener("change", () => this._atualizarBotao(campo.dataset.id));
    });
    this.container.querySelectorAll('[data-action="salvar-classificacao"]').forEach((botao) => {
      botao.addEventListener("click", () => this._salvar(botao.dataset.id, botao));
    });
  }

  _atualizarBotao(id) {
    const sistema = this.sistemas.find((s) => String(s.id) === String(id));
    const campo = this.container.querySelector(`select[data-id="${id}"]`);
    const botao = this.container.querySelector(`[data-action="salvar-classificacao"][data-id="${id}"]`);
    botao.disabled = Number(campo.value) === Number(sistema.controlaVersao);
  }

  async _salvar(id, botao) {
    const campo = this.container.querySelector(`select[data-id="${id}"]`);
    const liberar = marcarOcupado(botao);
    try {
      await this.api.patch(`/sistemas/${id}/classificacao`, { controlaVersao: campo.value === "1" });
      for (const chave of ["resumo", "sistemas:", "consulta:", "atualizacoes:"]) this.cache?.invalidar(chave);
      await this.refresh();
      toast.success("Classificação salva para a equipe.");
    } catch (err) {
      Modal.alert("Não foi possível salvar", err.message || "Ocorreu um erro inesperado.", "error");
    } finally {
      liberar();
    }
  }
}
