import { html } from "../../utils/html.js";
import { Modal } from "../../components/Modal.js";
import { toast } from "../../components/Toast.js";
import { marcarOcupado } from "../../utils/guard.js";
import { cabecalhoSecao, tituloCartao } from "../../templates/secao.js";
import { linhaRegraNumero, rodapeFormulario } from "../../templates/administracao.js";
import { FormularioRegras } from "./FormularioRegras.js";

/**
 * Seção Operação da Administração:
 * Prazos de desatualização, arquivamento de tarefas e classificação de sistemas.
 *
 * Todas as definições aqui afetam o comportamento e cálculos de toda a equipe.
 */
export class OperacaoAdmin extends FormularioRegras {
  nomes = ["desatualizadoDias", "agendamentoArquivarDias"];

  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.sistemas = [];
  }

  async refresh() {
    await super.refresh();
    await this._carregarSistemas();
  }

  desenhar({ valores, definicoes }) {
    const d = definicoes;
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Operação da equipe",
        descricao: "Prazos, arquivamento e classificação de versões. Valem para todas as contas.",
      })}
      <div class="admin-grade-vertical">
        <form class="card secao-card admin-form" data-role="form" novalidate>
          ${tituloCartao({
            titulo: "Prazos e arquivamento",
            descricao: "Regras de tempo que afetam o Resumo e a fila de Agendamentos.",
          })}
          ${linhaRegraNumero({
            nome: "desatualizadoDias",
            titulo: "Sem atualização depois de",
            ajuda: "Sem atendimento registrado por mais que isso, o cliente entra na lista \"Sem atualização\" do Resumo. Não altera a situação de versão.",
            unidade: "dias",
            valor: valores.desatualizadoDias,
            min: d.desatualizadoDias.min,
            max: d.desatualizadoDias.max,
          })}
          ${linhaRegraNumero({
            nome: "agendamentoArquivarDias",
            titulo: "Arquivar tarefa concluída depois de",
            ajuda: "Some da visualização principal de Agendamentos, continuando disponível no filtro \"Arquivadas\" e nas contagens.",
            unidade: "dias",
            valor: valores.agendamentoArquivarDias,
            min: d.agendamentoArquivarDias.min,
            max: d.agendamentoArquivarDias.max,
          })}
          ${rodapeFormulario()}
        </form>

        <section class="card secao-card" data-role="secao-sistemas">
          ${tituloCartao({
            titulo: "Classificação dos sistemas",
            descricao: "Defina quais sistemas têm versão oficial e entram na avaliação dos clientes. Componentes fixos não geram pendência de versão.",
          })}
          <div class="cfg-linhas" data-role="lista-sistemas">
            <p class="text-muted">Carregando sistemas…</p>
          </div>
        </section>
      </div>`;
  }

  async _carregarSistemas() {
    const lista = this.container.querySelector('[data-role="lista-sistemas"]');
    if (!lista) return;

    try {
      this.sistemas = (await this.api.get("/sistemas/catalogo")).filter((s) => s.ativo);
    } catch (err) {
      if (!err?.cancelled) toast.error("Não foi possível carregar a classificação dos sistemas.");
      return;
    }

    if (this.sistemas.length === 0) {
      lista.innerHTML = html`<p class="text-muted">Nenhum sistema ativo cadastrado.</p>`.toString();
      return;
    }

    lista.innerHTML = html`${this.sistemas.map((s) => html`
      <div class="cfg-group">
        <div class="cfg-group__labels">
          <label class="cfg-group__title" for="classificacao-${s.id}">${s.nome}</label>
          <span class="cfg-group__help">${s.ultimaVersao ? `Referência oficial atual: ${s.ultimaVersao}` : "Sem referência oficial"}</span>
        </div>
        <div class="form-actions">
          <select class="input" id="classificacao-${s.id}" data-id="${s.id}" aria-label="Classificação de ${s.nome}">
            <option value="1">Atualizável</option>
            <option value="0">Componente fixo</option>
          </select>
          <button type="button" class="btn btn--small" data-action="salvar-classificacao" data-id="${s.id}" disabled>Salvar</button>
        </div>
      </div>`)}`.toString();

    for (const sistema of this.sistemas) {
      const campo = lista.querySelector(`select[data-id="${sistema.id}"]`);
      if (campo) campo.value = String(sistema.controlaVersao ? 1 : 0);
    }

    lista.querySelectorAll("select[data-id]").forEach((campo) => {
      campo.addEventListener("change", () => this._atualizarBotaoSistema(campo.dataset.id));
    });

    lista.querySelectorAll('[data-action="salvar-classificacao"]').forEach((botao) => {
      botao.addEventListener("click", () => this._salvarSistema(botao.dataset.id, botao));
    });
  }

  _atualizarBotaoSistema(id) {
    const sistema = this.sistemas.find((s) => String(s.id) === String(id));
    const campo = this.container.querySelector(`select[data-id="${id}"]`);
    const botao = this.container.querySelector(`[data-action="salvar-classificacao"][data-id="${id}"]`);
    if (campo && botao && sistema) {
      botao.disabled = Number(campo.value) === (sistema.controlaVersao ? 1 : 0);
    }
  }

  async _salvarSistema(id, botao) {
    const campo = this.container.querySelector(`select[data-id="${id}"]`);
    if (!campo) return;
    const liberar = marcarOcupado(botao);
    try {
      await this.api.patch(`/sistemas/${id}/classificacao`, { controlaVersao: campo.value === "1" });
      for (const chave of ["resumo", "sistemas:", "consulta:", "atualizacoes:"]) this.cache?.invalidar(chave);
      await this._carregarSistemas();
      toast.success("Classificação salva para a equipe.");
    } catch (err) {
      Modal.alert("Não foi possível salvar", err.message || "Ocorreu um erro inesperado.", "error");
    } finally {
      liberar();
    }
  }
}
