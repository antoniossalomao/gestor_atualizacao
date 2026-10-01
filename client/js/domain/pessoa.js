/*
 * Como uma pessoa aparece na tela: as iniciais do avatar e o nome do papel.
 *
 * Duas funções de três linhas em arquivo próprio porque são usadas em lugares
 * que não deveriam depender um do outro -- o menu de conta do cabeçalho e o
 * painel de Configurações. A alternativa era um dos dois importar do outro
 * (dizendo que o menu é "dono" da regra, o que não é verdade) ou cada um ter a
 * sua cópia, e duas cópias da mesma regra acabam divergindo: foi assim que
 * `escaparHtml` chegou a existir em sete arquivos (ver html.js).
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

/**
 * O que cada papel pode, numa frase. A Administração mostra as três ao lado
 * da tabela de usuários (a pergunta que se faz ANTES de escolher um papel), e
 * Configurações > Conta mostra a de quem está logado -- "o que eu posso
 * fazer aqui?" não tinha resposta em lugar nenhum para quem não é admin.
 */
const DESCRICOES_PAPEL = {
  admin: "Tudo, inclusive a Administração, os backups e publicar versões.",
  operador: "Cadastra e edita clientes, atualizações e agendamentos.",
  consulta: "Só vê e exporta. Não altera nada.",
};

export function descricaoPapel(role) {
  return DESCRICOES_PAPEL[role === "admin" || role === "consulta" ? role : "operador"];
}

/**
 * A tarefa é desta pessoa? O campo Responsável é texto livre, e o servidor o
 * normaliza para a grafia mais usada -- que costuma ser só o primeiro nome
 * ("Antonio"), enquanto a conta tem o nome inteiro ("Antonio Salomão").
 * Comparar os dois textos inteiros diria "não é minha" para quase tudo.
 *
 * Vale quando, sem caixa e sem acento, os dois são iguais ou um é o começo
 * do outro em palavras inteiras ("Antonio" x "Antonio Salomão"; mas não
 * "Ana" x "Anabela").
 * @param {string} responsavel
 * @param {string} nome
 */
export function ehResponsavel(responsavel, nome) {
  const a = normalizarNome(responsavel);
  const b = normalizarNome(nome);
  if (!a || !b) return false;
  return a === b || b.startsWith(`${a} `) || a.startsWith(`${b} `);
}

function normalizarNome(texto) {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}
