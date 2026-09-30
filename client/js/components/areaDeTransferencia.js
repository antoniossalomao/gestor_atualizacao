/**
 * Copia texto para a área de transferência. Tenta a API moderna primeiro
 * (`navigator.clipboard`), que só funciona em "contexto seguro" (HTTPS ou
 * localhost) -- este app é rotineiramente acessado por HTTP puro dentro da
 * rede local (ver `SESSION_SECURE=false` no README), onde `navigator.clipboard`
 * nem existe. Cai para o jeito antigo (`execCommand("copy")` numa textarea
 * temporária, fora da tela) nesse caso -- descontinuado, mas ainda funciona
 * em todo navegador relevante e não depende de contexto seguro.
 * @returns {Promise<boolean>} true se copiou
 */
export async function copyToClipboard(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // segue para o fallback abaixo
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = texto;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}
