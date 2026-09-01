/**
 * Atrasa a chamada de `fn` até `delayMs` sem nova chamada -- usado nos
 * campos de busca. Sem isso, cada tecla digitada dispara uma consulta
 * completa à API; com o debounce, só a última tecla (a que ficou parada
 * por `delayMs`) realmente dispara a busca. Equivalente de
 * `widgets.debounced` no app Tkinter original.
 */
export function debounce(fn, delayMs = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}
