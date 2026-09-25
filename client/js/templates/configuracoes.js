import { html } from "../utils/html.js";
import { iconHtml } from "../utils/icons.js";
import { formatarDataHora, tempoRelativo } from "../utils/date.js";
import { iniciais, rotuloPapel, descricaoPapel } from "../domain/pessoa.js";
import { descreverAparelho } from "../domain/aparelho.js";

/**
 * Marcação da tela Configurações -- a parte que não depende do DOM, para ser
 * testada no Node (client/tests/telas.test.mjs). Os controles de ajuste
 * (trilhos de opções, interruptores, miniaturas de tema) ficam em
 * views/configuracoes/controles.js, porque cada um já nasce com o próprio
 * comportamento ligado.
 */

/**
 * Quem está logado, e o formulário do nome de exibição.
 * @param {{nome: string, usuario: string, role?: string, criado_em?: string|null}} perfil
 */
export function cartaoPerfil(perfil) {
  const nome = perfil.nome || perfil.usuario;
  return html`
    <div class="cfg-identidade">
      <span class="cfg-identidade__avatar" aria-hidden="true">${iniciais(nome)}</span>
      <div class="cfg-identidade__texto">
        <strong data-role="nome-exibido">${nome}</strong>
        <span>@${perfil.usuario}</span>
      </div>
      <dl class="cfg-identidade__fatos">
        <div><dt>Papel</dt><dd><span class="badge badge--accent">${rotuloPapel(perfil.role)}</span></dd></div>
        <div><dt>Membro desde</dt><dd>${dataCurta(perfil.criado_em)}</dd></div>
      </dl>
    </div>
    <p class="cfg-identidade__papel">${descricaoPapel(perfil.role)}</p>
    <form class="cfg-group" data-role="form-nome" novalidate>
      <div class="cfg-group__labels">
        <label class="cfg-group__title" for="cfg-nome">Nome de exibição</label>
        <span class="cfg-group__help">Aparece no menu da conta e no Histórico, e já vem preenchido como responsável nos registros novos. Os registros antigos continuam com o nome de antes.</span>
      </div>
      <div class="admin-campo-acao cfg-campo">
        <input type="text" class="input" id="cfg-nome" data-role="nome" value="${perfil.nome}" maxlength="80" autocomplete="name" spellcheck="false" />
        <button type="submit" class="btn btn--accent" data-action="salvar-nome" disabled>Salvar</button>
      </div>
    </form>`;
}

/** "23/09/2026", ou um travessão para data ausente ou inválida. */
function dataCurta(valor) {
  if (!valor) return "—";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d);
}

/**
 * Uma sessão aberta da conta.
 * @param {{id: string, atual: boolean, agente: string, desde: string|null, ultimoUso: string|null}} s
 */
