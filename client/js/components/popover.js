let polyfillCarregado = false;

/**
 * Conecta um botão disparador a um `[popover]` com sincronização de
 * `aria-expanded` e fallback de posicionamento para navegadores sem
 * CSS Anchor Positioning (`position-area`).
 *
 * @param {HTMLElement} trigger
 * @param {HTMLElement} popoverEl
 * @returns {{ abrir: () => void, fechar: () => void }}
 */
export function conectarPopover(trigger, popoverEl) {
  if (!Object.hasOwn(HTMLElement.prototype, "popover") && !polyfillCarregado) {
    polyfillCarregado = true;
    import("https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js").catch(() => {});
  }

  popoverEl.addEventListener("toggle", (e) => {
    const aberto = /** @type {ToggleEvent} */ (e).newState === "open";
    trigger.setAttribute("aria-expanded", String(aberto));
    if (!aberto || CSS.supports("position-area", "block-end")) return;

    const t = trigger.getBoundingClientRect();
    const p = popoverEl.getBoundingClientRect();
    const cabeAbaixo = t.bottom + 6 + p.height <= window.innerHeight;
    popoverEl.style.top = `${cabeAbaixo ? t.bottom + 6 : Math.max(8, t.top - 6 - p.height)}px`;
    popoverEl.style.left = `${Math.max(8, Math.min(t.right - p.width, window.innerWidth - p.width - 8))}px`;
  });

  const abrir = () => popoverEl.showPopover?.();
  const fechar = () => {
    if (popoverEl.matches(":popover-open, .\\:popover-open")) {
      popoverEl.hidePopover?.();
    }
  };

  return { abrir, fechar };
}
