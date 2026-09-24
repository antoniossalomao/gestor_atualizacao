import { tempoRelativo, formatarDataHora } from "../utils/date.js";
import { versaoRegistrada } from "./relatorio.js";

/**
 * Matriz de versões da ficha do cliente (aba Consultar Cliente): uma linha por
 * sistema, com o que está instalado, o que está publicado e em que estado o
 * cliente se encontra. Saiu de ConsultaView.js -- é regra (de onde vem a
 * versão instalada, quando um cliente conta como atrasado), não desenho, e
 * dentro da view não havia como testá-la.
 */

/**
 * Um log de atualização pode registrar vários sistemas de uma vez, separados
 * por vírgula (ex.: "B_Vendas, B_NFe, B_Importa" quando o lote atualiza os
 * três juntos). Sem separar esses nomes, a matriz de versões tratava a
 * string inteira como se fosse um "sistema" só, e cada sistema individual
 * (ex.: "B_Vendas" sozinho) nunca batia com o registro combinado -- mesmo
 * instalado, aparecia como "Não instalado". Mesmo critério de split usado no
 * backend (ver splitSystems em AtualizacaoRepository.js).
 * @param {string|null|undefined} texto
 * @returns {string[]}
 */
export function splitSistemas(texto) {
  return String(texto || "")
    .split(/,|\s+e\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Situação do agente (ver derivarSituacao no VersaoService) -> rótulo e cor do selo. */
const ESTADO_POR_SITUACAO = {
  ok: { estadoLabel: "Atualizado", estadoBadge: "badge--success" },
  desatualizado: { estadoLabel: "Atrasado", estadoBadge: "badge--warning" },
  erro: { estadoLabel: "Erro", estadoBadge: "badge--danger" },
  offline: { estadoLabel: "Sem contato", estadoBadge: "badge--muted" },
  pendencias: { estadoLabel: "Pendências", estadoBadge: "badge--warning" },
  pausado: { estadoLabel: "Pausado", estadoBadge: "badge--muted" },
};

/**
 * @typedef {{
 *   sistema: string,
 *   instalada: string|null,
 *   publicada: string|null,
 *   estadoLabel: string,
 *   estadoBadge: string,
 *   contatoTexto: string,
 *   contatoTitle: string,
 * }} LinhaMatriz
 */

/**
 * @param {{nome?: string, cnpj?: string, sistemas?: string[]}} cliente
 * @param {Array<{sistema?: string, versao?: string, data?: string}>|null|undefined} historico
 *   do mais recente para o mais antigo (como vem de /atualizacoes/recent-by-client)
 * @param {{agentes?: any[], ativas?: Array<{sistema: string, versao: string}>}|null|undefined} painelVersoes
 * @returns {LinhaMatriz[]} em ordem alfabética de sistema; vazio se o cliente não tem sistema nenhum
 */
export function montarMatrizVersoes(cliente, historico, painelVersoes) {
  const registros = historico || [];
  const sistemas = new Set(cliente.sistemas || []);

  const nomeNorm = (cliente.nome || "").trim().toLowerCase();
  const cnpjNorm = String(cliente.cnpj || "").replace(/\D/g, "");

  // O agente se identifica pelo CNPJ (ou pelo nome da empresa, nos agentes
  // antigos). Sem CNPJ cadastrado no cliente, "" casaria com todo agente que
  // também não tem dígitos -- por isso o `cnpjNorm &&`.
  const agentes = (painelVersoes?.agentes || []).filter((a) => {
    if (cnpjNorm && a.cnpj && a.cnpj.replace(/\D/g, "") === cnpjNorm) return true;
    if (a.empresa && a.empresa.trim().toLowerCase() === nomeNorm) return true;
    return false;
  });

  agentes.forEach((a) => splitSistemas(a.ultimoSistema).forEach((s) => sistemas.add(s)));
  registros.forEach((h) => splitSistemas(h.sistema).forEach((s) => sistemas.add(s)));

  const ativas = painelVersoes?.ativas || [];
  /** @param {string} a @param {string} b */
  const mesmo = (a, b) => a.toLowerCase() === b.toLowerCase();

  return Array.from(sistemas)
    .sort((a, b) => a.localeCompare(b))
    .map((sistema) => {
      const versaoAtiva = ativas.find((v) => mesmo(v.sistema, sistema))?.versao || null;
      const agente = agentes.find((a) => splitSistemas(a.ultimoSistema).some((s) => mesmo(s, sistema)));
      // O histórico vem do mais recente para o mais antigo, então o primeiro
      // registro que menciona este sistema é o mais atual para ele.
      const histReg = registros.find((h) => splitSistemas(h.sistema).some((s) => mesmo(s, sistema)));

      // O que o agente reportou ganha do que alguém digitou à mão: é o que
      // está de fato rodando na máquina. `histReg.versao` é o resumo de TODOS
      // os sistemas daquele atendimento (ex.: "B_Vendas: 1; B_NFe: 2") -- pega
      // a versão deste sistema específico, não a string inteira.
      const instalada = agente?.ultimaVersao || versaoRegistrada(histReg, sistema) || null;

      return {
        sistema,
        instalada,
        publicada: versaoAtiva,
        ...estado(agente, instalada, versaoAtiva),
        ...contato(agente, histReg),
      };
    });
}

/**
 * Com agente, o estado vem dele (ele sabe o que aconteceu na máquina). Sem
 * agente, a única pista é comparar a última versão registrada à mão com a
 * publicada.
 */
function estado(agente, instalada, versaoAtiva) {
  if (agente) {
    const situacao = String(agente.situacao || "");
    if (ESTADO_POR_SITUACAO[situacao]) return ESTADO_POR_SITUACAO[situacao];
    if (situacao.startsWith("aguardando_autorizacao")) return { estadoLabel: "Aguardando", estadoBadge: "badge--warning" };
    return { estadoLabel: situacao || "Desconhecido", estadoBadge: "badge--muted" };
  }
  if (!versaoAtiva) return { estadoLabel: "Sem publicação", estadoBadge: "badge--muted" };
  if (!instalada) return { estadoLabel: "Não instalado", estadoBadge: "badge--muted" };
  return instalada === versaoAtiva
    ? { estadoLabel: "Atualizado", estadoBadge: "badge--success" }
    : { estadoLabel: "Atrasado", estadoBadge: "badge--warning" };
}

function contato(agente, histReg) {
  if (agente?.ultimaComunicacao) {
    const texto = tempoRelativo(agente.ultimaComunicacao);
    return {
      contatoTexto: agente.maquina ? `${texto} (${agente.maquina})` : texto,
      contatoTitle: formatarDataHora(agente.ultimaComunicacao),
    };
  }
  if (histReg?.data) return { contatoTexto: histReg.data, contatoTitle: "Última atualização registrada" };
  return { contatoTexto: "—", contatoTitle: "" };
}
