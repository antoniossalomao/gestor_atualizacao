/**
 * Validacoes compartilhadas entre servicos (por enquanto, so a de datas).
 * Equivalente de gestor/validation.py.
 */

const DATA_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * True se `texto` estiver vazio ou for uma data real no formato dd/mm/aaaa.
 * Campo vazio e permitido (usuario pode nao saber a data ainda); o que nao
 * pode e um texto preenchido que nao seja uma data valida nesse formato --
 * isso quebraria silenciosamente a ordenacao cronologica e o calculo de
 * "cliente desatualizado" (ambos assumem sempre dd/mm/aaaa).
 */
function dataValida(texto) {
  if (!texto) return true;
  const m = DATA_REGEX.exec(texto);
  if (!m) return false;
  const [, diaStr, mesStr, anoStr] = m;
  const dia = Number(diaStr);
  const mes = Number(mesStr);
  const ano = Number(anoStr);
  // new Date faz "rollover" de datas invalidas (ex.: 31/02 vira 03/03) --
  // comparar os campos de volta com o que foi digitado pega esse caso.
  const d = new Date(ano, mes - 1, dia);
  return d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;
}

/** Converte "dd/mm/aaaa" num objeto Date; devolve null se invalido/vazio. */
function parseData(texto) {
  if (!dataValida(texto) || !texto) return null;
  const [dia, mes, ano] = texto.split("/").map(Number);
  return new Date(ano, mes - 1, dia);
}

module.exports = { dataValida, parseData };
