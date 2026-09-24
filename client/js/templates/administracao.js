import { html, confiavel } from "../utils/html.js";
import { iconHtml } from "../utils/icons.js";
import { formatarBytes, formatarDataHora, tempoRelativo } from "../utils/date.js";
import { rotuloPapel, descricaoPapel } from "../domain/pessoa.js";
import { formatarTempoAtivo, papelNormalizado } from "../domain/administracao.js";

/**
 * Marcação da tela Administração. As abas antigas eram cinco modais, cada um
 * com um desenho próprio (títulos de tamanhos diferentes, `style=""` espalhado,
 * um ícone de 200px na Saúde). Aqui todas usam as mesmas peças: cabeçalho de
 * seção (templates/secao.js, o mesmo das Configurações), cartão, linha de
 * regra (a mesma `.cfg-group` das Configurações) e tabela.
 */

/**
 * Uma regra numérica, no mesmo formato de linha do painel de preferências:
 * o que é e para que serve à esquerda, o controle à direita.
 * @param {{nome: string, titulo: string, ajuda: string, unidade: string, valor: number, min?: number, max?: number}} r
 */
export function linhaRegraNumero({ nome, titulo, ajuda, unidade, valor, min, max }) {
  return html`
    <div class="cfg-group">
      <div class="cfg-group__labels">
        <label class="cfg-group__title" for="regra-${nome}">${titulo}</label>
        <span class="cfg-group__help">${ajuda}</span>
      </div>
      <div class="input-unidade">
        <input type="number" class="input" id="regra-${nome}" data-regra="${nome}" value="${valor}"
               min="${min}" max="${max}" step="1" inputmode="numeric" required />
        <span>${unidade}</span>
      </div>
    </div>`;
}

/** Barra de salvar de um formulário de regras. Começa desligada: nada mudou ainda. */
export function rodapeFormulario() {
  return html`
    <footer class="admin-form__rodape">
      <span class="admin-form__estado" data-role="estado" aria-live="polite"></span>
      <button type="button" class="btn btn--ghost" data-action="desfazer" disabled>Desfazer</button>
      <button type="submit" class="btn btn--accent" data-action="salvar" disabled>Salvar</button>
    </footer>`;
}

const PAPEIS = ["admin", "operador", "consulta"].map((valor) => ({ valor, descricao: descricaoPapel(valor) }));

/** O que cada papel pode -- a pergunta que se faz ANTES de escolher um. */
export function legendaPapeis() {
  return html`
    <dl class="admin-papeis">
      ${PAPEIS.map((p) => html`<div><dt>${rotuloPapel(p.valor)}</dt><dd>${p.descricao}</dd></div>`)}
    </dl>`;
}

/**
 * Conteúdo de uma `<tr>` da tabela de usuários.
 * @param {{id: number, nome: string, usuario: string, role?: string, ultimo_login?: string|null}} u
 * @param {{ehVoce: boolean}} opcoes quem está logado não muda o próprio papel nem se remove por aqui
 */
export function linhaUsuario(u, { ehVoce }) {
  const papel = papelNormalizado(u.role);
  const acesso = u.ultimo_login
    ? html`<span title="${formatarDataHora(u.ultimo_login)}">${tempoRelativo(u.ultimo_login)}</span>`
    : html`<span class="text-muted">Nunca entrou</span>`;
  return html`
    <td data-label="Pessoa">
      <div class="admin-pessoa">
        <span><strong>${u.nome}</strong>${ehVoce && html` <span class="text-muted">(você)</span>`}</span>
        <span class="text-muted">@${u.usuario}</span>
      </div>
    </td>
    <td data-label="Papel">${
      ehVoce
        ? html`<span class="badge badge--accent">${rotuloPapel(papel)}</span>`
        : html`<select class="input admin-papel" data-action="papel" data-id="${u.id}" aria-label="Papel de ${u.nome}">
            ${PAPEIS.map((p) => html`<option value="${p.valor}" ${p.valor === papel && confiavel("selected")}>${rotuloPapel(p.valor)}</option>`)}
          </select>`
    }</td>
    <td data-label="Último acesso">${acesso}</td>
    <td data-label="" class="admin-tabela__acoes">${
      !ehVoce &&
      html`<button type="button" class="btn btn--small btn--danger" data-action="remover" data-id="${u.id}">Remover acesso</button>`
    }</td>`;
}

/**
 * Conteúdo de uma `<tr>` da tabela de backups.
 * @param {{arquivo: string, label: string, tamanhoBytes?: number, integro?: boolean}} b
 */
