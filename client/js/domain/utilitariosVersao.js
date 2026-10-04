export function splitSistemas(texto) {
  return String(texto || "")
    .split(/,|\s+e\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function versaoRegistrada(registro, sistema) {
  if (!registro) return "";
  if (registro.versoes_sistemas != null) {
    const mapa = JSON.parse(registro.versoes_sistemas);
    const chave = Object.keys(mapa).find((s) => s.toLowerCase() === sistema.toLowerCase());
    return chave ? mapa[chave] || "" : "";
  }
  return splitSistemas(registro.sistema).length === 1 ? registro.versao || "" : "";
}
