/**
 * Middleware final do Express: qualquer erro passado para `next(err)` em
 * algum controller cai aqui. Erros "esperados" (ErroDeValidacao,
 * ErroNaoEncontrado -- ver shared/erros.js) ja sabem seu proprio
 * `statusCode` e tem uma mensagem segura de mostrar pro usuario; qualquer
 * outro erro (bug, falha do banco) vira um 500 generico, sem vazar detalhes
 * internos para quem esta usando o navegador.
 */
const { LIMITE_UPLOAD_MB } = require("../config/constantes");

function tratadorDeErros(err, req, res, _next) {
  // Recusas do multer (upload): não têm statusCode, e caíam no 500 genérico
  // -- quem mandava uma planilha grande demais lia "Erro interno do
  // servidor." (P05). Viram 413/400 com o motivo.
  if (err?.name === "MulterError") {
    const grande = err.code === "LIMIT_FILE_SIZE";
    const mb = LIMITE_UPLOAD_MB[err.field];
    res.status(grande ? 413 : 400).json({
      error: grande
        ? `O arquivo passa do tamanho máximo aceito${mb ? ` (${mb} MB)` : ""}.`
        : "Envio de arquivo inválido. Escolha o arquivo de novo e tente outra vez.",
    });
    return;
  }
  const statusCode = err.statusCode || 500;
  if (statusCode === 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(statusCode).json({
    error: statusCode === 500 ? "Erro interno do servidor." : err.message,
    ...(statusCode === 409 && err.atual ? { atual: err.atual } : {}),
  });
}

/**
 * Intercepta explicitamente `unhandledRejection` e `uncaughtException` do
 * Node, para que uma promessa órfã não degrade nem derrube o processo em
 * silêncio e para que um erro síncrono fatal encerre de forma organizada
 * (fecha HTTP e SQLite antes de sair).
 *
 *  - unhandledRejection: só registra no log e segue -- o servidor continua
 *    atendendo. Sem este handler, o Node 15+ encerraria o processo.
 *  - uncaughtException: o estado do processo é incerto; registra, encerra com
 *    ordem (`aoEncerrar`) e sai com código 1 (o Docker reinicia o container).
 *    Há um teto de 5 s para não ficar pendurado se o encerramento travar.
 *
 * @param {{aoEncerrar?: () => Promise<void>|void, log?: Pick<Console, "error">, sair?: (codigo: number) => void, alvo?: NodeJS.Process}} [opcoes]
 */
function registrarErrosDeProcesso({ aoEncerrar, log = console, sair = (c) => process.exit(c), alvo = process } = {}) {
  let encerrando = false;
  alvo.on("unhandledRejection", (motivo) => {
    log.error("[unhandledRejection] Promessa rejeitada sem tratamento:", motivo);
  });
  alvo.on("uncaughtException", (erro) => {
    log.error("[uncaughtException] Exceção não capturada:", erro);
    if (encerrando) return;
    encerrando = true;
    const teto = setTimeout(() => sair(1), 5000);
    teto.unref?.();
    Promise.resolve()
      .then(() => aoEncerrar?.())
      .catch(() => {})
      .finally(() => sair(1));
  });
}

module.exports = { tratadorDeErros, registrarErrosDeProcesso };
