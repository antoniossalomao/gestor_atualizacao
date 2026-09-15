/*
 * Baixar e escolher arquivos, do jeito que o navegador exige.
 *
 * As duas operações são a mesma coisa vista dos dois lados -- um arquivo saindo
 * e um arquivo entrando --, e nenhuma delas tem API direta: baixar é fabricar
 * uma âncora invisível e clicar nela por código; escolher é fabricar um
 * `<input type="file">` invisível e fazer o mesmo. São gambiarras conhecidas,
 * mas são AS gambiarras, e escondê-las atrás de duas funções com nome é melhor
 * do que repeti-las em cada tela que precisar salvar alguma coisa.
 *
 * O `downloadBlob` da aba Atualizações (exportação .xlsx) morava lá dentro
 * como função solta; virou `baixarBlob` aqui quando as Configurações passaram
 * a exportar preferências e precisaram exatamente do mesmo.
 */

/**
 * Entrega um arquivo pronto ao usuário.
 *
 * @param {Blob} blob
 * @param {string} nome nome sugerido, com extensão
 */
export function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  // A liberação espera um instante de propósito. Revogar na linha seguinte ao
  // clique funciona na maioria dos casos e falha justamente nos piores: no
  // Safari e em downloads grandes, o navegador ainda não terminou de ler o
  // blob, e o arquivo chega vazio ou não chega.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** O mesmo, para um texto que ainda não é Blob (JSON, CSV). */
export function baixarTexto(texto, nome, tipo = "application/json") {
  baixarBlob(new Blob([texto], { type: `${tipo};charset=utf-8` }), nome);
}

/**
 * Abre o seletor de arquivos do sistema e devolve o que foi escolhido.
 *
 * @param {{accept?: string}} [opcoes]
 * @returns {Promise<File|null>} `null` se a pessoa cancelou
 */
export function escolherArquivo({ accept = "" } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept;

    // `cancel` é o evento que avisa que o diálogo foi fechado sem escolher
    // nada. Sem ele, cancelar deixaria uma Promise pendurada para sempre --
    // e, com ela, o `await` de quem chamou. Navegadores antigos não o
    // disparam; nesse caso a Promise fica pendente e o input é recolhido pelo
    // coletor de lixo junto com ela, sem vazar nada visível.
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.addEventListener("change", () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });
}
