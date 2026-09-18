import { icon } from "../utils/icons.js";
import { el } from "../utils/html.js";

/**
 * Estado vazio com ícone, título, explicação e (quando faz sentido) um botão
 * que resolve o vazio.
 *
 * Antes, "nenhum resultado" era uma linha de texto cinza no meio de um card
 * grande. O problema não é estético: um vazio sem saída deixa a pessoa sem
 * saber se ela filtrou demais, se o cadastro está faltando, ou se o sistema
 * quebrou. Um estado vazio bom responde "o que aconteceu" e "o que fazer
 * agora" -- por isso o botão de ação é parte do componente, não um extra.
 *
 * @param {{titulo: string, descricao?: string, icone?: string, acao?: {label: string, onClick: () => void}}} opts
 * @returns {HTMLElement}
 */
export function emptyState({ titulo, descricao, icone = "vazio", acao }) {
  // "busca" é o ícone que toda tela já usa para "seu filtro não achou nada"
  // (ver AtualizacoesView, ClientesView, HistoricoView, AgendamentosView,
  // SistemasView) -- um vazio temporário e resolvível (limpar o filtro),
  // diferente de "não existe nada cadastrado ainda". O círculo do ícone ganha
  // o tom de destaque só nesse caso, para a diferença aparecer antes mesmo de
  // ler o texto.
  const classe = icone === "busca" ? "empty-state empty-state--busca" : "empty-state";
  const box = el("div", { class: classe });
  box.appendChild(el("div", { class: "empty-state__icon", html: icon(icone) }));
  box.appendChild(el("p", { class: "empty-state__title", text: titulo }));
  if (descricao) box.appendChild(el("p", { class: "empty-state__desc", text: descricao }));
  if (acao) {
    box.appendChild(
      el("button", { type: "button", class: "btn btn--accent empty-state__action", text: acao.label, onclick: acao.onClick })
    );
  }
  return box;
}
