import { Modal } from "./Modal.js";

/**
 * Gaveta lateral reutilizável. O conteúdo continua sendo propriedade da view:
 * ele só é movido para uma camada flutuante, então listeners e referências de
 * formulário não se perdem ao abrir e fechar.
 */
export class Drawer {
  /**
   * @param {HTMLElement} conteudo
   * @param {{titulo: string, descricao?: string, aoFechar?: () => void}} opcoes
   */
  constructor(conteudo, { titulo, descricao = "", aoFechar = () => {} }) {
    this.conteudo = conteudo;
    this.aoFechar = aoFechar;
    this.aberta = false;
    this._estadoLimpo = this._serializar();
    const tituloId = `drawer-title-${Math.random().toString(36).slice(2, 8)}`;
    this.marcador = document.createComment("conteudo-da-gaveta");
    conteudo.before(this.marcador);
    conteudo.hidden = true;

    this.overlay = document.createElement("div");
    this.overlay.className = "drawer-backdrop";
    this.overlay.setAttribute("aria-hidden", "true");
    this.overlay.innerHTML = `
      <section class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="${tituloId}">
        <header class="drawer-header">
          <div><h2 id="${tituloId}">${titulo}</h2>${descricao ? `<p>${descricao}</p>` : ""}</div>
          <button type="button" class="btn btn--icon btn--ghost" data-action="drawer-fechar" aria-label="Fechar">×</button>
        </header>
        <div class="drawer-body" data-role="drawer-body"></div>
      </section>`;
    this.corpo = this.overlay.querySelector('[data-role="drawer-body"]');
    document.body.appendChild(this.overlay);

    this._aoClique = (e) => {
      if (e.target === this.overlay || e.target.closest('[data-action="drawer-fechar"], [data-action="cancel"]')) this.fechar();
    };
    this._aoTecla = (e) => {
      if (e.key === "Escape" && this.aberta) {
        e.preventDefault();
        this.fechar();
      }
    };
    this.overlay.addEventListener("click", this._aoClique);
    document.addEventListener("keydown", this._aoTecla);
  }

  setTitulo(titulo, descricao = "") {
    const h2 = this.overlay.querySelector("header h2");
    if (h2) h2.textContent = titulo;
    const p = this.overlay.querySelector("header p");
    if (p) p.textContent = descricao;
  }

  abrir({ foco } = {}) {
    if (this.aberta) return;
    this.aberta = true;
    this._estadoLimpo = this._serializar();
    this.corpo.appendChild(this.conteudo);
    this.conteudo.hidden = false;
    this.overlay.classList.add("is-open");
    this.overlay.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("has-drawer");
    setTimeout(() => (foco || this.conteudo.querySelector("input, select, textarea, button"))?.focus(), 180);
  }

  async fechar({ forcar = false } = {}) {
    if (!this.aberta) return true;
    if (!forcar && this.suja) {
      const ok = await Modal.confirm("Descartar alterações?", "Há dados não salvos no formulário.", {
        confirmLabel: "Descartar",
        danger: true,
      });
      if (!ok) return false;
    }
    this.aberta = false;
    this.overlay.classList.remove("is-open");
    this.overlay.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("has-drawer");
    this.conteudo.hidden = true;
    this.marcador.after(this.conteudo);
    this.aoFechar();
    return true;
  }

  marcarLimpa() {
    this._estadoLimpo = this._serializar();
  }

  get suja() {
    return this._serializar() !== this._estadoLimpo;
  }

  _serializar() {
    return JSON.stringify(
      [...this.conteudo.querySelectorAll("input, select, textarea")].map((el) => [el.name || el.id, el.type === "checkbox" ? el.checked : el.value])
    );
  }

  destroy() {
    document.removeEventListener("keydown", this._aoTecla);
    this.overlay.removeEventListener("click", this._aoClique);
    this.conteudo.hidden = false;
    this.marcador.after(this.conteudo);
    this.marcador.remove();
    this.overlay.remove();
    document.documentElement.classList.remove("has-drawer");
  }
}
