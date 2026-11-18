/**
 * Atrasa a chamada de `fn` até `delayMs` sem nova chamada -- usado nos
 * campos de busca. Sem isso, cada tecla digitada dispara uma consulta
 * completa à API; com o aguardarPausa, só a última tecla (a que ficou parada
 * por `delayMs`) realmente dispara a busca.
 */
export function aguardarPausa(fn, delayMs = 200) {
  // Tipo explícito: o TypeScript 7 infere `undefined` para o `let` sem anotação
  // e recusa receber o número devolvido por setTimeout.
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}
