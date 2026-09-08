try {
  var modo = JSON.parse(localStorage.getItem("gestor:tema") || '"sistema"');
  if (modo === "claro" || modo === "escuro") document.documentElement.setAttribute("data-tema", modo);
} catch (e) { /* localStorage bloqueado: segue no tema padrão */ }
