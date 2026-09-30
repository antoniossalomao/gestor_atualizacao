/**
 * Protege um botão contra clique duplo E dá o retorno visual de que algo está
 * acontecendo.
 *
 * A primeira versão só fazia `button.disabled = true`. Isso resolvia a
 * duplicação (dois cliques em "Adicionar" criavam dois registros, porque a
 * primeira resposta ainda não tinha voltado), mas não resolvia a percepção:
 * numa exportação de três segundos, o botão apenas ficava cinza e parado, o
 * que se lê como "não funcionou" -- e a pessoa clica de novo, ou vai embora.
 *
 * Agora o botão também ganha um spinner. Dois detalhes de implementação que
 * importam:
 *
 *  - a **largura é fixada** antes de trocar o conteúdo, senão o botão encolhe
 *    ao virar spinner e a barra de botões inteira "pula" de lugar;
 *  - o conteúdo original é guardado e restaurado, para o botão voltar exatamente
 *    como estava (inclusive com o ícone SVG que muitos deles têm).
 */

/** Marca um botão como ocupado (spinner + desabilitado) e devolve a função que desfaz. */
export function marcarOcupado(button) {
  if (button.dataset.ocupado === "1") return () => {};
  const conteudoOriginal = button.innerHTML;
  const larguraOriginal = button.style.width;

  button.style.width = `${button.getBoundingClientRect().width}px`;
  button.dataset.ocupado = "1";
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.innerHTML = '<span class="spinner" aria-hidden="true"></span>';

  return () => {
    button.innerHTML = conteudoOriginal;
    button.style.width = larguraOriginal;
    button.disabled = false;
    button.removeAttribute("aria-busy");
    delete button.dataset.ocupado;
  };
}

/**
 * Embrulha uma ação assíncrona: trava o botão, mostra o spinner, e libera no
 * fim -- dê certo ou dê errado.
 *
 * @param {HTMLButtonElement} button
 * @param {(...args: any[]) => Promise<any>} action
 */
export function withBusyButton(button, action) {
  return async (...args) => {
    if (button.disabled) return;
    const liberar = marcarOcupado(button);
    try {
      return await action(...args);
    } finally {
      liberar();
    }
  };
}
