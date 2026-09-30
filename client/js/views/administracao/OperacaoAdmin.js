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
  nomes = ["prazoVersaoDias", "desatualizadoDias", "agendamentoArquivarDias"];

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
            nome: "prazoVersaoDias",
            titulo: "Desatualizado depois da versão oficial",
            ajuda: "Conta da data da versão oficial. Antes do prazo, quem ainda não recebeu a versão fica \"Aguardando atualização\"; depois, \"Desatualizado\". Vale no Resumo, em Sistemas e na ficha do cliente. 0 = desatualizado já no dia seguinte.",
            unidade: "dias",
            valor: valores.prazoVersaoDias,
            min: d.prazoVersaoDias.min,
            max: d.prazoVersaoDias.max,
          })}
          ${linhaRegraNumero({
            nome: "desatualizadoDias",
            titulo: "Sem atualização depois de",
            ajuda: "Sem atualização registrada por mais que isso, o cliente entra na lista \"Sem atualização\" do Resumo. Não altera a situação de versão.",
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
          <div class="admin-sistemas" data-role="lista-sistemas">
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

    // Uma linha curta por sistema, em duas colunas quando cabe: nome e
    // referência à esquerda, a escolha (dois botões colados, como nas
    // Configurações) à direita. O "Salvar" só aparece na linha que mudou --
    // antes havia um por sistema, sempre visível e quase sempre desligado,
    // o que dobrava a altura da lista sem dizer nada.
    lista.innerHTML = html`${this.sistemas.map((s) => html`
      <div class="admin-sistema" data-linha="${s.id}">
        <div class="admin-sistema__nome">
          <strong id="classificacao-${s.id}">${s.nome}</strong>
          <small>${s.ultimaVersao ? `Referência oficial: ${s.ultimaVersao}` : "Sem referência oficial"}</small>
        </div>
        <div class="segmented" role="radiogroup" aria-labelledby="classificacao-${s.id}">
          <label class="cfg-group__option"><input type="radio" name="classificacao-${s.id}" value="1" data-id="${s.id}" /><span>Atualizável</span></label>
          <label class="cfg-group__option"><input type="radio" name="classificacao-${s.id}" value="0" data-id="${s.id}" /><span>Fixo</span></label>
        </div>
        <button type="button" class="btn btn--small btn--accent" data-action="salvar-classificacao" data-id="${s.id}" hidden>Salvar</button>
      </div>`)}`.toString();

    for (const sistema of this.sistemas) {
      const valor = String(sistema.controlaVersao ? 1 : 0);
      const campo = /** @type {HTMLInputElement|null} */ (lista.querySelector(`input[data-id="${sistema.id}"][value="${valor}"]`));
      if (campo) campo.checked = true;
    }

    lista.querySelectorAll("input[data-id]").forEach((campo) => {
      campo.addEventListener("change", () => this._atualizarBotaoSistema(/** @type {HTMLInputElement} */ (campo).dataset.id));
    });

    lista.querySelectorAll('[data-action="salvar-classificacao"]').forEach((botao) => {
      botao.addEventListener("click", () => this._salvarSistema(botao.dataset.id, botao));
    });
  }

  _atualizarBotaoSistema(id) {
    const sistema = this.sistemas.find((s) => String(s.id) === String(id));
    const campo = /** @type {HTMLInputElement|null} */ (this.container.querySelector(`input[data-id="${id}"]:checked`));
    const botao = /** @type {HTMLButtonElement|null} */ (this.container.querySelector(`[data-action="salvar-classificacao"][data-id="${id}"]`));
    if (campo && botao && sistema) {
      const mudou = Number(campo.value) !== (sistema.controlaVersao ? 1 : 0);
      botao.hidden = !mudou;
      botao.closest(".admin-sistema")?.classList.toggle("is-alterado", mudou);
    }
  }

  async _salvarSistema(id, botao) {
    const campo = /** @type {HTMLInputElement|null} */ (this.container.querySelector(`input[data-id="${id}"]:checked`));
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
