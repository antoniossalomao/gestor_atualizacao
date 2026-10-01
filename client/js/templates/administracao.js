import { html, confiavel } from "../utils/html.js";
import { iconeHtml } from "../utils/icones.js";
import { formatarBytes, formatarDataHora, tempoRelativo } from "../utils/data.js";
import { iniciais, rotuloPapel, descricaoPapel } from "../domain/pessoa.js";
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
      <button type="button" class="btn" data-action="desfazer" disabled>Desfazer</button>
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
 * A fileira de contagem em cima da tabela de pessoas ("2 Administradores ·
 * 5 Operadores"). Com uma equipe de quinze, "quantos admins existem?" é a
 * pergunta que se faz antes de tirar o papel de alguém.
 * @param {{admin: number, operador: number, consulta: number}} contagem
 */
export function resumoPapeis(contagem) {
  const total = contagem.admin + contagem.operador + contagem.consulta;
  return html`
    <div class="admin-resumo-papeis">
      <span class="admin-resumo-papeis__total"><strong>${total}</strong> ${total === 1 ? "conta" : "contas"}</span>
      ${["admin", "operador", "consulta"].map(
        (p) => html`<span class="admin-resumo-papeis__item"><span class="admin-pessoa__avatar admin-pessoa__avatar--${p} admin-pessoa__avatar--ponto" aria-hidden="true"></span>${rotuloPapel(p)} <strong>${contagem[p]}</strong></span>`
      )}
    </div>`;
}

/**
 * Conteúdo de uma `<tr>` da tabela de usuários.
 * @param {{id: number, nome: string, usuario: string, role?: string, ultimo_login?: string|null, sessoes?: number}} u
 * @param {{ehVoce: boolean}} opcoes quem está logado não muda o próprio papel nem se remove por aqui
 */
export function linhaUsuario(u, { ehVoce }) {
  const papel = papelNormalizado(u.role);
  const acesso = u.ultimo_login
    ? html`<span title="${formatarDataHora(u.ultimo_login)}">${primeiraMaiuscula(tempoRelativo(u.ultimo_login))}</span>`
    : html`<span class="text-muted">Nunca entrou</span>`;
  return html`
    <td data-label="Pessoa">
      <div class="admin-pessoa">
        <span class="admin-pessoa__avatar admin-pessoa__avatar--${papel}" aria-hidden="true">${iniciais(u.nome || u.usuario)}</span>
        <div class="admin-pessoa__texto">
          <span><strong>${u.nome}</strong>${ehVoce && html` <span class="text-muted">(você)</span>`}</span>
          <span class="text-muted">@${u.usuario}</span>
        </div>
      </div>
    </td>
    <td data-label="Papel">${
      ehVoce
        ? html`<span class="badge badge--accent">${rotuloPapel(papel)}</span>`
        : html`<select class="input admin-papel" data-action="papel" data-id="${u.id}" aria-label="Papel de ${u.nome}">
            ${PAPEIS.map((p) => html`<option value="${p.valor}" ${p.valor === papel && confiavel("selected")}>${rotuloPapel(p.valor)}</option>`)}
          </select>`
    }</td>
    <td data-label="Último acesso">
      <div class="admin-pessoa__texto">
        ${acesso}
        ${(u.sessoes ?? 0) > 0 && html`<span class="text-muted">${u.sessoes === 1 ? "1 sessão aberta" : `${u.sessoes} sessões abertas`}</span>`}
      </div>
    </td>
    <td data-label="" class="admin-tabela__acoes">${
      !ehVoce &&
      html`<button type="button" class="btn btn--small" data-action="gerenciar" data-id="${u.id}" aria-label="Gerenciar a conta de ${u.nome}">
        ${iconeHtml("editar")} Gerenciar</button>`
    }</td>`;
}

/**
 * O que vai dentro da gaveta "Gerenciar conta" de outra pessoa. Uma gaveta, e
 * não quatro botões na linha: nome, senha, sessões e remoção são raros, e
 * quatro botões em cada uma de quinze linhas viravam uma parede de ações.
 * A remoção fica por último e separada: é a única que não se desfaz.
 */
export function gavetaConta() {
  return html`
    <div class="admin-conta">
      <form class="admin-conta__bloco" data-role="form-nome" novalidate>
        <h3>Nome</h3>
        <div class="admin-campo-acao">
          <input type="text" class="input" id="conta-nome" name="conta-nome" data-campo="nome" maxlength="80" autocomplete="off" aria-label="Nome da pessoa" />
          <button type="submit" class="btn btn--accent" data-action="salvar-nome" disabled>Salvar</button>
        </div>
        <p class="field__help">Aparece no menu, no Histórico e como responsável nos registros novos.</p>
      </form>

      <form class="admin-conta__bloco" data-role="form-senha" novalidate>
        <h3>Redefinir a senha</h3>
        <p class="field__help">Para quem esqueceu a sua. A pessoa é desconectada de todos os aparelhos e entra com a senha nova.</p>
        <div class="admin-conta__campos">
          <div class="field">
            <label class="field__label" for="conta-senha">Senha nova</label>
            <input type="password" class="input" id="conta-senha" name="conta-senha" data-campo="senha" autocomplete="new-password" />
          </div>
          <div class="field">
            <label class="field__label" for="conta-senha2">Repita</label>
            <input type="password" class="input" id="conta-senha2" name="conta-senha2" data-campo="senha2" autocomplete="new-password" />
          </div>
        </div>
        <p class="admin-form__estado admin-conta__aviso" data-role="aviso-senha" aria-live="polite"></p>
        <button type="submit" class="btn" data-action="redefinir-senha" disabled>Redefinir senha</button>
      </form>

      <section class="admin-conta__bloco">
        <h3>Sessões abertas</h3>
        <p class="field__help" data-role="texto-sessoes"></p>
        <button type="button" class="btn" data-action="encerrar-sessoes">Encerrar todas</button>
      </section>

      <section class="admin-conta__bloco admin-conta__bloco--perigo">
        <h3>Remover acesso</h3>
        <p class="field__help">A pessoa deixa de entrar e é desconectada na hora. O que ela fez continua no Histórico.</p>
        <button type="button" class="btn btn--danger" data-action="remover">Remover acesso</button>
      </section>
    </div>`;
}

/**
 * Conteúdo de uma `<tr>` da tabela de backups.
 * @param {{arquivo: string, label: string, data?: string|null, tamanhoBytes?: number, integro?: boolean}} b
 */
export function linhaBackup(b) {
  return html`
    <td data-label="Cópia">
      <div class="admin-pessoa__texto">
        <strong>${b.label}</strong>
        ${b.data && html`<span class="text-muted">${primeiraMaiuscula(tempoRelativo(b.data))}</span>`}
      </div>
    </td>
    <td data-label="Tamanho">${b.tamanhoBytes ? formatarBytes(b.tamanhoBytes) : "—"}</td>
    <td data-label="Verificação">${
      b.integro === false
        ? html`<span class="badge badge--danger" title="Falhou na verificação de integridade logo após ser criada.">Corrompida</span>`
        : html`<span class="badge badge--success">Íntegra</span>`
    }</td>
    <td data-label="" class="admin-tabela__acoes">
      <a class="btn btn--small btn--ghost" href="/api/backups/${encodeURIComponent(b.arquivo)}/download" download="${b.arquivo}">
        ${iconeHtml("download")} Baixar
      </a>
      <button type="button" class="btn btn--small btn--danger" data-action="restaurar" data-arquivo="${b.arquivo}"
              ${b.integro === false && confiavel('disabled title="Cópia corrompida não pode ser restaurada."')}>Restaurar</button>
    </td>`;
}

/**
 * O topo do Diagnóstico: a frase que resume, a lista do que precisa de
 * atenção (cada item leva à aba onde se resolve) e a hora da conferência --
 * sem ela, "Conferir de novo" não dava sinal de ter feito alguma coisa.
 * @param {ReturnType<typeof import("../domain/administracao.js").situacaoDiagnostico>} situacao
 * @param {Date} conferidoEm
 */
export function resumoDiagnostico(situacao, conferidoEm) {
  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(conferidoEm);
  const ABAS = { backups: "Backups", integracoes: "Integrações" };
  return html`
    <section class="admin-diagnostico is-${situacao.tom}" role="status">
      <div class="admin-diagnostico__cabeca">
        <span class="admin-diagnostico__icone" aria-hidden="true">${iconeHtml(situacao.tom === "ok" ? "check" : "alerta")}</span>
        <strong>${situacao.titulo}</strong>
        <span class="admin-diagnostico__hora">Conferido às ${hora}</span>
      </div>
      ${
        situacao.pendencias.length > 0 &&
        html`<ul class="admin-diagnostico__lista">
          ${situacao.pendencias.map(
            (p) => html`<li class="is-${p.tom}">
              <span>${p.texto}</span>
              <button type="button" class="btn btn--small btn--ghost" data-ir-aba="${p.aba}">Abrir ${ABAS[p.aba] || p.aba} ${iconeHtml("seta")}</button>
            </li>`
          )}
        </ul>`
      }
    </section>`;
}

/**
 * A faixa em cima das abas da Administração quando algo precisa de atenção:
 * uma linha, com o que é e o atalho para a aba. Some quando não há nada (uma
 * faixa verde "Tudo certo" permanente vira papel de parede).
 * @param {ReturnType<typeof import("../domain/administracao.js").situacaoDiagnostico>} situacao
 */
export function faixaPendencias(situacao) {
  if (situacao.pendencias.length === 0) return html``;
  const ABAS = { backups: "Backups", integracoes: "Integrações" };
  return html`
    <div class="admin-faixa is-${situacao.tom}" role="status">
      <span class="admin-faixa__icone" aria-hidden="true">${iconeHtml("alerta")}</span>
      <strong>${situacao.titulo}</strong>
      <ul>
        ${situacao.pendencias.map(
          (p) => html`<li><button type="button" class="admin-faixa__item is-${p.tom}" data-ir-aba="${p.aba}"
            title="Abrir ${ABAS[p.aba] || p.aba}">${p.texto}</button></li>`
        )}
      </ul>
    </div>`;
}

/**
 * Aviso da chave dos agentes, em bloco e com o texto inteiro: num selo
 * arredondado, "Ainda é o valor de exemplo do .env.example..." quebrava em
 * três linhas espremidas na ponta direita da linha.
 * @param {{texto: string, tom: "ok"|"alerta"|"perigo"}} chave
 */
export function avisoChave(chave) {
  if (chave.tom === "ok") return html`<span class="badge badge--success">${chave.texto}</span>`;
  return html`<p class="admin-aviso admin-aviso--${chave.tom}" role="note">${iconeHtml("alerta")}<span>${chave.texto}</span></p>`;
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
        selo: dados.backups?.total ? [`${dados.backups.total} ${dados.backups.total === 1 ? "cópia" : "cópias"}`, "muted"] : ["Nenhuma cópia", "warning"],
        linhas: [
          ["Última cópia", dados.backups?.ultimo ? formatarDataHora(dados.backups.ultimo) : "Nenhuma ainda"],
          ...(dados.backups?.ultimo ? [/** @type {[string, unknown]} */ (["Feita", tempoRelativo(dados.backups.ultimo)])] : []),
        ],
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

/** "há 3 dias" -> "Há 3 dias", no começo de uma célula. */
function primeiraMaiuscula(texto) {
  return texto.replace(/^./, (letra) => letra.toLocaleUpperCase("pt-BR"));
}

/** "3 (120 MB)", ou "Nenhum" -- "0 (—)" parecia dado faltando, não pasta vazia. */
function pacotes(p) {
  return p?.total ? `${p.total} (${formatarBytes(p.tamanhoBytes)})` : "Nenhum";
}

/**
 * @param {{icone: Parameters<typeof iconeHtml>[0], titulo: string, selo: [string, string], linhas: Array<[string, unknown]>}} b
 */
function blocoSaude({ icone, titulo, selo, linhas }) {
  return html`
    <section class="admin-saude__bloco">
      <header>
        <span class="admin-saude__icone">${iconeHtml(icone)}</span>
        <h3>${titulo}</h3>
        <span class="badge badge--${selo[1]}">${selo[0]}</span>
      </header>
      <dl>
        ${linhas.map(([rotulo, valor]) => html`<div><dt>${rotulo}</dt><dd>${valor ?? "—"}</dd></div>`)}
      </dl>
    </section>`;
}
