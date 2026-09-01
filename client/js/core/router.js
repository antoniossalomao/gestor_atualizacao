/**
 * Roteamento por hash da URL (`#/clientes`).
 *
 * Antes o app não tinha rota nenhuma: recarregar a página sempre voltava para
 * o Resumo, o botão "Voltar" do navegador não fazia nada dentro do sistema, e
 * não dava para mandar a um colega o link de uma tela específica.
 *
 * Escolhemos hash em vez da History API de propósito: o servidor já devolve o
 * `index.html` para qualquer caminho, mas o hash nunca chega ao servidor,
 * então não há risco de uma rota do front conflitar com uma rota da API. Para
 * um app interno de uma aba só, é a opção mais simples que funciona.
 */
export class Router {
  /**
   * @param {string[]} rotasValidas chaves das abas
   * @param {(rota: string) => void} aoMudar
   */
  constructor(rotasValidas, aoMudar) {
    this.rotasValidas = new Set(rotasValidas);
    this.aoMudar = aoMudar;
    this._handler = () => this._resolver();
    window.addEventListener("hashchange", this._handler);
  }

  /** Rota atual da URL, ou `null` se a URL não aponta para uma aba conhecida. */
  atual() {
    const rota = decodeURIComponent(location.hash.replace(/^#\/?/, "")).trim();
    return this.rotasValidas.has(rota) ? rota : null;
  }

  /**
   * Aponta a URL para `rota`.
   * @param {string} rota
   * @param {{substituir?: boolean}} [opts] `substituir` troca a entrada atual
   *   do histórico em vez de empilhar uma nova -- usado na rota inicial, para
   *   que o primeiro "Voltar" saia do app em vez de ficar preso nele.
   */
  ir(rota, { substituir = false } = {}) {
    if (!this.rotasValidas.has(rota)) return;
    const novoHash = `#/${rota}`;
    if (location.hash === novoHash) return;
    if (substituir) history.replaceState(null, "", novoHash);
    else location.hash = novoHash;
  }

  /** Dispara `aoMudar` para a rota atual (ou para `padrao` se a URL não tiver uma). */
  iniciar(padrao) {
    const rota = this.atual();
    if (rota) {
      this.aoMudar(rota);
      return;
    }
    this.ir(padrao, { substituir: true });
    this.aoMudar(padrao);
  }

  _resolver() {
    const rota = this.atual();
    if (rota) this.aoMudar(rota);
  }

  destroy() {
    window.removeEventListener("hashchange", this._handler);
  }
}
