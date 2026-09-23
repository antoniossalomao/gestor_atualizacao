import { STATUS_OPTIONS } from "../config.js";

/** O último status do fluxo. Tarefa concluída nunca aparece como vencida. */
export const STATUS_CONCLUIDO = STATUS_OPTIONS[STATUS_OPTIONS.length - 1];

/**
 * True se `dataBR` (dd/mm/aaaa) for anterior a hoje. Data vazia ou mal
 * formada nunca conta como atrasada: é o que evita que tarefa sem data (ou
 * importada com data torta) apareça em vermelho no quadro para sempre.
 *
 * Compara só o DIA: a tarefa marcada para hoje não está atrasada, mesmo às
 * 23h -- por isso `hoje` é zerado na meia-noite antes da comparação.
 *
 * @param {string|null|undefined} dataBR
 * @param {Date} [agora]
 */
export function estaAtrasada(dataBR, agora = new Date()) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dataBR || "");
  if (!m) return false;
  const [, diaStr, mesStr, anoStr] = m;
  const data = new Date(Number(anoStr), Number(mesStr) - 1, Number(diaStr));
  const hoje = new Date(agora);
  hoje.setHours(0, 0, 0, 0);
  return data < hoje;
}
