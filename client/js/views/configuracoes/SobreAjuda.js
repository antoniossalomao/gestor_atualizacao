import { aparencia } from "../../app/aparencia.js";
import { ATALHOS } from "../../app/atalhos.js";
import { html } from "../../utils/html.js";
import { COMO_USAR_TELAS, NOVIDADES, agruparNovidades, explicacaoSituacoes } from "../../domain/ajuda.js";
import { cabecalhoSecao } from "../../templates/secao.js";
import {
  SECOES_SOBRE,
  NOVIDADES_VISIVEIS,
  indiceSobre,
  cartaoVersao,
  linhaDoTempo,
  gradeTelas,
  legendaSituacoes,
  blocoAtalhos,
  cartoesSuporte,
} from "../../templates/sobre.js";
import { montarControle } from "./controles.js";

/** A própria tela de Configurações não está no menu, mas tem o seu "como usar". */
const TELA_CONFIGURACOES = {
  key: "configuracoes",
  label: "Configurações",
  icone: "config",
  descricao: "As suas preferências, que valem só para você.",
};

/**
 * Configurações > Sobre e ajuda. Por que esta aba tem desenho próprio, e não
 * o das outras (SecaoAjustes), está em templates/sobre.js.
 *
 * As definições continuam em ajustes.js, e só por causa da busca: é de lá
 * que a busca das Configurações tira os títulos e textos, e é por `destacar`
 * daqui que ela chega até o bloco certo.
 */
export class SobreAjuda {
  /**
   * @param {HTMLElement} container
   * @param {any} aba a definição da aba em ajustes.js (de onde vem o controle das dicas de atalho)
   * @param {{
   *   usuario: {role?: string},
   *   navigate: (aba: string, params?: object) => void,
   *   abasDoMenu: Array<{key: string, label: string, icone?: any, descricao?: string}>,
   *   regras: {prazoVersaoDias?: number},
   *   versao: () => string | null,
   *   acoes: {aoAplicarPerfil: (valor: string) => void, aoRestaurarSecao: (aba: any) => void},
   * }} opcoes
   */
  constructor(container, aba, opcoes) {
    this.container = container;
    this.aba = aba;
    this.opcoes = opcoes;
    /** @type {Array<() => void>} */
    this.sincronizadores = [];
    this._desenhar();
  }

  _desenhar() {
    const { usuario, abasDoMenu, regras, versao } = this.opcoes;
    const ehAdmin = usuario?.role === "admin";
    const v = versao();
    const telas = [...abasDoMenu, TELA_CONFIGURACOES]
      .filter((t) => COMO_USAR_TELAS[t.key])
      .map((t) => ({
        key: t.key,
        label: t.label,
        icone: t.icone || "info",
        resumo: t.descricao || "",
        texto: COMO_USAR_TELAS[t.key],
        abrir: t.key !== TELA_CONFIGURACOES.key,
      }));

    this.container.innerHTML = html`
      ${cabecalhoSecao({ titulo: this.aba.titulo, descricao: this.aba.descricao })}
      <div class="sobre">
        <div class="sobre__conteudo">
          ${cartaoVersao({ versao: v, ehAdmin, totalNovidades: NOVIDADES.length })}
          ${linhaDoTempo(agruparNovidades(NOVIDADES))}
          ${gradeTelas(telas)}
          ${legendaSituacoes(explicacaoSituacoes(regras?.prazoVersaoDias), regras?.prazoVersaoDias)}
          ${blocoAtalhos(ATALHOS)}
          ${cartoesSuporte({ versao: v, ehAdmin })}
        </div>
        ${indiceSobre(SECOES_SOBRE)}
      </div>`.toString();

    this._montarDicas();
    this._ligarAcoes();
    this._observarSecoes();
  }

  /**
   * "Mostrar as dicas de atalho" é uma preferência de verdade, com o mesmo
   * interruptor e o mesmo selo "alterado" das outras abas -- então vem do
   * mesmo montador, e não de uma cópia aqui.
   */
  _montarDicas() {
    const alvo = this.container.querySelector('[data-role="dicas"]');
    const item = this.aba.cartoes.flatMap((c) => c.itens).find((i) => i.id === "dicas-atalho");
    if (!alvo || !item) return;
    const { el, sincronizar } = montarControle(item, this.opcoes.acoes);
    el.classList.add("cfg-linha");
    el.dataset.ajuste = item.id;
    el.dataset.chaves = (item.chaves || []).join(",");
    alvo.appendChild(el);
    this.sincronizadores.push(sincronizar);
    this.atualizarResumo();
  }

