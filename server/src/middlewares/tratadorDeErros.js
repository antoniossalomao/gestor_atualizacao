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

module.exports = { tratadorDeErros };
