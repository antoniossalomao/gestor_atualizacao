/**
 * Contas da aba Resumo que não dependem da tela -- saíram de ResumoView.js
 * para poderem ser testadas no Node. `hoje` é parâmetro (com a data real
 * como padrão) pelo mesmo motivo: "mês corrente" num teste precisa ser fixo.
 */

const MESES_ABREVIADOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * "2026-09" -> "set/2026".
 * @param {string} mesStr
 */
export function formatarMes(mesStr) {
  const [ano, mes] = String(mesStr).split("-");
  const indice = Number(mes) - 1;
  return `${MESES_ABREVIADOS[indice] || mes}/${ano}`;
}

/**
 * dd/mm/aaaa do primeiro dia do mês -- o "de" do recorte "este mês" que o
 * indicador "Atualizações Este Mês" usa ao levar para a lista de Atualizações.
 * Tem que ser o MESMO recorte que o backend contou, senão a lista abre com um
 * total diferente do número em que se clicou.
 * @param {Date} [hoje]
 */
export function primeiroDiaDoMes(hoje = new Date()) {
  return `01/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
}

/**
 * Compara atualizações realizadas até hoje com o mesmo período do mês
 * anterior (o servidor já recorta os dois). Sem base anterior, não há %.
 *
 * @param {number} totalAtual
 * @param {number} totalAnteriorComparavel
 * @returns {{pct: number, tendencia: "alta"|"baixa"|"neutra"}|null}
 */
export function tendenciaMensal(totalAtual, totalAnteriorComparavel) {
  if (!Number.isFinite(totalAtual) || !Number.isFinite(totalAnteriorComparavel) || totalAnteriorComparavel <= 0) return null;
  const pct = Math.round(((totalAtual - totalAnteriorComparavel) / totalAnteriorComparavel) * 100);
  return { pct, tendencia: pct > 0 ? "alta" : pct < 0 ? "baixa" : "neutra" };
}

/**
 * Barras do gráfico "Atualizações por sistema este mês" (A08): até `limite`
 * sistemas pelo nome, na ordem que o servidor mandou (decrescente), e o resto
 * somado numa barra "Outros" -- com a lista dos que ela junta, para o clique
 * e a dica dizerem o que há dentro.
 *
 * @param {Array<{label: string, total: number, anterior?: number}>} lista
 * @param {number} [limite]
 * @returns {Array<{label: string, total: number, anterior: number, diferenca: number, sistemas: string[], outros: boolean}>}
 */
export function barrasPorSistema(lista, limite = 8) {
  const barra = (label, total, anterior, sistemas, outros = false) => ({ label, total, anterior, diferenca: total - anterior, sistemas, outros });
  const itens = (lista || []).map((i) => barra(i.label, i.total, i.anterior ?? 0, [i.label]));
  if (itens.length <= limite) return itens;
  const resto = itens.slice(limite);
  const soma = (campo) => resto.reduce((acc, i) => acc + i[campo], 0);
  return [...itens.slice(0, limite), barra("Outros", soma("total"), soma("anterior"), resto.map((i) => i.label), true)];
}

/**
 * "▲ 3", "▼ 2" ou "=" contra o mesmo período do mês anterior.
 * @param {number} diferenca
 * @returns {{texto: string, tendencia: "alta"|"baixa"|"neutra"}}
 */
export function variacaoMesAnterior(diferenca) {
  if (diferenca > 0) return { texto: `▲ ${diferenca}`, tendencia: "alta" };
  if (diferenca < 0) return { texto: `▼ ${Math.abs(diferenca)}`, tendencia: "baixa" };
  return { texto: "=", tendencia: "neutra" };
}
