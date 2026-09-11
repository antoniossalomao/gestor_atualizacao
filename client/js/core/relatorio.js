import { plural } from "./html.js";

/**
 * Monta o texto dos relatórios do botão "Gerar Relatório" (aba Atualizações).
 *
 * Três decisões valem para os dois formatos:
 *
 *  - **Só o que já está gravado.** Nenhum campo novo no cadastro, nenhuma
 *    coluna nova no banco -- e por isso os 900+ registros antigos, importados
 *    de planilha, geram relatório exatamente como os de hoje.
 *  - **Campo vazio não vira linha.** Quase metade do histórico não tem
 *    responsável preenchido; um relatório com "Por: —" em toda linha é pior
 *    que um relatório mais curto. A linha simplesmente some.
 *  - **Texto puro, sem alinhar em colunas.** O destino é um chamado ou uma
 *    conversa, onde a fonte não é monoespaçada -- rótulos alinhados com
 *    espaços chegariam tortos do outro lado.
 */

/**
 * Relatório de UMA atualização.
 *
 * @param {object} registro linha da grid (id, cliente, sistema, versao, ...)
 * @param {{cliente?: object|null, anterior?: object|null}} [contexto]
 *   `cliente` vem de /clientes/by-nome (código e cidade) e pode ser nulo --
 *   dá pra registrar atualização de cliente que não está cadastrado, e nesse
 *   caso o relatório sai só com o nome. `anterior` é a atualização
 *   imediatamente anterior do mesmo cliente: é dela que sai a "versão
 *   anterior", sem precisar de campo novo nenhum.
 */
export function relatorioDeAtualizacao(registro, { cliente = null, anterior = null } = {}) {
  const linhas = [];
  const titulo = `ATUALIZAÇÃO #${registro.id}`;
  linhas.push(registro.data ? `${titulo} — ${registro.data}` : titulo);
  linhas.push("");

  const cidade = cliente?.cidade ? ` — ${cliente.cidade}` : "";
  linhas.push(`Cliente: ${nomeComCodigo(registro.cliente, cliente)}${cidade}`);
  campo(linhas, "Sistemas", registro.sistema);
  campo(linhas, "Versão", versaoComAnterior(registro.versao, anterior));
  campo(linhas, "Máquinas", registro.maquinas);
  campo(linhas, "Motivo", registro.motivo);
  campo(linhas, "Por", registro.responsavel);
  campo(linhas, "Obs", registro.obs);

  return linhas.join("\n");
}

/**
 * Relatório do histórico COMPLETO de um cliente -- todas as atualizações, da
 * mais recente para a mais antiga.
 *
 * @param {string} nome nome do cliente como está gravado nas atualizações
 * @param {object[]} historico de /atualizacoes/recent-by-client, já em ordem
 * @param {object|null} [cliente] de /clientes/by-nome; nulo se não cadastrado
 */
export function relatorioDoCliente(nome, historico, cliente = null) {
  const registros = Array.isArray(historico) ? historico : [];
  const linhas = [`HISTÓRICO DE ATUALIZAÇÕES — ${nomeComCodigo(nome, cliente)}`];

  const resumo = [];
  if (cliente?.cidade) resumo.push(cliente.cidade);
  resumo.push(plural(registros.length, "atualização", "atualizações"));
  const ultima = registros.find((r) => r.data);
  if (ultima) {
    const tempo = haQuantoTempo(ultima.data);
    resumo.push(`última em ${ultima.data}${tempo ? ` (${tempo})` : ""}`);
  }
  linhas.push(resumo.join(" · "));
  campo(linhas, "Sistemas do cliente", cliente?.sistemas);

  if (registros.length === 0) {
    linhas.push("", "Nenhuma atualização registrada para este cliente.");
    return linhas.join("\n");
  }

  for (const registro of registros) {
    linhas.push("");
    const versao = texto(registro.versao) ? ` (v${texto(registro.versao)})` : "";
    linhas.push(`${texto(registro.data) || "Sem data"} — ${texto(registro.sistema) || "Sistema não informado"}${versao}`);

    // Responsável, motivo e máquinas numa linha só, separados por "·": são
    // três dados curtos, e uma linha para cada faria um histórico de vinte
    // atualizações ocupar oitenta linhas.
    const detalhes = [];
    if (texto(registro.responsavel)) detalhes.push(`Por: ${texto(registro.responsavel)}`);
    if (texto(registro.motivo)) detalhes.push(`Motivo: ${texto(registro.motivo)}`);
    const maquinas = Number(registro.maquinas);
    if (Number.isFinite(maquinas) && maquinas > 0) detalhes.push(plural(maquinas, "máquina"));
    else if (texto(registro.maquinas)) detalhes.push(`Máquinas: ${texto(registro.maquinas)}`);
    if (detalhes.length > 0) linhas.push(detalhes.join(" · "));

    campo(linhas, "Obs", registro.obs);
  }

  return linhas.join("\n");
}

/** Acrescenta `Rótulo: valor` -- e não acrescenta nada se o valor for vazio. */
function campo(linhas, rotulo, valor) {
  const limpo = texto(valor);
  if (limpo) linhas.push(`${rotulo}: ${limpo}`);
}

function texto(valor) {
  return String(valor ?? "").trim();
}

/** "CASA DE CARNES SÃO FRANCISCO (C014200)" -- sem o código se não houver. */
function nomeComCodigo(nome, cliente) {
  const codigo = texto(cliente?.codigo);
  return codigo ? `${texto(nome)} (${codigo})` : texto(nome);
}

/**
 * "09/09/2026 (anterior: 17/08/2026)".
 *
 * A parte entre parênteses some quando não há atualização anterior, ou quando
 * a anterior estava na mesma versão -- aí a informação não é "de onde veio",
 * é ruído.
 */
function versaoComAnterior(versao, anterior) {
  const atual = texto(versao);
  if (!atual) return "";
  const antiga = texto(anterior?.versao);
  return antiga && antiga !== atual ? `${atual} (anterior: ${antiga})` : atual;
}

/**
 * "há 2 dias" a partir de uma data dd/mm/aaaa. Devolve "" para data ausente,
 * malformada (o histórico importado tem dessas) ou no futuro.
 */
function haQuantoTempo(dataBR) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto(dataBR));
  if (!m) return "";
  const [, dia, mes, ano] = m;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  if (d.getDate() !== Number(dia) || d.getMonth() !== Number(mes) - 1) return "";

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((hoje.getTime() - d.getTime()) / 86400000);
  if (dias < 0) return "";
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;

  const meses = Math.floor(dias / 30);
  if (meses < 12) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  return `há ${anos} ${anos === 1 ? "ano" : "anos"}`;
}
