import { Modal } from "./Modal.js";
import { html, copyToClipboard } from "../utils/html.js";
import { toast } from "./Toast.js";

/** Prévia, cópia e impressão usam exatamente o mesmo conteúdo. */
export function abrirRelatorio({ tipos, gerar, periodo = false }) {
  const { overlay, box, close } = Modal.abrirCaixa({ largura: 900 });
  overlay.classList.add("relatorio-overlay");
  box.classList.add("relatorio-modal");
  const id = `relatorio-${Date.now()}`;
  box.setAttribute("aria-labelledby", id);
  box.innerHTML = html`
    <div class="relatorio-controles">
      <h3 id="${id}">Relatórios de atualizações</h3>
      <div class="toolbar">
        <label class="field">Tipo de relatório<select class="input" data-role="tipo">${tipos.map((t) => html`<option value="${t.valor}">${t.nome}</option>`)}</select></label>
        ${periodo && html`<label class="field" data-role="periodo">Histórico desde<input type="date" class="input" data-role="desde" /></label><label class="field" data-role="periodo">Histórico até<input type="date" class="input" data-role="ate" /></label>`}
      </div>
      <p class="field__hint" data-role="erro" role="status"></p>
    </div>
    <article class="relatorio-previa" data-role="previa"></article>
    <div class="modal-box__actions relatorio-controles">
      <button class="btn" data-action="fechar">Fechar</button>
      <button class="btn" data-action="imprimir">Imprimir / Salvar PDF</button>
      <button class="btn btn--accent" data-action="copiar">Copiar texto</button>
    </div>`;
  let texto = "";
  const tipo = box.querySelector('[data-role="tipo"]');
  const previa = box.querySelector('[data-role="previa"]');
  const atualizar = () => {
    const desde = box.querySelector('[data-role="desde"]')?.value || "";
    const ate = box.querySelector('[data-role="ate"]')?.value || "";
    const invalido = tipo.value === "cliente" && desde && ate && desde > ate;
    box.querySelector('[data-role="erro"]').textContent = invalido ? "A data inicial deve ser anterior à final." : "";
    for (const el of box.querySelectorAll('[data-role="periodo"]')) el.hidden = tipo.value !== "cliente";
    for (const el of box.querySelectorAll('[data-action="copiar"], [data-action="imprimir"]')) el.disabled = Boolean(invalido);
    if (invalido) { previa.replaceChildren(); return; }
    texto = gerar(tipo.value, { desde, ate });
    const blocos = texto.split(/\n\n/);
    previa.innerHTML = html`${blocos.map((bloco, i) => {
      const [titulo, ...linhas] = bloco.split("\n");
      return i === 0 ? html`<header><h2>${titulo}</h2>${linhas.map((l) => html`<p>${l}</p>`)}</header>` : html`<section><h4>${titulo}</h4>${linhas.map((l) => html`<p>${l}</p>`)}</section>`;
    })}`;
  };
  box.querySelectorAll("select, input").forEach((el) => el.addEventListener("change", atualizar));
  box.querySelector('[data-action="fechar"]').addEventListener("click", () => close());
  box.querySelector('[data-action="copiar"]').addEventListener("click", async () => {
    if (await copyToClipboard(texto)) toast.success("Relatório copiado.");
    else {
      const area = document.createElement("textarea");
      area.className = "input";
      area.value = texto;
      area.readOnly = true;
      previa.replaceChildren(area);
      area.focus(); area.select();
      toast.info("Use Ctrl+C para copiar o texto selecionado.");
    }
  });
  box.querySelector('[data-action="imprimir"]').addEventListener("click", () => {
    atualizar();
    overlay.classList.add("relatorio-imprimir");
    document.body.classList.add("imprimindo-relatorio");
    try { window.print(); } finally {
      document.body.classList.remove("imprimindo-relatorio");
      overlay.classList.remove("relatorio-imprimir");
    }
  });
  atualizar();
  tipo.focus();
}
