/**
 * Decide se o SESSION_SECRET serve para subir o servidor.
 *
 * O SESSION_SECRET assina o cookie de login. Quem o conhece consegue forjar
 * um cookie de sessão válido para qualquer conta, sem senha nenhuma. O valor
 * de exemplo do .env.example é público (está no repositório), então subir
 * com ele equivale a não ter login.
 *
 * Antes o server.js caía nesse valor sozinho quando a variável faltava, e
 * isso acontecia sem aviso no caso mais comum: no Docker, se o server/.env
 * não existir antes do primeiro "up", o Docker cria uma PASTA com esse nome,
 * o dotenv não lê nada e o servidor subia normalmente com o segredo público
 * (ver o README, seção "Rodar em Docker"). Recusar a subida transforma esse
 * erro silencioso num container que não sobe e diz por quê no log.
 *
 * Função pura (não lê process.env nem encerra o processo) para ser testável
 * -- quem decide o que fazer com a resposta é o server.js.
 */

/** O mesmo texto do .env.example. Se mudar lá, mude aqui. */
const SEGREDO_DE_EXEMPLO = "troque-este-valor-em-producao";

/**
 * @param {string|undefined} valor o SESSION_SECRET lido do ambiente
 * @returns {string|null} o motivo da recusa, ou null se o valor serve
 */
function problemaNoSegredoDeSessao(valor) {
  const segredo = String(valor ?? "").trim();
  if (!segredo) return "SESSION_SECRET não está definido.";
  if (segredo === SEGREDO_DE_EXEMPLO) {
    return "SESSION_SECRET ainda é o valor de exemplo do .env.example, que é público.";
  }
  return null;
}

module.exports = { problemaNoSegredoDeSessao, SEGREDO_DE_EXEMPLO };
