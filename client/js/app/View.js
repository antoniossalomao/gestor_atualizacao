import { RequisicaoCancelada } from "../api/ApiPainel.js";
import { EstadoDados } from "../utils/EstadoDados.js";
import { el } from "../components/elemento.js";
import { iconeSvg } from "../utils/icones.js";

/**
 * Quanto uma revalidação precisa demorar para valer a pena avisar.
 *
 * Numa rede local a resposta volta em poucas dezenas de milissegundos. A barra
 * de progresso aparecia e sumia dentro do mesmo piscar de olhos em TODA troca
 * de aba -- e um lampejo desses não se lê como "conferindo", se lê como a tela
 * tremendo. Abaixo deste limiar a atualização simplesmente acontece, em
 * silêncio, que é o que ela merece quando é instantânea.
 */
const ATRASO_INDICADOR_MS = 180;

/**
 * Classe base de todas as telas.
 *
 * Existe por dois motivos concretos, os dois vindos de bugs reais:
 *
 * **1. Listeners que vazavam.** Três views faziam
 * `document.addEventListener("keydown", ...)` no construtor e nunca removiam.
 * Quando a sessão expirava, `App` descartava as instâncias das views, mas os
 * listeners continuavam vivos, presos às instâncias antigas -- depois de
 * re-logar, apertar `Delete` podia disparar a exclusão registrada pela tela
 * fantasma. Aqui, todo listener passa por `this.on(...)`, que anota o que
 * registrou, e `destroy()` remove tudo de uma vez.
 *
 * **2. Carregamento instantâneo entre abas.** `this.swr(...)` implementa o
 * ciclo "mostra o que tem guardado, revalida por trás, redesenha só se mudou"
 * (ver CacheSwr) e ainda cuida do indicador de atualização em segundo plano
 * e do aviso de dados desatualizados quando a busca falha (ver
 * utils/EstadoDados.js).
 */
export class View {
  /**
   * @param {HTMLElement} container
   * @param {import('../api/ApiPainel').ApiPainel} api
   * @param {{user?: object, cache?: import('./CacheSwr').CacheSwr, navigate?: (aba: string, params?: object) => void}} ctx
   *
   * `navigate` recebe DOIS argumentos, nao um: o destino e um objeto opcional de
   * filtros pre-aplicados na aba de destino (ver App.trocarAba). A anotacao antiga
   * dizia `(aba: string) => void`, e com isso as chamadas legitimas de ResumoView
   * ("este mes" abre Atualizacoes ja filtrada pelo mesmo recorte que o numero
   * contou) e de AgendamentosView apareciam como erro na verificacao de tipos.
   * O codigo sempre esteve certo; a anotacao e' que estava atras dele.
   *
   * `cache` e' opcional porque `ctx` tem default `{}` -- uma View construida sem
   * contexto e' valida (acontece em teste e no primeiro desenho do login).
   */
  constructor(container, api, ctx = {}) {
    this.container = container;
    this.api = api;
    this.user = ctx.user || null;
    this.cache = ctx.cache;
    this.navigate = ctx.navigate || (() => {});
    // Distribuição/Versões/alerta de agentes podem estar desativados
    // temporariamente em Configurações (ver App.js/ConfiguracaoSistemaService
    // no servidor) -- default `true` porque uma View construída sem
    // contexto (teste, primeiro desenho do login) não deve se comportar
    // como se o Atualizador estivesse desligado.
    this.atualizadorHabilitado = ctx.atualizadorHabilitado !== false;
    /** @type {Array<{alvo: EventTarget, evento: string, fn: Function, opts: any}>} */
    this._listeners = [];
    this._destruido = false;
    /** Quantas revalidações estão em voo agora (ver _indicarRevalidacao). */
    this._revalidando = 0;
    this._timerIndicador = null;
    /** De quando é o que está na tela e o que falhou (ver _mostrarAvisoDados). */
    this._estadoDados = new EstadoDados();
    /** @type {HTMLElement|null} */
    this._avisoDados = null;
    this._tentandoDeNovo = false;
  }

