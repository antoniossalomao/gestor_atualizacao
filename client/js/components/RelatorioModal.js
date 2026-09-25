import { Modal } from "./Modal.js";
import { html, copyToClipboard } from "../utils/html.js";
import { toast } from "./Toast.js";

/**
 * Janela de relatórios com abas curtas, prévia rolável e rodapé estável (I09).
 * Prévia, cópia e impressão usam exatamente o mesmo conteúdo.
 */
export function abrirRelatorio({ tipos, gerar, periodo = false }) {
  const { overlay, box, close } = Modal.abrirCaixa({ largura: 900 });
  overlay.classList.add("relatorio-overlay");
  box.classList.add("relatorio-modal");
  const id = `relatorio-${Date.now()}`;
  box.setAttribute("aria-labelledby", id);

  let tipoAtivo = tipos[0]?.valor || "atualizacao";

  // Rótulos curtos recomendados no planejamento (I09)
  const rotulosAba = {
    atualizacao: "Atendimento",
    cliente: "Cliente",
    periodo: "Período",
  };

  const temAbas = tipos.length > 1;

  box.innerHTML = html`
    <div class="modal-box__head relatorio-controles" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--sp-3);">
      <h3 class="modal-box__title" id="${id}" style="margin:0;">Relatório de Atualizações</h3>
      <button type="button" class="btn btn--icon btn--ghost" data-action="fechar-x" aria-label="Fechar relatório">✕</button>
    </div>

    <div class="relatorio-controles">
      ${temAbas && html`
        <nav class="client-hub-tabs relatorio-abas" role="tablist" aria-label="Tipo de relatório" style="margin-bottom:var(--sp-3);">
          ${tipos.map((t, idx) => html`
            <button type="button" class="btn ${idx === 0 ? "is-active" : ""}" role="tab" data-tipo="${t.valor}" aria-selected="${String(idx === 0)}">
              ${rotulosAba[t.valor] || t.nome}
            </button>
          `)}
        </nav>
      `}

      ${periodo && html`
        <details class="relatorio-periodo-details" data-role="periodo-wrap" style="margin-bottom:var(--sp-3); border:1px solid var(--cor-borda); border-radius:var(--raio-md); padding:var(--sp-2) var(--sp-3);">
          <summary class="text-muted" style="cursor:pointer; font-size:var(--txt-sm); font-weight:var(--peso-medio);">Filtrar histórico por data</summary>
          <div class="toolbar" style="margin-top:var(--sp-2); display:flex; gap:var(--sp-3); align-items:flex-end;">
            <label class="field" style="min-width:140px;">Desde<input type="date" class="input" data-role="desde" /></label>
            <label class="field" style="min-width:140px;">Até<input type="date" class="input" data-role="ate" /></label>
          </div>
        </details>
      `}
      <p class="field__hint text-danger" data-role="erro" role="status" style="margin:0 0 var(--sp-2); color:var(--cor-perigo); font-size:var(--txt-xs);"></p>
    </div>

    <article class="relatorio-previa" data-role="previa" style="max-height:55vh; overflow-y:auto;"></article>

    <div class="modal-box__actions relatorio-controles">
      <button type="button" class="btn" data-action="fechar">Fechar</button>
      <button type="button" class="btn" data-action="imprimir">Imprimir / Salvar PDF</button>
      <button type="button" class="btn btn--accent" data-action="copiar">Copiar texto</button>
    </div>
  `;

  let texto = "";
  const previa = box.querySelector('[data-role="previa"]');
  const periodoWrap = box.querySelector('[data-role="periodo-wrap"]');
  const erroEl = box.querySelector('[data-role="erro"]');

  const atualizar = () => {
    const desde = box.querySelector('[data-role="desde"]')?.value || "";
    const ate = box.querySelector('[data-role="ate"]')?.value || "";
    const invalido = tipoAtivo === "cliente" && desde && ate && desde > ate;
    if (erroEl) erroEl.textContent = invalido ? "A data inicial deve ser anterior à final." : "";

    if (periodoWrap) {
      periodoWrap.hidden = tipoAtivo !== "cliente";
    }

    for (const el of box.querySelectorAll('[data-action="copiar"], [data-action="imprimir"]')) {
      el.disabled = Boolean(invalido);
    }
    if (invalido) {
      previa.replaceChildren();
      return;
    }

    texto = gerar(tipoAtivo, { desde, ate });
    const blocos = texto.split(/\n\n/);
    previa.innerHTML = html`${blocos.map((bloco, i) => {
      const [titulo, ...linhas] = bloco.split("\n");
      return i === 0
        ? html`<header><h2>${titulo}</h2>${linhas.map((l) => html`<p>${l}</p>`)}</header>`
        : html`<section><h4>${titulo}</h4>${linhas.map((l) => html`<p>${l}</p>`)}</section>`;
    })}`;
  };

  // Alternar abas
  if (temAbas) {
    const abasNav = box.querySelector(".relatorio-abas");
    abasNav?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tipo]");
      if (!btn) return;
      tipoAtivo = btn.dataset.tipo;
      for (const b of abasNav.querySelectorAll("[data-tipo]")) {
        const ativo = b === btn;
        b.classList.toggle("is-active", ativo);
        b.setAttribute("aria-selected", String(ativo));
      }
      atualizar();
    });
  }

  box.querySelectorAll("input[type=date]").forEach((el) => el.addEventListener("change", atualizar));
  box.querySelector('[data-action="fechar"]').addEventListener("click", () => close());
  box.querySelector('[data-action="fechar-x"]')?.addEventListener("click", () => close());

  box.querySelector('[data-action="copiar"]').addEventListener("click", async () => {
    if (await copyToClipboard(texto)) {
      toast.success("Relatório copiado.");
    } else {
      const area = document.createElement("textarea");
      area.className = "input";
      area.value = texto;
      area.readOnly = true;
      previa.replaceChildren(area);
      area.focus();
      area.select();
      toast.info("Use Ctrl+C para copiar o texto selecionado.");
    }
  });

  box.querySelector('[data-action="imprimir"]').addEventListener("click", () => {
    atualizar();
    overlay.classList.add("relatorio-imprimir");
    document.body.classList.add("imprimindo-relatorio");
    try {
      window.print();
    } finally {
      document.body.classList.remove("imprimindo-relatorio");
      overlay.classList.remove("relatorio-imprimir");
    }
  });

  atualizar();
}
