const zlib = require("node:zlib");

/**
 * Conta as linhas (<row>) de todas as abas de um .xlsx SEM montar a planilha
 * -- só abrindo o zip e procurando a marcação nas abas descompactadas.
 *
 * Existe para a importação recusar um arquivo grande ANTES do
 * `workbook.xlsx.load` do ExcelJS, que monta tudo na memória: medido em
 * 29/09/2026 (P05, server/ferramentas/medir-planilhas.js), 50 mil linhas
 * custavam 1,75 GB. O leitor em fluxo do próprio ExcelJS, que resolveria
 * isso, falha de forma intermitente na versão 4.4.0 ("Cannot read properties
 * of undefined (reading 'sheets')" quando a aba vem antes do workbook.xml no
 * zip) e ainda grava abas em arquivo temporário -- descartado.
 *
 * Contagem APROXIMADA de propósito: uma linha só com formatação também tem
 * <row>. Quem chama usa como teto de memória, com folga; o limite exato, de
 * linhas preenchidas, é conferido depois de ler (ver AtualizacaoService).
 *
 * O `maxOutputLength` na descompressão é a proteção contra "zip-bomba": um
 * arquivo pequeno que se expande em gigabytes. Passou do teto, conta como
 * grande demais.
 *
 * @param {Buffer} buffer
 * @param {{tetoBytesPorAba?: number}} [opcoes]
 * @returns {number|null} linhas somadas de todas as abas; `Infinity` se uma
 *   aba passar do teto de bytes; `null` se não der para ler o zip (aí quem
 *   decide é o ExcelJS, que dá a mensagem de "arquivo inválido").
 */
function contarLinhasXlsx(buffer, { tetoBytesPorAba = 64 * 1024 * 1024 } = {}) {
  const entradas = lerDiretorioZip(buffer);
  if (!entradas) return null;
  let total = 0;
  for (const e of entradas) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(e.nome)) continue;
    const dados = extrair(buffer, e, tetoBytesPorAba);
    if (dados === null) return null;
    if (dados === Infinity) return Infinity;
    total += contarOcorrencias(dados, "<row");
  }
  return total;
}

/** Lê o diretório central do zip. `null` se não for um zip que se entenda. */
function lerDiretorioZip(buffer) {
  // Fim do diretório central (EOCD): assinatura 0x06054b50 nos últimos
  // 22 + 65535 bytes (o comentário do zip pode ter até 64 KB).
  const inicioBusca = Math.max(0, buffer.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= inicioBusca; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const quantidade = buffer.readUInt16LE(eocd + 10);
  let pos = buffer.readUInt32LE(eocd + 16);
  const entradas = [];
  for (let n = 0; n < quantidade; n++) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== 0x02014b50) return null;
    const metodo = buffer.readUInt16LE(pos + 10);
    const tamanhoCompactado = buffer.readUInt32LE(pos + 20);
    const tamNome = buffer.readUInt16LE(pos + 28);
    const tamExtra = buffer.readUInt16LE(pos + 30);
    const tamComentario = buffer.readUInt16LE(pos + 32);
    const cabecalhoLocal = buffer.readUInt32LE(pos + 42);
    const nome = buffer.toString("utf8", pos + 46, pos + 46 + tamNome);
    entradas.push({ nome, metodo, tamanhoCompactado, cabecalhoLocal });
    pos += 46 + tamNome + tamExtra + tamComentario;
  }
  return entradas;
}

/** Conteúdo descompactado de uma entrada; Infinity acima do teto; null se ilegível. */
function extrair(buffer, entrada, teto) {
  const p = entrada.cabecalhoLocal;
  if (p + 30 > buffer.length || buffer.readUInt32LE(p) !== 0x04034b50) return null;
  const inicio = p + 30 + buffer.readUInt16LE(p + 26) + buffer.readUInt16LE(p + 28);
  const compactado = buffer.subarray(inicio, inicio + entrada.tamanhoCompactado);
  if (entrada.metodo === 0) return compactado.length > teto ? Infinity : compactado;
  if (entrada.metodo !== 8) return null;
  try {
    return zlib.inflateRawSync(compactado, { maxOutputLength: teto });
  } catch (erro) {
    if (erro instanceof RangeError || erro?.code === "ERR_BUFFER_TOO_LARGE") return Infinity;
    return null;
  }
}

/** Quantas vezes `agulha` aparece no Buffer, sem convertê-lo em texto. */
function contarOcorrencias(dados, agulha) {
  let n = 0;
  for (let i = dados.indexOf(agulha); i >= 0; i = dados.indexOf(agulha, i + agulha.length)) {
    // "<row" pode ser o começo de "<rows..." em outro elemento; na aba de
    // uma planilha só existe <row> e <row .../>, mas conferir custa pouco.
    const depois = dados[i + agulha.length];
    if (depois === 0x20 || depois === 0x3e || depois === 0x2f) n++; // espaço, ">" ou "/"
  }
  return n;
}

module.exports = { contarLinhasXlsx };
