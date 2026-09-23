import { aparencia } from "../../app/appearance.js";
import { html } from "../../utils/html.js";
import { iconHtml } from "../../utils/icons.js";
import { cabecalhoSecao, tituloCartao } from "../../templates/secao.js";
import { previaTabela } from "../../templates/configuracoes.js";
import { montarControle } from "./controles.js";

/**
 * Uma aba de preferências das Configurações (Aparência, Tabelas, Navegação,
 * Notificações, Acessibilidade, Atalhos), desenhada a partir da definição
 * dela em ajustes.js: cabeçalho da seção, e um cartão com título para cada
 * grupo de ajustes.
 *
 * Tudo se aplica na hora, sem botão de "Salvar": são preferências de uma
 * pessoa, reversíveis com um clique, e nenhuma delas destrói nada. Pedir
 * confirmação para escolher um tema seria cerimônia sem risco nenhum por
 * trás. (A Administração é o contrário, e tem botão: lá a regra vale para a
 * equipe inteira e fica no Histórico.)
 */
export class SecaoAjustes {
  /**
   * @param {HTMLElement} container
   * @param {any} aba a definição da aba (ver definirAbas)
   * @param {{aoAplicarPerfil: (valor: string) => void, aoRestaurarSecao: (aba: any) => void}} acoes
   */
  constructor(container, aba, acoes) {
    this.container = container;
    this.aba = aba;
    this.acoes = acoes;
    /** @type {Array<() => void>} */
    this.sincronizadores = [];
    this._desenhar();
  }

  _desenhar() {
    const { aba } = this;
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: aba.titulo,
        descricao: aba.descricao,
        // Só aparece quando há o que restaurar (ver `atualizar`): um botão
        // permanentemente sem efeito ensina a ignorá-lo.
        acoes: html`<button type="button" class="btn btn--small btn--ghost" data-action="restaurar-secao" hidden>
          ${iconHtml("restaurar")} Restaurar esta seção</button>`,
      })}
      <div class="cfg-corpo${aba.previa ? " cfg-corpo--com-previa" : ""}">
        <div class="cfg-cartoes" data-role="cartoes"></div>
        ${
          aba.previa &&
          html`<aside class="card secao-card cfg-previa-cartao">
            ${tituloCartao({ titulo: "Prévia", descricao: "Uma tabela de exemplo, com os ajustes desta aba aplicados." })}
            ${previaTabela()}
          </aside>`
        }
      </div>`.toString();

    const cartoes = /** @type {HTMLElement} */ (this.container.querySelector('[data-role="cartoes"]'));
    for (const cartao of aba.cartoes) {
      const el = document.createElement("section");
      el.className = "card secao-card cfg-cartao";
      el.innerHTML = tituloCartao(cartao).toString();
      const linhas = document.createElement("div");
      linhas.className = "cfg-linhas";
      for (const item of cartao.itens) {
        const { el: linha, sincronizar } = montarControle(item, this.acoes);
        linha.classList.add("cfg-linha");
        linha.dataset.ajuste = item.id;
        linha.dataset.chaves = (item.chaves || []).join(",");
        linhas.appendChild(linha);
        this.sincronizadores.push(sincronizar);
      }
      el.appendChild(linhas);
      cartoes.appendChild(el);
    }

    this.container
      .querySelector('[data-action="restaurar-secao"]')
      .addEventListener("click", () => this.acoes.aoRestaurarSecao(this.aba));
    this.atualizar();
  }

  /** Chamado a cada vez que a aba aparece -- o valor pode ter mudado por fora. */
  refresh() {
    this.atualizar();
  }

  /**
   * Relê cada preferência para os controles e marca o que está fora do padrão:
   * o selo de cada linha e o botão de restaurar a seção.
   *
   * Roda inteiro a cada mudança em vez de atualizar só o que mexeu. São
   * poucas linhas numa tela que já está aberta -- o custo é irrelevante, e a
   * alternativa (cada controle sabendo quais selos ele afeta) é o tipo de
   * dependência cruzada que quebra em silêncio quando um perfil muda seis
   * preferências de uma vez.
   */
  atualizar() {
    for (const sincronizar of this.sincronizadores) sincronizar();
    const mudadas = aparencia.diferencas();
    let naAba = 0;
    for (const linha of this.container.querySelectorAll(".cfg-linha")) {
      const chaves = (/** @type {HTMLElement} */ (linha).dataset.chaves || "").split(",").filter(Boolean);
      const alterada = chaves.some((chave) => mudadas.has(chave));
      linha.classList.toggle("is-alterado", alterada);
      const selo = /** @type {HTMLElement|null} */ (linha.querySelector(".cfg-group__selo"));
      if (selo) selo.hidden = !alterada;
      if (alterada) naAba += 1;
    }
    /** @type {HTMLElement} */ (this.container.querySelector('[data-action="restaurar-secao"]')).hidden = naAba === 0;
  }

  /**
   * Leva a um ajuste achado pela busca: rola até ele, acende a linha por um
   * instante e põe o foco no controle -- quem buscou "densidade" quer MUDAR
   * a densidade, não só ver onde ela mora.
   * @param {string} id
   */
  destacar(id) {
    const linha = /** @type {HTMLElement|null} */ (this.container.querySelector(`[data-ajuste="${CSS.escape(id)}"]`));
    if (!linha) return;
    linha.scrollIntoView({ block: "center", behavior: "smooth" });
    linha.classList.remove("is-destacado");
    // Força o navegador a notar a remoção antes de recolocar a classe, para
    // a animação recomeçar mesmo se a mesma linha for buscada duas vezes.
    void linha.offsetWidth;
    linha.classList.add("is-destacado");
    const controle = /** @type {HTMLElement|null} */ (
      linha.querySelector("input:checked, input[type=checkbox], select, button, input")
    );
    controle?.focus({ preventScroll: true });
  }
}
