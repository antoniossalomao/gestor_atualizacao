import { View } from "../app/View.js";
import { prefs } from "../app/prefs.js";
import { TelaComAbas } from "../components/TelaComAbas.js";
import { cabecalhoSecao } from "../templates/secao.js";
import { HistoricoView } from "./HistoricoView.js";
import { UsuariosAdmin } from "./administracao/UsuariosAdmin.js";
import { OperacaoAdmin } from "./administracao/OperacaoAdmin.js";
import { DadosAdmin } from "./administracao/DadosAdmin.js";
import { IntegracoesAdmin } from "./administracao/IntegracoesAdmin.js";
import { BackupsAdmin } from "./administracao/BackupsAdmin.js";
import { SaudeAdmin } from "./administracao/SaudeAdmin.js";

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

const MAPA_ALIAS = {
  usuarios: "pessoas",
  pessoas: "pessoas",
  operacao: "operacao",
  regras: "operacao",
  classificacao: "operacao",
  dados: "dados",
  integracoes: "integracoes",
  notificacoes: "integracoes",
  atualizador: "integracoes",
  backups: "backups",
  auditoria: "auditoria",
  historico: "auditoria",
  diagnostico: "diagnostico",
  saude: "diagnostico",
};

export class AdministracaoView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.ctx = ctx;

    // Migra preferência legada salva na sessão/localStorage se necessário
    const salva = prefs.get("administracao:aba", "pessoas");
    if (MAPA_ALIAS[salva] && MAPA_ALIAS[salva] !== salva) {
      prefs.set("administracao:aba", MAPA_ALIAS[salva]);
    }

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
    });
  }

  /** `navigate("administracao", { aba: "backups" })` abre direto na aba suportando aliases legados. */
  aplicarParams({ aba } = {}) {
    if (!aba) return;
    const abaDestino = MAPA_ALIAS[aba] || aba;
    this.tela.escolher(abaDestino);
  }

  async refresh() {
    await this.tela.mostrar();
  }

  destroy() {
    this.tela.destroy();
    super.destroy();
  }
}
