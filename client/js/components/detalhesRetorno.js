import { analisarRetorno } from "../domain/agenteReport.js";

/** Bloco visual compartilhado pelo feed e pelo histórico completo do agente. */
export function criarDetalhesRetorno(log, { compacto = false } = {}) {
  const info = analisarRetorno(log);
  const box = document.createElement("div");
  box.className = `agent-report agent-report--${info.tipo}${compacto ? " agent-report--compact" : ""}`;

  const titulo = document.createElement("strong");
  titulo.className = "agent-report__title";
  titulo.textContent = info.titulo;
  const resumo = document.createElement("p");
  resumo.className = "agent-report__summary";
  resumo.textContent = info.resumo;
  box.append(titulo, resumo);

  if (info.tipo !== "script") return box;

  const details = document.createElement("details");
  details.className = "agent-report__details";
  const summary = document.createElement("summary");
  summary.textContent = "Ver relatório do script";
  const dl = document.createElement("dl");
  for (const [rotulo, valor] of info.campos) {
    const dt = document.createElement("dt");
    dt.textContent = rotulo;
    const dd = document.createElement("dd");
    dd.textContent = valor;
    dl.append(dt, dd);
  }
  details.append(summary, dl);

  if (info.tecnico) {
    const tecnicoTitulo = document.createElement("span");
    tecnicoTitulo.className = "agent-report__label";
    tecnicoTitulo.textContent = "Erro técnico";
    const pre = document.createElement("pre");
    pre.textContent = info.tecnico;
    details.append(tecnicoTitulo, pre);
  }

  const original = document.createElement("details");
  original.className = "agent-report__raw";
  const originalSummary = document.createElement("summary");
  originalSummary.textContent = "Mensagem original completa";
  const originalPre = document.createElement("pre");
  originalPre.textContent = info.original;
  original.append(originalSummary, originalPre);
  details.append(original);
  box.appendChild(details);
  return box;
}
