import { View } from "../app/View.js";
import { prefs } from "../app/preferencias.js";
import { TelaComAbas } from "../components/TelaComAbas.js";
import { cabecalhoSecao } from "../templates/secao.js";
import { resultadosBusca } from "../templates/configuracoes.js";
import { html } from "../utils/html.js";
import { iconeHtml } from "../utils/icones.js";
import { filtrarPorBusca } from "../utils/busca.js";
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
 * Organizada em navegação vertical espelhando Configurações, com índice lateral
 * em cada seção e busca rápida por regras, recursos e controles administrativos.
 */
const ABAS = [
  { key: "pessoas", rotulo: "Pessoas e permissões", subtitulo: "Contas, papéis e sessões", icone: "users", Secao: UsuariosAdmin },
  { key: "operacao", rotulo: "Operação", subtitulo: "Prazos e sistemas", icone: "ajustes", Secao: OperacaoAdmin },
  { key: "dados", rotulo: "Dados", subtitulo: "Planilhas e cadastros", icone: "download", Secao: DadosAdmin },
  { key: "integracoes", rotulo: "Integrações", subtitulo: "Discord e atualizador", icone: "distribuicao", Secao: IntegracoesAdmin },
  { key: "backups", rotulo: "Backups e recuperação", subtitulo: "Cópias e retenção", icone: "backups", Secao: BackupsAdmin },
  {
    key: "auditoria",
    rotulo: "Auditoria",
    subtitulo: "Registro de alterações",
    icone: "historico",
    Secao: HistoricoView,
    cabecalho: {
      titulo: "Auditoria do sistema",
      descricao: "Histórico detalhado de quem criou, editou ou excluiu registros no sistema, e quando.",
    },
  },
  { key: "diagnostico", rotulo: "Diagnóstico", subtitulo: "Saúde e integridade", icone: "saude", Secao: SaudeAdmin },
];

