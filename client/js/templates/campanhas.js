import { html, plural } from "../utils/html.js";
import { iconeHtml } from "../utils/icones.js";
import { FILTROS_CAMPANHA, SITUACAO_CAMPANHA, descricaoPublico, seloPrazo, textoProgresso } from "../domain/campanhas.js";

/**
 * Marcação da aba Campanhas. Sem DOM: a view (views/CampanhasView.js) só
 * joga o resultado num innerHTML e liga os eventos.
 */

/**
 * Barra de progresso com as três partes (atendidos, agendados, pendentes).
 * Mesma técnica da barra de situação do Resumo: largura por `flex-grow` =
 * quantidade, então a soma fecha a barra sem arredondar porcentagem.
 * @param {{totalClientes: number, atendidos: number, agendados: number, pendentes: number, percentual: number|null}} c
 */
export function barraProgresso(c) {
  if (!c.totalClientes) return html`<div class="situacao__barra campanha__barra" role="img" aria-label="Sem clientes"></div>`;
  /** @type {Array<[string, number]>} */
  const partes = [
    ["boa", c.atendidos],
    ["media", c.agendados],
    ["alta", c.pendentes],
  ];
  const descricao = `${textoProgresso(c)}; ${c.agendados} já agendados; ${c.pendentes} pendentes.`;
  return html`
    <div class="situacao__barra campanha__barra" role="img" aria-label="${descricao}">
      ${partes.filter(([, n]) => n > 0).map(([sev, n]) => html`<span class="situacao__parte is-${sev}" style="flex-grow: ${n}"></span>`)}
    </div>`;
}

/** @param {ReturnType<typeof seloPrazo>} selo */
function marcaPrazo(selo) {
  return selo ? html`<span class="campanha__selo is-${selo.tipo}">${selo.texto}</span>` : "";
}

/**
 * Cartão de uma campanha na lista lateral.
 * @param {any} c campanha com placar (GET /campanhas)
 * @param {boolean} selecionada
 */
export function cartaoCampanha(c, selecionada) {
  return html`
    <button type="button" class="campanha-cartao${selecionada ? " is-selecionada" : ""}" data-campanha="${c.id}" aria-pressed="${selecionada ? "true" : "false"}">
      <span class="campanha-cartao__topo">
        <strong class="campanha-cartao__titulo">${c.titulo}</strong>
        <span class="campanha-cartao__pct">${c.percentual == null ? "—" : `${c.percentual}%`}</span>
      </span>
      <span class="campanha-cartao__meta">${c.sistema} · versão ${c.versaoAlvo}${c.publico === "escolhidos" ? " · Clientes escolhidos" : c.cidade ? ` · ${c.cidade}` : ""} ${marcaPrazo(seloPrazo(c))}</span>
      ${barraProgresso(c)}
      <span class="campanha-cartao__meta">${textoProgresso(c)}</span>
    </button>`;
}

/** Lista lateral inteira, ou o vazio que explica o próximo passo. */
export function listaCampanhas(campanhas, selecionadaId, { encerradas, podeCriar }) {
  if (campanhas.length === 0) {
    return html`<p class="campanhas__vazio">${encerradas
      ? "Nenhuma campanha encerrada."
      : podeCriar
        ? "Nenhuma campanha ativa. Crie uma para acompanhar uma versão crítica ou um prazo fiscal."
        : "Nenhuma campanha ativa."}</p>`;
  }
  return html`${campanhas.map((c) => cartaoCampanha(c, c.id === selecionadaId))}`;
}

/**
 * Cabeçalho do detalhe: meta, placar e ações da campanha.
 * @param {any} c campanha com placar (GET /campanhas/:id)
 * @param {{role?: string}} usuario
 */
