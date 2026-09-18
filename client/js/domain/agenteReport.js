import { formatarDataHora, formatarDuracao } from "../utils/date.js";
import { faseLabel } from "./agenteLabels.js";

const RE_SCRIPT = /^Falha ao aplicar script de atualização '([^']+)' \((\d+)\/(\d+) do pacote; (\d+) scripts? já estavam aplicados antes deste lote\)\.\s*Verificação prévia:\s*([\s\S]*?)\s*Erro retornado pelo isql:\s*([\s\S]*)$/i;

/** Transforma a mensagem livre do agente em dados que a interface consegue organizar. */
export function analisarRetorno(log) {
  const detalhes = String(log?.detalhes || "").trim();
  const script = RE_SCRIPT.exec(detalhes);
  if (script) {
    const [, caminho, posicao, total, aplicados, verificacao, tecnicoBruto] = script;
    const tecnico = limparErroIsql(tecnicoBruto);
    return {
      tipo: "script",
      titulo: arquivoDe(caminho),
      resumo: diagnosticoIsql(tecnico),
      campos: [
        ["Script", caminho],
        ["Posição no pacote", `${posicao} de ${total}`],
        ["Já aplicados antes", aplicados],
        ["Verificação prévia", limparVerificacao(verificacao)],
      ],
      tecnico,
      original: detalhes,
    };
  }

  const scriptsPulados = /Atualização concluída com (\d+) script\(s\) pulado\(s\) por erro/i.exec(detalhes);
  if (scriptsPulados) {
    const quantidade = Number(scriptsPulados[1]);
    return {
      tipo: "aviso",
      titulo: "Atualização concluída com pendências",
      resumo: quantidade === 1
        ? "1 script falhou e ficou pendente para uma nova tentativa."
        : `${quantidade} scripts falharam e ficaram pendentes para uma nova tentativa.`,
      campos: [],
      tecnico: "",
      original: detalhes,
    };
  }

  const semScript = /Atualização concluída sem script/i.test(detalhes);
  return {
    tipo: semScript ? "sucesso" : "mensagem",
    titulo: semScript ? "Atualização concluída" : "Retorno do agente",
    resumo: detalhes || "Sem detalhes informados.",
    campos: [],
    tecnico: "",
    original: detalhes,
  };
}

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

/** Texto pronto para chamado, e-mail ou conversa de suporte. */
export function relatorioRetornosTexto(logs, { titulo = "RELATÓRIO DE RETORNOS DOS AGENTES" } = {}) {
  const linhas = [titulo, `${logs.length} retorno(s)`, ""];
  logs.forEach((log, index) => {
    const info = analisarRetorno(log);
    linhas.push(`${index + 1}. ${String(log.status || "SEM STATUS").toUpperCase()} — ${formatarDataHora(log.criadoEm)}`);
    const contexto = [
      log.empresa || log.cnpj,
      log.sistema,
      log.versaoAnterior && log.versao ? `${log.versaoAnterior} -> ${log.versao}` : log.versao,
      faseLabel(log.fase),
      formatarDuracao(log.duracaoMs) !== "—" ? formatarDuracao(log.duracaoMs) : null,
    ].filter(Boolean);
    if (contexto.length) linhas.push(contexto.join(" · "));
    linhas.push(info.titulo, info.resumo);
    for (const [rotulo, valor] of info.campos) linhas.push(`${rotulo}: ${valor}`);
    if (info.tecnico) linhas.push("Erro técnico:", info.tecnico);
    linhas.push("");
  });
  return linhas.join("\n").trim();
}

function arquivoDe(caminho) {
  return String(caminho).split(/[\\/]/).pop() || caminho;
}

function limparVerificacao(texto) {
  return String(texto)
    .replace(/^verifiquei antes:\s*/i, "")
    .replace(/\s*--\s*não é caso de 'já aplicado', é uma falha genuína ao tentar criar\.?$/i, "")
    .replace(/^não consegui/i, "Não foi possível")
    .trim();
}

function limparErroIsql(texto) {
  const semProcesso = String(texto)
    .replace(/^Processo\s+.*?isql\.exe\s+falhou\.\s*ExitCode:\s*\d+\.\s*Erro:\s*/is, "")
    .replace(/\s*Saída:\s*$/i, "");
  const vistas = new Set();
  const linhas = [];
  for (let linha of semProcesso.split(/\r?\n/)) {
    linha = linha.trim().replace(/^-/, "").trim();
    if (!linha || /^can't format message/i.test(linha) || /^Dynamic SQL Error$/i.test(linha)) continue;
    if (vistas.has(linha)) continue;
    vistas.add(linha);
    linhas.push(linha);
  }
  return linhas.join("\n");
}

function diagnosticoIsql(tecnico) {
  let match = /Table unknown\s*\n?([A-Z0-9_$]+)/i.exec(tecnico);
  if (match) return `Tabela não encontrada: ${match[1]}.`;
  match = /Trigger\s+([A-Z0-9_$]+)\s+not found/i.exec(tecnico);
  if (match) return `Trigger não encontrada: ${match[1]}.`;
  match = /Input parameter mismatch for procedure\s+([A-Z0-9_$]+)/i.exec(tecnico);
  if (match) return `A chamada da procedure ${match[1]} não corresponde aos parâmetros atuais.`;
  match = /New scale specified for column\s+([A-Z0-9_$]+)\s+must be at most\s+(\d+)/i.exec(tecnico);
  if (match) return `A escala solicitada para ${match[1]} excede o máximo ${match[2]} aceito pela estrutura atual.`;
  match = /Unexpected end of command\s*-?\s*(line\s+\d+,\s*column\s+\d+)/i.exec(tecnico);
  if (match) return `O comando SQL terminou antes do esperado (${match[1]}).`;
  match = /Token unknown\s*-?\s*(line\s+\d+,\s*column\s+\d+)\s*\n?([A-Z0-9_$]+)/i.exec(tecnico);
  if (match) return `Token SQL não reconhecido: ${match[2]} (${match[1]}).`;
  return tecnico.split("\n").find((linha) => !/^SQL error code/i.test(linha)) || "O Firebird não forneceu uma mensagem de erro legível.";
}