export function linhaSessao(s) {
  const aparelho = descreverAparelho(s.agente);
  const quando = [
    s.desde ? `Entrou ${tempoRelativo(s.desde)}` : "",
    s.atual ? "em uso agora" : s.ultimoUso ? `último uso ${tempoRelativo(s.ultimoUso)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return html`
    <li class="cfg-sessao${s.atual ? " is-atual" : ""}">
      <span class="cfg-sessao__icone" aria-hidden="true">${iconHtml(aparelho.movel ? "celular" : "temaSistema")}</span>
      <div class="cfg-sessao__texto">
        <strong>${aparelho.rotulo}${s.atual && html` <span class="badge badge--success">Este aparelho</span>`}</strong>
        <span title="${s.desde ? `Entrou em ${formatarDataHora(s.desde)}` : ""}">${quando || "Sessão aberta antes desta versão do Gestor"}</span>
      </div>
      ${
        !s.atual &&
        html`<button type="button" class="btn btn--small btn--danger" data-action="encerrar-sessao" data-id="${s.id}">Encerrar</button>`
      }
    </li>`;
}

/**
 * A lista inteira. Uma sessão só (a atual) é o caso comum, e merece uma frase
 * que diga que está tudo certo em vez de uma lista de um item só.
 * @param {Array<Parameters<typeof linhaSessao>[0]>} sessoes
 */
export function listaSessoes(sessoes) {
  const outras = sessoes.filter((s) => !s.atual).length;
  return html`
    <ul class="cfg-sessoes">${sessoes.map(linhaSessao)}</ul>
    <p class="cfg-sessoes__resumo">${
      outras === 0
        ? "Sua conta só está aberta neste aparelho."
        : outras === 1
        ? "Sua conta também está aberta em outro aparelho. Se não reconhece, encerre e troque a senha."
        : `Sua conta também está aberta em ${outras} outros aparelhos. Se não reconhece algum, encerre e troque a senha.`
    }</p>`;
}

/**
 * Uma tabela de mentira com as classes da tabela de verdade -- então a
 * densidade, as linhas alternadas, o contraste e o tamanho do texto valem
 * nela exatamente como vão valer nas telas. Mexer na densidade de uma tela
 * sem tabela à vista era escolher no escuro.
 */
export function previaTabela() {
  // Três colunas, e não as nove de Atualizações: a prévia tem 400px, e
  // nomes cortados com "..." fariam a densidade parecer o problema.
  const linhas = [
    ["Mercado Bom Preço", "B_Vendas", "4.12.0"],
    ["Auto Peças Silva", "NFCe", "3.8.2"],
    ["Farmácia Central", "B_Estoque", "2.4.1"],
    ["Padaria Estrela", "Sped", "1.9.0"],
    ["Construtora Horizonte", "B_Obras", "5.0.3"],
    ["Ótica Visão", "DFe", "2.2.7"],
  ];
  return html`
    <div class="table-wrap cfg-previa" aria-hidden="true">
      <table class="data-table">
        <thead><tr><th>Cliente</th><th>Sistema</th><th>Versão</th></tr></thead>
        <tbody>
          ${linhas.map(([cliente, sistema, versao]) => html`<tr><td>${cliente}</td><td>${sistema}</td><td>${versao}</td></tr>`)}
        </tbody>
      </table>
    </div>`;
}

/**
 * Os atalhos de um grupo, no formato da lista do `?` (app/Shortcuts.js).
 * @param {Array<[string, string, string]>} atalhos
 */
export function listaAtalhos(atalhos) {
  return html`
    <dl class="cfg-atalhos">
      ${atalhos.map(
        ([teclas, descricao]) => html`
          <div class="cfg-atalhos__linha">
            <dt class="shortcuts__keys">${teclas.split(" + ").map((t, i) => html`${i > 0 && html`<span>+</span>`}<kbd>${t}</kbd>`)}</dt>
            <dd>${descricao}</dd>
          </div>`
      )}
    </dl>`;
}

/**
 * Resultados da busca de ajustes. Cada um leva à aba certa e acende a linha.
 * @param {Array<{aba: string, id: string, titulo: string, ajuda?: string, caminho: string, icone: Parameters<typeof iconHtml>[0]}>} resultados
 * @param {string} termo
 */
export function resultadosBusca(resultados, termo) {
  if (resultados.length === 0) {
    return html`
      <div class="cfg-resultados__vazio">
        <strong>Nenhum ajuste para "${termo}".</strong>
        <span>Tente outra palavra: "tema", "linhas", "senha", "avisos".</span>
      </div>`;
  }
  return html`
    <p class="cfg-resultados__total">${resultados.length === 1 ? "1 ajuste encontrado" : `${resultados.length} ajustes encontrados`}</p>
    <ul class="cfg-resultados__lista" role="list">
      ${resultados.map(
        (r) => html`
          <li>
            <button type="button" class="cfg-resultado" data-aba="${r.aba}" data-ajuste="${r.id}">
              <span class="cfg-resultado__icone" aria-hidden="true">${iconHtml(r.icone)}</span>
              <span class="cfg-resultado__texto">
                <strong>${r.titulo}</strong>
                ${r.ajuda && html`<span>${r.ajuda}</span>`}
              </span>
              <span class="cfg-resultado__caminho">${r.caminho}</span>
              <span class="cfg-resultado__seta" aria-hidden="true">${iconHtml("seta")}</span>
            </button>
          </li>`
      )}
    </ul>`;
}
