/**
 * Middleware de "nao encontrado", montado depois de todas as rotas e do
 * fallback de SPA, e antes do errorHandler.
 *
 * Sem ele, quem responde e' o 404 padrao do Express: uma pagina HTML com
 * "Cannot GET /caminho". Isso e' ruim de dois jeitos. Para /api/..., um
 * cliente que espera JSON recebe HTML e quebra no `await r.json()` com um
 * erro de parse que nao diz nada sobre a causa real (rota errada). Para um
 * asset (/js/..., /css/...), o navegador recebe `text/html` onde esperava
 * um modulo e reclama com "expected a JavaScript module script but the
 * server responded with a MIME type of text/html" -- mensagem que manda
 * procurar o problema no lugar errado.
 *
 * O formato da resposta da API e' o mesmo de errorHandler.js (`{ error }`),
 * para o front-end ter um unico formato de erro para tratar.
 */
function notFoundHandler(req, res) {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Rota de API não encontrada." });
  }
  // Nao e' API: so chega aqui um pedido de ARQUIVO que nao existe (o
  // fallback de SPA ja capturou tudo que nao tem extensao). Texto puro, sem
  // ecoar o caminho pedido de volta -- nao ha nada de util a dizer alem do
  // proprio 404, e o caminho ja esta na aba Network de quem esta depurando.
  res.status(404).type("txt").send("Arquivo não encontrado.");
}

module.exports = { notFoundHandler };
