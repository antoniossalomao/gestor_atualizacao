/*
 * Como uma pessoa aparece na tela: as iniciais do avatar e o nome do papel.
 *
 * Duas funções de três linhas em arquivo próprio porque são usadas em lugares
 * que não deveriam depender um do outro -- o menu de conta do cabeçalho e o
 * painel de Configurações. A alternativa era um dos dois importar do outro
 * (dizendo que o menu é "dono" da regra, o que não é verdade) ou cada um ter a
 * sua cópia, e duas cópias da mesma regra acabam divergindo: foi assim que
 * `escapeHtml` chegou a existir em sete arquivos (ver html.js).
 */

/** "Antonio Salomão" -> "AS". Duas letras bastam para um avatar de 32px. */
export function iniciais(nome) {
  const partes = String(nome || "?")
    .trim()
    .split(/\s+/);
  const primeira = partes[0]?.[0] || "?";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * Mapeia os valores guardados no banco (admin, operador, consulta) para rótulos amigáveis na UI.
 */
export function rotuloPapel(role) {
  if (role === "admin") return "Administrador";
  if (role === "consulta") return "Consulta";
  return "Operador";
}
