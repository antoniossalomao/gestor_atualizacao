import { View } from "../app/View.js";
import { SortableTable } from "../components/SortableTable.js";
import { Modal } from "../components/Modal.js";
import { toast } from "../components/Toast.js";
import { emptyState } from "../components/EmptyState.js";
import { ApiError } from "../api/ApiClient.js";
import { prefs } from "../app/prefs.js";
import { debounce } from "../utils/debounce.js";
import { isValidDateBR, mascaraDataBR, todayBR } from "../utils/date.js";
import { baixarBlob } from "../components/arquivos.js";
import { html } from "../utils/html.js";
import { iconHtml } from "../utils/icons.js";
import { withBusyButton } from "../components/botaoOcupado.js";
import { filtrarClientesCampanha, tarefaDaCampanha } from "../domain/campanhas.js";
import {
  listaCampanhas,
  cabecalhoCampanha,
  filtrosCampanha,
  celulaSituacaoCampanha,
  celulaClienteCampanha,
  celulaUltimaCampanha,
  acoesClienteCampanha,
  formularioCampanha,
  contagemClientes,
} from "../templates/campanhas.js";
import { AcessosModal } from "./AcessosModal.js";

/**
 * Aba Campanhas (E11): metas temporárias de versão -- "todo cliente de B_NFe
 * na 25/09/2026 até o dia 30" -- e o andamento delas.
 *
 * A tela não decide quem está atendido: o servidor calcula a partir dos
 * atualizações (ver server/src/services/CampanhaService.js). Por isso não
 * existe botão de "dar baixa": a baixa é registrar a atualização, como
 * sempre, e a campanha só enxerga isso.
 *
 * Duas colunas: a lista de campanhas à esquerda e o detalhe da escolhida à
 * direita. No celular, uma embaixo da outra.
 */
