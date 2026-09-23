import { theme } from "../../app/theme.js";
import { aparencia, REALCES, PERFIS } from "../../app/appearance.js";
import { html } from "../../utils/html.js";
import { iconHtml } from "../../utils/icons.js";
import { listaAtalhos } from "../../templates/configuracoes.js";

/**
 * Os controles de cada linha das Configurações, montados a partir da
 * definição de um ajuste (ver ajustes.js).
 *
 * Cada controle devolve o elemento E uma função `sincronizar`, que relê a
 * preferência e acerta o que está marcado. É ela que mantém a tela certa
 * quando o valor muda por fora do próprio controle: um perfil aplicado, um
 * arquivo importado, o Ctrl+B recolhendo o menu, o tema trocado pelo menu da
 * conta. A versão em modal resolvia isso redesenhando o painel inteiro -- o
 * que funcionava, mas tirava o foco do controle que a pessoa acabou de usar.
 *
 * @typedef {{el: HTMLElement, sincronizar: () => void}} Controle
 */

/**
 * @param {any} item a definição do ajuste
 * @param {{aoAplicarPerfil: (valor: string) => void}} acoes
 * @returns {Controle}
 */
export function montarControle(item, acoes) {
  if (item.tipo === "perfis") return perfis(acoes);
  if (item.tipo === "temas") return temas(item);
  if (item.tipo === "cores") return cores(item);
  if (item.tipo === "select") return selecao(item);
  if (item.tipo === "alternar") return alternar(item);
  if (item.tipo === "acao") return acao(item);
  if (item.tipo === "atalhos") return atalhos(item);
  return segmentado(item);
}

/**
 * Rótulo à esquerda + controle à direita, a forma padrão de uma linha.
 *
 * O selo "alterado" nasce escondido em toda linha que tem rótulo, e é a tela
 * quem decide quais aparecem (ver SecaoAjustes.atualizar). Criar todos de uma
 * vez e apenas mostrar/esconder evita a alternativa: inserir e remover
 * elementos a cada clique, que é como se perde o foco do controle que acabou
 * de ser usado.
 */
function linha({ titulo, ajuda, id }) {
  const el = document.createElement("div");
  el.className = "cfg-group";
  el.innerHTML = html`
    <div class="cfg-group__labels">
      <span class="cfg-group__title-row">
        <span class="cfg-group__title" id="cfg-titulo-${id}">${titulo}</span>
        <span class="cfg-group__selo" hidden>alterado</span>
      </span>
      ${ajuda && html`<span class="cfg-group__help">${ajuda}</span>`}
    </div>`.toString();
  return el;
}

/**
 * Um grupo de opções mutuamente exclusivas, desenhado como botões colados.
 *
 * Por baixo são `<input type="radio">` de verdade, escondidos visualmente e
 * cobertos por um `<label>`. Isso não é preciosismo: um grupo de radios
 * nativo já vem com navegação por setas, com o anúncio correto ("opção 2 de
 * 3, marcada") em leitor de tela e com o clique no rótulo funcionando --
 * três coisas que uma fileira de `<button>` obrigaria a reimplementar na
 * mão, e que quase sempre saem pela metade quando se reimplementa.
 */
function segmentado(item) {
  const el = linha(item);
  const trilho = document.createElement("div");
  trilho.className = "segmented";
  trilho.setAttribute("role", "radiogroup");
  trilho.setAttribute("aria-labelledby", `cfg-titulo-${item.id}`);

  for (const opcao of item.opcoes) {
    const label = document.createElement("label");
    label.className = "cfg-group__option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `cfg-${item.id}`;
    input.value = opcao.valor;
    const texto = document.createElement("span");
    texto.textContent = opcao.rotulo;
    label.append(input, texto);
    trilho.appendChild(label);
    input.addEventListener("change", () => {
      if (input.checked) item.aoEscolher(opcao.valor);
    });
  }

  const sincronizar = () => {
    const atual = item.atual();
    for (const input of trilho.querySelectorAll("input")) input.checked = input.value === atual;
  };
  sincronizar();
  el.appendChild(trilho);
  return { el, sincronizar };
}

