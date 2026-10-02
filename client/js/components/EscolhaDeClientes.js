import { aguardarPausa } from "../utils/aguardarPausa.js";
import { plural } from "../utils/html.js";
import { filtrarCandidatos, filtrosEscolhaVazios, opcoesFiltroEscolha, podeFiltrarQuemFalta } from "../domain/campanhas.js";
import { filtrosEscolhaClientes, listaEscolhaClientes } from "../templates/campanhas.js";

/**
 * Lista de clientes de um sistema onde se escolhe quem entra numa campanha:
 * busca, filtros (cidade, grupo, regime, "só quem falta") e "marcar os
 * visíveis". Usada no formulário da campanha e no "Adicionar clientes" do
 * detalhe -- por isso mora em components/, e não dentro de uma tela.
 *
 * A seleção mora aqui, num `Set`, e não nos checkboxes: filtrar refaz a
 * lista, e quem estava marcado e saiu da tela não pode ser desmarcado por
 * isso.
 *
 * Marcação esperada dentro de `raiz`: `blocoEscolhaClientes()` em
 * templates/campanhas.js.
 */
export class EscolhaDeClientes {
  /**
   * @param {HTMLElement} raiz
   * @param {import("../api/ApiPainel.js").ApiPainel} api
   * @param {{
   *   marcados?: Iterable<number>,
   *   excluir?: Set<number>,
   *   contagem?: (marcados: number, total: number) => string,
   *   aoErro?: (err: any) => void,
   * }} [opcoes] `excluir`: clientes que nem aparecem (já estão na campanha)
   */
  constructor(raiz, api, { marcados = [], excluir = new Set(), contagem, aoErro = () => {} } = {}) {
    this.raiz = raiz;
    this.api = api;
    this.marcados = new Set(marcados);
    this.excluir = excluir;
    this.aoErro = aoErro;
    this.contagem = contagem || ((n, total) => `${plural(n, "cliente escolhido", "clientes escolhidos")} de ${total}`);
    this.filtros = filtrosEscolhaVazios();
    /** @type {Array<any>} */
    this.candidatos = [];
    this.carregadoPara = null;

    this.busca = /** @type {HTMLInputElement} */ (this._papel("busca-escolha"));
    raiz.addEventListener("change", (e) => this._aoMudar(e));
    this.busca.addEventListener("input", aguardarPausa(() => {
      this.filtros.busca = this.busca.value;
      this._pintarLista();
    }, 150));
    raiz.querySelector('[data-action="marcar-visiveis"]').addEventListener("click", () => {
      for (const c of filtrarCandidatos(this.candidatos, this.filtros)) this.marcados.add(c.id);
      this._pintarLista();
    });
    raiz.querySelector('[data-action="limpar-escolha"]').addEventListener("click", () => {
      this.marcados.clear();
      this._pintarLista();
    });
  }

  /** Ids escolhidos, na ordem em que foram marcados. */
  ids() {
    return [...this.marcados];
  }

  focar() {
    this.busca.focus();
  }

  /** Outro sistema, outros clientes possíveis: a escolha anterior não vale mais. */
  esquecer() {
    this.marcados.clear();
    this.carregadoPara = null;
  }

  /**
   * Busca os candidatos e pinta a lista. Não refaz o pedido se sistema e
   * versão-alvo são os mesmos da última carga.
   * @param {{sistema: string, versaoAlvo?: string}} alvo
   */
  async carregar({ sistema, versaoAlvo = "" }) {
    const chave = `${sistema}|${versaoAlvo}`;
    if (this.carregadoPara === chave) return;
    let lista;
    try {
      lista = await this.api.get("/campanhas/clientes-do-sistema", { sistema, versaoAlvo }, { key: "campanhas:candidatos" });
    } catch (err) {
      if (!err?.cancelled) this.aoErro(err);
      return;
    }
    this.carregadoPara = chave;
    this.candidatos = lista.filter((c) => !this.excluir.has(c.id));
    const ids = new Set(this.candidatos.map((c) => c.id));
    for (const id of [...this.marcados]) if (!ids.has(id)) this.marcados.delete(id);
    // Outro sistema pode não ter a cidade/grupo/regime que estava filtrado.
    const opcoes = opcoesFiltroEscolha(this.candidatos);
    if (!opcoes.cidades.includes(this.filtros.cidade)) this.filtros.cidade = "";
    if (!opcoes.grupos.includes(this.filtros.grupo)) this.filtros.grupo = "";
    if (!opcoes.regimes.includes(this.filtros.regime)) this.filtros.regime = "";
    this._pintarFiltros();
    this._pintarLista();
  }

  _papel(nome) {
    return /** @type {HTMLElement} */ (this.raiz.querySelector(`[data-role="${nome}"]`));
  }

  _aoMudar(e) {
    const alvo = /** @type {HTMLInputElement} */ (e.target);
    const filtro = alvo.dataset?.filtroEscolha;
    if (filtro) {
      this.filtros[filtro] = alvo.type === "checkbox" ? alvo.checked : alvo.value;
      return this._pintarLista();
    }
    if (!alvo.closest('[data-role="lista-escolha"]')) return;
    if (alvo.checked) this.marcados.add(Number(alvo.value));
    else this.marcados.delete(Number(alvo.value));
    this._pintarLista();
  }

  _pintarLista() {
    const visiveis = filtrarCandidatos(this.candidatos, this.filtros);
    this._papel("lista-escolha").innerHTML = String(listaEscolhaClientes(visiveis, this.marcados));
    this._papel("contagem-escolha").textContent = this.contagem(this.marcados.size, this.candidatos.length);
  }

  _pintarFiltros() {
    const pode = podeFiltrarQuemFalta(this.candidatos);
    if (!pode) this.filtros.soQuemFalta = false;
    this._papel("filtros-escolha").innerHTML = String(filtrosEscolhaClientes(opcoesFiltroEscolha(this.candidatos), this.filtros, { podeFiltrarQuemFalta: pode }));
  }
}
