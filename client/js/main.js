import { ApiPainel } from "./api/ApiPainel.js";
import { App } from "./app/App.js";
import { iniciarTema } from "./app/tema.js";
import { iniciarAparencia } from "./app/aparencia.js";
import { html } from "./utils/html.js";

// Ponto de entrada do front-end: aplica o tema salvo, cria o cliente de API e
// a aplicação, e manda ela decidir o que mostrar (login ou o app principal).
//
// O tema vem PRIMEIRO, antes de qualquer coisa ser desenhada: aplicar depois
// faria a tela piscar no tema errado por um quadro ("flash of wrong theme").
iniciarTema();
// Densidade das tabelas, pelo mesmo motivo e no mesmo momento: é um atributo
// no <html> que o CSS lê, e aplicá-lo depois faria as linhas nascerem numa
// altura e pularem para outra.
iniciarAparencia();

const api = new ApiPainel();
const app = new App(document.getElementById("app"), api);
app.start().catch((err) => {
  console.error("Falha fatal ao iniciar aplicação:", err);
  const root = document.getElementById("app");
  if (root && (!root.childNodes.length || root.innerHTML.trim() === "")) {
    // Com a tag html, e não template cru: a mensagem e a pilha do erro
    // carregam texto de fora (um URIError do hash da URL, a resposta da API)
    // e, sem escapar, um "<img onerror>" ali viraria código na página.
    root.innerHTML = html`
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#111315;">
        <div style="background:#191c20;color:#fca5a5;padding:32px;max-width:680px;width:100%;border:1px solid #6a2428;border-left:3px solid #fca5a5;border-radius:12px;font-family:sans-serif;">
          <h2 style="margin:0 0 12px 0;color:#eceef0;font-size:20px;">Falha ao inicializar o Gestor</h2>
          <p style="color:#a8afb8;font-size:14px;line-height:1.5;margin:0 0 16px 0;">${err?.message || String(err)}</p>
          ${err?.stack ? html`<pre style="background:#111315;padding:14px;border-radius:8px;overflow:auto;max-height:240px;color:#939ba5;font-size:12px;margin:0 0 20px 0;border:1px solid #282c32;">${err.stack}</pre>` : ""}
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <button id="main-err-reload" style="padding:9px 18px;background:#eceef0;color:#111315;border:none;border-radius:8px;font-weight:500;cursor:pointer;font-size:14px;">Recarregar página</button>
            <button id="main-err-reset" style="padding:9px 18px;background:transparent;color:#a8afb8;border:1px solid #30353b;border-radius:8px;cursor:pointer;font-size:14px;">Limpar preferências e recarregar</button>
          </div>
        </div>
      </div>
    `;
    root.querySelector("#main-err-reload")?.addEventListener("click", () => location.reload());
    root.querySelector("#main-err-reset")?.addEventListener("click", () => {
      localStorage.clear();
      location.reload();
    });
  }
});