/**
 * Liga/desliga. Os ajustes de sim-ou-não eram trilhos de duas opções ("Sim" /
 * "Não", "Lembrar" / "Sempre limpo"), que obrigam a ler as duas palavras para
 * saber qual vale. O interruptor é a forma que todo sistema usa para isso, e
 * se lê de relance numa coluna inteira deles.
 *
 * Por baixo é um checkbox com `role="switch"`: o leitor de tela anuncia
 * "ligado"/"desligado", e o Espaço alterna sem nenhum código a mais.
 *
 * `aoEscolher` pode devolver `false` (ou uma promessa de `false`) para
 * recusar a mudança -- a permissão de notificação, que quem decide é o
 * navegador. Aí o interruptor volta sozinho: deixá-lo ligado prometeria algo
 * que não vai acontecer, e a pessoa só descobriria na hora em que mais
 * precisava.
 */
function alternar(item) {
  const el = linha(item);
  const rotulo = document.createElement("label");
  rotulo.className = "interruptor";
  rotulo.innerHTML = html`
    <input type="checkbox" role="switch" class="interruptor__input" aria-labelledby="cfg-titulo-${item.id}" />
    <span class="interruptor__trilho" aria-hidden="true"><span class="interruptor__bolinha"></span></span>`.toString();
  const input = /** @type {HTMLInputElement} */ (rotulo.querySelector("input"));
  input.addEventListener("change", async () => {
    const pedido = input.checked;
    const aceito = await item.aoEscolher(pedido);
    if (aceito === false) input.checked = !pedido;
  });
  const sincronizar = () => {
    input.checked = Boolean(item.atual());
  };
  sincronizar();
  el.appendChild(rotulo);
  return { el, sincronizar };
}

/**
 * Lista suspensa, para quando as opções não cabem num trilho. Nove telas
 * não cabem: nove botões colados não seriam legíveis nem caberiam na largura.
 * A regra aqui é a largura do que se escolhe, não a consistência pela
 * consistência.
 */
function selecao(item) {
  const el = linha(item);
  const select = document.createElement("select");
  select.className = "input cfg-group__select";
  select.setAttribute("aria-labelledby", `cfg-titulo-${item.id}`);
  for (const opcao of item.opcoes) {
    const op = document.createElement("option");
    op.value = opcao.valor;
    op.textContent = opcao.rotulo;
    select.appendChild(op);
  }
  select.addEventListener("change", () => item.aoEscolher(select.value));
  const sincronizar = () => {
    select.value = item.atual();
  };
  sincronizar();
  el.appendChild(select);
  return { el, sincronizar };
}

/** Uma linha cujo controle é um botão que FAZ algo (mostrar um aviso de exemplo). */
function acao(item) {
  const el = linha(item);
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "btn btn--small";
  botao.textContent = item.rotulo;
  botao.addEventListener("click", () => item.executar());
  el.appendChild(botao);
  return { el, sincronizar: () => {} };
}

/** Os atalhos de um grupo, só leitura. */
function atalhos(item) {
  const el = document.createElement("div");
  el.className = "cfg-group cfg-group--largo";
  el.innerHTML = listaAtalhos(item.atalhos).toString();
  return { el, sincronizar: () => {} };
}

/**
 * Tema: três miniaturas, não três palavras.
 *
 * "Claro" e "Escuro" até se explicam sozinhos, mas "Sistema" não -- e o
 * problema real é outro: escolher o visual do app lendo a palavra que
 * descreve o visual é dar uma volta desnecessária, quando mostrar o visual é
 * possível. A miniatura de "Sistema" é metade de cada, que é literalmente o
 * que a opção significa.
 */
function temas(item) {
  const el = linha(item);
  el.classList.add("cfg-group--largo");
  const grade = document.createElement("div");
  grade.className = "cfg-temas";
  grade.setAttribute("role", "radiogroup");
  grade.setAttribute("aria-labelledby", `cfg-titulo-${item.id}`);

  for (const opcao of [
    { valor: "sistema", rotulo: "Sistema" },
    { valor: "claro", rotulo: "Claro" },
    { valor: "escuro", rotulo: "Escuro" },
  ]) {
    const label = document.createElement("label");
    label.className = "cfg-tema";
    label.innerHTML = html`
      <input type="radio" name="cfg-tema" value="${opcao.valor}" />
      <span class="cfg-tema__preview cfg-tema__preview--${opcao.valor}" aria-hidden="true">
        <span class="cfg-tema__barra"></span>
        <span class="cfg-tema__corpo"><i></i><i></i><i></i></span>
      </span>
      <span class="cfg-tema__rotulo">${opcao.rotulo}${iconHtml("check")}</span>`.toString();
    const input = /** @type {HTMLInputElement} */ (label.querySelector("input"));
    input.addEventListener("change", () => {
      if (input.checked) theme.aplicar(opcao.valor);
    });
    grade.appendChild(label);
  }

  const sincronizar = () => {
    const atual = theme.atual();
    for (const input of grade.querySelectorAll("input")) input.checked = input.value === atual;
  };
  sincronizar();
  el.appendChild(grade);
  return { el, sincronizar };
}

