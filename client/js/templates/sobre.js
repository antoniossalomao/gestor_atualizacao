import { html, confiavel } from "../utils/html.js";
import { iconeHtml, simboloMarca } from "../utils/icones.js";
import { listaAtalhos } from "./configuracoes.js";

/**
 * Marcação da aba Sobre e ajuda das Configurações.
 *
 * Até 01/10/2026 a aba era desenhada como as outras: cartões de "título +
 * texto cinza", um embaixo do outro. Para ajustes isso funciona (cada linha
 * tem um controle à direita que dá ritmo à leitura); para ajuda virou uma
 * parede de 3.500px com quarenta blocos de mesmo peso, em que a versão -- a
 * primeira coisa que se procura num "Sobre" -- era uma linha qualquer. Aqui
 * cada assunto tem a forma do que ele é: versão em destaque, novidades em
 * linha do tempo, telas em grade, situações com a cor que têm no app.
 *
 * Todo bloco que a busca das Configurações acha carrega `data-ajuste` com o
 * MESMO id da definição em views/configuracoes/ajustes.js: é por ele que a
 * busca leva até o bloco e o acende.
 */

/** As seções da aba, na ordem do índice lateral. */
export const SECOES_SOBRE = [
  { id: "versao", rotulo: "Visão geral" },
  { id: "novidades", rotulo: "Novidades" },
  { id: "telas", rotulo: "Como usar cada tela" },
  { id: "situacoes", rotulo: "Como a situação é calculada" },
  { id: "atalhos", rotulo: "Atalhos de teclado" },
  { id: "suporte", rotulo: "Contato e suporte" },
];

/** Quantas novidades aparecem antes do "Ver todas". */
export const NOVIDADES_VISIVEIS = 3;

/** @param {typeof SECOES_SOBRE} secoes */
export function indiceSobre(secoes) {
  return html`
    <nav class="sobre__indice" aria-label="Nesta página">
      <span class="sobre__indice-titulo">Nesta página</span>
      <ul>
        ${secoes.map(
          // Botões, e não <a href="#...">: o roteador do app mora no hash, e
          // uma âncora trocaria de tela em vez de rolar até a seção.
          (s) => html`<li><button type="button" data-action="ir-secao" data-secao="${s.id}">${s.rotulo}</button></li>`
        )}
      </ul>
    </nav>`;
}

/**
 * O cartão do topo: o que é, que versão, e os atalhos para o que mais se
 * procura aqui.
 * @param {{versao: string|null, ehAdmin: boolean, totalNovidades: number}} opcoes
 */
export function cartaoVersao({ versao, ehAdmin, totalNovidades }) {
  return html`
    <section class="card sobre-hero" id="sobre-versao" data-ajuste="versao-painel" tabindex="-1">
      <span class="sobre-hero__marca" aria-hidden="true">${confiavel(simboloMarca())}</span>
      <div class="sobre-hero__texto">
        <h3>Gestor de Atualizações</h3>
        <p>Painel da equipe para registrar, agendar e acompanhar as atualizações dos sistemas nos clientes.</p>
        <div class="sobre-hero__fatos">
          <span class="badge badge--accent">${versao ? `Versão ${versao}` : "Versão não informada"}</span>
          ${totalNovidades > 0 && html`<span class="text-muted">${totalNovidades === 1 ? "1 novidade recente" : `${totalNovidades} novidades recentes`}</span>`}
        </div>
      </div>
      <div class="sobre-hero__acoes">
        <button type="button" class="btn btn--small" data-action="ir-secao" data-secao="novidades">${iconeHtml("info")} Novidades</button>
        <button type="button" class="btn btn--small" data-action="ir-secao" data-secao="atalhos">${iconeHtml("teclado")} Atalhos</button>
        ${ehAdmin && html`<button type="button" class="btn btn--small" data-action="diagnostico">${iconeHtml("saude")} Diagnóstico</button>`}
      </div>
    </section>`;
}

/**
 * Cabeçalho de um cartão de seção da aba, com a âncora do índice.
 * @param {{id: string, titulo: string, descricao?: string, acoes?: any}} s
 */
