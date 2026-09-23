import { View } from "../../app/View.js";
import { toast } from "../../components/Toast.js";
import { html } from "../../utils/html.js";
import { iconHtml } from "../../utils/icons.js";
import { marcarOcupado } from "../../utils/guard.js";
import { cabecalhoSecao, blocosSaude } from "../../templates/administracao.js";
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
        titulo: "Saúde do servidor",
        descricao: "Diagnóstico do banco, do processo e das cópias de segurança, lido agora.",
        acoes: html`<button type="button" class="btn" data-action="atualizar">${iconHtml("atualizar")} Conferir de novo</button>`,
      })}
      <div data-role="situacao"></div>
      <div data-role="blocos"></div>`;
    this.situacao = this.container.querySelector('[data-role="situacao"]');
    this.blocos = this.container.querySelector('[data-role="blocos"]');
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
    try {
      dados = await this.api.get("/saude");
    } catch (err) {
      if (err?.cancelled) return;
      toast.error(mensagem(err));
      return;
    }
    const saudavel = dados.statusGeral === "saudavel";
    this.situacao.innerHTML = html`
      <p class="admin-situacao ${saudavel ? "is-ok" : "is-alerta"}">
        <span class="admin-situacao__ponto" aria-hidden="true"></span>
        ${saudavel ? "Tudo em ordem." : "Algo precisa de atenção -- veja os blocos marcados abaixo."}
      </p>`;
    this.blocos.innerHTML = blocosSaude(dados, { atualizadorHabilitado: this.atualizadorHabilitado });
  }
}
