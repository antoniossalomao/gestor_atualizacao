import { View } from "../app/View.js";
import { TelaComAbas } from "../components/TelaComAbas.js";
import { cabecalhoSecao } from "../templates/secao.js";
import { HistoricoView } from "./HistoricoView.js";
import { UsuariosAdmin } from "./administracao/UsuariosAdmin.js";
import { RegrasAdmin } from "./administracao/RegrasAdmin.js";
import { NotificacoesAdmin } from "./administracao/NotificacoesAdmin.js";
import { AtualizadorAdmin } from "./administracao/AtualizadorAdmin.js";
import { BackupsAdmin } from "./administracao/BackupsAdmin.js";
import { SaudeAdmin } from "./administracao/SaudeAdmin.js";
import { SistemasAdmin } from "./administracao/SistemasAdmin.js";

/**
 * Tela Administração -- só para administrador (ver `papel` em App.TABS).
 *
 * Antes, o que era da equipe inteira morava dentro do painel de preferências
 * PESSOAIS, numa seção "Segurança" que era só uma lista de links: cada um
 * fechava o painel e abria outro modal, com desenho próprio, e o "Fechar"
 * devolvia à tela de fundo em vez de às Configurações. Juntava coisas sem
 * relação entre si (usuários, backups, a chave dos agentes, o diagnóstico do
 * servidor, o liga/desliga do Atualizador) sob um nome que só servia a uma
 * delas.
 *
 * Agora é uma tela como as outras: tem rota (#/administracao), cabe tabela de
 * usuários e lista de backups com folga, e cada assunto é uma aba. O
 * Histórico de alterações veio junto -- é auditoria, a pergunta "quem mudou
 * isto?" que se faz justamente aqui.
 *
 * Cada aba é montada na primeira vez que é aberta, e só então vai à rede: a
 * Saúde e os Backups não têm por que ser consultados quando se entra só para
 * mudar o papel de alguém. A moldura das abas é a mesma das Configurações
 * (components/TelaComAbas.js).
 */
const ABAS = [
  { key: "usuarios", rotulo: "Usuários", icone: "users", Secao: UsuariosAdmin },
  // O Histórico é uma View completa, que não desenha cabeçalho de seção
  // próprio (como aba solta, o título vinha do cabeçalho do app). Aqui dentro
  // ele ganha o mesmo cabeçalho das outras abas.
  {
    key: "historico",
    rotulo: "Histórico",
    icone: "historico",
    Secao: HistoricoView,
    cabecalho: { titulo: "Histórico de alterações", descricao: "Quem criou, editou ou excluiu o quê, e quando." },
  },
  { key: "regras", rotulo: "Regras da equipe", icone: "ajustes", Secao: RegrasAdmin },
  { key: "classificacao", rotulo: "Classificação", icone: "sistemas", Secao: SistemasAdmin },
  { key: "notificacoes", rotulo: "Notificações", icone: "sino", Secao: NotificacoesAdmin },
  { key: "atualizador", rotulo: "Atualizador", icone: "distribuicao", Secao: AtualizadorAdmin },
  { key: "backups", rotulo: "Backups", icone: "backups", Secao: BackupsAdmin },
  { key: "saude", rotulo: "Saúde do servidor", icone: "saude", Secao: SaudeAdmin },
];

export class AdministracaoView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.ctx = ctx;
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

  /** `navigate("administracao", { aba: "backups" })` abre direto na aba. */
  aplicarParams({ aba } = {}) {
    this.tela.escolher(aba);
  }

  async refresh() {
    await this.tela.mostrar();
  }

  destroy() {
    this.tela.destroy();
    super.destroy();
  }
}