function cabecalho({ id, titulo, descricao, acoes }) {
  return html`
    <header class="secao-card__head">
      <div class="secao-card__titulos">
        <h3 id="sobre-${id}-titulo">${titulo}</h3>
        ${descricao && html`<p>${descricao}</p>`}
      </div>
      ${acoes && html`<div class="secao-card__acoes">${acoes}</div>`}
    </header>`;
}

/**
 * As novidades como linha do tempo, agrupadas por data. As que passam de
 * `NOVIDADES_VISIVEIS` nascem escondidas, atrás do "Ver todas".
 * @param {Array<{data: string, itens: Array<{titulo: string, texto: string, indice: number}>}>} grupos
 */
export function linhaDoTempo(grupos) {
  const total = grupos.reduce((soma, g) => soma + g.itens.length, 0);
  const sobra = total - NOVIDADES_VISIVEIS;
  return html`
    <section class="card secao-card sobre-secao" id="sobre-novidades" aria-labelledby="sobre-novidades-titulo">
      ${cabecalho({ id: "novidades", titulo: "Novidades", descricao: "O que mudou de visível nas últimas entregas." })}
      <ol class="sobre-tempo">
        ${grupos.map(
          (g) => html`
            <li class="sobre-tempo__grupo"${g.itens.every((i) => i.indice >= NOVIDADES_VISIVEIS) && confiavel(" data-extra hidden")}>
              <span class="sobre-tempo__data">${g.data}</span>
              <ul class="sobre-tempo__itens">
                ${g.itens.map(
                  (n) => html`
                    <li class="sobre-tempo__item" data-ajuste="novidade-${n.indice}"${n.indice >= NOVIDADES_VISIVEIS && confiavel(" data-extra hidden")}>
                      <strong>${n.titulo}</strong>
                      <p>${n.texto}</p>
                    </li>`
                )}
              </ul>
            </li>`
        )}
      </ol>
      ${
        sobra > 0 &&
        html`<button type="button" class="btn btn--small btn--ghost sobre-tempo__mais" data-action="mais-novidades" aria-expanded="false">
          ${sobra === 1 ? "Ver mais 1 novidade" : `Ver mais ${sobra} novidades`}
        </button>`
      }
    </section>`;
}

/**
 * Uma grade com as telas do menu. Fechado, cada cartão diz em uma frase para
 * que a tela serve; aberto, o "como usar" inteiro e um botão que leva até ela.
 * @param {Array<{key: string, label: string, icone: any, resumo: string, texto: string, abrir: boolean}>} telas
 *   `abrir: false` na tela em que se está (as próprias Configurações).
 */
export function gradeTelas(telas) {
  return html`
    <section class="card secao-card sobre-secao" id="sobre-telas" aria-labelledby="sobre-telas-titulo">
      ${cabecalho({ id: "telas", titulo: "Como usar cada tela", descricao: "Clique numa tela para ver onde ficam as ações principais." })}
      <div class="sobre-telas">
        ${telas.map(
          (t) => html`
            <details class="sobre-tela" data-ajuste="como-usar-${t.key}">
              <summary>
                <span class="sobre-tela__icone" aria-hidden="true">${iconeHtml(t.icone)}</span>
                <span class="sobre-tela__textos">
                  <strong>${t.label}</strong>
                  <span>${t.resumo}</span>
                </span>
                <span class="sobre-tela__seta" aria-hidden="true">${iconeHtml("seta")}</span>
              </summary>
              <div class="sobre-tela__corpo">
                <p>${t.texto}</p>
                ${t.abrir && html`<button type="button" class="btn btn--small" data-action="abrir-tela" data-tela="${t.key}">Abrir ${t.label} ${iconeHtml("seta")}</button>`}
              </div>
            </details>`
        )}
      </div>
    </section>`;
}

/**
 * A legenda das situações, com a bolinha da mesma cor do Resumo, e as regras
 * de combinação separadas embaixo -- elas não são uma situação a mais.
 * @param {Array<{titulo: string, texto: string, tom: string|null}>} itens
 * @param {number|null|undefined} prazoDias
 */
