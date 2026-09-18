import { Modal } from "../core/Modal.js";
import { icon } from "../core/icons.js";
import { formatarBytes } from "../core/arquivo.js";
import { formatarDataHora } from "../core/date.js";
import { toast } from "../core/Toast.js";
import { BackupsPanel } from "./BackupsPanel.js";

/**
 * Painel Administrativo de Diagnóstico Operacional e Saúde do Sistema (Feature 2.3).
 * Exibe integridade do banco SQLite, métricas de runtime do Node, backups, pacotes e agentes.
 */
export class SaudeSistemaPanel {
  /** @param {import('../api/ApiClient').ApiClient} api */
  constructor(api) {
    this.api = api;
  }

  async open() {
    let diag;
    try {
      diag = await this.api.get("/saude");
    } catch {
      Modal.alert(
        "Acesso Restrito",
        "Não foi possível obter o diagnóstico do sistema. Esta função é exclusiva de Administradores.",
        "error"
      );
      return;
    }

    const { box, close } = Modal.abrirCaixa({ largura: 640 });
    box.innerHTML = `
      <div class="saude-header" style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--sp-3);">
        <div>
          <h3 class="modal-box__title" id="saude-titulo" style="margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
            ${icon("saude")} Saúde Operacional do Sistema
          </h3>
          <p class="modal-box__message" style="margin-bottom: 0;">Diagnóstico em tempo real dos subsistemas locais do servidor.</p>
        </div>
        <div data-role="status-geral" style="margin-left: 12px; flex-shrink: 0;"></div>
      </div>

      <div class="saude-content" data-role="conteudo" style="display: flex; flex-direction: column; gap: var(--sp-3);"></div>

      <div class="modal-box__actions" style="margin-top: var(--sp-4);">
        <button type="button" class="btn" data-action="atualizar" style="display: inline-flex; align-items: center; gap: 6px;">
          ${icon("atualizar")} Atualizar Diagnóstico
        </button>
        <button type="button" class="btn btn--primary" data-action="close">Fechar</button>
      </div>
    `;
    box.setAttribute("aria-labelledby", "saude-titulo");

    const statusGeralEl = box.querySelector('[data-role="status-geral"]');
    const conteudoEl = box.querySelector('[data-role="conteudo"]');
    const btnAtualizar = box.querySelector('[data-action="atualizar"]');
    const btnClose = box.querySelector('[data-action="close"]');

    const render = (dados) => {
      const isSaudavel = dados.statusGeral === "saudavel";
      statusGeralEl.innerHTML = `
        <span class="badge ${isSaudavel ? "badge--success" : "badge--warning"}" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font-weight: 600;">
          <span class="status-dot ${isSaudavel ? "status-dot--ok is-pulsing" : "status-dot--alerta is-pulsing"}" style="width: 8px; height: 8px;"></span>
          ${isSaudavel ? "Subsistemas Saudáveis" : "Atenção Operacional"}
        </span>
      `;

      conteudoEl.innerHTML = `
        <!-- Grid de Diagnósticos -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--sp-3);">
          
          <!-- Banco de Dados SQLite -->
          <div class="card" style="padding: var(--sp-3); border: 1px solid var(--cor-borda);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <strong style="display: flex; align-items: center; gap: 6px; font-size: var(--txt-base);">
                ${icon("tabela")} Banco SQLite
              </strong>
              <span class="badge ${dados.banco.integridade === "ok" ? "badge--success" : "badge--danger"}">
                ${dados.banco.integridade === "ok" ? "Integridade OK" : "Falha de Integridade"}
              </span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: var(--txt-sm); color: var(--cor-texto-sub);">
              <div><strong>Arquivo:</strong> ${dados.banco.caminho}</div>
              <div><strong>Tamanho:</strong> ${formatarBytes(dados.banco.tamanhoBytes)}</div>
              <div><strong>Modo Journal:</strong> ${String(dados.banco.journalMode).toUpperCase()}</div>
            </div>
          </div>

          <!-- Servidor & Processo Node -->
          <div class="card" style="padding: var(--sp-3); border: 1px solid var(--cor-borda);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <strong style="display: flex; align-items: center; gap: 6px; font-size: var(--txt-base);">
                ${icon("painel")} Servidor Web
              </strong>
              <span class="badge badge--accent">v${dados.servidor.versao}</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: var(--txt-sm); color: var(--cor-texto-sub);">
              <div><strong>Node:</strong> ${dados.servidor.node} · ${dados.servidor.plataforma}</div>
              <div><strong>Tempo Ativo:</strong> ${formatarUptime(dados.servidor.uptimeSegundos)}</div>
              <div><strong>Memória Heap:</strong> ${dados.servidor.memoriaHeapUsadaMB} MB usados (${dados.servidor.memoriaHeapTotalMB} MB total)</div>
            </div>
          </div>

          <!-- Backups Preventivos -->
          <div class="card" style="padding: var(--sp-3); border: 1px solid var(--cor-borda);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <strong style="display: flex; align-items: center; gap: 6px; font-size: var(--txt-base);">
                ${icon("backups")} Backups Locais
              </strong>
              <button type="button" class="btn btn--small btn--ghost" data-action="abrir-backups" style="padding: 2px 8px;">
                Ver backups
              </button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: var(--txt-sm); color: var(--cor-texto-sub);">
              <div><strong>Total armazenado:</strong> ${dados.backups.total} cópias</div>
              <div><strong>Última cópia:</strong> ${dados.backups.ultimo ? formatarDataHora(dados.backups.ultimo) : "Nenhuma cópia recente"}</div>
            </div>
          </div>

          <!-- Pacotes & Agentes -->
          <div class="card" style="padding: var(--sp-3); border: 1px solid var(--cor-borda);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <strong style="display: flex; align-items: center; gap: 6px; font-size: var(--txt-base);">
                ${icon("distribuicao")} Agentes & Pacotes
              </strong>
              <span class="badge ${dados.agentes.erro > 0 ? "badge--danger" : "badge--muted"}">
                ${dados.agentes.erro > 0 ? `${dados.agentes.erro} com erro` : "Sem incidentes"}
              </span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: var(--txt-sm); color: var(--cor-texto-sub);">
              <div><strong>Pacotes em disco:</strong> ${dados.pacotes.total} (${formatarBytes(dados.pacotes.tamanhoBytes)})</div>
              <div><strong>Agentes:</strong> ${dados.agentes.total} total (${dados.agentes.ok} em dia · ${dados.agentes.offline} offline)</div>
            </div>
          </div>

        </div>
      `;

      const btnGerenciarBackups = conteudoEl.querySelector('[data-action="abrir-backups"]');
      if (btnGerenciarBackups) {
        btnGerenciarBackups.addEventListener("click", () => {
          close();
          new BackupsPanel(this.api).open();
        });
      }
    };

    render(diag);

    btnAtualizar.addEventListener("click", async () => {
      btnAtualizar.disabled = true;
      try {
        const novo = await this.api.get("/saude");
        render(novo);
        toast.success("Diagnóstico atualizado com sucesso.");
      } catch {
        toast.error("Não foi possível atualizar o diagnóstico.");
      } finally {
        btnAtualizar.disabled = false;
      }
    });

    btnClose.addEventListener("click", close);
  }
}

function formatarUptime(segundos) {
  if (!segundos || segundos < 0) return "0s";
  const dias = Math.floor(segundos / 86400);
  const horas = Math.floor((segundos % 86400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);

  const partes = [];
  if (dias > 0) partes.push(`${dias}d`);
  if (horas > 0 || dias > 0) partes.push(`${horas}h`);
  partes.push(`${minutos}m`);
  return partes.join(" ");
}