  /**
   * Registra um listener que será removido automaticamente no `destroy()`.
   * Use SEMPRE isto em vez de `addEventListener` direto quando o alvo for
   * `document`/`window` -- eles sobrevivem à view, e é exatamente aí que o
   * vazamento acontece.
   */
  on(alvo, evento, fn, opts) {
    alvo.addEventListener(evento, fn, opts);
    this._listeners.push({ alvo, evento, fn, opts });
    return fn;
  }

  /**
   * True se esta é a aba que o usuário está vendo agora.
   *
   * O `offsetParent` cobre a view ANINHADA: o Histórico mora dentro de uma
   * aba da Administração, e quando a Administração inteira sai de cena o
   * contêiner dele continua `display: flex` -- escondido é o avô. Olhando só
   * o próprio `display`, uma view aninhada se acharia visível atrás de
   * qualquer outra tela e responderia aos atalhos de teclado dela.
   */
  get visivel() {
    return this.container.style.display !== "none" && this.container.offsetParent !== null;
  }

  /**
   * Busca dados com a estratégia stale-while-revalidate.
   *
   * @param {string} chave identidade do dado (inclua os filtros: "clientes:busca=ab:p2")
   * @param {() => Promise<any>} buscar
   * @param {(dados: any, meta: {doCache: boolean}) => void} desenhar
   */
  async swr(chave, buscar, desenhar) {
    const guardado = this.cache?.peek(chave);
    // Só há o que "revalidar" quando já existe algo na tela. Sem cache, o
    // esqueleto da tabela já é o aviso de carregamento -- a barra em cima dele
    // seria um segundo aviso da mesma coisa. Guardado numa variável porque o
    // `finally` lá embaixo precisa DESFAZER exatamente o que foi feito aqui:
    // decrementar um contador que nunca foi incrementado zeraria o indicador
    // de uma outra busca que ainda está rodando na mesma tela.
    const avisando = guardado !== undefined;
    if (avisando) {
      desenhar(guardado, { doCache: true });
      this._estadoDados.exibido(chave, this.cache?.buscadoEm(chave) ?? Date.now());
      this._indicarRevalidacao(true);
    }

    try {
      const frescos = await buscar();
      if (this._destruido) return frescos;
      // Só redesenha se mudou de verdade. Redesenhar uma tabela idêntica
      // custa um "pisca" visível e a perda da posição de rolagem, sem
      // nenhum ganho.
      if (guardado === undefined || this.cache?.mudou(chave, frescos)) {
        desenhar(frescos, { doCache: false });
      }
      this.cache?.set(chave, frescos);
      this._estadoDados.sucesso(chave);
      this._mostrarAvisoDados();
      return frescos;
    } catch (erro) {
      // Cancelamento não é falha: outra busca, mais nova, tomou o lugar desta.
      if (erro instanceof RequisicaoCancelada) return guardado;
      // A tela diz que o dado é velho, de quando, e por quê -- antes o dado
      // velho ficava na tela em silêncio, parecendo atual.
      const avisado = !this._destruido && this._estadoDados.falhou(chave, erro);
      if (avisado) this._mostrarAvisoDados();
      // Já tínhamos algo na tela: melhor manter o dado velho visível do que
      // trocar a tela inteira por uma mensagem de erro.
      if (guardado !== undefined) return guardado;
      // Sem dado guardado, o erro segue para quem chamou (o fluxo da view
      // para ali). A marca diz ao App que a tela já avisou: sem ela, cada
      // tentativa somava um toast ao aviso.
      if (avisado && erro && typeof erro === "object") erro.avisadoNaTela = true;
      throw erro;
    } finally {
      if (avisando) this._indicarRevalidacao(false);
    }
  }

