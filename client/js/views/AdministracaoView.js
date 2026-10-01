import { View } from "../app/View.js";
import { prefs } from "../app/preferencias.js";
import { TelaComAbas } from "../components/TelaComAbas.js";
import { cabecalhoSecao } from "../templates/secao.js";
import { HistoricoView } from "./HistoricoView.js";
import { UsuariosAdmin } from "./administracao/UsuariosAdmin.js";
import { OperacaoAdmin } from "./administracao/OperacaoAdmin.js";
import { DadosAdmin } from "./administracao/DadosAdmin.js";
import { IntegracoesAdmin } from "./administracao/IntegracoesAdmin.js";
import { BackupsAdmin } from "./administracao/BackupsAdmin.js";
import { SaudeAdmin } from "./administracao/SaudeAdmin.js";
import { ALIASES_ADMINISTRACAO, abaAtual } from "../domain/abas.js";
import { pendenciasPorAba, situacaoDiagnostico } from "../domain/administracao.js";
import { faixaPendencias } from "../templates/administracao.js";

/**
 * Tela Administração -- exclusiva para administradores.
 *
 * Organizada por finalidade em 7 seções estruturadas (Seção 11.2 do planejamento):
 *  1. Pessoas e permissões: Usuários, papéis e ações de conta.
 *  2. Operação: Prazos, arquivamento e classificação de sistemas.
 *  3. Dados: Importação, exportações administrativas e validações de base.
 *  4. Integrações: Atualizador, alertas externos no Discord e endereço do servidor.
 *  5. Backups e recuperação: Cópias de segurança, política de retenção e restauração.
 *  6. Auditoria: Histórico detalhado de alterações e filtros.
 *  7. Diagnóstico: Saúde do servidor, processos e integridade do banco.
 */
const ABAS = [
  { key: "pessoas", rotulo: "Pessoas e permissões", icone: "users", Secao: UsuariosAdmin },
  { key: "operacao", rotulo: "Operação", icone: "ajustes", Secao: OperacaoAdmin },
  { key: "dados", rotulo: "Dados", icone: "download", Secao: DadosAdmin },
  { key: "integracoes", rotulo: "Integrações", icone: "distribuicao", Secao: IntegracoesAdmin },
  { key: "backups", rotulo: "Backups e recuperação", icone: "backups", Secao: BackupsAdmin },
  {
    key: "auditoria",
    rotulo: "Auditoria",
    icone: "historico",
    Secao: HistoricoView,
    cabecalho: {
      titulo: "Auditoria do sistema",
      descricao: "Histórico detalhado de quem criou, editou ou excluiu registros no sistema, e quando.",
    },
  },
  { key: "diagnostico", rotulo: "Diagnóstico", icone: "saude", Secao: SaudeAdmin },
];


export class AdministracaoView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.ctx = ctx;

    // Migra preferência legada salva na sessão/localStorage se necessário
    const salva = prefs.get("administracao:aba", "pessoas");
    if (abaAtual(ALIASES_ADMINISTRACAO, salva) !== salva) prefs.set("administracao:aba", abaAtual(ALIASES_ADMINISTRACAO, salva));

    this.tela = new TelaComAbas(container, {
      abas: ABAS,
      rotulo: "Seções da administração",
      idBase: "admin",
      chavePrefs: "administracao:aba",
      criar: (key, painel) => {
        const def = ABAS.find((a) => a.key === key);
        let alvo = painel;
        if (def.cabecalho) {
          painel.insertAdjacentHTML("beforeend", String(cabecalhoSecao(def.cabecalho)));
          alvo = document.createElement("div");
          alvo.className = "admin__conteudo";
          painel.appendChild(alvo);
        }
        return new def.Secao(alvo, this.api, this.ctx);
      },
      // No Diagnóstico a faixa repetiria, em menor, o que a aba já mostra.
      aoMostrar: (key) => {
        if (this.faixa) this.faixa.hidden = key === "diagnostico";
      },
    });

    // A faixa de pendências mora entre as abas e os painéis: vale para a
    // tela inteira, não para uma aba.
    this.faixa = document.createElement("div");
    this.faixa.className = "admin-faixa-lugar";
    this.tela.paineis.before(this.faixa);
    this.faixa.addEventListener("click", (e) => {
      const alvo = /** @type {HTMLElement} */ (e.target).closest("[data-ir-aba]");
      if (alvo instanceof HTMLElement) this.tela.mostrar(alvo.dataset.irAba);
    });
    this._ultimaConferencia = 0;
    // Quem resolve uma pendência (fez uma cópia, por exemplo) pede para a
    // faixa conferir de novo agora, em vez de mostrar o aviso velho por até
    // um minuto.
    this.on(document, "administracao:conferir", () => {
      this._ultimaConferencia = 0;
      this._conferirPendencias();
    });
  }

  /**
   * Confere o que precisa de atenção (a mesma regra do Diagnóstico) e pinta a
   * faixa e os contadores das abas. No máximo uma vez por minuto: a Saúde
   * roda o integrity_check do SQLite, e quem entra e sai da Administração
   * várias vezes não precisa pagar isso a cada vez.
   */
  async _conferirPendencias() {
    if (Date.now() - this._ultimaConferencia < 60_000) return;
    this._ultimaConferencia = Date.now();
    let dados;
    let completa;
    try {
      [dados, completa] = await Promise.all([
        this.api.get("/saude"),
        this.api.get("/configuracao-sistema/completa").catch(() => null),
      ]);
    } catch {
      // Sem a Saúde não há o que dizer; a faixa fica como estava, e a aba
      // Diagnóstico mostra o erro a quem for procurar.
      this._ultimaConferencia = 0;
      return;
    }
    const situacao = situacaoDiagnostico(dados, {
      atualizadorHabilitado: this.atualizadorHabilitado,
      chaveAgentes: completa?.chaveAgentes ?? null,
    });
    this.faixa.innerHTML = faixaPendencias(situacao).toString();
    const porAba = pendenciasPorAba(situacao.pendencias);
    for (const { key } of ABAS) {
      const n = porAba[key] || 0;
      this.tela.contador(key, n, n === 1 ? "1 ponto precisa de atenção nesta seção" : `${n} pontos precisam de atenção nesta seção`);
    }
  }

  /** `navigate("administracao", { aba: "backups" })` abre direto na aba suportando aliases legados. */
  aplicarParams({ aba } = {}) {
    if (!aba) return;
    const abaDestino = abaAtual(ALIASES_ADMINISTRACAO, aba);
    this.tela.escolher(abaDestino);
  }

  async refresh() {
    await Promise.all([this.tela.mostrar(), this._conferirPendencias()]);
  }

  destroy() {
    this.tela.destroy();
    super.destroy();
  }
}
