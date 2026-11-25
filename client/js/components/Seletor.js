import { conectarPopover } from "./popover.js";

const CHEVRON_SVG =
  '<svg class="seletor__seta" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8l4 4 4-4"/></svg>';

const CHECK_SVG =
  '<svg class="seletor__check" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>';

const descValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
const descSelectedIndex = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");

let contador = 0;

/**
 * Converte um `<select>` nativo em um seletor estilizado com `[popover]`,
 * mantendo o `<select>` original sincronizado no DOM para formularios,
 * leitores de valores e eventos `change`.
 *
 * @param {HTMLSelectElement} select
 */
export function melhorarSeletor(select) {
  if (!(select instanceof HTMLSelectElement)) return;
  if (select.dataset.seletorPronto === "1" || select.multiple || !select.parentElement) return;
  if (select.closest(".seletor")) return;

  select.dataset.seletorPronto = "1";
  const popId = `seletor-pop-${++contador}`;

  const wrapper = document.createElement("div");
  wrapper.className = "seletor";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "input seletor__trigger";
  // Copia classes especificas do <select> (ex.: admin-papel, campanha-escolha__filtro)
  for (const cls of select.classList) {
    if (cls !== "input" && cls !== "seletor__nativo") {
      trigger.classList.add(cls);
      wrapper.classList.add(`seletor--${cls}`);
    }
  }
  if (select.style.maxWidth) wrapper.style.maxWidth = select.style.maxWidth;
  if (select.style.width) wrapper.style.width = select.style.width;

  trigger.setAttribute("popovertarget", popId);
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const ariaLabel = select.getAttribute("aria-label");
  if (ariaLabel) trigger.setAttribute("aria-label", ariaLabel);
  const ariaLabelledBy = select.getAttribute("aria-labelledby");
  if (ariaLabelledBy) trigger.setAttribute("aria-labelledby", ariaLabelledBy);

  const textoEl = document.createElement("span");
  textoEl.className = "seletor__texto";
  trigger.appendChild(textoEl);
  trigger.insertAdjacentHTML("beforeend", CHEVRON_SVG);

  const lista = document.createElement("div");
  lista.className = "seletor__lista";
  lista.id = popId;
  lista.setAttribute("popover", "auto");
  lista.setAttribute("role", "listbox");

  select.before(wrapper);
  wrapper.appendChild(select);
  wrapper.appendChild(trigger);
  wrapper.appendChild(lista);

  select.classList.add("seletor__nativo");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const { fechar } = conectarPopover(trigger, lista);

  const sincronizarTexto = () => {
    const opt = select.selectedOptions?.[0] || select.options?.[select.selectedIndex];
    textoEl.textContent = opt ? opt.textContent : "";
    wrapper.hidden = select.hidden;
    trigger.disabled = select.disabled;
    for (const btn of lista.querySelectorAll(".seletor__opcao")) {
      const ativo = btn.dataset.value === select.value;
      btn.classList.toggle("is-selected", ativo);
      btn.setAttribute("aria-selected", String(ativo));
    }
  };

  const reconstruirOpcoes = () => {
    const frag = document.createDocumentFragment();
    for (const opt of select.options) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "seletor__opcao";
      item.setAttribute("role", "option");
      item.dataset.value = opt.value;
      item.disabled = opt.disabled;

      const label = document.createElement("span");
      label.className = "seletor__opcao-texto";
      label.textContent = opt.textContent || "";
      item.appendChild(label);
      item.insertAdjacentHTML("beforeend", CHECK_SVG);

      if (opt.selected) {
        item.classList.add("is-selected");
        item.setAttribute("aria-selected", "true");
      } else {
        item.setAttribute("aria-selected", "false");
      }
      frag.appendChild(item);
    }
    lista.replaceChildren(frag);
    sincronizarTexto();
  };

  lista.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement|null} */ (e.target instanceof Element ? e.target.closest(".seletor__opcao") : null);
    if (!btn || btn.hasAttribute("disabled")) return;
    const novoValor = btn.dataset.value ?? "";
    const mudou = select.value !== novoValor;
    descValue?.set?.call(select, novoValor);
    sincronizarTexto();
    fechar();
    trigger.focus();
    if (mudou) {
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  lista.addEventListener("toggle", (e) => {
    const aberto = /** @type {ToggleEvent} */ (e).newState === "open";
    if (!aberto) return;
    const rect = trigger.getBoundingClientRect();
    lista.style.minWidth = `${Math.max(rect.width, 160)}px`;
    const ativo = lista.querySelector(".seletor__opcao.is-selected");
    if (ativo instanceof HTMLElement) {
      ativo.scrollIntoView({ block: "nearest" });
    }
  });

  lista.addEventListener("keydown", (e) => {
    const itens = [...lista.querySelectorAll(".seletor__opcao:not([disabled])")];
    if (!itens.length) return;
    const atual = itens.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (e.key === "ArrowDown") {
      e.preventDefault();
      itens[(atual + 1) % itens.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      itens[(atual - 1 + itens.length) % itens.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      itens[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      itens[itens.length - 1]?.focus();
    }
  });

  trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      lista.showPopover?.();
      const alvo = lista.querySelector(".seletor__opcao.is-selected:not([disabled])") || lista.querySelector(".seletor__opcao:not([disabled])");
      if (alvo instanceof HTMLElement) alvo.focus();
    }
  });

  // Se clicarem no <label for="...">, o navegador foca o <select>: repassa pro botao.
  select.addEventListener("focus", () => trigger.focus());
  select.addEventListener("change", sincronizarTexto);

  if (descValue) {
    Object.defineProperty(select, "value", {
      configurable: true,
      get() {
        return descValue.get.call(this);
      },
      set(v) {
        descValue.set.call(this, v);
        sincronizarTexto();
      },
    });
  }

  if (descSelectedIndex) {
    Object.defineProperty(select, "selectedIndex", {
      configurable: true,
      get() {
        return descSelectedIndex.get.call(this);
      },
      set(v) {
        descSelectedIndex.set.call(this, v);
        sincronizarTexto();
      },
    });
  }

  const obs = new MutationObserver((mutacoes) => {
    const mudouFilhos = mutacoes.some((m) => m.type === "childList");
    if (mudouFilhos) reconstruirOpcoes();
    else sincronizarTexto();
  });
  obs.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "hidden"] });

  reconstruirOpcoes();
}

/**
 * Ativa o aprimoramento automatico para todos os `<select>` atuais e futuros.
 */
export function iniciarSeletores() {
  for (const s of document.querySelectorAll("select")) {
    melhorarSeletor(s);
  }
  const obs = new MutationObserver((mutacoes) => {
    for (const m of mutacoes) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node instanceof HTMLSelectElement) {
          melhorarSeletor(node);
        } else if (node.querySelectorAll) {
          for (const s of node.querySelectorAll("select")) {
            melhorarSeletor(s);
          }
        }
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}