const INDICE_BUSCA = [
  { aba: "pessoas", id: "conta-nova", titulo: "Criar nova conta", ajuda: "Cadastrar usuário e escolher papel inicial (Administrador, Operador ou Consulta).", caminho: "Pessoas e permissões", icone: "users", seletor: '[data-action="nova"]', busca: "usuario senha conta criar papel permissao" },
  { aba: "pessoas", id: "papeis", titulo: "O que cada papel pode", ajuda: "Regras de acesso para Administrador, Operador e Consulta.", caminho: "Pessoas e permissões", icone: "escudo", seletor: ".secao-card--lateral", busca: "permissao papel operador consulta admin acesso" },
  { aba: "operacao", id: "prazoVersaoDias", titulo: "Desatualizado depois da versão oficial", ajuda: "Dias após a referência oficial para contar cliente como Desatualizado.", caminho: "Operação › Prazos", icone: "ajustes", seletor: '[data-regra="prazoVersaoDias"]', busca: "prazo versao oficial desatualizado aguardando dias" },
  { aba: "operacao", id: "desatualizadoDias", titulo: "Sem atualização depois de", ajuda: "Prazo sem registro para o cliente aparecer em Sem atualização no Resumo.", caminho: "Operação › Prazos", icone: "ajustes", seletor: '[data-regra="desatualizadoDias"]', busca: "sem atualizacao resumo dias alerta" },
  { aba: "operacao", id: "agendamentoArquivarDias", titulo: "Arquivar tarefa concluída depois de", ajuda: "Dias até tarefas concluídas saírem do quadro principal de Agendamentos.", caminho: "Operação › Prazos", icone: "ajustes", seletor: '[data-regra="agendamentoArquivarDias"]', busca: "agendamento arquivar concluida dias" },
  { aba: "operacao", id: "classificacao-sistemas", titulo: "Classificação dos sistemas", ajuda: "Define sistemas atualizáveis, componentes fixos e dependência com o B_Vendas.", caminho: "Operação › Sistemas", icone: "sistemas", seletor: '[data-role="secao-sistemas"]', busca: "sistema fixo atualizavel classificacao b_vendas" },
  { aba: "dados", id: "exportar-todos", titulo: "Exportar todas as atualizações (.xlsx)", ajuda: "Gera planilha completa do histórico gravado sem recorte de data.", caminho: "Dados › Histórico", icone: "download", seletor: '[data-action="exportar-todos"]', busca: "exportar excel xlsx planilha completo" },
  { aba: "dados", id: "importar-planilha", titulo: "Importar planilha de atualizações", ajuda: "Carga em lote por arquivo .xlsx com prévia antes de salvar.", caminho: "Dados › Histórico", icone: "upload", seletor: '[data-action="importar-planilha"]', busca: "importar planilha lote xlsx" },
  { aba: "dados", id: "conferencia-cadastros", titulo: "Conferência de cadastros", ajuda: "Clientes sem sistemas e sistemas sem versão oficial cadastrada.", caminho: "Dados › Conferência", icone: "alerta", seletor: '[data-role="conferencia"]', busca: "conferencia sem sistema versao oficial cadastro" },
  { aba: "integracoes", id: "discordWebhookUrl", titulo: "Webhook do Discord", ajuda: "URL do canal que recebe alertas externos de atualizações e agentes.", caminho: "Integrações › Discord", icone: "sino", seletor: '[data-regra="discordWebhookUrl"]', busca: "discord webhook notificacao alerta teste" },
  { aba: "integracoes", id: "atualizadorHabilitado", titulo: "Atualizador automático e agentes", ajuda: "Liga ou desliga a distribuição remota e oculta as abas correspondentes.", caminho: "Integrações › Atualizador", icone: "distribuicao", seletor: '#regra-atualizador-rotulo', busca: "atualizador automatico agente distribuicao versoes" },
  { aba: "integracoes", id: "publicUrl", titulo: "Endereço público deste servidor", ajuda: "URL usada pelos agentes para baixar pacotes de versão.", caminho: "Integrações › Atualizador", icone: "distribuicao", seletor: '[data-regra="publicUrl"]', busca: "url endereco servidor agentes download" },
  { aba: "backups", id: "backupsManter", titulo: "Política de retenção de backups", ajuda: "Quantidade de cópias automáticas mantidas no disco.", caminho: "Backups e recuperação", icone: "backups", seletor: '[data-role="retencao"]', busca: "backup retencao copias manter" },
  { aba: "backups", id: "fazer-copia", titulo: "Cópias armazenadas e restauração", ajuda: "Gerar cópia agora, baixar ou restaurar ponto anterior do banco.", caminho: "Backups e recuperação", icone: "backups", seletor: '[data-role="conteudo"]', busca: "backup copia restaurar baixar agora" },
  { aba: "auditoria", id: "auditoria-lista", titulo: "Registro de auditoria", ajuda: "Histórico completo de alterações, exclusões e ações administrativas.", caminho: "Auditoria", icone: "historico", seletor: '.admin__conteudo', busca: "auditoria historico log alteracoes" },
  { aba: "diagnostico", id: "saude-geral", titulo: "Diagnóstico do servidor e integridade", ajuda: "Situação geral, arquivo do banco SQLite, memória Node e agentes.", caminho: "Diagnóstico", icone: "saude", seletor: '[data-role="situacao"]', busca: "saude diagnostico sqlite banco memoria uptime agente" },
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
      layout: "vertical",
      indiceLateral: true,
      extra: html`
        <label class="cfg-busca">
          <span class="cfg-busca__icone" aria-hidden="true">${iconeHtml("busca")}</span>
          <input type="search" class="input" data-role="busca" placeholder="Filtrar administração"
                 aria-label="Filtrar na administração" autocomplete="off" spellcheck="false" />
        </label>`,
      criar: (key, painel) => {
        const def = ABAS.find((a) => a.key === key);
        let alvo = painel;
        if (def.cabecalho) {
          painel.insertAdjacentHTML("beforeend", String(cabecalhoSecao(def.cabecalho)));
          alvo = document.createElement("div");
          alvo.className = "admin__conteudo";
          painel.appendChild(alvo);
        }
        const sec = new def.Secao(alvo, this.api, this.ctx);
        if (key === "auditoria") {
          alvo.querySelector(".toolbar")?.setAttribute("data-indice-titulo", "Filtros");
          alvo.querySelector('[data-role="table"]')?.setAttribute("data-indice-titulo", "Histórico de alterações");
        }
        return sec;
      },
      // No Diagnóstico a faixa repetiria, em menor, o que a aba já mostra.
      aoMostrar: (key) => {
        if (this.faixa) this.faixa.hidden = key === "diagnostico";
      },
    });

    // A faixa de pendências fica no topo da coluna de conteúdo para manter a grade vertical limpa.
    this.faixa = document.createElement("div");
    this.faixa.className = "admin-faixa-lugar";
    this.tela.paineis.prepend(this.faixa);
    this.faixa.addEventListener("click", (e) => {
      const alvo = /** @type {HTMLElement} */ (e.target).closest("[data-ir-aba]");
      if (alvo instanceof HTMLElement) this.tela.mostrar(alvo.dataset.irAba);
    });

    this.resultados = document.createElement("section");
    this.resultados.className = "card secao-card cfg-resultados";
    this.resultados.setAttribute("aria-label", "Resultados da busca na administração");
    this.resultados.hidden = true;
    this.tela.raiz.appendChild(this.resultados);
    this.busca = /** @type {HTMLInputElement} */ (this.tela.raiz.querySelector('[data-role="busca"]'));
    this._ligarBusca();

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

  _ligarBusca() {
    const campo = this.busca;
    if (!campo) return;
    campo.addEventListener("input", () => {
      const termo = campo.value.trim();
      this.tela.raiz.classList.toggle("is-buscando", termo.length > 0);
      this.resultados.hidden = termo.length === 0;
      if (!termo) return;
      const achados = filtrarPorBusca(INDICE_BUSCA, termo, (item) => ({ titulo: item.titulo, resto: `${item.ajuda} ${item.busca} ${item.caminho}` }));
      this.resultados.innerHTML = resultadosBusca(achados.slice(0, 30), termo).toString();
    });

    campo.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && campo.value) {
        e.stopPropagation();
        this._limparBusca();
      }
      const primeiro = /** @type {HTMLElement|null} */ (this.resultados.querySelector(".cfg-resultado"));
      if (e.key === "Enter" && primeiro) {
        e.preventDefault();
        primeiro.click();
      }
      if (e.key === "ArrowDown" && primeiro) {
        e.preventDefault();
        primeiro.focus();
      }
    });

    this.resultados.addEventListener("click", (e) => {
      const alvo = /** @type {HTMLElement} */ (e.target).closest(".cfg-resultado");
      if (!(alvo instanceof HTMLElement)) return;
      this._limparBusca();
      this._irParaItem(alvo.dataset.aba, alvo.dataset.ajuste);
    });
  }

  _limparBusca() {
    this.busca.value = "";
    this.busca.dispatchEvent(new Event("input"));
  }

  async _irParaItem(aba, id) {
    if (!aba) return;
    await this.tela.mostrar(aba);
    const def = INDICE_BUSCA.find((x) => x.aba === aba && x.id === id);
    const painel = this.tela.secoes.get(aba)?.painel;
    if (!def?.seletor || !painel) return;
    const alvo = /** @type {HTMLElement|null} */ (painel.querySelector(def.seletor));
    if (!alvo) return;
    const destaque = alvo.closest(".cfg-group, .card, .admin-diagnostico") || alvo;
    destaque.scrollIntoView({ block: "center", behavior: "smooth" });
    destaque.classList.remove("is-destacado");
    void /** @type {HTMLElement} */ (destaque).offsetWidth;
    destaque.classList.add("is-destacado");
    if (alvo instanceof HTMLElement && typeof alvo.focus === "function") alvo.focus({ preventScroll: true });
  }

  destroy() {
    this.tela.destroy();
    super.destroy();
  }
}
