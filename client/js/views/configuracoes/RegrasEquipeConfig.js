import { html } from "../../utils/html.js";
import { iconHtml } from "../../utils/icons.js";
import { rotuloPapel } from "../../domain/pessoa.js";
import { cabecalhoSecao, tituloCartao } from "../../templates/secao.js";

/**
 * Seção Regras da equipe em Configurações (Seção 12 do planejamento):
 * Esclarece o escopo de preferências pessoais versus regras globais da equipe,
 * com link direto para a Administração quando o usuário possui permissão.
 */
export class RegrasEquipeConfig {
  /**
   * @param {HTMLElement} container
   * @param {import('../../api/ApiClient').ApiClient} api
   * @param {{
   *   usuario: {id: number, nome: string, usuario: string, role?: string},
   *   navigate: (aba: string, params?: object) => void,
   * }} opcoes
   */
  constructor(container, api, opcoes) {
    this.container = container;
    this.api = api;
    this.opcoes = opcoes;
    this._desenhar();
  }

  _desenhar() {
    const ehAdmin = this.opcoes.usuario?.role === "admin";
    const papel = rotuloPapel(this.opcoes.usuario?.role || "operador");

    this.container.innerHTML = html`
      ${cabecalhoSecao({
        titulo: "Regras da equipe",
        descricao: "Entenda a separação entre suas preferências individuais e as regras globais da equipe.",
      })}
      <div class="cfg-cartoes">
        <section class="card secao-card cfg-cartao">
          ${tituloCartao({
            titulo: "Preferências pessoais vs. Regras globais",
            descricao: "O que muda só para você e o que afeta todas as pessoas da equipe.",
          })}
          <div class="cfg-linhas">
            <div class="cfg-group cfg-group--largo">
              <div class="cfg-group__labels">
                <span class="cfg-group__title">Ajustes nesta tela (Pessoais)</span>
                <span class="cfg-group__help">
                  Minha conta, Trabalho diário, Notificações e Interface/acessibilidade são preferências do seu usuário.
                  Cada pessoa da equipe escolhe seu tema, densidade de linhas e tela inicial sem interferir nas escolhas dos outros.
                </span>
              </div>
            </div>
            <div class="cfg-group cfg-group--largo">
              <div class="cfg-group__labels">
                <span class="cfg-group__title">Regras da equipe (Globais)</span>
                <span class="cfg-group__help">
                  Valem para todo mundo e são gerenciadas centralizadamente na <strong>Administração</strong>:
                  prazos para clientes sem atualização, arquivamento automático de tarefas, classificação de versões dos sistemas,
                  alertas no Discord, agentes do Atualizador e cópias de backup.
                </span>
              </div>
            </div>
          </div>
        </section>

        ${
          ehAdmin
            ? html`
              <button type="button" class="card cfg-link cfg-link--cartao" data-action="ir-administracao">
                <span class="cfg-link__icon">${iconHtml("escudo")}</span>
                <span class="cfg-link__labels">
                  <strong>Gerenciar regras na Administração</strong>
                  <span>Abrir a tela de Administração para editar prazos, arquivamento, sistemas e integrações.</span>
                </span>
                <span class="cfg-link__seta">${iconHtml("seta")}</span>
              </button>`
            : html`
              <section class="card secao-card cfg-cartao">
                ${tituloCartao({ titulo: "Acesso administrativo" })}
                <p class="text-muted" style="margin: 0.5rem 0 0;">
                  A sua conta tem papel de <strong>${papel}</strong>. Apenas administradores podem alterar as regras globais
                  da equipe. Para solicitar alterações em prazos ou sistemas, contate um administrador do sistema.
                </p>
              </section>`
        }
      </div>`;

    this.container.querySelector('[data-action="ir-administracao"]')?.addEventListener("click", () => {
      this.opcoes.navigate("administracao", { aba: "operacao" });
    });
  }

  refresh() {
    // Tela informativa: não requer recargas remotas
  }
}
