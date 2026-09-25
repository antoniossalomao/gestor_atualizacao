import { View } from "../app/View.js";
import { prefs } from "../app/prefs.js";
import { theme } from "../app/theme.js";
import { aparencia, reaplicarAparencia, PERFIS } from "../app/appearance.js";
import { Modal } from "../components/Modal.js";
import { toast } from "../components/Toast.js";
import { TelaComAbas } from "../components/TelaComAbas.js";
import { html } from "../utils/html.js";
import { iconHtml } from "../utils/icons.js";
import { filtrarPorBusca } from "../utils/busca.js";
import { baixarTexto, escolherArquivo } from "../utils/arquivo.js";
import { resultadosBusca } from "../templates/configuracoes.js";
import { definirAbas, chavesDaAba } from "./configuracoes/ajustes.js";
import { SecaoAjustes } from "./configuracoes/SecaoAjustes.js";
import { ContaConfig } from "./configuracoes/ContaConfig.js";
import { RegrasEquipeConfig } from "./configuracoes/RegrasEquipeConfig.js";

/**
 * Tela Configurações -- as preferências de quem está usando.
 *
 * A história, que explica a forma de hoje:
 *
 *  1. As preferências estavam espalhadas e escondidas atrás de gestos que
 *     ninguém descobre sozinho: o tema era um botão de ícone que CICLAVA
 *     entre três estados, e recolher o menu era um botãozinho sem rótulo.
 *  2. Viraram uma lista única dentro de um modal de 520px. Funcionou até a
 *     lista crescer: catorze ajustes empilhados num rolinho de modal não se
 *     varrem, e não havia sinal de ONDE se estava enquanto se rolava.
 *  3. Viraram um modal de duas colunas, com trilha de seções à esquerda --
 *     que resolvia a organização, mas tinha um desenho só dele (outra trilha
 *     de navegação, outro cabeçalho, outro rodapé), diferente de todo o
 *     resto do app, e apertava tudo em 880px com a tela desfocada atrás.
 *  4. Hoje é uma tela, com a mesma moldura da Administração (abas
 *     sublinhadas, cabeçalho de seção, cartões com título). Continua sendo
 *     aberta pelos MESMOS lugares -- o botão no rodapé do menu lateral, o
 *     menu da conta, Ctrl + , e a paleta -- e não ganhou item no menu: é
 *     lugar de ir de vez em quando, não de trabalhar.
 *
 * O que continua, e por quê:
 *
 *  - **Perfis.** Vinte e tantos ajustes é mais do que a maioria das pessoas
 *    quer decidir. Um clique em "Operação" ou "Leitura" põe a interface
 *    inteira numa configuração coerente, e cada ajuste continua editável.
 *  - **Selo "alterado", contagem por aba e restaurar só uma seção.** "O que
 *    aqui dentro fui EU que mexi?" é a primeira pergunta de quem herda uma
 *    máquina configurada por outra pessoa, ou de quem quer desfazer um ajuste
 *    de que se arrependeu sem zerar todo o resto junto.
 *  - **Busca**, porque a pergunta real de quem abre configurações quase nunca
 *    é "quais seções existem", é "onde fica aquilo". Agora ela responde com
 *    uma lista que leva ao ajuste e o acende, em vez de filtrar as linhas no
 *    lugar.
 *  - **Exportar e importar** as preferências num arquivo.
 *
 * O que é novo: a conta (nome, senha, sessões abertas) com cara de conta, a
 * prévia ao vivo da tabela, a lista de atalhos na própria tela, e oito
 * ajustes que não existiam (fonte, largura do conteúdo, anel de foco, dicas de
 * atalho, período inicial de Atualizações, confirmar ao sair, tempo dos
 * avisos, contador no título da aba).
 */
export class ConfiguracoesView extends View {
  /**
   * @param {HTMLElement} container
   * @param {import('../api/ApiClient').ApiClient} api
   * @param {any} ctx além do de toda view: `abasDoMenu`, `definirSidebar`,
   *   `sincronizarPreferencias` e `aoMudarNome` (ver App._montarAbas)
   */
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.ctx = ctx;
    this.abas = definirAbas({
      abasDoMenu: ctx.abasDoMenu || [],
      atualizadorHabilitado: this.atualizadorHabilitado,
      definirSidebar: (recolhida) => ctx.definirSidebar?.(recolhida),
    });

