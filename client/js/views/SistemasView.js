import { View } from "../app/View.js";
import { TabelaOrdenavel } from "../components/TabelaOrdenavel.js";
import { aguardarPausa } from "../utils/aguardarPausa.js";
import { formatarDataHora, dataBRValida, mascaraDataBR } from "../utils/data.js";
import { ErroApi } from "../api/ApiPainel.js";
import { Modal } from "../components/Modal.js";
import { estadoVazio } from "../components/estadoVazio.js";
import { escaparHtml, html, plural } from "../utils/html.js";
import { prefs } from "../app/preferencias.js";
import { filtrarClientesDoSistema } from "../domain/filtrosSistemas.js";
import { iconeHtml, iconeSvg } from "../utils/icones.js";
import { conectarPopover } from "../components/popover.js";

/** Consulta por sistema; a referência oficial só pode ser editada no painel próprio. */
/*
 * Até 30/09/2026 o filtro de data era salvo com o termo antigo que a equipe
 * aboliu (A14). Quem já tinha uma data salva continua com ela. A chave é
 * montada em partes porque client/tests/vocabulario.test.mjs recusa o termo
 * escrito por extenso -- de propósito, sem exceção para este arquivo.
 */
const CHAVE_ANTIGA_DATA = ["atend", "imentoAntesDe"].join("");
const SISTEMA_PADRAO = "B_Vendas";

