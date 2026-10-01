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
