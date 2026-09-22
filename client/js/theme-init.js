/*
 * Roda no <head>, antes do primeiro pixel. Aplica só o que, chegando tarde,
 * faria a tela PISCAR: o tema (fundo preto virando branco), a cor de destaque
 * (todo botão trocando de cor), a escala do texto (a página inteira mudando
 * de tamanho e reposicionando tudo) e o contraste alto, que redefine bordas e
 * cor de texto por cima do tema.
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

  // Contraste alto e superfícies sólidas entram aqui pelo mesmo critério do
  // tema: as duas redefinem COR (bordas, texto de apoio, o desfoque da barra
  // lateral), e cor aplicada tarde é exatamente o que se vê piscar.
  if (lido("contraste", "normal") === "alto") raiz.setAttribute("data-contraste", "alto");
  if (lido("transparencia", "normal") === "reduzida") raiz.setAttribute("data-transparencia", "reduzida");

  // Captura qualquer erro global ou rejeição assíncrona para que o usuário
  // nunca fique diante de uma tela preta vazia sem diagnóstico.
  function exibirErroFatal(titulo, erro) {
    var app = document.getElementById("app");
    if (app && (!app.childNodes.length || app.innerHTML.trim() === "")) {
      var msg = erro && (erro.message || erro.reason || String(erro)) || "Erro desconhecido";
      var stack = erro && erro.stack ? erro.stack : "";
      app.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;">' +
        '<div style="background:#181c24;color:#f87171;padding:32px;max-width:680px;width:100%;border:1px solid #ef4444;border-top:3px solid #ef4444;border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,0.4);font-family:sans-serif;">' +
        '<h2 style="margin:0 0 12px 0;color:#f0f3f8;font-size:20px;">' + titulo + '</h2>' +
        '<p style="color:#cbd5e1;font-size:14px;line-height:1.5;margin:0 0 16px 0;">' + msg + '</p>' +
        (stack ? '<pre style="background:#0e1117;padding:14px;border-radius:6px;overflow:auto;max-height:240px;color:#94a3b8;font-size:12px;margin:0 0 20px 0;border:1px solid #262c38;">' + stack + '</pre>' : '') +
        '<div style="display:flex;gap:12px;">' +
        '<button id="err-btn-reload" style="padding:9px 18px;background:#3b82f6;color:#ffffff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:14px;">Recarregar página</button>' +
        '<button id="err-btn-reset" style="padding:9px 18px;background:transparent;color:#94a3b8;border:1px solid #384152;border-radius:6px;cursor:pointer;font-size:14px;">Limpar preferências e recarregar</button>' +
        '</div>' +
        '</div></div>';
      var btnReload = document.getElementById("err-btn-reload");
      if (btnReload) btnReload.addEventListener("click", function () { location.reload(); });
      var btnReset = document.getElementById("err-btn-reset");
      if (btnReset) btnReset.addEventListener("click", function () { localStorage.clear(); location.reload(); });
    }
  }

  window.addEventListener("error", function (e) {
    exibirErroFatal("Falha ao inicializar o sistema", e.error || e);
  });

  window.addEventListener("unhandledrejection", function (e) {
    exibirErroFatal("Erro inesperado na aplicação", e.reason || e);
  });
})();