export function cabecalhoCampanha(c, usuario) {
  const podeEditar = usuario?.role !== "consulta";
  const encerrada = Boolean(c.encerradaEm);
  return html`
    <div class="campanha__cabecalho">
      <div class="campanha__identidade">
        <h2 class="campanha__titulo">${c.titulo} ${marcaPrazo(seloPrazo(c))}</h2>
        <p class="campanha__meta">
          <strong>${c.sistema}</strong> na versão <strong>${c.versaoAlvo}</strong> ou mais nova
          · <strong>${descricaoPublico(c)}</strong>
        </p>
        ${c.descricao ? html`<p class="campanha__descricao">${c.descricao}</p>` : ""}
      </div>
      <div class="campanha__acoes">
        <button type="button" class="btn btn--small" data-action="exportar">${iconeHtml("download")} Exportar pendentes (.xlsx)</button>
        ${podeEditar && !encerrada && c.publico === "escolhidos" ? html`<button type="button" class="btn btn--small" data-action="adicionar">${iconeHtml("plus")} Adicionar clientes</button>` : ""}
        ${podeEditar && !encerrada ? html`<button type="button" class="btn btn--small" data-action="editar">${iconeHtml("editar")} Editar</button>` : ""}
        ${podeEditar ? html`<button type="button" class="btn btn--small" data-action="${encerrada ? "reabrir" : "encerrar"}">${encerrada ? "Reabrir" : "Encerrar"}</button>` : ""}
        ${usuario?.role === "admin" ? html`<button type="button" class="btn btn--small btn--danger" data-action="excluir">${iconeHtml("alerta")} Excluir</button>` : ""}
      </div>
    </div>
    <div class="campanha__painel">
      <div class="campanha__placar">
        <div class="campanha__numero campanha__numero--pct"><strong>${c.percentual == null ? "—" : `${c.percentual}%`}</strong>concluído</div>
        <div class="campanha__numero is-boa"><strong><span class="situacao__marca" aria-hidden="true"></span>${c.atendidos}</strong>atualizados</div>
        ${encerrada ? "" : html`<div class="campanha__numero is-media"><strong><span class="situacao__marca" aria-hidden="true"></span>${c.agendados}</strong>já agendados</div>`}
        <div class="campanha__numero is-alta"><strong><span class="situacao__marca" aria-hidden="true"></span>${c.pendentes}</strong>pendentes</div>
      </div>
      ${barraProgresso(c)}
      <p class="campanha__nota">${encerrada
      ? `Encerrada em ${new Date(c.encerradaEm).toLocaleDateString("pt-BR")}${c.encerradaPor ? ` por ${c.encerradaPor}` : ""}: o placar acima é o do encerramento.`
      : "A baixa é automática: registre a atualização em Atualizações e o cliente sai dos pendentes. Uma versão oficial nova em Sistemas não muda a meta."}</p>
    </div>`;
}

/**
 * Filtros rápidos com a contagem de cada um.
 * @param {string} ativo
 * @param {Record<string, number>} contagens
 */
export function filtrosCampanha(ativo, contagens) {
  return html`${FILTROS_CAMPANHA.map(
    (f) => html`<button type="button" class="filtro-rapido${f.chave === ativo ? " is-active" : ""}" data-filtro="${f.chave}" aria-pressed="${f.chave === ativo ? "true" : "false"}">${f.rotulo} <span class="filtro-rapido__n">${contagens[f.chave] ?? 0}</span></button>`
  )}`;
}

/** Nome do cliente, com código e cidade embaixo em tom de apoio. */
export function celulaClienteCampanha(row) {
  const apoio = [row.codigo && `Cód. ${row.codigo}`, row.cidade].filter(Boolean).join(" · ");
  return html`<span class="campanha__cliente">${row.nome}${apoio ? html`<small>${apoio}</small>` : ""}</span>`;
}

/** Data da última atualização no sistema, com a versão recebida embaixo. */
export function celulaUltimaCampanha(row) {
  if (!row.ultima) return html`<span class="campanha__cliente">Nunca</span>`;
  return html`<span class="campanha__cliente">${row.ultima}<small>versão ${row.versaoRecebida || "não informada"}</small></span>`;
}

/** Célula de situação (o mesmo ponto colorido do Resumo, e o texto ao lado). */
export function celulaSituacaoCampanha(row) {
  const s = SITUACAO_CAMPANHA[row.situacao] || { rotulo: row.situacao, severidade: "media" };
  const detalhe = row.situacao === "agendado" && row.agendamento
    ? ` — ${row.agendamento.data || "sem data"}${row.agendamento.responsavel ? `, ${row.agendamento.responsavel}` : ""}`
    : "";
  return html`<span class="campanha__situacao is-${s.severidade}"><span class="situacao__marca" aria-hidden="true"></span>${s.rotulo}${detalhe}</span>`;
}

/**
 * Botões da linha. Ícone sem texto, então nome acessível e dica sempre.
 * "Agendar" só para quem ainda não está atendido nem agendado. "Retirar da
 * campanha" só numa campanha de clientes escolhidos ainda aberta, e não no
 * último cliente (o servidor recusaria).
 * @param {any} row
 * @param {{role?: string, encerrada: boolean, podeRetirar?: boolean}} opcoes
 */
export function acoesClienteCampanha(row, { role, encerrada, podeRetirar = false }) {
  /** @type {Array<[string, Parameters<typeof iconeHtml>[0], string]>} */
  const botoes = [];
  if (role !== "consulta" && !encerrada && row.situacao === "pendente") botoes.push(["agendar", "calendario", "Criar agendamento"]);
  if (role !== "consulta") botoes.push(["acessos", "acessos", "Gerenciar acessos remotos"]);
  botoes.push(["ficha", "olho", "Abrir ficha do cliente"]);
  if (role !== "consulta" && !encerrada && podeRetirar) botoes.push(["remover", "fechar", "Retirar da campanha"]);
  return html`<div class="row-actions">${botoes.map(
    ([acao, ico, titulo]) => html`<button type="button" class="btn btn--icon" data-row-action="${acao}" data-id="${row.id}" title="${titulo}" aria-label="${titulo}: ${row.nome}">${iconeHtml(ico)}</button>`
  )}</div>`;
}

