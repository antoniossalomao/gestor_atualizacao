import { View } from "../app/View.js";
import { TabelaOrdenavel } from "../components/TabelaOrdenavel.js";
import { misturarHex } from "../utils/cor.js";
import { tokenHex } from "../app/tema.js";
import { aguardarPausa } from "../utils/aguardarPausa.js";
import { formatarDataHora, dataBRValida, mascaraDataBR } from "../utils/data.js";
import { ErroApi } from "../api/ApiPainel.js";
import { Modal } from "../components/Modal.js";
import { estadoVazio } from "../components/estadoVazio.js";
import { escaparHtml, plural } from "../utils/html.js";
import { prefs } from "../app/preferencias.js";
import { filtrarClientesDoSistema } from "../domain/filtrosSistemas.js";

/** Consulta por sistema; a referência oficial só pode ser editada no painel próprio. */
/*
 * Até 30/09/2026 o filtro de data era salvo com o termo antigo que a equipe
 * aboliu (A14). Quem já tinha uma data salva continua com ela. A chave é
 * montada em partes porque client/tests/vocabulario.test.mjs recusa o termo
 * escrito por extenso -- de propósito, sem exceção para este arquivo.
 */
const CHAVE_ANTIGA_DATA = ["atend", "imentoAntesDe"].join("");

