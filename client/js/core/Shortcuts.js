import { Modal } from "./Modal.js";

/**
 * Lista de atalhos de teclado, aberta com `?`.
 *
 * O app já tinha atalhos (`Delete` exclui o selecionado, `Enter` salva,
 * `Escape` limpa) desde a primeira versão -- mas em lugar nenhum eles eram
 * mencionados. Um atalho que ninguém descobre é código morto: ou aparece numa
 * lista, ou não existe na prática.
 */
/** Definição plana: [teclas, descrição, grupo] */
const TABELA = [
  ["Ctrl + K", "Abrir a paleta de comandos: telas, clientes e ações", "Global"],
  ["Ctrl + ,", "Abrir as Configurações", "Global"],
  ["Ctrl + B", "Recolher ou abrir o menu lateral", "Global"],
  ["?", "Mostrar esta lista de atalhos", "Global"],
  ["Alt + 1 … 9", "Ir direto para a aba de mesmo número", "Global"],
  ["Esc", "Fechar a janela ou a lista de sugestões aberta", "Global"],
  ["Enter", "Salvar o formulário (adicionar, ou atualizar o selecionado)", "Formulários"],
  ["Esc", "Cancelar a edição e limpar o formulário", "Formulários"],
  ["↑ ↓", "Percorrer as sugestões do campo Cliente", "Formulários"],
  ["↑ ↓", "Percorrer as linhas da tabela", "Tabelas"],
  ["Enter", "Selecionar a linha em foco", "Tabelas"],
  ["Delete", "Excluir o registro selecionado", "Tabelas"],
  ["Shift + clique", "Selecionar um intervalo de linhas, para excluir em lote (Atualizações)", "Tabelas"],
  ["Shift + ↑ ↓", "O mesmo intervalo, sem tirar a mão do teclado", "Tabelas"],
];

export function mostrarAtalhos() {
  const { box, close } = Modal.abrirCaixa({ largura: 560 });

  const grupos = [...new Set(TABELA.map(([, , grupo]) => grupo))];
  box.innerHTML = `
    <h3 class="modal-box__title" id="atalhos-titulo">Atalhos de teclado</h3>
    <p class="modal-box__message">Tudo que dá para fazer sem tirar a mão do teclado.</p>
    <div class="shortcuts">
      ${grupos
        .map(
          (grupo) => `
        <div class="shortcuts__group">
          <h4>${grupo}</h4>
          ${TABELA.filter(([, , g]) => g === grupo)
            .map(
              ([teclas, descricao]) => `
            <div class="shortcuts__row">
              <span class="shortcuts__keys">${teclas
                .split(" + ")
                .map((t) => `<kbd>${t}</kbd>`)
                .join("<span>+</span>")}</span>
              <span class="shortcuts__desc">${descricao}</span>
            </div>`
            )
            .join("")}
        </div>`
        )
        .join("")}
    </div>
    <div class="modal-box__actions"><button type="button" class="btn btn--accent" data-action="fechar">Entendi</button></div>
  `;
  box.setAttribute("aria-labelledby", "atalhos-titulo");
  const fechar = box.querySelector('[data-action="fechar"]');
  fechar.addEventListener("click", () => close());
  fechar.focus();
}

/**
 * Liga o `?` global. Ignora quando a pessoa está digitando num campo -- senão
 * escrever "por quê?" numa observação abriria a ajuda.
 */
export function ligarAtalhoAjuda() {
  const handler = (e) => {
    if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
    const alvo = e.target;
    if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) return;
    if (document.querySelector(".modal-overlay, .cmdk-overlay")) return;
    e.preventDefault();
    mostrarAtalhos();
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}