/**
 * Lista de checkboxes onde se escolhem os clientes de uma campanha. Só marca
 * o que está em `marcados`; quem decide o que fica marcado é a view, que
 * guarda a seleção fora da lista (filtrar a busca refaz a lista inteira).
 * @param {Array<{id: number, nome: string, codigo?: string, cidade?: string}>} clientes
 * @param {Set<number>} marcados
 */
export function listaEscolhaClientes(clientes, marcados) {
  if (clientes.length === 0) return html`<p class="campanha-escolha__vazio">Nenhum cliente encontrado.</p>`;
  return html`${clientes.map((c) => {
    const apoio = [c.codigo && `Cód. ${c.codigo}`, c.cidade].filter(Boolean).join(" · ");
    return html`<label class="checkbox-item campanha-escolha__item">
      <input type="checkbox" value="${c.id}" ${marcados.has(c.id) ? html`checked` : ""} />
      <span class="campanha__cliente">${c.nome}${apoio ? html`<small>${apoio}</small>` : ""}</span>
    </label>`;
  })}`;
}

/**
 * Filtros acima da lista de escolha: cidade, grupo/rede, regime tributário e
 * "só quem ainda não está na versão-alvo". Só aparece o seletor que tem mais
 * de uma opção; com uma só (ou nenhuma) ele não filtra nada.
 * @param {{cidades: string[], grupos: string[], regimes: string[]}} opcoes
 * @param {import("../domain/campanhas.js").FiltrosEscolha} filtros
 * @param {{podeFiltrarQuemFalta: boolean}} contexto
 */
export function filtrosEscolhaClientes(opcoes, filtros, { podeFiltrarQuemFalta }) {
  /** @type {Array<[string, string, string[]]>} */
  const seletores = [
    ["cidade", "Cidade", opcoes.cidades],
    ["grupo", "Grupo/rede", opcoes.grupos],
    ["regime", "Regime tributário", opcoes.regimes],
  ];
  return html`
    ${seletores.filter(([, , lista]) => lista.length > 1).map(
      ([chave, rotulo, lista]) => html`<select class="input campanha-escolha__filtro" data-filtro-escolha="${chave}" aria-label="${rotulo}">
        <option value="">${rotulo}: todos</option>
        ${lista.map((valor) => html`<option value="${valor}" ${filtros[chave] === valor ? html`selected` : ""}>${valor}</option>`)}
      </select>`
    )}
    <label class="checkbox-item campanha-escolha__so-falta">
      <input type="checkbox" data-filtro-escolha="soQuemFalta" ${filtros.soQuemFalta ? html`checked` : ""} ${podeFiltrarQuemFalta ? "" : html`disabled`} />
      <span>${podeFiltrarQuemFalta ? "Só quem ainda não está na versão-alvo" : "Só quem falta (informe a versão-alvo)"}</span>
    </label>`;
}

/**
 * Bloco de escolha de clientes (busca, filtros, lista e contagem), que o
 * componente EscolhaDeClientes liga. Fica oculto no formulário enquanto o
 * público for "todos".
 * @param {{oculto?: boolean}} [opcoes]
 */
export function blocoEscolhaClientes({ oculto = false } = {}) {
  return html`
    <div class="field campanha-escolha" data-role="escolha" ${oculto ? html`hidden` : ""}>
      <div class="campanha-escolha__barra">
        <input class="input" type="search" data-role="busca-escolha" autocomplete="off" placeholder="Buscar cliente, código ou cidade" aria-label="Buscar cliente, código ou cidade" />
        <button type="button" class="btn btn--small" data-action="marcar-visiveis">Marcar os visíveis</button>
        <button type="button" class="btn btn--small" data-action="limpar-escolha">Limpar</button>
      </div>
      <div class="campanha-escolha__filtros" data-role="filtros-escolha"></div>
      <div class="campanha-escolha__lista" data-role="lista-escolha" role="group" aria-label="Clientes da campanha"></div>
      <div class="field__help" data-role="contagem-escolha" aria-live="polite"></div>
    </div>`;
}

/**
 * Janela "Adicionar clientes" do detalhe de uma campanha de clientes escolhidos.
 * @param {{titulo: string, sistema: string}} campanha
 */
