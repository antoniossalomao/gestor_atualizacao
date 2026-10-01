/*
 * Utilidades de texto/DOM compartilhadas.
 *
 * Antes, `escaparHtml` estava copiado em sete arquivos diferentes (App,
 * AtualizacoesView, ClientesView, SistemasView, UsersPanel, GraficoDeBarras,
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
 * (`aria-label="Tarefa ${escaparHtml(row.tarefa)}"`), e uma tarefa com `"` no
 * título fechava o atributo antes da hora. A CSP (sem 'unsafe-inline')
 * barrava um `onmouseover` injetado, mas o HTML saía corrompido do mesmo
 * jeito. A tabela na mão cobre os dois contextos, e de quebra tira o DOM de
 * utils/ -- agora dá para testar no Node.
 */
export function escaparHtml(text) {
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
 * Por que existe: com `escaparHtml` na mão, a segurança dependia de lembrar de
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
  return escaparHtml(valor);
}

/**
 * Marca uma string como HTML confiável, para a tag `html` não escapá-la.
 * Só para marcação que o PRÓPRIO código produziu (o `<svg>` de `iconeSvg()`, por
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
export function escaparAtributo(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Plural simples em português: `plural(1, "cliente")` -> "1 cliente". */
export function plural(n, singular, pluralForm = `${singular}s`) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
