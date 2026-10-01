import { html } from "../../utils/html.js";
import { rotuloPapel } from "../../domain/pessoa.js";
import { resumoRegrasEquipe } from "../../domain/regrasEquipe.js";
import { cabecalhoSecao, tituloCartao } from "../../templates/secao.js";
import { blocosRegras, escopoPreferencias } from "../../templates/configuracoes.js";

/**
 * Configurações > Regras da equipe: o que vale para todo mundo, com os
 * valores de agora, e o que é só de quem está usando.
 *
 * Até 01/10/2026 esta aba era dois parágrafos explicando que regras globais
 * existem e um link para a Administração. Quem não é administrador -- a
 * maioria da equipe -- nem entra lá, então ficava sem saber qual era o prazo
 * que decide se um cliente está "Desatualizado". Agora os números estão
 * aqui, e o administrador ganha, em cada um, o caminho direto para mudá-lo.
 */
export class RegrasEquipeConfig {
  /**
   * @param {HTMLElement} container
   * @param {import('../../api/ApiPainel').ApiPainel} api
   * @param {{
   *   usuario: {id: number, nome: string, usuario: string, role?: string},
   *   navigate: (aba: string, params?: object) => void,
   *   regras?: Record<string, any>,
   * }} opcoes
   */
  constructor(container, api, opcoes) {
    this.container = container;
    this.api = api;
    this.opcoes = opcoes;
    this.ehAdmin = opcoes.usuario?.role === "admin";
    this._desenhar();
    // Desenha na hora com as regras que o app já tem; `refresh` traz as de
    // agora (outro admin pode ter mudado um prazo desde o login).
    this._pintarRegras(opcoes.regras || {});
  }

  _desenhar() {
    const papel = rotuloPapel(this.opcoes.usuario?.role || "operador");
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Regras da equipe",
        descricao: "O que vale para todo mundo, com os valores de agora, e o que cada pessoa escolhe para si.",
      })}
      <div class="cfg-cartoes">
        <section class="card secao-card cfg-cartao" data-ajuste="regras-globais">
          ${tituloCartao({
            titulo: "Valendo agora para a equipe",
            descricao: this.ehAdmin
              ? "Você é administrador: cada regra leva direto ao lugar onde ela se muda."
              : `Só um administrador muda estas regras. A sua conta é ${papel}.`,
          })}
          <div data-role="regras"></div>
        </section>

        <section class="card secao-card cfg-cartao" data-ajuste="regras-escopo">
          ${tituloCartao({ titulo: "O que é seu e o que é da equipe" })}
          ${escopoPreferencias()}
        </section>
      </div>`.toString();

    this.container.addEventListener("click", (e) => {
      const alvo = /** @type {HTMLElement} */ (e.target).closest('[data-action="editar-regra"]');
      if (alvo instanceof HTMLElement) this.opcoes.navigate("administracao", { aba: alvo.dataset.aba });
    });
  }

  /** @param {Record<string, any>} regras */
  _pintarRegras(regras) {
    const alvo = /** @type {HTMLElement} */ (this.container.querySelector('[data-role="regras"]'));
    alvo.innerHTML = blocosRegras(resumoRegrasEquipe(regras), { ehAdmin: this.ehAdmin }).toString();
  }

  async refresh() {
    try {
      this._pintarRegras(await this.api.get("/configuracao-sistema"));
    } catch {
      // Sem resposta, ficam as regras que o app recebeu no login -- melhor
      // que trocar números certos por um erro numa aba só de leitura.
    }
  }

  /** @param {string} id ver SecaoAjustes.destacar */
  destacar(id) {
    const alvo = /** @type {HTMLElement|null} */ (this.container.querySelector(`[data-ajuste="${CSS.escape(id)}"]`));
    if (!alvo) return;
    alvo.scrollIntoView({ block: "center", behavior: "smooth" });
    alvo.classList.remove("is-destacado");
    void alvo.offsetWidth;
    alvo.classList.add("is-destacado");
  }
}
