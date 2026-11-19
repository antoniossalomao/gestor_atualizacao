import { View } from "../../app/View.js";
import { avisoRapido } from "../../components/AvisosRapidos.js";
import { html } from "../../utils/html.js";
import { iconeHtml } from "../../utils/icones.js";
import { marcarOcupado } from "../../components/botaoOcupado.js";
import { cabecalhoSecao } from "../../templates/secao.js";
import { blocosSaude, resumoDiagnostico } from "../../templates/administracao.js";
import { situacaoDiagnostico, textoDiagnostico, verificacoesDiagnostico } from "../../domain/administracao.js";
import { copiarParaAreaDeTransferencia } from "../../components/areaDeTransferencia.js";
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
        acoes: html`
          <button type="button" class="btn" data-action="copiar" disabled>${iconeHtml("copiar")} Copiar para o suporte</button>
          <button type="button" class="btn" data-action="atualizar">${iconeHtml("atualizar")} Conferir de novo</button>`,
      })}
      <div data-role="situacao" data-indice-titulo="Situação geral"></div>
      <p class="admin-aviso admin-aviso--alerta" data-role="erro-atualizacao" role="status" hidden></p>
      <div data-role="blocos"></div>`;
    this.situacao = this.container.querySelector('[data-role="situacao"]');
    this.blocos = this.container.querySelector('[data-role="blocos"]');
    this.botaoCopiar = /** @type {HTMLButtonElement} */ (this.container.querySelector('[data-action="copiar"]'));
    this.botaoCopiar.addEventListener("click", async () => {
      if (!this.texto) return;
      const ok = await copiarParaAreaDeTransferencia(this.texto);
      if (ok) avisoRapido.sucesso("Diagnóstico copiado. Cole na conversa com o suporte.");
      else avisoRapido.erro("O navegador não deixou copiar. Selecione os blocos e copie à mão.");
    });

    // Cada pendência e atalho dos cartões leva à aba onde se resolve ou aciona uma cópia imediata.
    this.container.addEventListener("click", (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const alvo = target.closest("[data-ir-aba]");
      if (alvo instanceof HTMLElement) {
        this.navigate("administracao", { aba: alvo.dataset.irAba });
        return;
      }
      const copia = target.closest('[data-action="fazer-copia"]');
      if (copia instanceof HTMLButtonElement) {
        this._fazerCopia(copia);
      }
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

  /** Gera uma cópia de segurança direto do Diagnóstico e revalida os indicadores na hora. */
  async _fazerCopia(botao) {
    const liberar = marcarOcupado(botao);
    try {
      const copia = await this.api.post("/backups");
      if (copia.integro === false) {
        avisoRapido.erro(`Cópia ${copia.label || copia.arquivo} feita, mas falhou na verificação de integridade.`);
      } else {
        avisoRapido.sucesso(`Cópia ${copia.label || copia.arquivo} feita e conferida.`);
      }
      document.dispatchEvent(new CustomEvent("administracao:conferir"));
      await this.refresh();
    } catch (err) {
      avisoRapido.erro(mensagem(err));
    } finally {
      liberar();
    }
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
      const aviso = this.container.querySelector('[data-role="erro-atualizacao"]');
      aviso.hidden = false;
      aviso.textContent = `Não foi possível atualizar o diagnóstico. ${this.conferidoEm
        ? `Última verificação concluída em ${this.conferidoEm.toLocaleString("pt-BR")}. Os dados abaixo são dessa verificação.`
        : "Nenhuma verificação foi concluída nesta sessão."} Use Conferir de novo para tentar novamente.`;
      avisoRapido.erro(mensagem(err));
      return;
    }
    const opcoesDiag = {
      atualizadorHabilitado: this.atualizadorHabilitado,
      chaveAgentes: completa?.chaveAgentes ?? null,
    };
    const situacao = situacaoDiagnostico(dados, opcoesDiag);
    const verificacoes = verificacoesDiagnostico(dados, opcoesDiag);
    const conferidoEm = new Date();
    this.conferidoEm = conferidoEm;
    this.container.querySelector('[data-role="erro-atualizacao"]').hidden = true;
    this.situacao.innerHTML = resumoDiagnostico(situacao, conferidoEm, {
      verificacoes,
      verificacaoMs: dados.banco?.verificacaoMs ?? null,
    }).toString();
    // O texto é do MESMO momento da tela, e não montado no clique: o que se
    // manda ao suporte é o que a pessoa está vendo.
    this.texto = textoDiagnostico(dados, situacao, {
      atualizadorHabilitado: this.atualizadorHabilitado,
      conferidoEm,
      navegador: navigator.userAgent,
    });
    this.botaoCopiar.disabled = false;
    this.blocos.innerHTML = blocosSaude(dados, opcoesDiag).toString();
  }
}
