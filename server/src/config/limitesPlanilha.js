/**
 * Quantas linhas uma planilha pode ter na importação e na exportação de
 * atualizações (P05 de docs/MELHORIAS.md).
 *
 * São limites de CAPACIDADE do servidor, não regras da equipe -- por isso
 * moram aqui, ao lado do limite de 15 MB do upload (routes/index.js), e não
 * em regrasEquipe.js / tela Administração. Subir um deles pela tela, sem
 * medir, é o jeito de uma planilha grande derrubar o painel de todo mundo:
 * a importação e a exportação montam o arquivo na memória do processo.
 *
 * Números de 29/09/2026 (server/ferramentas/medir-planilhas.js, i5-2410M com
 * 8 GB -- a máquina que roda o Docker de produção), depois das otimizações
 * da P05:
 *
 *   importar 5.000 linhas:  2,2 s, pico de 86 MB
 *   importar 20.000 linhas: 9,4 s, pico de 245 MB
 *   exportar 10.000 linhas: ~2 s, pico de ~180 MB
 *   exportar 20.000 linhas: 4,3 s, pico de 343 MB
 *
 * O volume real, na mesma data: 945 atualizações no histórico inteiro, em
 * torno de 1.000 por ano (pico de 162 num mês), 368 clientes. Os limites
 * ficam com folga de anos sobre isso e com tempo e memória que a máquina
 * aguenta sem atrapalhar quem está usando o painel ao mesmo tempo.
 *
 * Antes de subir: rode a medição de novo. Se o histórico passar do limite de
 * exportação, o caminho é trocar para a escrita em fluxo do ExcelJS
 * (stream.xlsx.WorkbookWriter), não só aumentar o número.
 */

/** Linhas de dados (fora o cabeçalho) por arquivo importado. */
const LIMITE_LINHAS_IMPORTACAO = 5000;

/** Linhas numa exportação .xlsx; acima disso, a pessoa filtra por período. */
const LIMITE_LINHAS_EXPORTACAO = 10000;

module.exports = { LIMITE_LINHAS_IMPORTACAO, LIMITE_LINHAS_EXPORTACAO };
