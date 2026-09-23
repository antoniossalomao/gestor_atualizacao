/**
 * "Chrome no Windows", a partir do User-Agent que o servidor anota no login
 * (ver AuthController._iniciarSessao). É o que Configurações > Conta mostra
 * em cada sessão aberta.
 *
 * Não é detecção de navegador para decidir comportamento -- isso seria frágil
 * e errado. É só um rótulo para a pessoa reconhecer "esse sou eu no notebook"
 * numa lista de sessões. Por isso a ordem dos testes importa mais do que a
 * precisão: o Edge e o Opera se anunciam também como Chrome, o Chrome também
 * como Safari, o Android também como Linux e o iPhone também como Mac -- o
 * mais específico tem que vir antes.
 *
 * @param {unknown} agente
 * @returns {{rotulo: string, navegador: string, sistema: string, movel: boolean}}
 */
export function descreverAparelho(agente) {
  const ua = String(agente ?? "");
  if (!ua.trim()) return { rotulo: "Aparelho não identificado", navegador: "", sistema: "", movel: false };

  const navegador = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
    ? "Opera"
    : /Firefox\/|FxiOS\//.test(ua)
    ? "Firefox"
    : /Chrome\/|CriOS\//.test(ua)
    ? "Chrome"
    : /Safari\//.test(ua)
    ? "Safari"
    : "Navegador";

  const sistema = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /CrOS/.test(ua)
    ? "ChromeOS"
    : /Mac OS X|Macintosh/.test(ua)
    ? "macOS"
    : /Linux/.test(ua)
    ? "Linux"
    : "";

  const movel = /Mobi|Android|iPhone|iPad|iPod/.test(ua);
  return { rotulo: sistema ? `${navegador} no ${sistema}` : navegador, navegador, sistema, movel };
}
