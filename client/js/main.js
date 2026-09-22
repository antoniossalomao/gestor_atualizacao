import { ApiClient } from "./api/ApiClient.js";
import { App } from "./app/App.js";
import { iniciarTema } from "./app/theme.js";
import { iniciarAparencia } from "./app/appearance.js";

// Ponto de entrada do front-end: aplica o tema salvo, cria o cliente de API e
// a aplicação, e manda ela decidir o que mostrar (login ou o app principal).
// Equivalente do antigo "App(DB_PATH).mainloop()" em Atualizacao.py -- só que
// aqui não existe "mainloop": o navegador já fica reagindo a eventos sozinho.
//
// O tema vem PRIMEIRO, antes de qualquer coisa ser desenhada: aplicar depois
// faria a tela piscar no tema errado por um quadro ("flash of wrong theme").
iniciarTema();
// Densidade das tabelas, pelo mesmo motivo e no mesmo momento: é um atributo
// no <html> que o CSS lê, e aplicá-lo depois faria as linhas nascerem numa
// altura e pularem para outra.
iniciarAparencia();

const api = new ApiClient();
const app = new App(document.getElementById("app"), api);
app.start().catch((err) => {
  console.error("Falha fatal ao iniciar aplicação:", err);
  const root = document.getElementById("app");
  if (root && (!root.childNodes.length || root.innerHTML.trim() === "")) {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;">
        <div style="background:#181c24;color:#f87171;padding:32px;max-width:680px;width:100%;border:1px solid #ef4444;border-top:3px solid #ef4444;border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,0.4);font-family:sans-serif;">
          <h2 style="margin:0 0 12px 0;color:#f0f3f8;font-size:20px;">Falha ao inicializar o Gestor</h2>
          <p style="color:#cbd5e1;font-size:14px;line-height:1.5;margin:0 0 16px 0;">${err?.message || String(err)}</p>
          ${err?.stack ? `<pre style="background:#0e1117;padding:14px;border-radius:6px;overflow:auto;max-height:240px;color:#94a3b8;font-size:12px;margin:0 0 20px 0;border:1px solid #262c38;">${err.stack}</pre>` : ""}
          <div style="display:flex;gap:12px;">
            <button id="main-err-reload" style="padding:9px 18px;background:#3b82f6;color:#ffffff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:14px;">Recarregar página</button>
            <button id="main-err-reset" style="padding:9px 18px;background:transparent;color:#94a3b8;border:1px solid #384152;border-radius:6px;cursor:pointer;font-size:14px;">Limpar preferências e recarregar</button>
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