/** Cor de destaque: bolinhas, pelo mesmo motivo das miniaturas de tema. */
function cores(item) {
  const el = linha(item);
  const trilho = document.createElement("div");
  trilho.className = "cfg-cores";
  trilho.setAttribute("role", "radiogroup");
  trilho.setAttribute("aria-labelledby", `cfg-titulo-${item.id}`);

  for (const cor of REALCES) {
    const label = document.createElement("label");
    label.className = "cfg-cor";
    label.title = cor.rotulo;
    label.style.setProperty("--amostra", cor.hex);
    // O nome da cor não some, vira texto de leitor de tela: sete bolinhas
    // coloridas sem rótulo são sete opções idênticas para quem não as
    // enxerga, e a cor é exatamente a informação que falta nesse caso.
    label.innerHTML = html`<input type="radio" name="cfg-realce" value="${cor.valor}" /><span class="sr-only">${cor.rotulo}</span>`.toString();
    const input = /** @type {HTMLInputElement} */ (label.querySelector("input"));
    input.addEventListener("change", () => {
      if (input.checked) aparencia.aplicar({ realce: cor.valor });
    });
    trilho.appendChild(label);
  }

  const sincronizar = () => {
    const atual = aparencia.realce();
    for (const input of trilho.querySelectorAll("input")) input.checked = input.value === atual;
  };
  sincronizar();
  el.appendChild(trilho);
  return { el, sincronizar };
}

/**
 * Os perfis, como cartões escolhíveis.
 *
 * Cada um traz uma amostra desenhada em CSS -- três traços finos e juntos
 * para "Operação", dois grossos e espaçados para "Leitura" -- pelo mesmo
 * motivo das miniaturas de tema: o que o perfil faz é VISUAL, e mostrar o
 * resultado é sempre mais direto do que descrevê-lo em duas linhas de texto
 * que a pessoa vai ter que imaginar.
 *
 * Não tem rótulo à esquerda: o título do cartão ("Perfil rápido") já diz o
 * que é, e repeti-lo em cima da grade só empurraria os cartões para baixo.
 */
function perfis({ aoAplicarPerfil }) {
  const el = document.createElement("div");
  el.className = "cfg-group cfg-group--largo";
  const grade = document.createElement("div");
  grade.className = "cfg-perfis";
  grade.innerHTML = html`${PERFIS.map(
    (perfil) => html`
      <button type="button" class="cfg-perfil" data-perfil="${perfil.valor}" aria-pressed="false">
        <span class="cfg-perfil__amostra cfg-perfil__amostra--${perfil.valor}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span class="cfg-perfil__nome">${perfil.rotulo}</span>
        <span class="cfg-perfil__desc">${perfil.descricao}</span>
        <span class="cfg-perfil__check" aria-hidden="true">${iconHtml("check")}</span>
      </button>`
  )}`.toString();
  grade.addEventListener("click", (e) => {
    const cartao = /** @type {HTMLElement} */ (e.target).closest("[data-perfil]");
    if (cartao instanceof HTMLElement) aoAplicarPerfil(cartao.dataset.perfil);
  });

  /** Marca o perfil que descreve o estado ATUAL -- não o último clicado. */
  const sincronizar = () => {
    const ativo = aparencia.perfilAtivo();
    for (const cartao of grade.querySelectorAll(".cfg-perfil")) {
      const marcado = /** @type {HTMLElement} */ (cartao).dataset.perfil === ativo;
      cartao.classList.toggle("is-active", marcado);
      cartao.setAttribute("aria-pressed", String(marcado));
    }
  };
  sincronizar();
  el.appendChild(grade);
  return { el, sincronizar };
}