export function formularioAdicionarClientes(campanha) {
  return html`
    <h3 class="modal-box__title" id="campanha-add-titulo">Adicionar clientes</h3>
    <p class="campanha__nota">${campanha.titulo} · ${campanha.sistema}</p>
    <form class="campanha-form" data-role="form-adicionar" novalidate>
      ${blocoEscolhaClientes()}
      <p class="field__hint" data-role="erro" role="alert"></p>
      <div class="modal-box__actions">
        <button type="button" class="btn" data-action="cancelar">Cancelar</button>
        <button type="submit" class="btn btn--accent" data-action="salvar">Adicionar</button>
      </div>
    </form>`;
}

/**
 * Formulário de criação/edição. Na edição, sistema e versão-alvo aparecem
 * só para leitura: são a meta, e o servidor recusaria mudar.
 * O público ("todos" ou "escolhidos") pode mudar nas duas situações; a lista
 * de clientes a escolher é preenchida pela view (depende do sistema).
 * @param {{sistemas: Array<{nome: string, data?: string}>, cidades: string[], campanha?: any}} opts
 */
export function formularioCampanha({ sistemas, cidades = [], campanha }) {
  const edicao = Boolean(campanha);
  const escolhidos = campanha?.publico === "escolhidos";
  const opcoesCidade = campanha?.cidade && !cidades.includes(campanha.cidade) ? [...cidades, campanha.cidade] : cidades;
  return html`
    <h3 class="modal-box__title" id="campanha-form-titulo">${edicao ? "Editar campanha" : "Nova campanha"}</h3>
    <form class="campanha-form" data-role="form" novalidate>
      <div class="form-grid form-grid--2">
        <div class="field">
          <label class="field__label" for="cmp-sistema">Sistema</label>
          ${edicao
            ? html`<input class="input" id="cmp-sistema" value="${campanha.sistema}" disabled />`
            : html`<select class="input" id="cmp-sistema" data-field="sistema" required>
                ${sistemas.map((s) => html`<option value="${s.nome}" data-oficial="${s.data || ""}">${s.nome}</option>`)}
              </select>`}
        </div>
        <div class="field">
          <label class="field__label" for="cmp-versao">Versão-alvo</label>
          <input class="input" id="cmp-versao" data-field="versaoAlvo" placeholder="dd/mm/aaaa" inputmode="numeric" value="${campanha?.versaoAlvo || ""}" ${edicao ? html`disabled` : html`required`} aria-describedby="cmp-versao-ajuda" />
          <div class="field__help" id="cmp-versao-ajuda">${edicao ? "A meta não muda depois de criada." : "Quem for atualizado nesta data ou depois conta como atualizado."}</div>
        </div>
        <div class="field">
          <label class="field__label" for="cmp-titulo">Título</label>
          <input class="input" id="cmp-titulo" data-field="titulo" maxlength="120" value="${campanha?.titulo || ""}" required placeholder="ex.: NT 2026.001 da SEFAZ" />
        </div>
        <div class="field">
          <label class="field__label" for="cmp-prazo">Prazo (opcional)</label>
          <input class="input" id="cmp-prazo" data-field="prazo" placeholder="dd/mm/aaaa" inputmode="numeric" value="${campanha?.prazo || ""}" />
        </div>
        <div class="field" data-role="campo-cidade" ${escolhidos ? html`hidden` : ""}>
          <label class="field__label" for="cmp-cidade">Cidade</label>
          <select class="input" id="cmp-cidade" data-field="cidade">
            <option value="">Todas as cidades</option>
            ${opcoesCidade.map((cidade) => html`<option value="${cidade}" ${campanha?.cidade === cidade ? html`selected` : ""}>${cidade}</option>`)}
          </select>
        </div>
      </div>
      <fieldset class="field campanha-form__publico">
        <legend class="field__label">Quem entra na campanha</legend>
        <label class="checkbox-item"><input type="radio" name="publico" value="todos" ${escolhidos ? "" : html`checked`} /> Todos os clientes do sistema</label>
        <label class="checkbox-item"><input type="radio" name="publico" value="escolhidos" ${escolhidos ? html`checked` : ""} /> Só clientes escolhidos</label>
      </fieldset>
      ${blocoEscolhaClientes({ oculto: !escolhidos })}
      <div class="field">
        <label class="field__label" for="cmp-descricao">Descrição (opcional)</label>
        <textarea class="input" id="cmp-descricao" data-field="descricao" rows="3" maxlength="1000">${campanha?.descricao || ""}</textarea>
      </div>
      <p class="field__hint" data-role="erro" role="alert"></p>
      <div class="modal-box__actions">
        <button type="button" class="btn" data-action="cancelar">Cancelar</button>
        <button type="submit" class="btn btn--accent" data-action="salvar">${edicao ? "Salvar" : "Criar campanha"}</button>
      </div>
    </form>`;
}

/** "3 clientes" para o contador da tabela. */
export function contagemClientes(n) {
  return plural(n, "cliente");
}
