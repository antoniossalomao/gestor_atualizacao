const STATUS_SUCESSO = new Set(["OK", "SUCESSO", "ATUALIZADO", "CONCLUIDO"]);
const STATUS_ERRO = new Set(["ERRO", "FALHA"]);
const STATUS_ANDAMENTO = new Set(["INICIADO", "INICIANDO", "EM_ANDAMENTO", "ANDAMENTO", "PROGRESSO", "PROCESSANDO", "ATUALIZANDO", "INFO"]);

/**
 * O resultado final pode ser SUCESSO mesmo quando scripts foram pulados.
 * A classificação considera essa mensagem, sem transformar erros históricos
 * em falhas de uma atualização posterior que terminou sem pendências.
 */
export function classificarRetorno(log = {}) {
  const status = String(log.status || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const detalhes = String(log.detalhes || "");
  const pulados = detalhes.match(/\b(\d+)\s+script(?:\(s\)|s)?\s+pulado(?:\(s\)|s)?\s+por\s+erro\b/i);
  const scriptsPulados = pulados ? Number(pulados[1]) : null;

  if (STATUS_ERRO.has(status)) return { tipo: "erro", label: "Falha na atualização", scriptsPulados };
  // `scriptsPulados !== null` explicito antes da comparacao: `null > 0` e' false
  // em JavaScript, entao o comportamento sempre esteve certo -- mas so por
  // coercao implicita, que e' o tipo de regra que alguem "simplifica" um dia
  // sem perceber. Escrito assim, a intencao ("so conta quando o numero existe")
  // esta no codigo, e a verificacao estatica de tipos passa limpa.
  if ((scriptsPulados !== null && scriptsPulados > 0) || status === "PENDENCIAS" || status === "CONCLUIDO_COM_PENDENCIAS") {
    return { tipo: "pendencias", label: "Concluída com pendências", scriptsPulados };
  }
  if (STATUS_SUCESSO.has(status)) return { tipo: "sucesso", label: "Concluída", scriptsPulados };
  if (status === "PENDENTE" || log.fase === "aguardando_autorizacao") {
    return { tipo: "aguardando", label: "Aguardando autorização", scriptsPulados };
  }
  if (STATUS_ANDAMENTO.has(status) || (log.fase && log.fase !== "concluido")) {
    return { tipo: "andamento", label: "Em andamento", scriptsPulados };
  }
  return { tipo: "desconhecido", label: "Sem resultado", scriptsPulados };
}

function instante(log) {
  const valor = Date.parse(log.criadoEm || "");
  return Number.isFinite(valor) ? valor : -Infinity;
}

function compararRetornos(a, b) {
  const dataA = instante(a);
  const dataB = instante(b);
  if (dataA !== dataB) return dataA > dataB ? -1 : 1;
  return (Number(b.id) || 0) - (Number(a.id) || 0);
}

/**
 * Um resumo por identificador do agente, com histórico preservado.
 * Chame antes dos filtros de resultado/busca: filtrar linhas antes de agrupar
 * pode fazer um erro antigo parecer o resultado atual do agente.
 * Códigos legados (por exemplo C015928) não podem ser reduzidos a dígitos.
 */
export function agruparRetornos(logs = []) {
  const grupos = new Map();
  const ordenados = [...logs].sort(compararRetornos);

  for (const log of ordenados) {
    // A API exige cnpj; dados incompletos ficam separados para não misturar clientes.
    const cnpj = String(log.cnpj ?? "");
    const chave = cnpj || Symbol("retorno-sem-identificador");
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = { cnpj, ultimo: log, resultado: classificarRetorno(log), logs: [], erros: [], avisos: [], sistemas: [] };
      grupos.set(chave, grupo);
    }
    grupo.logs.push(log);
    const resultado = classificarRetorno(log);
    if (resultado.tipo === "erro") grupo.erros.push(log);
    if (resultado.tipo === "pendencias") grupo.avisos.push(log);
    if (log.sistema && !grupo.sistemas.includes(log.sistema)) grupo.sistemas.push(log.sistema);
  }

  return [...grupos.values()];
}
