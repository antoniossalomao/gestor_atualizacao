/**
 * Mantém em `--altura-disponivel` (no próprio elemento) a altura que sobra
 * para ele entre o ponto onde começa e o fim da janela, descontado o que
 * vem DEPOIS dele na tela (paginação, rodapé do cartão, respiro da página).
 *
 * Existe porque a altura das tabelas era um `vh` fixo (45/60/82vh), que não
 * sabe quanto o cabeçalho e os filtros ocupam acima: em 1366×768, "Cheia"
 * passava da janela e a página rolava junto com a tabela (rolagem dupla),
 * e numa tela alta sobrava uma faixa vazia embaixo (A06). O CSS decide o que
 * fazer com o número; aqui só se mede.
 *
 * O "depois" é medido até o fim do `.view`, e não até o fim do documento:
 * com pouco conteúdo o documento tem a altura da janela, e a conta viraria
 * "a altura que o elemento já tem" -- ele nunca cresceria.
 *
 * @param {HTMLElement} el
 * @param {{minimo?: number}} [opcoes] abaixo disto, a página rola em vez de a tabela encolher
 */
export function ocuparAlturaDisponivel(el, { minimo = 280 } = {}) {
  el.dataset.ocupaAltura = "";
  let ultima = null;
  let quadro = 0;

  const medir = () => {
    quadro = 0;
    if (!el.isConnected) {
      encerrar();
      return;
    }
    // Aba escondida (display: none): não há o que medir, e medir daria zero.
    // Quando ela volta, o ResizeObserver do próprio elemento dispara.
    if (el.offsetParent === null) return;
    const view = el.closest(".view");
    const main = el.closest(".app-main");
    const caixa = el.getBoundingClientRect();
    const depois =
      (view ? view.getBoundingClientRect().bottom - caixa.bottom : 0) +
      (main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0);
    const topo = caixa.top + window.scrollY;
    const altura = Math.max(minimo, Math.floor(window.innerHeight - topo - depois));
    if (altura === ultima) return;
    ultima = altura;
    el.style.setProperty("--altura-disponivel", `${altura}px`);
  };

  const agendar = () => {
    if (!quadro) quadro = requestAnimationFrame(medir);
  };

  // O corpo muda de tamanho quando os filtros quebram linha, a paginação
  // aparece ou a barra de lote abre: tudo isso mexe no espaço que sobra.
  const observador = new ResizeObserver(agendar);
  observador.observe(el);
  observador.observe(document.body);
  window.addEventListener("resize", agendar);

  function encerrar() {
    observador.disconnect();
    window.removeEventListener("resize", agendar);
    if (quadro) cancelAnimationFrame(quadro);
  }

  agendar();
  return encerrar;
}