    // Migra preferências salvas de chaves antigas para as novas seções
    const ALIASES = {
      conta: "conta",
      navegacao: "trabalho",
      tabelas: "trabalho",
      rotina: "trabalho",
      trabalho: "trabalho",
      aparencia: "interface",
      acessibilidade: "interface",
      interface: "interface",
      notificacoes: "notificacoes",
      regras: "regras-equipe",
      "regras-equipe": "regras-equipe",
      atalhos: "ajuda",
      sobre: "ajuda",
      ajuda: "ajuda",
    };
    const salva = prefs.get("configuracoes:aba", "conta");
    if (ALIASES[salva] && ALIASES[salva] !== salva) {
      prefs.set("configuracoes:aba", ALIASES[salva]);
    }

    this.tela = new TelaComAbas(container, {
      abas: this.abas,
      rotulo: "Seções das configurações",
      idBase: "cfg",
      chavePrefs: "configuracoes:aba",
      extra: html`
        <label class="cfg-busca">
          <span class="cfg-busca__icone" aria-hidden="true">${iconHtml("busca")}</span>
          <input type="search" class="input" data-role="busca" placeholder="Buscar um ajuste…"
                 aria-label="Buscar um ajuste" autocomplete="off" spellcheck="false" />
        </label>`,
      criar: (key, painel) => this._criarAba(key, painel),
    });

    // A lista de resultados mora FORA dos painéis das abas: durante a busca
    // os painéis somem e ela aparece no lugar, e apagar o texto devolve
    // exatamente a aba em que se estava.
    this.resultados = document.createElement("section");
    this.resultados.className = "card secao-card cfg-resultados";
    this.resultados.setAttribute("aria-label", "Resultados da busca");
    this.resultados.hidden = true;
    this.tela.raiz.appendChild(this.resultados);
    this.busca = /** @type {HTMLInputElement} */ (this.tela.raiz.querySelector('[data-role="busca"]'));
    this._ligarBusca();