export class SistemasView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    const salvo = prefs.get("sistemas:filtros", {});
    this.sistema = salvo.sistema || "";
    // "Sem informação" saiu do filtro em 30/09/2026 (nunca atualizado passou
    // a ser desatualizado): uma escolha salva com ele não casaria com opção
    // nenhuma, e a lista abriria vazia sem motivo aparente.
    this.situacao = salvo.situacao && salvo.situacao !== "Sem informação" ? salvo.situacao : "Todos";
    this.busca = salvo.busca || "";
    this.atualizacaoAntesDe = salvo.atualizacaoAntesDe || salvo[CHAVE_ANTIGA_DATA] || "";
    this.versoes = [];
    this.rows = [];
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = `
      <div class="card">
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
          <div class="toolbar-spacer"></div>
          <span class="result-count" data-role="count" aria-live="polite"></span>
          <button type="button" class="btn btn--ghost btn--small" data-action="filtros" aria-expanded="false" aria-controls="sis-filtros">Filtros</button>
          <button type="button" class="btn btn--ghost btn--small" data-action="oficiais" aria-expanded="false" aria-controls="sis-oficiais">Versões oficiais</button>
        </div>
        <!-- Mesmo painel recolhível de Atualizações (A10). A dica que ficava
             embaixo do campo empurrava o "Limpar data" para fora da linha e
             repetia o que o rótulo já diz; data inválida fica marcada no
             próprio campo, como nos filtros de período de Atualizações. -->
        <div id="sis-filtros" class="filtros-painel" hidden>
          <div class="field field--data">
            <label class="field__label" for="sis-antes">Última atualização antes de</label>
            <input class="input" id="sis-antes" data-role="atualizacao-antes" placeholder="dd/mm/aaaa" inputmode="numeric" />
          </div>
          <button type="button" class="btn btn--small btn--ghost" data-action="limpar-data">Limpar data</button>
        </div>
        <p class="sistemas-referencia" data-role="referencia"></p>
        <section id="sis-oficiais" class="sistemas-oficiais" aria-label="Versões oficiais" hidden>
          <div class="sistemas-oficiais__cabecalho">
            <div><h2>Versões oficiais</h2><p>Novas atualizações recebem a referência vigente. As versões recebidas nas atualizações anteriores permanecem. Deixe o campo vazio para limpar a referência.</p></div>
            <button type="button" class="btn" data-action="fechar-oficiais">Fechar</button>
          </div>
          <div data-role="oficiais-lista"></div>
        </section>
        <div data-role="table"></div>
      </div>`;

    this.table = new TabelaOrdenavel(this.container.querySelector('[data-role="table"]'), {
      ocuparAltura: true,
      columns: [
        { key: "cliente", label: "Cliente" },
        {
          key: "ultima",
          label: "Última atualização",
          type: "date",
          // NFCe e Consignado M2 são julgados pela data do B_Vendas (A13):
          // sem a nota, a data parecia de uma atualização que não existe.
          render: (row) => {
            const celula = document.createElement("span");
            celula.textContent = row.ultima;
            if (row.pelaDataDe) {
              const nota = document.createElement("small");
              nota.className = "pela-data";
              nota.textContent = `pela data do ${row.pelaDataDe}`;
              celula.appendChild(nota);
            }
            return celula;
          },
        },
        { key: "situacao", label: "Situação" },
        { key: "cidade", label: "Cidade" },
      ],
      rowKey: (row) => row.cliente,
      caption: "Clientes por sistema",
      rowStyle: (row, index) => ({ background: severidadeCor(row.situacao, index) }),
      onSelect: (row) => this.navigate("consulta", { cliente: row.cliente }),
      emptyNode: () => estadoVazio({
        titulo: "Nenhum cliente para os filtros",
        descricao: "Ajuste a situação, a busca ou a data. Se o sistema não tiver clientes, vincule-os na tela Clientes.",
        icone: "sistemas",
      }),
    });

    this.sistemaFilter = this.container.querySelector('[data-role="sistema-filter"]');
    this.situacaoFilter = this.container.querySelector('[data-role="situacao-filter"]');
    this.buscaInput = this.container.querySelector('[data-role="busca"]');
    this.dataInput = this.container.querySelector('[data-role="atualizacao-antes"]');
    this.botaoFiltros = this.container.querySelector('[data-action="filtros"]');
    this.botaoLimparFiltros = this.container.querySelector('[data-action="limpar-filtros"]');
    this.situacaoFilter.value = this.situacao;
    this.buscaInput.value = this.busca;
    this.dataInput.value = this.atualizacaoAntesDe;
    this._mostrarFiltrosAtivos();

    this.sistemaFilter.addEventListener("change", () => {
      this.sistema = this.sistemaFilter.value;
      this._salvarFiltros();
      this._mostrarReferencia();
      this._reloadList();
    });
    this.situacaoFilter.addEventListener("change", () => {
      this.situacao = this.situacaoFilter.value;
      this._salvarFiltros();
      this._filtrarRows();
    });
    const buscar = aguardarPausa(() => {
      this.busca = this.buscaInput.value.trim();
      this._salvarFiltros();
      this._filtrarRows();
    }, 180);
    this.buscaInput.addEventListener("input", buscar);
    const consultar = aguardarPausa(() => {
      this.atualizacaoAntesDe = this.dataInput.value.trim();
      this._salvarFiltros();
      this._reloadList();
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
      this._reloadList();
      this.dataInput.focus();
    });
    this.botaoLimparFiltros.addEventListener("click", () => this._limparFiltros());
    this.container.querySelector('[data-action="filtros"]').addEventListener("click", () => this._alternar("filtros"));
    this.container.querySelector('[data-action="oficiais"]').addEventListener("click", () => this._alternar("oficiais"));
    this.container.querySelector('[data-action="fechar-oficiais"]').addEventListener("click", () => this._fecharOficiais());
    this.container.querySelector('[data-role="oficiais-lista"]').addEventListener("click", (e) => this._acaoOficial(e));
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
        if (this.versoes.some((s) => s.nome === this.sistema)) this.sistemaFilter.value = this.sistema;
        this.sistema = this.sistemaFilter.value;
        this._salvarFiltros();
        this._mostrarReferencia();
        this._renderOficiais();
      }
    );
    await this._reloadList();
  }

  _mostrarReferencia() {
    const oficial = this.versoes.find((s) => s.nome === this.sistema)?.data;
    this.container.querySelector('[data-role="referencia"]').textContent = this.sistema
      ? `Versão oficial de ${this.sistema}: ${oficial || "não cadastrada"}`
      : "Nenhum sistema atualizável cadastrado.";
  }

  _alternar(tipo) {
    const botao = this.container.querySelector(`[data-action="${tipo}"]`);
    const painel = this.container.querySelector(`#sis-${tipo}`);
    painel.hidden = !painel.hidden;
    botao.setAttribute("aria-expanded", String(!painel.hidden));
    if (tipo === "oficiais" && !painel.hidden) this._renderOficiais();
    if (!painel.hidden) painel.querySelector("input, button")?.focus();
  }

  _fecharOficiais() {
    this.container.querySelector("#sis-oficiais").hidden = true;
    this.container.querySelector('[data-action="oficiais"]').setAttribute("aria-expanded", "false");
    this._renderOficiais(); // descarta qualquer edição sem gravar
    this.container.querySelector('[data-action="oficiais"]').focus();
  }

  _renderOficiais() {
    const lista = this.container.querySelector('[data-role="oficiais-lista"]');
    lista.innerHTML = this.versoes.map((s, i) => `
      <div class="sistemas-oficiais__row" data-index="${i}">
        <div><strong>${escaparHtml(s.nome)}</strong><span data-role="valor">${escaparHtml(s.data || "Sem referência")}</span>
          <small>${s.alteradaEm ? `Alterada por ${escaparHtml(s.autor || "não informado")} em ${escaparHtml(formatarDataHora(s.alteradaEm))}` : "Autor e data não registrados"}</small></div>
        <div class="sistemas-oficiais__acoes">
          <input class="input" data-role="edicao" aria-label="Versão oficial de ${escaparHtml(s.nome)}" placeholder="dd/mm/aaaa" inputmode="numeric" hidden />
          <button type="button" class="btn" data-action="editar" ${this.user?.role === "consulta" ? "hidden" : ""}>Editar</button>
          <button type="button" class="btn btn--accent" data-action="salvar" hidden>Salvar</button>
          <button type="button" class="btn" data-action="cancelar" hidden>Cancelar</button>
        </div>
      </div>`).join("");
    if (this.versoes.length === 0) lista.textContent = "Nenhum sistema atualizável cadastrado.";
  }

  async _acaoOficial(e) {
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
    if (botao.dataset.action === "cancelar") { this._renderOficiais(); return; }
    if (botao.dataset.action !== "salvar") return;
    const data = mascaraDataBR(campo.value.trim());
    if (data && !dataBRValida(data)) {
      campo.setAttribute("aria-invalid", "true");
      campo.focus();
      return;
    }
    botao.disabled = true;
    try {
      await this.api.put(`/sistemas/${encodeURIComponent(sistema.nome)}/versao`, { data, versaoEsperada: sistema.data || "" });
      this.cache?.invalidar();
      await this.refresh();
    } catch (err) {
      if (err.status === 409) {
        this.cache?.invalidar();
        try { await this.refresh(); } catch { /* a mensagem de conflito continua sendo a informação principal */ }
      }
      Modal.alert("Não foi possível salvar", mensagemDeErro(err), "error");
    } finally {
      botao.disabled = false;
    }
  }

  async _reloadList() {
    if (!this.sistema) {
      this.rows = [];
      this._filtrarRows();
      return;
    }
    if (this.atualizacaoAntesDe && !dataBRValida(this.atualizacaoAntesDe)) return;
    this.table.definirRecarregando(true);
    try {
      await this.swr(
        `sistemas:lista:${this.sistema}|${this.atualizacaoAntesDe}`,
        () => this.api.get("/atualizacoes/por-sistema", { sistema: this.sistema, atualizacaoAntesDe: this.atualizacaoAntesDe }, { key: "sistemas:lista" }),
        (rows) => { this.rows = rows; this._filtrarRows(); }
      );
    } catch (err) {
      // Falha de carga já aparece no aviso fixo da tela (View.swr); um modal
      // em cima dele era o mesmo recado duas vezes.
      if (!err?.cancelled && !err?.avisadoNaTela) Modal.alert("Erro", mensagemDeErro(err), "error");
    } finally {
      this.table.definirRecarregando(false);
    }
  }

  _filtrarRows() {
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
    this.botaoFiltros.textContent = this.atualizacaoAntesDe ? "Filtros (1)" : "Filtros";
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
    if (recarregar) this._reloadList();
    else this._filtrarRows();
    this.buscaInput.focus();
  }
}

function severidadeCor(situacao, index) {
  const base = index % 2 === 0 ? tokenHex("--zebra-a") : tokenHex("--zebra-b");
  if (situacao === "Nunca atualizado") return misturarHex(base, tokenHex("--severidade-alta"), 0.28);
  if (situacao === "Desatualizado") return misturarHex(base, tokenHex("--severidade-alta"), 0.14);
  if (situacao === "Em dia") return misturarHex(base, tokenHex("--severidade-boa"), 0.08);
  return base;
}

function mensagemDeErro(err) {
  return err instanceof ErroApi ? err.message : "Ocorreu um erro inesperado.";
}