export function linhaBackup(b) {
  return html`
    <td data-label="Cópia"><strong>${b.label}</strong></td>
    <td data-label="Tamanho">${b.tamanhoBytes ? formatarBytes(b.tamanhoBytes) : "—"}</td>
    <td data-label="Verificação">${
      b.integro === false
        ? html`<span class="badge badge--danger" title="Falhou na verificação de integridade logo após ser criada.">Corrompida</span>`
        : html`<span class="badge badge--success">Íntegra</span>`
    }</td>
    <td data-label="" class="admin-tabela__acoes">
      <a class="btn btn--small btn--ghost" href="/api/backups/${encodeURIComponent(b.arquivo)}/download" download="${b.arquivo}">
        ${iconHtml("download")} Baixar
      </a>
      <button type="button" class="btn btn--small btn--danger" data-action="restaurar" data-arquivo="${b.arquivo}"
              ${b.integro === false && confiavel('disabled title="Cópia corrompida não pode ser restaurada."')}>Restaurar</button>
    </td>`;
}

/**
 * Os quatro blocos da Saúde. Com o Atualizador desligado, o bloco de agentes
 * diz isso em vez de mostrar "0 agentes, sem incidentes" -- que parecia uma
 * boa notícia e era só a ausência do recurso.
 * @param {any} dados resposta de /api/saude
 * @param {{atualizadorHabilitado: boolean}} opcoes
 */
export function blocosSaude(dados, { atualizadorHabilitado }) {
  const bancoOk = dados.banco?.integridade === "ok";
  const agentes = dados.agentes || {};
  return html`
    <div class="admin-saude">
      ${blocoSaude({
        icone: "tabela",
        titulo: "Banco de dados",
        selo: bancoOk ? ["Íntegro", "success"] : ["Falha de integridade", "danger"],
        linhas: [
          ["Arquivo", dados.banco?.caminho],
          ["Tamanho", formatarBytes(dados.banco?.tamanhoBytes)],
          ["Modo de gravação", String(dados.banco?.journalMode || "—").toUpperCase()],
        ],
      })}
      ${blocoSaude({
        icone: "painel",
        titulo: "Servidor",
        selo: [`v${dados.servidor?.versao ?? "?"}`, "muted"],
        linhas: [
          ["Node", `${dados.servidor?.node ?? "?"} · ${dados.servidor?.plataforma ?? "?"}`],
          ["No ar há", formatarTempoAtivo(dados.servidor?.uptimeSegundos)],
          ["Memória", `${dados.servidor?.memoriaHeapUsadaMB ?? "?"} MB de ${dados.servidor?.memoriaHeapTotalMB ?? "?"} MB`],
        ],
      })}
      ${blocoSaude({
        icone: "backups",
        titulo: "Backups",
        selo: dados.backups?.total ? [`${dados.backups.total} cópias`, "muted"] : ["Nenhuma cópia", "warning"],
        linhas: [["Última cópia", dados.backups?.ultimo ? formatarDataHora(dados.backups.ultimo) : "Nenhuma ainda"]],
      })}
      ${
        atualizadorHabilitado
          ? blocoSaude({
              icone: "distribuicao",
              titulo: "Agentes e pacotes",
              selo: agentes.erro > 0 ? [`${agentes.erro} com erro`, "danger"] : ["Sem incidentes", "success"],
              linhas: [
                ["Agentes", `${agentes.total ?? 0} (${agentes.ok ?? 0} em dia · ${agentes.offline ?? 0} sem contato)`],
                ["Pacotes em disco", pacotes(dados.pacotes)],
              ],
            })
          : blocoSaude({
              icone: "distribuicao",
              titulo: "Agentes e pacotes",
              selo: ["Desligado", "muted"],
              linhas: [["Pacotes em disco", pacotes(dados.pacotes)]],
            })
      }
    </div>`;
}

/** "3 (120 MB)", ou "Nenhum" -- "0 (—)" parecia dado faltando, não pasta vazia. */
function pacotes(p) {
  return p?.total ? `${p.total} (${formatarBytes(p.tamanhoBytes)})` : "Nenhum";
}

/**
 * @param {{icone: Parameters<typeof iconHtml>[0], titulo: string, selo: [string, string], linhas: Array<[string, unknown]>}} b
 */
function blocoSaude({ icone, titulo, selo, linhas }) {
  return html`
    <section class="admin-saude__bloco">
      <header>
        <span class="admin-saude__icone">${iconHtml(icone)}</span>
        <h3>${titulo}</h3>
        <span class="badge badge--${selo[1]}">${selo[0]}</span>
      </header>
      <dl>
        ${linhas.map(([rotulo, valor]) => html`<div><dt>${rotulo}</dt><dd>${valor ?? "—"}</dd></div>`)}
      </dl>
    </section>`;
}