export function legendaSituacoes(itens, prazoDias) {
  const situacoes = itens.map((item, i) => ({ ...item, i })).filter((item) => item.tom);
  const regras = itens.map((item, i) => ({ ...item, i })).filter((item) => !item.tom);
  const prazo = Number.isInteger(prazoDias) ? /** @type {number} */ (prazoDias) : null;
  return html`
    <section class="card secao-card sobre-secao" id="sobre-situacoes" aria-labelledby="sobre-situacoes-titulo">
      ${cabecalho({
        id: "situacoes",
        titulo: "Como a situação é calculada",
        descricao: "Vale igual no Resumo, na aba Sistemas e na ficha do cliente.",
        acoes: prazo !== null && html`<span class="badge badge--muted" title="Definido pela administração (Administração › Operação).">Prazo da equipe: ${prazo === 1 ? "1 dia" : `${prazo} dias`}</span>`,
      })}
      <ul class="sobre-situacoes">
        ${situacoes.map(
          (s) => html`
            <li class="sobre-situacao" data-ajuste="situacao-${s.i}">
              <span class="sobre-situacao__nome"><span class="situacao__marca is-${s.tom}" aria-hidden="true"></span>${s.titulo}</span>
              <p>${s.texto}</p>
            </li>`
        )}
      </ul>
      ${
        regras.length > 0 &&
        html`<div class="sobre-regras">
          ${regras.map(
            (r) => html`
              <div class="sobre-regra" data-ajuste="situacao-${r.i}">
                <strong>${r.titulo}</strong>
                <p>${r.texto}</p>
              </div>`
          )}
        </div>`
      }
    </section>`;
}

/**
 * Os atalhos, um bloco por grupo. A linha "Mostrar as dicas de atalho" é um
 * controle de verdade e entra pela view (`data-role="dicas"`).
 * @param {Array<[string, string, string]>} atalhos
 */
export function blocoAtalhos(atalhos) {
  const grupos = [...new Set(atalhos.map(([, , grupo]) => grupo))];
  return html`
    <section class="card secao-card sobre-secao" id="sobre-atalhos" aria-labelledby="sobre-atalhos-titulo">
      ${cabecalho({ id: "atalhos", titulo: "Atalhos de teclado", descricao: "Tudo o que dá para fazer sem tirar a mão do teclado. Digite ? em qualquer tela para ver esta lista." })}
      <div class="cfg-linhas" data-role="dicas"></div>
      <div class="sobre-atalhos">
        ${grupos.map(
          (grupo) => html`
            <div class="sobre-atalhos__grupo" data-ajuste="atalhos-${grupo.toLowerCase()}">
              <h4>${grupo === "Global" ? "Em qualquer tela" : `Em ${grupo.toLowerCase()}`}</h4>
              ${listaAtalhos(atalhos.filter(([, , g]) => g === grupo))}
            </div>`
        )}
      </div>
    </section>`;
}

/**
 * Os dois caminhos de suporte, lado a lado.
 * @param {{versao: string|null, ehAdmin: boolean}} opcoes
 */
export function cartoesSuporte({ versao, ehAdmin }) {
  return html`
    <section class="card secao-card sobre-secao" id="sobre-suporte" aria-labelledby="sobre-suporte-titulo">
      ${cabecalho({ id: "suporte", titulo: "Contato e suporte" })}
      <div class="sobre-suporte">
        <div class="sobre-suporte__item" data-ajuste="suporte-duvidas">
          <span class="sobre-suporte__icone" aria-hidden="true">${iconeHtml("users")}</span>
          <div>
            <strong>Dúvidas, acesso e regras da equipe</strong>
            <p>Fale com um administrador da equipe. É quem cria contas, troca papéis e muda prazos, arquivamento e a classificação dos sistemas.</p>
          </div>
        </div>
        <div class="sobre-suporte__item" data-ajuste="suporte-problema">
          <span class="sobre-suporte__icone" aria-hidden="true">${iconeHtml("alerta")}</span>
          <div>
            <strong>Encontrou um problema no painel</strong>
            <p>Anote a tela, o que você fez e a hora, e passe para um administrador${versao ? ` (versão ${versao})` : ""}.
              ${ehAdmin ? "Em Administração, Auditoria mostra quem mudou o quê, e em Diagnóstico o botão “Copiar para o suporte” junta a saúde do servidor num texto pronto para colar." : ""}</p>
          </div>
        </div>
      </div>
    </section>`;
}