  _ligarAcoes() {
    this.container.addEventListener("click", (e) => {
      const alvo = /** @type {HTMLElement} */ (e.target).closest("[data-action]");
      if (!(alvo instanceof HTMLElement)) return;
      const acao = alvo.dataset.action;
      if (acao === "ir-secao") this._irPara(alvo.dataset.secao);
      else if (acao === "mais-novidades") this._mostrarTodasNovidades(alvo.getAttribute("aria-expanded") !== "true");
      else if (acao === "abrir-tela") this.opcoes.navigate(alvo.dataset.tela);
      else if (acao === "diagnostico") this.opcoes.navigate("administracao", { aba: "diagnostico" });
    });
  }

  /** @param {string} [id] */
  _irPara(id) {
    const secao = /** @type {HTMLElement|null} */ (this.container.querySelector(`#sobre-${id}`));
    if (!secao) return;
    secao.scrollIntoView({ block: "start", behavior: "smooth" });
    // O foco vai junto: quem chegou pelo teclado continua lendo dali, e não
    // do botão do índice que ficou lá em cima.
    secao.setAttribute("tabindex", "-1");
    secao.focus({ preventScroll: true });
  }

  /** @param {boolean} todas */
  _mostrarTodasNovidades(todas) {
    for (const el of this.container.querySelectorAll("#sobre-novidades [data-extra]")) /** @type {HTMLElement} */ (el).hidden = !todas;
    const botao = this.container.querySelector('[data-action="mais-novidades"]');
    if (!botao) return;
    const sobra = NOVIDADES.length - NOVIDADES_VISIVEIS;
    botao.setAttribute("aria-expanded", String(todas));
    botao.textContent = todas ? "Mostrar menos" : sobra === 1 ? "Ver mais 1 novidade" : `Ver mais ${sobra} novidades`;
  }

  /**
   * Acende no índice a seção que está na parte de cima da tela. Numa aba
   * longa, "onde estou" é o que se perdia primeiro.
   */
  _observarSecoes() {
    if (typeof IntersectionObserver === "undefined") return;
    const links = new Map(
      [...this.container.querySelectorAll(".sobre__indice [data-secao]")].map((el) => [/** @type {HTMLElement} */ (el).dataset.secao, el])
    );
    const visiveis = new Set();
    this.observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          const id = e.target.id.replace(/^sobre-/, "");
          if (e.isIntersecting) visiveis.add(id);
          else visiveis.delete(id);
        }
        // A primeira da ordem da página entre as visíveis -- e não a última
        // que entrou, que pisca ao rolar devagar entre duas seções.
        const atual = SECOES_SOBRE.find((s) => visiveis.has(s.id))?.id;
        if (!atual) return;
        for (const [id, el] of links) el.classList.toggle("is-atual", id === atual);
      },
      // Só a faixa de cima conta: a seção "atual" é a que se está lendo.
      { rootMargin: "-80px 0px -55% 0px" }
    );
    for (const s of SECOES_SOBRE) {
      const el = this.container.querySelector(`#sobre-${s.id}`);
      if (el) this.observador.observe(el);
    }
  }

  /** Chamado pelas Configurações quando alguma preferência muda (ver _atualizarTudo). */
  atualizarResumo() {
    for (const sincronizar of this.sincronizadores) sincronizar();
    const alterada = aparencia.diferencas().has("dicasAtalho");
    const linha = this.container.querySelector('[data-ajuste="dicas-atalho"]');
    linha?.classList.toggle("is-alterado", alterada);
    const selo = /** @type {HTMLElement|null} */ (linha?.querySelector(".cfg-group__selo") ?? null);
    if (selo) selo.hidden = !alterada;
  }

  refresh() {
    this.atualizarResumo();
  }

  /**
   * Leva a um bloco achado pela busca. A novidade que está atrás do "Ver
   * todas" e a tela fechada na grade se abrem antes -- acender um bloco
   * escondido não mostraria nada.
   * @param {string} id
   */
  destacar(id) {
    const alvo = /** @type {HTMLElement|null} */ (this.container.querySelector(`[data-ajuste="${CSS.escape(id)}"]`));
    if (!alvo) return;
    if (alvo.hidden || alvo.closest("[hidden]")) this._mostrarTodasNovidades(true);
    if (alvo instanceof HTMLDetailsElement) alvo.open = true;
    alvo.scrollIntoView({ block: "center", behavior: "smooth" });
    alvo.classList.remove("is-destacado");
    // Força o navegador a notar a remoção antes de recolocar a classe, para
    // a animação recomeçar mesmo se o mesmo bloco for buscado duas vezes.
    void alvo.offsetWidth;
    alvo.classList.add("is-destacado");
    const controle = /** @type {HTMLElement|null} */ (alvo.querySelector("summary, input, button") || (alvo.matches("summary, [tabindex]") ? alvo : null));
    controle?.focus({ preventScroll: true });
  }

  destroy() {
    this.observador?.disconnect();
  }
}
