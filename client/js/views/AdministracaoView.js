import { View } from "../app/View.js";
import { prefs } from "../app/prefs.js";
import { html } from "../utils/html.js";
import { iconHtml } from "../utils/icons.js";
import { cabecalhoSecao } from "../templates/administracao.js";
import { HistoricoView } from "./HistoricoView.js";
import { UsuariosAdmin } from "./administracao/UsuariosAdmin.js";
import { RegrasAdmin } from "./administracao/RegrasAdmin.js";
import { NotificacoesAdmin } from "./administracao/NotificacoesAdmin.js";
import { AtualizadorAdmin } from "./administracao/AtualizadorAdmin.js";
import { BackupsAdmin } from "./administracao/BackupsAdmin.js";
import { SaudeAdmin } from "./administracao/SaudeAdmin.js";

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
 * mudar o papel de alguém.
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
  { key: "notificacoes", rotulo: "Notificações", icone: "sino", Secao: NotificacoesAdmin },
  { key: "atualizador", rotulo: "Atualizador", icone: "distribuicao", Secao: AtualizadorAdmin },
  { key: "backups", rotulo: "Backups", icone: "backups", Secao: BackupsAdmin },
  { key: "saude", rotulo: "Saúde do servidor", icone: "saude", Secao: SaudeAdmin },
];

export class AdministracaoView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.ctx = ctx;
    /** @type {Map<string, {painel: HTMLElement, instancia: any}>} */
    this.secoes = new Map();
    const salva = prefs.get("administracao:aba", "usuarios");
    this.aba = ABAS.some((a) => a.key === salva) ? salva : "usuarios";
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = html`
      <div class="admin">
        <nav class="admin__abas" role="tablist" aria-label="Seções da administração">
          ${ABAS.map(
            (a) => html`
              <button type="button" class="admin__aba" role="tab" id="admin-aba-${a.key}" data-aba="${a.key}"
                      aria-controls="admin-painel-${a.key}" aria-selected="false" tabindex="-1">
                ${iconHtml(a.icone)}<span>${a.rotulo}</span>
              </button>`
          )}
        </nav>
        <div class="admin__paineis" data-role="paineis"></div>
      </div>`;
    this.nav = this.container.querySelector(".admin__abas");
    this.paineis = this.container.querySelector('[data-role="paineis"]');

    this.nav.addEventListener("click", (e) => {
      const botao = e.target.closest("[data-aba]");
      if (botao) this._mostrar(botao.dataset.aba);
    });
    // Setas entre as abas, como no menu lateral (padrão ARIA de tablist).
    this.nav.addEventListener("keydown", (e) => {
      const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!passo) return;
      e.preventDefault();
      const i = ABAS.findIndex((a) => a.key === this.aba);
      const proxima = ABAS[(i + passo + ABAS.length) % ABAS.length].key;
      this._mostrar(proxima);
      this.nav.querySelector(`[data-aba="${proxima}"]`)?.focus();
    });
  }

  /** `navigate("administracao", { aba: "backups" })` abre direto na aba. */
  aplicarParams({ aba } = {}) {
    if (ABAS.some((a) => a.key === aba)) this.aba = aba;
  }

  async refresh() {
    await this._mostrar(this.aba);
  }

  async _mostrar(key) {
    const def = ABAS.find((a) => a.key === key);
    if (!def) return;
    this.aba = key;
    prefs.set("administracao:aba", key);

    for (const botao of this.nav.querySelectorAll("[data-aba]")) {
      const ativa = botao.dataset.aba === key;
      botao.classList.toggle("is-active", ativa);
      botao.setAttribute("aria-selected", String(ativa));
      botao.tabIndex = ativa ? 0 : -1;
    }

    let secao = this.secoes.get(key);
    if (!secao) {
      const painel = document.createElement("section");
      painel.className = "admin__painel view";
      painel.id = `admin-painel-${key}`;
      painel.setAttribute("role", "tabpanel");
      painel.setAttribute("aria-labelledby", `admin-aba-${key}`);
      this.paineis.appendChild(painel);
      let alvo = painel;
      if (def.cabecalho) {
        painel.insertAdjacentHTML("beforeend", String(cabecalhoSecao(def.cabecalho)));
        alvo = document.createElement("div");
        alvo.className = "admin__conteudo";
        painel.appendChild(alvo);
      }
      secao = { painel, instancia: new def.Secao(alvo, this.api, this.ctx) };
      this.secoes.set(key, secao);
    }
    // `display`, e não `hidden`: é por ele que as views medem se estão
    // visíveis (ver View.visivel) -- inclusive a do Histórico, que é uma View
    // completa morando aqui dentro.
    for (const [k, { painel }] of this.secoes) painel.style.display = k === key ? "flex" : "none";

    await secao.instancia.refresh?.();
  }

  destroy() {
    for (const { instancia } of this.secoes.values()) instancia.destroy?.();
    super.destroy();
  }
}
