import { html } from "../../utils/html.js";
import { Modal } from "../../components/Modal.js";
import { avisoRapido } from "../../components/AvisosRapidos.js";
import { marcarOcupado } from "../../components/botaoOcupado.js";
import { cabecalhoSecao, tituloCartao } from "../../templates/secao.js";
import { linhaRegraNumero, rodapeFormulario } from "../../templates/administracao.js";
import { FormularioRegras } from "./FormularioRegras.js";
import { iconeHtml } from "../../utils/icones.js";
import { filtrarPorBusca } from "../../utils/busca.js";
import { alteracoesClassificacao } from "../../domain/administracao.js";
import { alteracoesPendentes } from "../../app/alteracoesPendentes.js";

/**
 * Seção Operação da Administração:
 * Prazos de desatualização, arquivamento de tarefas e classificação de sistemas.
 *
 * Todas as definições aqui afetam o comportamento e cálculos de toda a equipe.
 */
export class OperacaoAdmin extends FormularioRegras {
  nomes = ["prazoVersaoDias", "desatualizadoDias", "agendamentoArquivarDias"];
  rotuloPendencia = "Administração › Operação";

  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.sistemas = [];
    this._desfazerPendenciaSistemas = alteracoesPendentes.registrar(() => {
      const n = this._alteracoesSistemas().length;
      return n === 0 ? null : `Administração › Operação: ${n === 1 ? "1 sistema reclassificado e não salvo" : `${n} sistemas reclassificados e não salvos`}`;
    });
  }

  async refresh() {
    // `super.refresh` redesenha a seção inteira (prazos E sistemas). Com
    // sistemas marcados e não salvos, isso apagaria as marcações -- então,
    // nesse caso, a aba fica como está, como o próprio formulário de prazos
    // faz quando está sujo.
    if (this._alteracoesSistemas().length > 0) return;
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
          <div class="admin-sistemas__barra">
            <label class="cfg-busca admin-sistemas__filtro">
              <span class="cfg-busca__icone" aria-hidden="true">${iconeHtml("busca")}</span>
              <input type="search" class="input" data-role="filtro-sistemas" placeholder="Filtrar sistemas…"
                     aria-label="Filtrar sistemas" autocomplete="off" spellcheck="false" />
            </label>
            <span class="text-muted admin-sistemas__total" data-role="total-sistemas" aria-live="polite"></span>
          </div>
          <div class="admin-sistemas" data-role="lista-sistemas">
            <p class="text-muted">Carregando sistemas…</p>
          </div>
          <footer class="admin-form__rodape admin-sistemas__rodape" data-role="rodape-sistemas">
            <span class="admin-form__estado" data-role="estado-sistemas" aria-live="polite"></span>
            <button type="button" class="btn" data-action="desfazer-sistemas" disabled>Desfazer</button>
            <button type="button" class="btn btn--accent" data-action="salvar-sistemas" disabled>Salvar</button>
          </footer>
        </section>
      </div>`;
  }

  async _carregarSistemas() {
    const lista = this.container.querySelector('[data-role="lista-sistemas"]');
    if (!lista) return;
    // Voltar à aba não joga fora o que foi marcado e ainda não salvo -- o
    // mesmo cuidado do formulário de prazos (FormularioRegras.refresh).
    if (this._alteracoesSistemas().length > 0) return;

    try {
      this.sistemas = (await this.api.get("/sistemas/catalogo")).filter((s) => s.ativo);
    } catch (err) {
      if (!err?.cancelled) avisoRapido.erro("Não foi possível carregar a classificação dos sistemas.");
      return;
    }
    this._ligarListaSistemas();

    if (this.sistemas.length === 0) {
      lista.innerHTML = html`<p class="text-muted">Nenhum sistema ativo cadastrado.</p>`.toString();
      return;
    }

    // Uma linha curta por sistema, em duas colunas quando cabe: nome e
    // referência à esquerda, a escolha (dois botões colados, como nas
    // Configurações) à direita. Um "Salvar" só, no pé do cartão, para todas
    // as linhas alteradas -- antes era um por linha, e quem reclassificava
    // cinco sistemas clicava cinco vezes.
    lista.innerHTML = html`${this.sistemas.map((s) => html`
      <div class="admin-sistema" data-linha="${s.id}" data-nome="${s.nome}">
        <div class="admin-sistema__nome">
          <strong id="classificacao-${s.id}">${s.nome}</strong>
          <small>${s.ultimaVersao ? `Referência oficial: ${s.ultimaVersao}` : "Sem referência oficial"}</small>
          ${s.nome.toLowerCase() === "b_vendas"
            ? ""
            : html`<label class="admin-sistema__dependente" title="Vai para o cliente junto com o B_Vendas: a situação deste sistema usa a data da última atualização do B_Vendas do cliente.">
                <input type="checkbox" data-dependente="${s.id}" /> Atualiza junto com o B_Vendas
              </label>`}
        </div>
        <div class="segmented" role="radiogroup" aria-labelledby="classificacao-${s.id}">
          <label class="cfg-group__option"><input type="radio" name="classificacao-${s.id}" value="1" data-id="${s.id}" /><span>Atualizável</span></label>
          <label class="cfg-group__option"><input type="radio" name="classificacao-${s.id}" value="0" data-id="${s.id}" /><span>Fixo</span></label>
        </div>
      </div>`)}`.toString();
    this._preencherSistemas();
    this._filtrarSistemas();
  }

  /** Ouvintes da lista, ligados uma vez só: as linhas são redesenhadas a cada carga. */
  _ligarListaSistemas() {
    // `desenhar` (de FormularioRegras) recria o cartão; a marca é o próprio
    // elemento da lista, e não um booleano, para religar só quando ele mudou.
    const lista = this.container.querySelector('[data-role="lista-sistemas"]');
    if (this._listaLigada === lista) return;
    this._listaLigada = lista;
    lista.addEventListener("change", () => this._atualizarEstadoSistemas());
    this.container.querySelector('[data-role="filtro-sistemas"]').addEventListener("input", () => this._filtrarSistemas());
    this.container.querySelector('[data-action="desfazer-sistemas"]').addEventListener("click", () => this._preencherSistemas());
    this.container.querySelector('[data-action="salvar-sistemas"]').addEventListener("click", (e) => this._salvarSistemas(e.currentTarget));
  }

  /** Põe na tela a classificação salva (carga e "Desfazer"). */
  _preencherSistemas() {
    for (const sistema of this.sistemas) {
      const valor = String(sistema.controlaVersao ? 1 : 0);
      const campo = /** @type {HTMLInputElement|null} */ (this.container.querySelector(`input[data-id="${sistema.id}"][value="${valor}"]`));
      if (campo) campo.checked = true;
      const dependente = this._caixaDependente(sistema.id);
      if (dependente) dependente.checked = Boolean(sistema.atualizaComPrincipal);
    }
    this._atualizarEstadoSistemas();
  }

  /** @returns {HTMLInputElement|null} */
  _caixaDependente(id) {
    return this.container.querySelector(`input[data-dependente="${id}"]`);
  }

  /** Como cada sistema está na tela agora, por id. */
  _escolhasSistemas() {
    /** @type {Record<string, {controlaVersao: boolean, atualizaComPrincipal?: boolean}>} */
    const escolhas = {};
    for (const s of this.sistemas) {
      const marcado = /** @type {HTMLInputElement|null} */ (this.container.querySelector(`input[data-id="${s.id}"]:checked`));
      if (!marcado) continue;
      const caixa = this._caixaDependente(s.id);
      escolhas[String(s.id)] = { controlaVersao: marcado.value === "1", ...(caixa ? { atualizaComPrincipal: caixa.checked } : {}) };
    }
    return escolhas;
  }

  _alteracoesSistemas() {
    return this.sistemas?.length ? alteracoesClassificacao(this.sistemas, this._escolhasSistemas()) : [];
  }

  /** Marca as linhas alteradas, esconde a caixa do B_Vendas em quem é Fixo e acende o Salvar. */
  _atualizarEstadoSistemas() {
    const escolhas = this._escolhasSistemas();
    const alteradas = new Set(this._alteracoesSistemas().map((m) => String(m.id)));
    for (const s of this.sistemas) {
      const linha = this.container.querySelector(`[data-linha="${s.id}"]`);
      linha?.classList.toggle("is-alterado", alteradas.has(String(s.id)));
      // Fixo não tem versão, então não tem de quem depender: a caixa some.
      const caixa = this._caixaDependente(s.id);
      if (caixa) /** @type {HTMLElement} */ (caixa.closest("label")).hidden = !escolhas[String(s.id)]?.controlaVersao;
    }
    const n = alteradas.size;
    this.container.querySelector('[data-role="estado-sistemas"]').textContent =
      n === 0 ? "" : n === 1 ? "1 sistema alterado" : `${n} sistemas alterados`;
    this.container.querySelector('[data-role="rodape-sistemas"]').classList.toggle("is-sujo", n > 0);
    /** @type {HTMLButtonElement} */ (this.container.querySelector('[data-action="salvar-sistemas"]')).disabled = n === 0;
    /** @type {HTMLButtonElement} */ (this.container.querySelector('[data-action="desfazer-sistemas"]')).disabled = n === 0;
  }

  /** O filtro só esconde linhas: uma linha alterada e escondida continua contando no Salvar. */
  _filtrarSistemas() {
    const termo = /** @type {HTMLInputElement} */ (this.container.querySelector('[data-role="filtro-sistemas"]')).value.trim();
    const visiveis = new Set(
      (termo ? filtrarPorBusca(this.sistemas, termo, (s) => ({ titulo: s.nome })) : this.sistemas).map((s) => String(s.id))
    );
    for (const linha of this.container.querySelectorAll("[data-linha]")) {
      /** @type {HTMLElement} */ (linha).hidden = !visiveis.has(/** @type {HTMLElement} */ (linha).dataset.linha);
    }
    const total = this.container.querySelector('[data-role="total-sistemas"]');
    total.textContent = termo ? `${visiveis.size} de ${this.sistemas.length}` : `${this.sistemas.length} sistemas`;
  }

  /**
   * Um pedido por sistema, em sequência (a rota é por sistema). Se algum
   * falhar, os que já foram ficam salvos e a mensagem diz quais faltaram --
   * melhor que desfazer tudo por causa de um.
   * @param {HTMLButtonElement} botao
   */
  async _salvarSistemas(botao) {
    const mudancas = this._alteracoesSistemas();
    if (mudancas.length === 0) return;
    const liberar = marcarOcupado(botao);
    const falhas = [];
    for (const { id, ...corpo } of mudancas) {
      try {
        await this.api.patch(`/sistemas/${id}/classificacao`, corpo);
      } catch (err) {
        falhas.push(`${this.sistemas.find((s) => s.id === id)?.nome || id}: ${err.message || "erro inesperado"}`);
      }
    }
    for (const chave of ["resumo", "sistemas:", "consulta:", "atualizacoes:"]) this.cache?.invalidar(chave);
    liberar();
    const salvos = mudancas.length - falhas.length;
    // Recarrega do servidor: as que falharam voltam ao valor salvo, e a tela
    // mostra a verdade em vez do que se tentou. Zerar a lista antes é o que
    // deixa `_carregarSistemas` passar pela trava de "há alteração".
    this.sistemas = [];
    await this._carregarSistemas();
    if (falhas.length === 0) avisoRapido.sucesso(salvos === 1 ? "Classificação salva para a equipe." : `${salvos} sistemas reclassificados para a equipe.`);
    else Modal.alert("Alguns sistemas não foram salvos", `${salvos} salvo(s). Não foi possível salvar:\n\n${falhas.join("\n")}`, "warning");
  }

  destroy() {
    this._desfazerPendenciaSistemas?.();
    super.destroy();
  }
}
