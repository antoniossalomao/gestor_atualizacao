import { icon } from "./icons.js";
import { prefs } from "./prefs.js";

const CHAVE = "lembretes-fechados-em";

/**
 * Banner no topo do app avisando sobre agendamentos vencidos ou vencendo
 * hoje. Diferente do Toast (que some sozinho), fica visível até o usuário
 * fechar -- fechar grava a data de hoje, então só reaparece na próxima vez
 * que o app for aberto (nova aba/sessão) ou no dia seguinte.
 *
 * O visual mudou: era uma faixa amarela sólida de ponta a ponta com texto
 * escuro, que destoava do resto do app e gritava mais do que a informação
 * merecia. Virou um aviso contido, no mesmo vocabulário dos cards -- ainda
 * inconfundível, mas sem sequestrar a tela.
 */
export class ReminderBanner {
  /** @param {HTMLElement} container @param {() => void} onVerAgendamentos */
  constructor(container, onVerAgendamentos) {
    this.container = container;
    this.onVerAgendamentos = onVerAgendamentos;
  }

  /** @param {Array<{tarefa:string, cliente:string}>} itens */
  show(itens) {
    const hojeStr = new Date().toDateString();
    if (!itens.length || prefs.get(CHAVE) === hojeStr) {
      this.container.replaceChildren();
      return;
    }
    const plural = itens.length > 1;
    this.container.innerHTML = `
      <div class="reminder-banner" role="status">
        <span class="reminder-banner__icon">${icon("alerta")}</span>
        <span class="reminder-banner__text">
          Você tem <strong>${itens.length}</strong> agendamento${plural ? "s" : ""}
          pendente${plural ? "s" : ""} para hoje ou atrasado${plural ? "s" : ""}.
        </span>
        <button type="button" class="btn btn--small" data-action="ver">Ver Agendamentos</button>
        <button type="button" class="btn btn--small btn--ghost" data-action="fechar" aria-label="Fechar aviso">✕</button>
      </div>
    `;
    this.container.querySelector('[data-action="ver"]').addEventListener("click", () => {
      this.onVerAgendamentos();
      this._dismiss();
    });
    this.container.querySelector('[data-action="fechar"]').addEventListener("click", () => this._dismiss());
  }

  _dismiss() {
    prefs.set(CHAVE, new Date().toDateString());
    this.container.replaceChildren();
  }
}
