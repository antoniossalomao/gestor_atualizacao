/*
 * Utilidades de texto/DOM compartilhadas.
 *
 * Antes, `escapeHtml` estava copiado em sete arquivos diferentes (App,
 * AtualizacoesView, ClientesView, SistemasView, UsersPanel, BarChart,
 * DistribuicaoView...). Sete cópias da mesma função é sete lugares para
 * esquecer de corrigir quando uma delas estiver errada -- agora existe uma só.
 */

/**
 * Converte texto em HTML seguro para interpolar dentro de um `innerHTML`.
 * Usa o próprio navegador (textContent -> innerHTML) em vez de uma tabela de
 * substituição na mão: é o mesmo mecanismo que o browser usa para renderizar,
 * então não tem como divergir dele.
 */
export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

/** Escapa texto que vai dentro de um atributo entre aspas duplas. */
export function escapeAttr(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Cria um elemento com classe, texto e atributos numa chamada só -- versão
 * enxuta do `document.createElement` + três linhas de configuração que
 * aparecia repetida em todas as views.
 *
 * @param {string} tag
 * @param {{class?: string, text?: string, html?: string, [attr: string]: any}} props
 * @param {Array<Node|string>} children
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) node.append(child);
  return node;
}

/** Plural simples em português: `plural(1, "cliente")` -> "1 cliente". */
export function plural(n, singular, pluralForm = `${singular}s`) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