export class CampanhasView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    const salvo = prefs.get("campanhas:filtros", {});
    this.mostrarEncerradas = salvo.encerradas === true;
    this.filtro = salvo.filtro || "pendente";
    this.busca = "";
    this.selecionadaId = salvo.selecionadaId ?? null;
    this.campanhas = [];
    this.detalhe = null;
    this._buildDom();
  }

  _buildDom() {
    const podeCriar = this.user?.role !== "consulta";
    this.container.innerHTML = String(html`
      <div class="card campanhas">
        <div class="campanhas__topo">
          <div class="campanhas__alternar" role="group" aria-label="Campanhas exibidas">
            <button type="button" class="filtro-rapido" data-lista="ativas">Ativas</button>
            <button type="button" class="filtro-rapido" data-lista="encerradas">Encerradas</button>
          </div>
          ${podeCriar ? html`<button type="button" class="btn btn--accent btn--small" data-action="nova">${iconHtml("plus")} Nova campanha</button>` : ""}
        </div>
        <div class="campanhas__grade">
          <nav class="campanhas__lista" data-role="lista" aria-label="Campanhas"></nav>
          <section class="campanhas__detalhe" data-role="detalhe" aria-live="polite">
            <div data-role="cabecalho"></div>
            <div class="toolbar campanhas__toolbar" data-role="toolbar-clientes" hidden>
              <div class="filtros-rapidos" data-role="filtros" role="group" aria-label="Filtrar clientes da campanha"></div>
              <input class="input campanhas__busca" data-role="busca" type="search" autocomplete="off" placeholder="Buscar cliente, código ou cidade" aria-label="Buscar cliente, código ou cidade" />
              <div class="toolbar-spacer"></div>
              <span class="result-count" data-role="count" aria-live="polite"></span>
            </div>
            <div class="campanhas__tabela" data-role="table" hidden></div>
          </section>
        </div>
      </div>`);

    this.listaEl = this.container.querySelector('[data-role="lista"]');
    this.cabecalhoEl = this.container.querySelector('[data-role="cabecalho"]');
    this.toolbarClientes = this.container.querySelector('[data-role="toolbar-clientes"]');
    this.filtrosEl = this.container.querySelector('[data-role="filtros"]');
    this.tableEl = this.container.querySelector('[data-role="table"]');

    this.table = new SortableTable(this.tableEl, {
      // Ao lado da lista de campanhas não cabem sete colunas: código e
      // cidade vão embaixo do nome, a versão recebida embaixo da data (a
      // busca e a planilha continuam com tudo). Só as colunas curtas têm
      // largura fixa; o nome fica com o resto.
      columns: [
        { key: "nome", label: "Cliente", title: (row) => row.nome, render: (row) => no(celulaClienteCampanha(row)) },
        { key: "ultima", label: "Última atualização", type: "date", largura: "150px", render: (row) => no(celulaUltimaCampanha(row)) },
        { key: "situacao", label: "Situação", largura: "170px", render: (row) => no(celulaSituacaoCampanha(row)) },
        { key: "acoes", label: "Ações", largura: "116px", render: (row) => no(acoesClienteCampanha(row, { role: this.user?.role, encerrada: Boolean(this.detalhe?.encerradaEm) })) },
      ],
      rowKey: (row) => row.id,
      caption: "Clientes da campanha",
      onSelect: () => {},
      emptyNode: () => emptyState({
        titulo: "Nenhum cliente neste filtro",
        descricao: this.filtro === "pendente" ? "Ninguém pendente: todos atualizados ou já agendados." : "Troque o filtro ou limpe a busca.",
        icone: "busca",
      }),
    });

    this.container.querySelector(".campanhas__alternar").addEventListener("click", (e) => {
      const botao = e.target.closest("[data-lista]");
      if (!botao) return;
      this.mostrarEncerradas = botao.dataset.lista === "encerradas";
      this.selecionadaId = null;
      this._salvar();
      this.refresh();
    });
    this.container.querySelector('[data-action="nova"]')?.addEventListener("click", () => this._abrirFormulario());
    this.listaEl.addEventListener("click", (e) => {
      const cartao = e.target.closest("[data-campanha]");
      if (!cartao) return;
      this.selecionadaId = Number(cartao.dataset.campanha);
      this._salvar();
      this._pintarLista();
      this._carregarDetalhe();
    });
    this.cabecalhoEl.addEventListener("click", (e) => this._acaoCampanha(e));
    this.filtrosEl.addEventListener("click", (e) => {
      const botao = e.target.closest("[data-filtro]");
      if (!botao) return;
      this.filtro = botao.dataset.filtro;
      this._salvar();
      this._pintarClientes();
    });
    const buscar = debounce(() => this._pintarClientes(), 180);
    this.container.querySelector('[data-role="busca"]').addEventListener("input", (e) => {
      this.busca = /** @type {HTMLInputElement} */ (e.target).value;
      buscar();
    });
    this.tableEl.addEventListener("click", (e) => this._acaoLinha(e));
  }

  /** "Nova Campanha" da Ação rápida (App._abrirAcoesRapidas) chega aqui com `novo`. */
  aplicarParams({ novo } = {}) {
    if (!novo || this.user?.role === "consulta") return;
    this._abrirFormulario();
  }

  async refresh() {
    for (const b of this.container.querySelectorAll("[data-lista]")) {
      const ativo = (b.getAttribute("data-lista") === "encerradas") === this.mostrarEncerradas;
      b.classList.toggle("is-active", ativo);
      b.setAttribute("aria-pressed", String(ativo));
    }
    const situacao = this.mostrarEncerradas ? "encerradas" : "ativas";
    try {
      await this.swr(`campanhas:lista:${situacao}`, () => this.api.get("/campanhas", { situacao }, { key: "campanhas:lista" }), (lista) => {
        this.campanhas = lista;
        if (!lista.some((c) => c.id === this.selecionadaId)) this.selecionadaId = lista[0]?.id ?? null;
        this._pintarLista();
      });
    } catch (err) {
      // Falha de carga já aparece no aviso fixo da tela (View.swr); um modal
      // em cima dele era o mesmo recado duas vezes.
      if (!err?.cancelled && !err?.avisadoNaTela) Modal.alert("Erro", mensagem(err), "error");
      return;
    }
    await this._carregarDetalhe();
  }

  _pintarLista() {
    // Sem nenhuma campanha, a coluna da lista some e o vazio do detalhe ocupa
    // o cartão inteiro (ver .campanhas.is-vazia no CSS).
    this.container.querySelector(".campanhas").classList.toggle("is-vazia", this.campanhas.length === 0);
    this.listaEl.innerHTML = String(listaCampanhas(this.campanhas, this.selecionadaId, { encerradas: this.mostrarEncerradas, podeCriar: this.user?.role !== "consulta" }));
  }

  async _carregarDetalhe() {
    if (this.selecionadaId == null) {
      this.detalhe = null;
      this.cabecalhoEl.replaceChildren(emptyState({
        titulo: this.mostrarEncerradas ? "Nenhuma campanha encerrada" : "Nenhuma campanha ativa",
        descricao: "Uma campanha acompanha quantos clientes já receberam uma versão crítica, como a de uma Nota Técnica da SEFAZ.",
        icone: "campanhas",
        acao: this.user?.role !== "consulta" && !this.mostrarEncerradas ? { label: "Nova campanha", onClick: () => this._abrirFormulario() } : undefined,
      }));
      this.toolbarClientes.hidden = true;
      this.tableEl.hidden = true;
      return;
    }
    const id = this.selecionadaId;
    this.table.setRefreshing(true);
    try {
      await this.swr(`campanhas:detalhe:${id}`, () => this.api.get(`/campanhas/${id}`, null, { key: "campanhas:detalhe" }), (d) => {
        if (d.id !== this.selecionadaId) return;
        this.detalhe = d;
        this.cabecalhoEl.innerHTML = String(cabecalhoCampanha(d, this.user));
        this.toolbarClientes.hidden = false;
        this.tableEl.hidden = false;
        this._pintarClientes();
      });
    } catch (err) {
      if (err?.status === 404) {
        this.selecionadaId = null;
        this.cache?.invalidar();
        return this.refresh();
      }
      if (!err?.cancelled && !err?.avisadoNaTela) Modal.alert("Erro", mensagem(err), "error");
    } finally {
      this.table.setRefreshing(false);
    }
  }

  _pintarClientes() {
    if (!this.detalhe) return;
    const clientes = this.detalhe.clientes;
    const contagens = { todos: clientes.length };
    for (const c of clientes) contagens[c.situacao] = (contagens[c.situacao] || 0) + 1;
    this.filtrosEl.innerHTML = String(filtrosCampanha(this.filtro, contagens));
    const linhas = filtrarClientesCampanha(clientes, this.filtro, this.busca);
    this.table.setRows(linhas);
    this.container.querySelector('[data-role="count"]').textContent = contagemClientes(linhas.length);
  }

  async _acaoCampanha(e) {
    const botao = /** @type {HTMLButtonElement|null} */ (e.target.closest("button[data-action]"));
    if (!botao || !this.detalhe) return;
    const c = this.detalhe;
    const acao = botao.dataset.action;
    if (acao === "exportar") return withBusyButton(botao, () => this._exportar())();
    if (acao === "editar") return this._abrirFormulario(c);
    if (acao === "encerrar") {
      const ok = await Modal.confirm("Encerrar campanha", `Encerrar "${c.titulo}"?\n\nO placar de hoje (${c.atendidos} de ${c.totalClientes} atualizados) fica registrado. As atualizações continuam sendo registradas normalmente, e dá para reabrir depois.`, { confirmLabel: "Encerrar", danger: false });
      if (ok) await this._mudar(() => this.api.patch(`/campanhas/${c.id}/encerrar`), "Campanha encerrada.");
    }
    if (acao === "reabrir") await this._mudar(() => this.api.patch(`/campanhas/${c.id}/reabrir`), "Campanha reaberta.");
    if (acao === "excluir") {
      const ok = await Modal.confirm("Excluir campanha", `Excluir "${c.titulo}"?\n\nSó a campanha sai. Atualizações e agendamentos feitos por causa dela continuam.`, { confirmLabel: "Excluir", danger: true });
      if (ok) await this._mudar(() => this.api.delete(`/campanhas/${c.id}`), "Campanha excluída.");
    }
  }

  async _mudar(fazer, sucesso) {
    try {
      await fazer();
      toast.success(sucesso);
      this.cache?.invalidar();
      await this.refresh();
    } catch (err) {
      Modal.alert("Não foi possível concluir", mensagem(err), "error");
      this.cache?.invalidar();
      await this.refresh();
    }
  }

  async _exportar() {
    const c = this.detalhe;
    try {
      const blob = await this.api.getFile(`/campanhas/${c.id}/export`);
      baixarBlob(blob, `campanha-pendentes-${c.sistema}-${c.versaoAlvo.replaceAll("/", "-")}.xlsx`);
    } catch (err) {
      Modal.alert("Erro ao exportar", mensagem(err), "error");
    }
  }

  async _acaoLinha(e) {
    const botao = /** @type {HTMLButtonElement|null} */ (e.target.closest("[data-row-action]"));
    if (!botao || !this.detalhe) return;
    e.stopPropagation();
    const row = this.detalhe.clientes.find((c) => String(c.id) === botao.dataset.id);
    if (!row) return;
    const acao = botao.dataset.rowAction;
    if (acao === "ficha") return this.navigate("consulta", { cliente: row.nome });
    if (acao === "acessos") return new AcessosModal(this.api, { id: row.id, nome: row.nome }).open();
    if (acao === "agendar") {
      const c = this.detalhe;
      // Cria a tarefa direto, sem abrir o formulário: é o "botão rápido" da
      // campanha. A tarefa leva o sistema da campanha -- é isso que a faz
      // aparecer como "já agendado" aqui (ver CampanhaService).
      await withBusyButton(botao, async () => {
        try {
          await this.api.post("/agendamentos", {
            tarefa: tarefaDaCampanha(c),
            cliente: row.nome,
            sistema: c.sistema,
            responsavel: this.user?.nome || "",
            prioridade: c.prazo ? "Alta" : "Normal",
            data: todayBR(),
            obs: c.prazo ? `Prazo da campanha: ${c.prazo}` : "",
          });
          toast.success(`Agendamento criado para ${row.nome}.`);
          this.cache?.invalidar();
          await this.refresh();
        } catch (err) {
          Modal.alert("Não foi possível agendar", mensagem(err), "error");
        }
      })();
    }
  }

  async _abrirFormulario(campanha) {
    let sistemas = [];
    let cidades = [];
    try {
      cidades = await this.api.get("/clientes/cidades", null, { key: "clientes:cidades" });
    } catch (err) {
      return Modal.alert("Erro", mensagem(err), "error");
    }
    if (!campanha) {
      try {
        sistemas = await this.api.get("/sistemas/versoes", null, { key: "sistemas:versoes" });
      } catch (err) {
        return Modal.alert("Erro", mensagem(err), "error");
      }
      if (sistemas.length === 0) return Modal.alert("Nova campanha", "Nenhum sistema atualizável cadastrado. Os sistemas fixos não têm versão para cobrar.", "info");
    }
    const { box, close } = Modal.abrirCaixa({ largura: 600 });
    box.setAttribute("aria-labelledby", "campanha-form-titulo");
    box.innerHTML = String(formularioCampanha({ sistemas, cidades, campanha }));
    const form = /** @type {HTMLFormElement} */ (box.querySelector('[data-role="form"]'));
    const campo = (nome) => /** @type {HTMLInputElement} */ (form.querySelector(`[data-field="${nome}"]`));
    const erro = form.querySelector('[data-role="erro"]');
    for (const nome of ["versaoAlvo", "prazo"]) {
      campo(nome)?.addEventListener("input", (e) => {
        const alvo = /** @type {HTMLInputElement} */ (e.target);
        alvo.value = mascaraDataBR(alvo.value);
      });
    }
    // Sugere a oficial atual do sistema como versão-alvo: é o caso mais
    // comum ("todo mundo na versão que acabou de sair"), e dá para trocar.
    const sugerir = () => {
      const opcao = /** @type {HTMLSelectElement} */ (campo("sistema")).selectedOptions[0];
      if (!campo("versaoAlvo").dataset.editado) campo("versaoAlvo").value = opcao?.dataset.oficial || "";
    };
    if (!campanha) {
      campo("sistema").addEventListener("change", sugerir);
      campo("versaoAlvo").addEventListener("input", () => { campo("versaoAlvo").dataset.editado = "1"; });
      sugerir();
    }
    form.querySelector('[data-action="cancelar"]').addEventListener("click", () => close());
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const dados = {
        titulo: campo("titulo").value.trim(),
        prazo: campo("prazo").value.trim(),
        cidade: campo("cidade").value,
        descricao: /** @type {HTMLTextAreaElement} */ (form.querySelector('[data-field="descricao"]')).value.trim(),
        ...(campanha ? {} : { sistema: campo("sistema").value, versaoAlvo: campo("versaoAlvo").value.trim() }),
      };
      const versaoRuim = !campanha && (!dados.versaoAlvo || !isValidDateBR(dados.versaoAlvo));
      const invalido = !dados.titulo ? ["titulo", "Informe o título."]
        : versaoRuim ? ["versaoAlvo", "Versão-alvo precisa ser uma data dd/mm/aaaa."]
          : dados.prazo && !isValidDateBR(dados.prazo) ? ["prazo", "Prazo precisa ser uma data dd/mm/aaaa."] : null;
      for (const nome of ["titulo", "versaoAlvo", "prazo"]) campo(nome)?.setAttribute("aria-invalid", "false");
      if (invalido) {
        erro.textContent = invalido[1];
        campo(invalido[0]).setAttribute("aria-invalid", "true");
        campo(invalido[0]).focus();
        return;
      }
      const salvar = /** @type {HTMLButtonElement} */ (form.querySelector('[data-action="salvar"]'));
      await withBusyButton(salvar, async () => {
        try {
          const salva = campanha ? await this.api.put(`/campanhas/${campanha.id}`, dados) : await this.api.post("/campanhas", dados);
          close();
          toast.success(campanha ? "Campanha atualizada." : "Campanha criada.");
          this.mostrarEncerradas = Boolean(salva.encerradaEm);
          this.selecionadaId = salva.id;
          this._salvar();
          this.cache?.invalidar();
          await this.refresh();
        } catch (err) {
          erro.textContent = mensagem(err);
        }
      })();
    });
    campo(campanha ? "titulo" : "sistema").focus();
  }

  _salvar() {
    prefs.set("campanhas:filtros", { encerradas: this.mostrarEncerradas, filtro: this.filtro, selecionadaId: this.selecionadaId });
  }
}

/** HtmlSeguro -> nó, para as colunas da SortableTable (que pedem Node). */
function no(marcacao) {
  const t = document.createElement("template");
  t.innerHTML = String(marcacao);
  return t.content;
}

function mensagem(err) {
  return err instanceof ApiError ? err.message : "Ocorreu um erro inesperado.";
}
