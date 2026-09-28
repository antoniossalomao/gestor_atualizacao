import { html, plural } from "../utils/html.js";
import { iconHtml } from "../utils/icons.js";

/**
 * Marcação do fluxo de importação de planilha (components/ImportacaoModal.js):
 * orientação -> prévia -> resultado. Sem DOM, para ser testada no Node.
 */

/** Colunas aceitas, na ordem usada quando a planilha não tem cabeçalho. */
export const COLUNAS_IMPORTACAO = ["Cliente", "Sistema", "Versão", "Quem Atualizou", "Data", "Motivo", "Máquinas", "Obs"];

const TIPO_ROTULO = { data: "Data", cliente: "Cliente", sistema: "Sistema", duplicidade: "Duplicidade" };

/** Passo 1: o que a planilha precisa ter, antes de escolher o arquivo. */
export function orientacaoImportacao() {
  return html`
    <h3 class="modal-box__title" id="importacao-titulo">Importar planilha de atualizações</h3>
    <div class="importacao__orientacao">
      <p>A importação <strong>acrescenta</strong> atualizações ao histórico; nada do que já existe é alterado. Antes de gravar, você confere uma prévia.</p>
      <ul>
        <li>Arquivo Excel <strong>.xlsx</strong> (até 15 MB). Vale a primeira aba.</li>
        <li>Primeira linha com os nomes das colunas: ${COLUNAS_IMPORTACAO.join(", ")}. Só <strong>Cliente</strong> é obrigatória; colunas com outro nome são ignoradas.</li>
        <li><strong>Data</strong> em dd/mm/aaaa. Linha com data em outro formato fica de fora.</li>
        <li>Vários sistemas na mesma célula, separados por vírgula.</li>
        <li>A versão oficial atual <strong>não</strong> é aplicada: planilha é histórico, e cada linha fica com a versão escrita nela, ou nenhuma.</li>
      </ul>
    </div>
    <div class="modal-box__actions">
      <button type="button" class="btn" data-action="fechar">Cancelar</button>
      <button type="button" class="btn btn--accent" data-action="escolher">${iconHtml("upload")} Escolher arquivo</button>
    </div>`;
}

/**
 * Passo 2: prévia devolvida por POST /atualizacoes/import/previa.
 * @param {any} p resposta da prévia
 * @param {string} nomeArquivo
 * @param {boolean} pularDuplicadas
 */
export function previaImportacao(p, nomeArquivo, pularDuplicadas) {
  const entram = p.validas - (pularDuplicadas ? p.duplicadas : 0);
  return html`
    <h3 class="modal-box__title" id="importacao-titulo">Conferir antes de importar</h3>
    <p class="importacao__arquivo">${nomeArquivo} · ${plural(p.total, "linha")} lida${p.total === 1 ? "" : "s"}</p>
    <div class="importacao__numeros">
      <div class="importacao__numero is-boa"><strong>${p.validas}</strong> válida${p.validas === 1 ? "" : "s"}</div>
      <div class="importacao__numero${p.comErro ? " is-alta" : ""}"><strong>${p.comErro}</strong> com erro (ficam de fora)</div>
      <div class="importacao__numero${p.duplicadas ? " is-media" : ""}"><strong>${p.duplicadas}</strong> possíve${p.duplicadas === 1 ? "l" : "is"} duplicidade${p.duplicadas === 1 ? "" : "s"}</div>
      <div class="importacao__numero"><strong>${p.clientesSemCadastro}</strong> cliente${p.clientesSemCadastro === 1 ? "" : "s"} sem cadastro</div>
    </div>
    ${p.semCabecalho ? html`<p class="importacao__aviso">Cabeçalho não reconhecido: as colunas foram lidas na ordem ${COLUNAS_IMPORTACAO.join(", ")}.</p>` : ""}
    ${p.colunasIgnoradas?.length ? html`<p class="importacao__aviso">Colunas ignoradas: ${p.colunasIgnoradas.join(", ")}.</p>` : ""}
    ${p.ocorrencias.length ? tabelaOcorrencias(p) : html`<p class="importacao__ok">${iconHtml("check")} Nenhum problema encontrado.</p>`}
    ${p.duplicadas
      ? html`<label class="importacao__opcao"><input type="checkbox" data-role="pular-duplicadas" ${pularDuplicadas ? html`checked` : ""} /> Pular possíveis duplicidades (recomendado ao reenviar um arquivo)</label>`
      : ""}
    <div class="modal-box__actions">
      <button type="button" class="btn" data-action="escolher">Escolher outro arquivo</button>
      <button type="button" class="btn btn--accent" data-action="importar" ${entram > 0 ? "" : html`disabled`}>${entram > 0 ? `Importar ${plural(entram, "linha")}` : "Nada para importar"}</button>
    </div>`;
}

function tabelaOcorrencias(p) {
  return html`
    <div class="importacao__ocorrencias">
      <table class="data-table">
        <caption class="sr-only">Linhas com erro ou aviso</caption>
        <thead><tr><th scope="col">Linha</th><th scope="col">Cliente</th><th scope="col">Data</th><th scope="col">O que foi encontrado</th></tr></thead>
        <tbody>
          ${p.ocorrencias.map((o) => html`
            <tr class="${o.erro ? "is-erro" : ""}">
              <td>${o.linha}</td>
              <td>${o.cliente || "—"}</td>
              <td>${o.data || "—"}</td>
              <td>${[...(o.erro ? [o.erro] : []), ...o.avisos].map((item, i) => html`${i ? html`<br />` : ""}<span class="importacao__tipo${o.erro && i === 0 ? " is-erro" : ""}">${o.erro && i === 0 ? "Erro" : "Aviso"} · ${TIPO_ROTULO[item.tipo] || item.tipo}:</span> ${item.mensagem}`)}</td>
            </tr>`)}
        </tbody>
      </table>
      ${p.ocorrencias.length >= 200 ? html`<p class="importacao__aviso">Mostrando as 200 primeiras ocorrências.</p>` : ""}
    </div>`;
}

/**
 * Passo 3: o que foi gravado.
 * @param {any} r resposta de POST /atualizacoes/import
 */
export function resultadoImportacao(r) {
  return html`
    <h3 class="modal-box__title" id="importacao-titulo">Importação concluída</h3>
    <p><strong>${plural(r.inserted, "atualização importada", "atualizações importadas")}</strong>${r.ignoradas ? html`; ${plural(r.ignoradas, "linha ficou", "linhas ficaram")} de fora (com erro ou duplicada)` : ""}. O registro está no Histórico da Administração.</p>
    ${r.naoCadastrados?.length
      ? html`<p class="importacao__aviso">${plural(r.naoCadastrados.length, "cliente")} sem cadastro: ${r.naoCadastrados.slice(0, 8).join(", ")}${r.naoCadastrados.length > 8 ? "…" : ""}. Essas atualizações só aparecem no Resumo e na ficha depois que o cliente for cadastrado com o mesmo nome.</p>`
      : ""}
    <div class="modal-box__actions">
      <button type="button" class="btn btn--accent" data-action="fechar">Fechar</button>
    </div>`;
}