    // Qualquer preferência que mude -- daqui, do menu da conta, da paleta ou
    // do Ctrl+B -- passa por um destes dois eventos. Ouvindo os dois, a tela
    // nunca mostra um valor velho.
    const aoMudar = () => this._atualizarTudo();
    this.on(document, "aparencia:mudou", aoMudar);
    this.on(document, "tema:mudou", aoMudar);
    this._atualizarContadores();
  }

  /** `navigate("configuracoes", { aba: "tabelas", ajuste: "densidade" })` */
  aplicarParams({ aba, ajuste } = {}) {
    let abaDestino = aba;
    if (ajuste) {
      const abaComAjuste = this.abas.find((a) => a.cartoes?.some((c) => c.itens?.some((i) => i.id === ajuste)))?.key;
      if (abaComAjuste) abaDestino = abaComAjuste;
    }
    if (abaDestino) {
      const ALIASES = {
        conta: "conta",
        navegacao: "trabalho",
        tabelas: "trabalho",
        rotina: "trabalho",
        trabalho: "trabalho",
        aparencia: "interface",
        acessibilidade: "interface",
        interface: "interface",
        notificacoes: "notificacoes",
        regras: "regras-equipe",
        "regras-equipe": "regras-equipe",
        atalhos: "ajuda",
        sobre: "ajuda",
        ajuda: "ajuda",
      };
      abaDestino = ALIASES[abaDestino] || abaDestino;
      this.tela.escolher(abaDestino);
    }
    this._ajustePendente = ajuste || null;
  }

  async refresh() {
    await this.tela.mostrar();
    if (this._ajustePendente) {
      this.tela.instancia(this.tela.aba)?.destacar?.(this._ajustePendente);
      this._ajustePendente = null;
    }
  }

  destroy() {
    this.tela.destroy();
    super.destroy();
  }

  _criarAba(key, painel) {
    const aba = this.abas.find((a) => a.key === key);
    if (key === "conta") {
      return new ContaConfig(painel, this.api, {
        usuario: this.user,
        navigate: this.navigate,
        aoMudarNome: (nome) => this.ctx.aoMudarNome?.(nome),
        exportar: () => this._exportar(),
        importar: () => this._importar(),
        restaurarTudo: () => this._restaurarTudo(),
        resumoAlteracoes: () => {
          const n = aparencia.diferencas().size;
          return n === 0 ? "Tudo como vem de fábrica." : `${n} ${n === 1 ? "ajuste está" : "ajustes estão"} fora do padrão.`;
        },
      });
    }
    if (key === "regras-equipe") {
      return new RegrasEquipeConfig(painel, this.api, {
        usuario: this.user,
        navigate: this.navigate,
      });
    }
    return new SecaoAjustes(painel, aba, {
      aoAplicarPerfil: (valor) => this._aplicarPerfil(valor),
      aoRestaurarSecao: (a) => this._restaurarSecao(a),
    });
  }

  // ==========================================================================
  // O QUE ESTÁ FORA DO PADRÃO
  // ==========================================================================

  _atualizarTudo() {
    for (const aba of this.abas) {
      const instancia = this.tela.instancia(aba.key);
      if (instancia instanceof SecaoAjustes) instancia.atualizar();
      else instancia?.atualizarResumo?.();
    }
    this._atualizarContadores();
  }

  /** O numerozinho de cada aba: quantos ajustes dela estão fora do padrão. */
  _atualizarContadores() {
    const mudadas = aparencia.diferencas();
    for (const aba of this.abas) {
      if (aba.manual) continue;
      const n = aba.cartoes
        .flatMap((c) => c.itens)
        .filter((item) => (item.chaves || []).some((chave) => mudadas.has(chave))).length;
      this.tela.contador(aba.key, n, `${n} ${n === 1 ? "ajuste" : "ajustes"} fora do padrão nesta seção`);
    }
  }

  // ==========================================================================
  // MUDANÇAS EM LOTE
  // ==========================================================================

  /**
   * O que fazer depois de mexer em muitas preferências de uma vez (perfil,
   * arquivo importado, seção ou tudo restaurado).
   *
   * Uma versão antiga resolvia isso com `location.reload()` -- e cobrava caro:
   * a página piscava inteira, a aba e a rolagem voltavam ao começo, e quem
   * estava explorando perfis perdia o lugar a cada clique. Bastam os mesmos
   * chamados que a inicialização faz: repintar o tema, repintar a aparência
   * (que avisa esta tela pelo evento) e pedir ao App que alinhe o que é dele,
   * o menu lateral.
   */
  _aplicarEmLote() {
    theme.aplicar();
    reaplicarAparencia();
    this.ctx.sincronizarPreferencias?.();
    this._atualizarTudo();
  }

  _aplicarPerfil(valor) {
    const perfil = PERFIS.find((p) => p.valor === valor);
    if (!perfil || !aparencia.aplicarPerfil(valor)) return;
    this._aplicarEmLote();
    toast.success(`Perfil "${perfil.rotulo}" aplicado.`);
  }

  _restaurarSecao(aba) {
    const chaves = chavesDaAba(aba);
    if (chaves.length === 0) return;
    aparencia.restaurarPadroes(chaves);
    this._aplicarEmLote();
    toast.success(`"${aba.rotulo}" voltou ao padrão.`);
  }

  async _restaurarTudo() {
    const ok = await Modal.confirm(
      "Restaurar padrões",
      "Todas as suas preferências voltam ao estado original: tema, cores, texto, tabelas, navegação, avisos e acessibilidade.\n\nNenhum dado do sistema é afetado, e a sua senha e as sessões abertas continuam como estão.",
      { confirmLabel: "Restaurar", danger: false }
    );
    if (!ok) return;
    aparencia.restaurarPadroes();
    this._aplicarEmLote();
    toast.success("Preferências restauradas.");
  }

  // ==========================================================================
  // LEVAR PARA OUTRA MÁQUINA
  // ==========================================================================

  _exportar() {
    const agora = new Date();
    const carimbo = [
      agora.getFullYear(),
      String(agora.getMonth() + 1).padStart(2, "0"),
      String(agora.getDate()).padStart(2, "0"),
    ].join("-");
    baixarTexto(JSON.stringify(aparencia.exportar(), null, 2), `preferencias-gestor-${carimbo}.json`);
    toast.success("Arquivo de preferências salvo.");
  }

  async _importar() {
    const arquivo = await escolherArquivo({ accept: "application/json,.json" });
    if (!arquivo) return; // diálogo cancelado: nada a dizer

    let conteudo;
    try {
      conteudo = JSON.parse(await arquivo.text());
    } catch {
      toast.error("Arquivo inválido: não é um JSON legível.");
      return;
    }

    let resultado;
    try {
      resultado = aparencia.importar(conteudo);
    } catch (erro) {
      // As mensagens de `importar` são escritas para serem lidas por quem
      // escolheu o arquivo -- repassar direto é melhor que traduzir aqui.
      toast.error(erro.message);
      return;
    }

    this._aplicarEmLote();
    toast.success(
      resultado.ignoradas > 0
        ? `${resultado.aplicadas} preferências aplicadas. ${resultado.ignoradas} não foram reconhecidas.`
        : `${resultado.aplicadas} preferências aplicadas.`
    );
  }

  // ==========================================================================
  // BUSCA
  // ==========================================================================

  /**
   * Todos os ajustes de todas as abas, achatados -- inclusive os das abas que
   * ainda não foram abertas (as abas são montadas sob demanda, mas a busca
   * precisa enxergar tudo).
   */
  _indice() {
    return this.abas.flatMap((aba) =>
      aba.cartoes.flatMap((cartao) =>
        cartao.itens.map((item) => ({
          aba: aba.key,
          id: item.id,
          titulo: item.titulo,
          ajuda: item.ajuda || "",
          caminho: cartao.titulo === item.titulo ? aba.rotulo : `${aba.rotulo} › ${cartao.titulo}`,
          icone: aba.icone,
          resto: `${item.ajuda || ""} ${item.busca || ""} ${cartao.titulo} ${aba.rotulo}`,
        }))
      )
    );
  }

  _ligarBusca() {
    const campo = this.busca;
    campo.addEventListener("input", () => {
      const termo = campo.value.trim();
      this.tela.raiz.classList.toggle("is-buscando", termo.length > 0);
      this.resultados.hidden = termo.length === 0;
      if (!termo) return;
      const achados = filtrarPorBusca(this._indice(), termo, (item) => ({ titulo: item.titulo, resto: item.resto }));
      this.resultados.innerHTML = resultadosBusca(achados.slice(0, 30), termo).toString();
    });

    campo.addEventListener("keydown", (e) => {
      // Escape com texto limpa a busca em vez de sair da tela: quem está
      // buscando quer desistir da BUSCA.
      if (e.key === "Escape" && campo.value) {
        e.stopPropagation();
        this._limparBusca();
      }
      // Enter leva ao primeiro resultado; seta para baixo entra na lista.
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
      this._irParaAjuste(alvo.dataset.aba, alvo.dataset.ajuste);
    });

    // Setas percorrem os resultados, como numa lista de sugestões.
    this.resultados.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const itens = [...this.resultados.querySelectorAll(".cfg-resultado")];
      const i = itens.indexOf(/** @type {Element} */ (document.activeElement));
      if (i === -1) return;
      e.preventDefault();
      if (e.key === "ArrowUp" && i === 0) campo.focus();
      else /** @type {HTMLElement} */ (itens[Math.min(itens.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))]).focus();
    });
  }

  _limparBusca() {
    this.busca.value = "";
    this.busca.dispatchEvent(new Event("input"));
  }

  async _irParaAjuste(aba, id) {
    await this.tela.mostrar(aba);
    this.tela.instancia(aba)?.destacar?.(id);
  }
}