  /**
   * Barra fina de progresso no topo da view enquanto uma revalidação roda por
   * trás. É a diferença entre "o app travou" e "estou conferindo se mudou":
   * discreto o bastante para não atrapalhar a leitura do dado antigo.
   *
   * Duas correções sobre a versão anterior, que era um `classList.toggle`
   * direto:
   *
   *  - **espera `ATRASO_INDICADOR_MS`** antes de aparecer. Só avisa quem
   *    realmente vai ter que esperar; quando a resposta é instantânea, a barra
   *    nunca chega a existir e a troca de aba fica limpa;
   *  - **conta as revalidações em voo.** Telas como Distribuição fazem três
   *    buscas seguidas: com um booleano, a primeira a terminar apagava a barra
   *    e as outras duas continuavam rodando sem nenhum sinal na tela.
   */
  _indicarRevalidacao(ligado) {
    if (ligado) {
      this._revalidando += 1;
      if (this._timerIndicador == null) {
        this._timerIndicador = setTimeout(() => {
          this._timerIndicador = null;
          if (this._revalidando > 0 && !this._destruido) this.container.classList.add("is-revalidating");
        }, ATRASO_INDICADOR_MS);
      }
      return;
    }

    this._revalidando = Math.max(0, this._revalidando - 1);
    if (this._revalidando > 0) return;
    clearTimeout(this._timerIndicador);
    this._timerIndicador = null;
    this.container.classList.remove("is-revalidating");
  }

  /**
   * Mostra, atualiza ou tira o aviso de dados desatualizados no topo da view.
   *
   * Um aviso fixo na tela, e não um toast: é um estado que continua valendo
   * enquanto a tela mostrar o dado velho, e que some sozinho quando a busca
   * volta a dar certo (inclusive pela volta da conexão, que recarrega a aba
   * -- ver ConexaoBanner). Toast a cada tentativa seria o contrário: ruído
   * repetido, e nada na tela depois que ele some.
   */
  _mostrarAvisoDados() {
    if (this._destruido) return;
    const aviso = this._estadoDados.aviso();
    if (!aviso) {
      this._avisoDados?.remove();
      this._avisoDados = null;
      return;
    }
    if (!this._avisoDados) {
      this._avisoDados = el("div", { class: "dados-aviso", role: "status" }, [
        el("span", { class: "dados-aviso__icone", "aria-hidden": "true", html: iconeSvg("alerta") }),
        el("span", { class: "dados-aviso__texto" }, [el("strong", { dataset: { role: "titulo" } }), el("span", { dataset: { role: "detalhe" } })]),
        el("button", { type: "button", class: "btn btn--small", text: "Tentar novamente", onclick: () => this._tentarDeNovo() }),
      ]);
    }
    // A view pode ter refeito o próprio conteúdo (innerHTML) desde a última
    // vez; aí o aviso ficou solto e precisa voltar para o topo.
    if (!this._avisoDados.isConnected) this.container.prepend(this._avisoDados);
    this._avisoDados.classList.toggle("dados-aviso--sem-dados", aviso.semDados);
    /** @type {HTMLElement} */ (this._avisoDados.querySelector('[data-role="titulo"]')).textContent = aviso.titulo;
    /** @type {HTMLElement} */ (this._avisoDados.querySelector('[data-role="detalhe"]')).textContent = aviso.detalhe;
  }

  /** O botão do aviso: busca tudo de novo. O próprio swr tira ou atualiza o aviso. */
  async _tentarDeNovo() {
    if (this._tentandoDeNovo || typeof this.refresh !== "function") return;
    this._tentandoDeNovo = true;
    const botao = this._avisoDados?.querySelector("button");
    if (botao) {
      botao.disabled = true;
      botao.textContent = "Tentando…";
    }
    try {
      await this.refresh();
    } catch {
      /* o aviso continua na tela, com o motivo novo */
    } finally {
      this._tentandoDeNovo = false;
      if (botao) {
        botao.disabled = false;
        botao.textContent = "Tentar novamente";
      }
    }
  }

  /** Sobrescrito pelas views que precisam soltar recursos próprios. */
  destroy() {
    this._destruido = true;
    clearTimeout(this._timerIndicador);
    this._timerIndicador = null;
    for (const { alvo, evento, fn, opts } of this._listeners) {
      alvo.removeEventListener(evento, fn, opts);
    }
    this._listeners = [];
  }
}
