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
 * "admin" é o valor guardado no banco (ver AuthService), não uma palavra para
 * mostrar a ninguém. Quem lê isto na tela quer saber se pode mexer em
 * usuários e backups, e é isso que "Administrador" responde.
 */
export function rotuloPapel(role) {
  return role === "admin" ? "Administrador" : "Usuário";
}