export class SistemasView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    const salvo = prefs.get("sistemas:filtros", {});
    this.sistema = salvo.sistema || SISTEMA_PADRAO;
    // "Sem informação" saiu do filtro em 30/09/2026 (nunca atualizado passou
    // a ser desatualizado): uma escolha salva com ele não casaria com opção
    // nenhuma, e a lista abriria vazia sem motivo aparente.
    this.situacao = salvo.situacao && salvo.situacao !== "Sem informação" ? salvo.situacao : "Todos";
    this.busca = salvo.busca || "";
    this.atualizacaoAntesDe = salvo.atualizacaoAntesDe || salvo[CHAVE_ANTIGA_DATA] || "";
    this.versoes = [];
    this.rows = [];
    this._montarDom();
  }

  _montarDom() {
    this.container.innerHTML = `
      <div class="card sistemas-consulta">
        <div class="toolbar sistemas-toolbar">
          <div class="field">
            <label class="field__label" for="sis-filtro">Sistema</label>
            <select class="input" id="sis-filtro" data-role="sistema-filter"></select>
          </div>
          <div class="field">
            <label class="field__label" for="sis-situacao">Situação</label>
            <select class="input" id="sis-situacao" data-role="situacao-filter">
              <option>Todos</option><option>Em dia</option><option>Aguardando atualização</option><option>Desatualizados</option><option>Sem versão oficial</option>
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="sis-busca">Buscar cliente ou cidade</label>
            <input class="input" id="sis-busca" data-role="busca" type="search" autocomplete="off" />
          </div>
          <div class="toolbar__clear">
            <button type="button" class="btn btn--small btn--ghost" data-action="limpar-filtros" hidden>Limpar filtros</button>
          </div>
          <span class="result-count" data-role="count" aria-live="polite"></span>
          <div class="toolbar-spacer"></div>
          <button type="button" class="btn btn--toolbar-icon" data-action="filtros" popovertarget="sis-filtros" aria-label="Filtros" title="Filtros" aria-expanded="false" aria-controls="sis-filtros">${iconeSvg("filtro")}</button>
          <button type="button" class="btn btn--subtle btn--small" data-action="oficiais">${iconeSvg("versoes")} Versões oficiais</button>
        </div>
        <div id="sis-filtros" class="filtros-popover" popover="auto" aria-label="Filtros de data">
          <div class="filtros-popover__header">
            <span class="filtros-popover__title">Data de corte</span>
            <button type="button" class="btn btn--small btn--ghost" data-action="limpar-data">Limpar</button>
          </div>
          <div class="field field--data">
            <label class="field__label" for="sis-antes">Última atualização antes de</label>
            <input class="input" id="sis-antes" data-role="atualizacao-antes" placeholder="dd/mm/aaaa" inputmode="numeric" />
          </div>
        </div>
        <div class="sistemas-tabela" data-role="table"></div>
      </div>`;

    this.table = new TabelaOrdenavel(this.container.querySelector('[data-role="table"]'), {
      ocuparAltura: true,
      columns: [
        { key: "cliente", label: "Cliente", largura: "36%" },
        {
          key: "ultima",
          label: "Última atualização",
          type: "date",
          largura: "20%",
          // NFCe e Consignado M2 são julgados pela data do B_Vendas (A13):
          // sem a nota, a data parecia de uma atualização que não existe.
          render: (row) => {
            const celula = document.createElement("span");
            celula.textContent = row.ultima || "Não registrada";
            if (row.pelaDataDe) {
              const nota = document.createElement("small");
              nota.className = "pela-data";
              nota.textContent = `pela data do ${row.pelaDataDe}`;
              celula.appendChild(nota);
            }
            return celula;
          },
        },
        { key: "situacao", label: "Situação", largura: "24%" },
        { key: "cidade", label: "Cidade", largura: "20%" },
      ],
      rowKey: (row) => row.cliente,
      caption: "Clientes por sistema",
      rowClass: (row) => `row--com-situacao ${situacaoClasse(row.situacao)}`,
      onSelect: (row) => this.navigate("clientes", { cliente: row.cliente }),
      emptyNode: () => estadoVazio({
        titulo: "Nenhum cliente para os filtros",
        descricao: "Ajuste a situação, a busca ou a data. Se o sistema não tiver clientes, vincule-os na tela Clientes.",
        icone: "sistemas",
      }),
    });
    this.table.definirOrdem("ultima", true);

    this.sistemaFilter = this.container.querySelector('[data-role="sistema-filter"]');
    this.situacaoFilter = this.container.querySelector('[data-role="situacao-filter"]');
    this.buscaInput = this.container.querySelector('[data-role="busca"]');
    this.dataInput = this.container.querySelector('[data-role="atualizacao-antes"]');
    this.botaoFiltros = this.container.querySelector('[data-action="filtros"]');
    this.botaoLimparFiltros = this.container.querySelector('[data-action="limpar-filtros"]');
    this.situacaoFilter.value = this.situacao;
    this.buscaInput.value = this.busca;
    this.dataInput.value = this.atualizacaoAntesDe;
    conectarPopover(this.botaoFiltros, this.container.querySelector("#sis-filtros"));
    this._mostrarFiltrosAtivos();

    this.sistemaFilter.addEventListener("change", () => {
      this.sistema = this.sistemaFilter.value;
      this._salvarFiltros();
      this._recarregarLista();
    });
    this.situacaoFilter.addEventListener("change", () => {
      this.situacao = this.situacaoFilter.value;
      this._salvarFiltros();
      this._filtrarLinhas();
    });
    const buscar = aguardarPausa(() => {
      this.busca = this.buscaInput.value.trim();
      this._salvarFiltros();
      this._filtrarLinhas();
    }, 180);
    this.buscaInput.addEventListener("input", buscar);
    const consultar = aguardarPausa(() => {
      this.atualizacaoAntesDe = this.dataInput.value.trim();
      this._salvarFiltros();
      this._recarregarLista();
    }, 300);
    this.dataInput.addEventListener("input", () => {
      this.dataInput.value = mascaraDataBR(this.dataInput.value);
      const invalida = Boolean(this.dataInput.value) && !dataBRValida(this.dataInput.value);
      this.dataInput.setAttribute("aria-invalid", String(invalida));
      if (!invalida) consultar();
    });
    this.container.querySelector('[data-action="limpar-data"]').addEventListener("click", () => {
      this._limparData();
      this._salvarFiltros();
      this._recarregarLista();
      this.dataInput.focus();
    });
    this.botaoLimparFiltros.addEventListener("click", () => this._limparFiltros());
    this.container.querySelector('[data-action="oficiais"]').addEventListener("click", () => this._abrirOficiais());
  }

  aoEntrar() {
    this.table?.definirOrdem("ultima", true);
  }

  aplicarParams({ sistema } = {}) {
    if (!sistema) return;
    this.sistema = sistema;
    this._salvarFiltros();
  }

  async refresh() {
    // Pelo swr (P03): com `api.get` direto, o servidor fora do ar derrubava a
    // tela sem dizer de quando eram as versões oficiais mostradas.
    await this.swr(
      "sistemas:versoes",
      () => this.api.get("/sistemas/versoes", null, { key: "sistemas:versoes" }),
      (versoes) => {
        this.versoes = versoes;
        this.sistemaFilter.innerHTML = this.versoes.map((s) => `<option value="${escaparHtml(s.nome)}">${escaparHtml(s.nome)}</option>`).join("");
        const selecionado = this.versoes.find((s) => s.nome === this.sistema)
          || this.versoes.find((s) => s.nome.toLowerCase() === SISTEMA_PADRAO.toLowerCase());
        if (selecionado) this.sistemaFilter.value = selecionado.nome;
        this.sistema = this.sistemaFilter.value;
        this._salvarFiltros();
        this._desenharOficiais();
      }
    );
    await this._recarregarLista();
  }

  _abrirOficiais() {
    if (this._oficiaisModal) return;
    const { box, close } = Modal.abrirCaixa({
      largura: 640,
      classe: "sistemas-oficiais-modal",
      onClose: () => {
        this._oficiaisModal = null;
      },
    });
    const tituloId = `sis-oficiais-titulo-${Math.random().toString(36).slice(2, 8)}`;
    box.setAttribute("aria-labelledby", tituloId);
    box.innerHTML = html`
      <div class="sistemas-oficiais__cabecalho">
        <div>
          <h3 id="${tituloId}">Versões oficiais</h3>
          <p id="sis-oficiais-ajuda">Novas atualizações recebem a referência vigente; as versões recebidas anteriormente permanecem. Use dd/mm/aaaa ou deixe o campo vazio para limpar a referência.</p>
        </div>
        <button type="button" class="btn btn--icon btn--ghost" data-action="fechar-oficiais" aria-label="Fechar" title="Fechar (Esc)">${iconeHtml("fechar")}</button>
      </div>
      <p class="sistemas-oficiais__retorno" data-role="oficiais-retorno" role="status" aria-live="polite"></p>
      <div class="sistemas-oficiais__lista" data-role="oficiais-lista"></div>
    `;
    this._oficiaisModal = { box, close };
    box.querySelector('[data-action="fechar-oficiais"]').addEventListener("click", () => close());
    const lista = box.querySelector('[data-role="oficiais-lista"]');
    lista.addEventListener("click", (e) => this._acaoOficial(e));
    lista.addEventListener("input", (e) => {
      if (e.target && e.target.matches('[data-role="edicao"]')) {
        e.target.value = mascaraDataBR(e.target.value);
      }
    });
    lista.addEventListener("keydown", (e) => {
      if (e.target && e.target.matches('[data-role="edicao"]')) {
        const linha = e.target.closest("[data-index]");
        if (e.key === "Enter") {
          e.preventDefault();
          linha?.querySelector('[data-action="salvar"]')?.click();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          linha?.querySelector('[data-action="cancelar"]')?.click();
        }
      }
    });
    this._desenharOficiais();
    box.querySelector('[data-action="editar"], [data-action="fechar-oficiais"]')?.focus();
  }

  _desenharOficiais() {
    const lista = this._oficiaisModal?.box?.querySelector('[data-role="oficiais-lista"]');
    if (!lista) return;
    lista.innerHTML = this.versoes.map((s, i) => `
      <div class="sistemas-oficiais__row" data-index="${i}">
        <div class="sistemas-oficiais__info">
          <div class="sistemas-oficiais__titulo">
            <strong>${escaparHtml(s.nome)}</strong>
            <span class="badge ${s.data ? "badge--info" : "badge--muted"}" data-role="valor">${escaparHtml(s.data || "Sem referência")}</span>
          </div>
          <small>${s.alteradaEm ? `Alterada por ${escaparHtml(s.autor || "não informado")} em ${escaparHtml(formatarDataHora(s.alteradaEm))}` : "Autor e data não registrados"}</small>
        </div>
        <div class="sistemas-oficiais__acoes">
          <input class="input" data-role="edicao" aria-label="Versão oficial de ${escaparHtml(s.nome)}" aria-describedby="sis-oficiais-ajuda sis-oficial-erro-${i}" placeholder="dd/mm/aaaa" inputmode="numeric" hidden />
          <button type="button" class="btn btn--small" data-action="editar" ${this.user?.role === "consulta" ? "hidden" : ""}>${iconeSvg("editar")} Editar</button>
          <button type="button" class="btn btn--small btn--accent" data-action="salvar" hidden>Salvar</button>
          <button type="button" class="btn btn--small btn--ghost" data-action="cancelar" hidden>Cancelar</button>
        </div>
        <p class="sistemas-oficiais__erro" id="sis-oficial-erro-${i}" hidden>Informe uma data válida no formato dd/mm/aaaa.</p>
      </div>`).join("");
    if (this.versoes.length === 0) lista.textContent = "Nenhum sistema atualizável cadastrado.";
  }

  async _acaoOficial(e) {
    const box = this._oficiaisModal?.box;
    if (!box) return;
    const botao = e.target.closest("button[data-action]");
    const linha = botao?.closest("[data-index]");
    if (!linha) return;
    const sistema = this.versoes[Number(linha.dataset.index)];
    const campo = linha.querySelector('[data-role="edicao"]');
    if (botao.dataset.action === "editar") {
      campo.value = sistema.data || "";
      for (const acao of ["editar", "salvar", "cancelar"]) linha.querySelector(`[data-action="${acao}"]`).hidden = acao === "editar";
      campo.hidden = false;
      campo.focus();
      return;
    }
    if (botao.dataset.action === "cancelar") { this._desenharOficiais(); return; }
    if (botao.dataset.action !== "salvar") return;
    const data = mascaraDataBR(campo.value.trim());
    if (data && !dataBRValida(data)) {
      campo.setAttribute("aria-invalid", "true");
      linha.querySelector(".sistemas-oficiais__erro").hidden = false;
      campo.focus();
      return;
    }
    campo.setAttribute("aria-invalid", "false");
    linha.querySelector(".sistemas-oficiais__erro").hidden = true;
    const retorno = box.querySelector('[data-role="oficiais-retorno"]');
    retorno.textContent = `Salvando referência de ${sistema.nome}…`;
    botao.disabled = true;
    try {
      await this.api.put(`/sistemas/${encodeURIComponent(sistema.nome)}/versao`, { data, versaoEsperada: sistema.data || "" });
      this.cache?.invalidar();
      await this.refresh();
      retorno.textContent = data ? `Referência de ${sistema.nome} salva: ${data}.` : `Referência de ${sistema.nome} removida.`;
      box.querySelector(`[data-index="${linha.dataset.index}"] [data-action="editar"]`)?.focus();
    } catch (err) {
      retorno.textContent = "";
      if (err.status === 409) {
        this.cache?.invalidar();
        try { await this.refresh(); } catch { /* a mensagem de conflito continua sendo a informação principal */ }
      }
      Modal.alert("Não foi possível salvar", mensagemDeErro(err), "error");
    } finally {
      botao.disabled = false;
    }
  }

  async _recarregarLista() {
    if (!this.sistema) {
      this.rows = [];
      this._filtrarLinhas();
      return;
    }
    if (this.atualizacaoAntesDe && !dataBRValida(this.atualizacaoAntesDe)) return;
    this.table.definirRecarregando(true);
    try {
      await this.swr(
        `sistemas:lista:${this.sistema}|${this.atualizacaoAntesDe}`,
        () => this.api.get("/atualizacoes/por-sistema", { sistema: this.sistema, atualizacaoAntesDe: this.atualizacaoAntesDe }, { key: "sistemas:lista" }),
        (rows) => { this.rows = rows; this._filtrarLinhas(); }
      );
    } catch (err) {
      // Falha de carga já aparece no aviso fixo da tela (View.swr); um modal
      // em cima dele era o mesmo recado duas vezes.
      if (!err?.cancelled && !err?.avisadoNaTela) Modal.alert("Erro", mensagemDeErro(err), "error");
    } finally {
      this.table.definirRecarregando(false);
    }
  }

  _filtrarLinhas() {
    const rows = filtrarClientesDoSistema(this.rows, this.situacao, this.busca);
    this.table.definirLinhas(rows);
    this.container.querySelector('[data-role="count"]').textContent = plural(rows.length, "cliente");
  }

  _salvarFiltros() {
    prefs.set("sistemas:filtros", { sistema: this.sistema, situacao: this.situacao, busca: this.busca, atualizacaoAntesDe: this.atualizacaoAntesDe });
    this._mostrarFiltrosAtivos();
  }

  /**
   * Como em Atualizações: "Filtros (1)" quando há data escolhida -- com o
   * painel fechado, era a única pista de que a lista estava recortada -- e
   * "Limpar filtros" só quando há o que limpar. O sistema não conta: sempre
   * há um escolhido.
   */
  _mostrarFiltrosAtivos() {
    const ativo = Boolean(this.atualizacaoAntesDe);
    this.botaoFiltros.dataset.active = String(ativo);
    const label = ativo ? "Filtros (data de corte ativa)" : "Filtros";
    this.botaoFiltros.setAttribute("aria-label", label);
    this.botaoFiltros.title = label;
    this.botaoLimparFiltros.hidden = !(this.atualizacaoAntesDe || this.busca || this.situacao !== "Todos");
  }

  _limparData() {
    this.dataInput.value = "";
    this.atualizacaoAntesDe = "";
    this.dataInput.setAttribute("aria-invalid", "false");
  }

  _limparFiltros() {
    const recarregar = Boolean(this.atualizacaoAntesDe);
    this._limparData();
    this.situacao = "Todos";
    this.situacaoFilter.value = "Todos";
    this.busca = "";
    this.buscaInput.value = "";
    this._salvarFiltros();
    if (recarregar) this._recarregarLista();
    else this._filtrarLinhas();
    this.buscaInput.focus();
  }

  destroy() {
    this._oficiaisModal?.close?.();
    this.versoes = [];
    this.rows = [];
    this.table?.destroy?.();
    super.destroy();
  }
}

function situacaoClasse(situacao) {
  if (situacao === "Nunca atualizado" || situacao === "Desatualizado") return "sistemas-situacao--alta";
  if (situacao === "Em dia") return "sistemas-situacao--boa";
  if (situacao === "Aguardando atualização") return "sistemas-situacao--atencao";
  return "sistemas-situacao--neutra";
}

function mensagemDeErro(err) {
  return err instanceof ErroApi ? err.message : "Ocorreu um erro inesperado.";
}
