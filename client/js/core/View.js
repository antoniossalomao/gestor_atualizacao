import { RequestCancelled } from "../api/ApiClient.js";

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
 * (ver SwrCache) e ainda cuida do indicador de atualização em segundo plano.
 */
export class View {
  /**
   * @param {HTMLElement} container
   * @param {import('../api/ApiClient').ApiClient} api
   * @param {{user?: object, cache: import('./SwrCache').SwrCache, navigate?: (aba: string) => void}} ctx
   */
  constructor(container, api, ctx = {}) {
    this.container = container;
    this.api = api;
    this.user = ctx.user || null;
    this.cache = ctx.cache;
    this.navigate = ctx.navigate || (() => {});
    /** @type {Array<{alvo: EventTarget, evento: string, fn: Function, opts: any}>} */
    this._listeners = [];
    this._destruido = false;
    /** Quantas revalidações estão em voo agora (ver _indicarRevalidacao). */
    this._revalidando = 0;
    this._timerIndicador = null;
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

  /** True se esta é a aba que o usuário está vendo agora. */
  get visivel() {
    return this.container.style.display !== "none";
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
      return frescos;
    } catch (erro) {
      // Cancelamento não é falha: outra busca, mais nova, tomou o lugar desta.
      if (erro instanceof RequestCancelled) return guardado;
      // Já tínhamos algo na tela: melhor manter o dado velho visível do que
      // trocar a tela inteira por uma mensagem de erro.
      if (guardado !== undefined) return guardado;
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
