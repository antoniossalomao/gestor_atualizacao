/*
 * Roda no <head>, antes do primeiro pixel. Aplica só o que, chegando tarde,
 * faria a tela PISCAR: o tema (fundo preto virando branco), a cor de destaque
 * (todo botão trocando de cor) e a escala do texto (a página inteira mudando
 * de tamanho e reposicionando tudo).
 *
 * Densidade, altura de tabela e posição dos avisos não entram aqui: nenhuma
 * delas afeta algo que já esteja desenhado quando o módulo principal assume
 * (`iniciarAparencia`, alguns milissegundos depois) -- não há tabela nem toast
 * na tela ainda.
 *
 * É um arquivo, e não um <script> inline, para a CSP do Server.js poder
 * recusar script-src inline: um inline exigiria "unsafe-inline", que anula
 * boa parte da proteção contra XSS.
 */
(function () {
  var raiz = document.documentElement;

  function lido(chave, padrao) {
    try {
      var bruto = localStorage.getItem("gestor:" + chave);
      return bruto == null ? padrao : JSON.parse(bruto);
    } catch (e) {
      return padrao; // localStorage bloqueado: segue nos padrões
    }
  }

  var tema = lido("tema", "sistema");
  if (tema === "claro" || tema === "escuro") raiz.setAttribute("data-tema", tema);

  // Os padrões ("azul", "padrao") não viram atributo: o :root do CSS já os
  // traz, e escrevê-los só acrescentaria seletor para casar o mesmo resultado.
  var realce = lido("realce", "azul");
  if (realce && realce !== "azul") raiz.setAttribute("data-realce", realce);

  var escala = lido("escalaTexto", "padrao");
  if (escala && escala !== "padrao") raiz.setAttribute("data-escala", escala);

  if (lido("fundoTela", "grade") === "liso") raiz.setAttribute("data-fundo", "liso");
})();
