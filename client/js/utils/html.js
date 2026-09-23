/*
 * Utilidades de texto/DOM compartilhadas.
 *
 * Antes, `escapeHtml` estava copiado em sete arquivos diferentes (App,
 * AtualizacoesView, ClientesView, SistemasView, UsersPanel, BarChart,
 * DistribuicaoView...). Sete cópias da mesma função é sete lugares para
 * esquecer de corrigir quando uma delas estiver errada -- agora existe uma só.
 */

const ENTIDADES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * Converte texto em HTML seguro para interpolar dentro de um `innerHTML` --
 * tanto no conteúdo de um elemento quanto dentro de um atributo entre aspas.
 *
 * Era implementada com o próprio navegador (textContent -> innerHTML), sob o
 * argumento de "não divergir do browser". Mas esse caminho só escapa `&`, `<`
 * e `>`, e NÃO escapa aspas: serve para conteúdo, e quebra dentro de
 * atributo. O cartão do kanban fazia exatamente isso
 * (`aria-label="Tarefa ${escapeHtml(row.tarefa)}"`), e uma tarefa com `"` no
 * título fechava o atributo antes da hora. A CSP (sem 'unsafe-inline')
 * barrava um `onmouseover` injetado, mas o HTML saía corrompido do mesmo
 * jeito. A tabela na mão cobre os dois contextos, e de quebra tira o DOM de
 * utils/ -- agora dá para testar no Node.
 */
export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

/**
 * HTML que já passou pela tag `html` (ou foi declarado confiável com
 * `confiavel`). É o que distingue "texto que alguém digitou" de "marcação que
 * o código montou": a tag escapa o primeiro e insere o segundo como está.
 *
 * `toString` devolve a marcação, então `elemento.innerHTML = html\`...\``
 * funciona direto, sem conversão.
 */
export class HtmlSeguro {
  /** @param {string} marcacao */
  constructor(marcacao) {
    this.marcacao = marcacao;
  }

  toString() {
    return this.marcacao;
  }
}

/**
 * Template tag que escapa TODO valor interpolado, a menos que ele já seja
 * `HtmlSeguro`:
 *
 *     el.innerHTML = html`<p title="${row.cliente}">${row.tarefa}</p>`;
 *
 * Por que existe: com `escapeHtml` na mão, a segurança dependia de lembrar de
 * chamar a função em CADA interpolação de CADA template, e um esquecimento não
 * quebra nada visível até o dia em que um cliente se chama `<b>`. Com a tag, o
 * padrão é seguro e o perigoso é o que precisa ser escrito: `confiavel(...)`.
 *
 * Regras de cada valor interpolado:
 *  - `null`, `undefined` e `false` viram nada -- permite `${cond && html\`...\`}`;
 *  - `HtmlSeguro` (outra tag `html`, ou `confiavel`) entra como está;
 *  - array: cada item segue estas mesmas regras, e os itens são concatenados
 *    sem separador -- permite `${lista.map((x) => html\`<li>${x}</li>\`)}`;
 *  - qualquer outra coisa (inclusive número e `true`) vira texto escapado.
 *
 * Escapar aspas é o que torna a mesma regra segura dentro de atributo entre
 * aspas. Continua NÃO sendo seguro fora de aspas (`<div class=${x}>`), dentro
 * de `<script>`/`<style>`, em `on*="..."` ou em `href`/`src` (onde
 * `javascript:` passaria) -- nesses lugares, não interpole dado de usuário.
 *
 * @param {TemplateStringsArray} partes
 * @param {...unknown} valores
 * @returns {HtmlSeguro}
 */
export function html(partes, ...valores) {
  let saida = partes[0];
  for (let i = 0; i < valores.length; i += 1) {
    saida += interpolar(valores[i]) + partes[i + 1];
  }
  return new HtmlSeguro(saida);
}

/** @param {unknown} valor @returns {string} */
function interpolar(valor) {
  if (valor == null || valor === false) return "";
  if (valor instanceof HtmlSeguro) return valor.marcacao;
  if (Array.isArray(valor)) return valor.map(interpolar).join("");
  return escapeHtml(valor);
}

/**
 * Marca uma string como HTML confiável, para a tag `html` não escapá-la.
 * Só para marcação que o PRÓPRIO código produziu (o `<svg>` de `icon()`, por
 * exemplo) -- nunca para algo que veio da API ou de um campo de formulário.
 * O nome é para chamar atenção numa revisão: cada `confiavel(` é um lugar
 * onde a garantia da tag foi suspensa de propósito.
 *
 * @param {string} marcacao
 * @returns {HtmlSeguro}
 */
export function confiavel(marcacao) {
  return new HtmlSeguro(String(marcacao ?? ""));
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

/**
 * Copia texto para a área de transferência. Tenta a API moderna primeiro
 * (`navigator.clipboard`), que só funciona em "contexto seguro" (HTTPS ou
 * localhost) -- este app é rotineiramente acessado por HTTP puro dentro da
 * rede local (ver `SESSION_SECURE=false` no README), onde `navigator.clipboard`
 * nem existe. Cai para o jeito antigo (`execCommand("copy")` numa textarea
 * temporária, fora da tela) nesse caso -- descontinuado, mas ainda funciona
 * em todo navegador relevante e não depende de contexto seguro.
 * @returns {Promise<boolean>} true se copiou
 */
export async function copyToClipboard(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // segue para o fallback abaixo
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = texto;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}
