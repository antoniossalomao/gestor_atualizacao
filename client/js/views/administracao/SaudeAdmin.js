import { View } from "../../app/View.js";
import { avisoRapido } from "../../components/AvisosRapidos.js";
import { html } from "../../utils/html.js";
import { iconeHtml } from "../../utils/icones.js";
import { marcarOcupado } from "../../components/botaoOcupado.js";
import { cabecalhoSecao } from "../../templates/secao.js";
import { blocosSaude, resumoDiagnostico } from "../../templates/administracao.js";
import { situacaoDiagnostico } from "../../domain/administracao.js";
import { mensagem } from "./FormularioRegras.js";

/**
 * Aba "Saúde do servidor": o diagnóstico que se abre quando alguém diz que o
 * sistema está estranho -- banco íntegro? servidor no ar há quanto tempo?
 * última cópia de segurança? O modal antigo tinha o ícone desenhado a 200px
 * (sem tamanho definido) e títulos quebrando em três linhas.
 */
export class SaudeAdmin extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Diagnóstico do servidor",
        descricao: "Saúde do processo, integridade do banco de dados e cópias de segurança.",
        acoes: html`<button type="button" class="btn" data-action="atualizar">${iconeHtml("atualizar")} Conferir de novo</button>`,
      })}
      <div data-role="situacao"></div>
      <div data-role="blocos"></div>`;
    this.situacao = this.container.querySelector('[data-role="situacao"]');
    this.blocos = this.container.querySelector('[data-role="blocos"]');
    // Cada pendência leva à aba onde ela se resolve.
    this.situacao.addEventListener("click", (e) => {
      const alvo = /** @type {HTMLElement} */ (e.target).closest("[data-ir-aba]");
      if (alvo instanceof HTMLElement) this.navigate("administracao", { aba: alvo.dataset.irAba });
    });
    const botao = this.container.querySelector('[data-action="atualizar"]');
    botao.addEventListener("click", async () => {
      const liberar = marcarOcupado(botao);
      try {
        await this.refresh();
      } finally {
        liberar();
      }
    });
  }

  async refresh() {
    let dados;
    let completa;
    try {
      // A chave dos agentes não vem na Saúde (é regra da equipe, não do
      // processo), mas uma chave de exemplo é o problema mais grave que um
      // Diagnóstico pode apontar -- então ela entra na conta do resumo.
      [dados, completa] = await Promise.all([
        this.api.get("/saude"),
        this.api.get("/configuracao-sistema/completa").catch(() => null),
      ]);
    } catch (err) {
      if (err?.cancelled) return;
      avisoRapido.erro(mensagem(err));
      return;
    }
    const situacao = situacaoDiagnostico(dados, {
      atualizadorHabilitado: this.atualizadorHabilitado,
      chaveAgentes: completa?.chaveAgentes ?? null,
    });
    this.situacao.innerHTML = resumoDiagnostico(situacao, new Date()).toString();
    this.blocos.innerHTML = blocosSaude(dados, { atualizadorHabilitado: this.atualizadorHabilitado });
  }
}
