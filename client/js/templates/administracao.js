import { html, confiavel } from "../utils/html.js";
import { iconeHtml } from "../utils/icones.js";
import { formatarBytes, formatarDataHora, tempoRelativo } from "../utils/data.js";
import { iniciais, rotuloPapel, descricaoPapel } from "../domain/pessoa.js";
import { formatarTempoAtivo, papelNormalizado, descreverChaveAgentes, descreverTransporte } from "../domain/administracao.js";

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
export function rodapeFormulario(rotuloSalvar = "Salvar") {
  return html`
    <footer class="admin-form__rodape">
      <span class="admin-form__estado" data-role="estado" aria-live="polite"></span>
      <button type="button" class="btn" data-action="desfazer" disabled>Desfazer</button>
      <button type="submit" class="btn btn--accent" data-action="salvar" disabled>${rotuloSalvar}</button>
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
        ? html`<span class="admin-papel admin-papel--leitura" aria-describedby="papel-proprio-${u.id}">${rotuloPapel(papel)}</span>
            <small class="admin-papel__ajuda" id="papel-proprio-${u.id}">Seu papel não pode ser alterado aqui.</small>`
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

/** Até quantos nomes a conferência mostra antes de "e mais N". */
const NOMES_NA_CONFERENCIA = 8;

/**
 * As duas linhas da conferência de cadastros, cada uma com a conta, os
 * primeiros nomes e o atalho para onde se corrige.
 * @param {{clientesSemSistema: Array<{nome: string}>, sistemasSemReferencia: string[]}} dados
 */
export function conferenciaCadastros({ clientesSemSistema, sistemasSemReferencia }) {
  const linha = ({ titulo, vazio, ajuda, nomes, botao }) => html`
    <div class="cfg-group admin-conferencia">
      <div class="cfg-group__labels">
        <span class="cfg-group__title">${titulo}
          <span class="badge ${nomes.length ? "badge--warning" : "badge--success"}">${nomes.length || "Nenhum"}</span></span>
        <span class="cfg-group__help">${nomes.length ? ajuda : vazio}</span>
        ${
          nomes.length > 0 &&
          html`<span class="admin-conferencia__nomes">${nomes.slice(0, NOMES_NA_CONFERENCIA).join(", ")}${
            nomes.length > NOMES_NA_CONFERENCIA ? ` e mais ${nomes.length - NOMES_NA_CONFERENCIA}` : ""
          }</span>`
        }
      </div>
      ${nomes.length > 0 && botao}
    </div>`;
  return html`
    ${linha({
      titulo: "Clientes sem nenhum sistema",
      vazio: "Todo cliente tem ao menos um sistema marcado.",
      ajuda: "Ficam fora da situação de versão e do Resumo. Marque os sistemas no cadastro do cliente.",
      nomes: clientesSemSistema.map((c) => c.nome),
      botao: html`<button type="button" class="btn btn--small" data-ir="clientes">${iconeHtml("clientes")} Abrir Clientes</button>`,
    })}
    ${linha({
      titulo: "Sistemas atualizáveis sem versão oficial",
      vazio: "Todo sistema atualizável tem versão oficial cadastrada.",
      ajuda: "Aparecem como \"Sem versão oficial\" e não contam contra ninguém. Cadastre a versão em Sistemas › Versões oficiais, ou marque como Fixo.",
      nomes: sistemasSemReferencia,
      botao: html`<button type="button" class="btn btn--small" data-ir="sistemas">${iconeHtml("sistemas")} Abrir Sistemas</button>`,
    })}`;
}

/**
 * Conteúdo de uma `<tr>` da tabela de backups.
 * @param {{arquivo: string, label: string, data?: string|null, tamanhoBytes?: number, integro?: boolean|null}} b
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
        : b.integro === true
          ? html`<span class="badge badge--success">Íntegra</span>`
          : html`<span class="badge badge--neutral">Não verificada</span>`
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
 * atenção (cada item leva à aba onde se resolve), o resumo do que foi
 * conferido e a hora da conferência -- sem ela, "Conferir de novo" não dava
 * sinal de ter feito alguma coisa.
 * @param {ReturnType<typeof import("../domain/administracao.js").situacaoDiagnostico>} situacao
 * @param {Date} conferidoEm
 * @param {{verificacoes?: ReturnType<typeof import("../domain/administracao.js").verificacoesDiagnostico>, verificacaoMs?: number|null}} [opcoes]
 */
export function resumoDiagnostico(situacao, conferidoEm, { verificacoes = [], verificacaoMs = null } = {}) {
  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(conferidoEm);
  const ABAS = { backups: "Backups", integracoes: "Integrações" };
  const subtitulo =
    situacao.pendencias.length === 0
      ? "Nenhuma pendência operacional encontrada na última verificação."
      : situacao.tom === "perigo"
        ? "Há itens críticos que exigem atenção imediata."
        : "Revise os pontos destacados abaixo para manter o ambiente protegido.";
  return html`
    <section class="admin-diagnostico is-${situacao.tom}" role="status">
      <div class="admin-diagnostico__cabeca">
        <span class="admin-diagnostico__icone" aria-hidden="true">${iconeHtml(situacao.tom === "ok" ? "check" : "alerta")}</span>
        <div class="admin-diagnostico__titulos">
          <strong>${situacao.titulo}</strong>
          <span class="admin-diagnostico__sub">${subtitulo}</span>
        </div>
        <span class="admin-diagnostico__hora">Conferido às ${hora}${Number.isFinite(verificacaoMs) ? ` · ${verificacaoMs} ms` : ""}</span>
      </div>
      ${
        situacao.pendencias.length > 0 &&
        html`<ul class="admin-diagnostico__lista" role="list">
          ${situacao.pendencias.map(
            (p) => html`<li class="is-${p.tom}">
              <span>${p.texto}</span>
              <button type="button" class="btn btn--small btn--ghost" data-ir-aba="${p.aba}">Abrir ${ABAS[p.aba] || p.aba} ${iconeHtml("seta")}</button>
            </li>`
          )}
        </ul>`
      }
      ${
        verificacoes.length > 0 &&
        html`<ul class="admin-diagnostico__checks" role="list">
          ${verificacoes.map(
            (v) => html`<li class="admin-diagnostico__check is-${v.tom}">
              <span class="admin-diagnostico__ponto" aria-hidden="true"></span>
              <span class="admin-diagnostico__check-rotulo">${v.rotulo}</span>
              <strong class="admin-diagnostico__check-valor">${v.detalhe}</strong>
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
 * Os quatro blocos da Saúde em grade de 2 colunas. Com o Atualizador desligado,
 * o bloco de integrações e agentes diz isso em vez de mostrar "0 agentes, sem
 * incidentes" -- que parecia uma boa notícia e era só a ausência do recurso.
 * @param {any} dados resposta de /api/saude
 * @param {{atualizadorHabilitado: boolean, chaveAgentes?: {situacao: "ausente"|"exemplo"|"configurada", final?: string}|null}} opcoes
 */
export function blocosSaude(dados, { atualizadorHabilitado, chaveAgentes = null }) {
  const banco = dados.banco || {};
  const srv = dados.servidor || {};
  const bk = dados.backups || {};
  const agentes = dados.agentes || {};
  const integracoes = dados.integracoes || {};

  const bancoOk = banco.integridade === "ok";
  const tamanhoBanco = banco.walBytes > 0
    ? `${formatarBytes(banco.tamanhoBytes)} · WAL ${formatarBytes(banco.walBytes)}`
    : formatarBytes(banco.tamanhoBytes);
  const reg = banco.registros;
  const numero = new Intl.NumberFormat("pt-BR");
  const volume = reg
    ? html`<div class="admin-saude__volume">
        <span class="admin-saude__subtitulo">Volume da base</span>
        <ul class="admin-saude__contadores" role="list">
          ${[
            ["Clientes", reg.clientes],
            ["Atualizações", reg.atualizacoes],
            ["Agendamentos", reg.agendamentosAtivos],
            ["Campanhas", reg.campanhasAtivas],
            ["Contas", reg.usuarios],
          ].map(([rotulo, qtd]) => html`<li><strong>${numero.format(Number(qtd || 0))}</strong><span>${rotulo}</span></li>`)}
        </ul>
      </div>`
    : null;

  /** @type {Array<[string, unknown]>} */
  const linhasBanco = [
    ["Arquivo", html`<span class="admin-saude__mono">${banco.caminho ?? "—"}</span>`],
    ["Tamanho", tamanhoBanco],
    ...(banco.sessoesBytes > 0 ? [/** @type {[string, unknown]} */ (["Sessões em disco", formatarBytes(banco.sessoesBytes)])] : []),
    ["Modo de gravação", String(banco.journalMode || "—").toUpperCase()],
    ...(banco.versaoEsquema != null ? [/** @type {[string, unknown]} */ (["Versão do esquema", `v${banco.versaoEsquema}`])] : []),
    ...(Number.isFinite(banco.verificacaoMs) ? [/** @type {[string, unknown]} */ (["Verificação", `${bancoOk ? "OK" : "Falha"} (${banco.verificacaoMs} ms)`])] : []),
  ];

  const memoriaTexto = srv.memoriaRssMB != null
    ? `${srv.memoriaRssMB} MB no processo (heap ${srv.memoriaHeapUsadaMB ?? "?"} MB)`
    : `${srv.memoriaHeapUsadaMB ?? "?"} MB de ${srv.memoriaHeapTotalMB ?? "?"} MB`;
  /** @type {Array<[string, unknown]>} */
  const linhasServidor = [
    ["Node", `${srv.node ?? "?"} · ${srv.plataforma ?? "?"}`],
    ["No ar há", formatarTempoAtivo(srv.uptimeSegundos)],
    ...(srv.iniciadoEm ? [/** @type {[string, unknown]} */ (["Iniciado em", formatarDataHora(srv.iniciadoEm)])] : []),
    ["Memória", memoriaTexto],
    ...(srv.transporte ? [/** @type {[string, unknown]} */ (["Conexão", descreverTransporte(srv.transporte).texto])] : []),
    ...(srv.sessoesAtivas != null
      ? [/** @type {[string, unknown]} */ ([
          "Sessões abertas",
          srv.sessoesAtivas === 0 ? "Nenhuma" : srv.sessoesAtivas === 1 ? "1 sessão ativa" : `${srv.sessoesAtivas} sessões ativas`,
        ])]
      : []),
  ];

  const totalBackups = bk.total ?? 0;
  const corrompidos = bk.corrompidos ?? 0;
  const retencao = bk.retencao ?? null;
  /** @type {[string, string]} */
  const seloBackups = totalBackups === 0
    ? ["Nenhuma cópia", "warning"]
    : corrompidos > 0
      ? [corrompidos === 1 ? "1 corrompida" : `${corrompidos} corrompidas`, "danger"]
      : retencao
        ? [`${totalBackups} de ${retencao}`, "success"]
        : [`${totalBackups} ${totalBackups === 1 ? "cópia" : "cópias"}`, "muted"];
  /** @type {Array<[string, unknown]>} */
  const linhasBackups = [
    ["Última cópia", bk.ultimo ? formatarDataHora(bk.ultimo) : "Nenhuma ainda"],
    ...(bk.ultimo ? [/** @type {[string, unknown]} */ (["Feita", tempoRelativo(bk.ultimo)])] : []),
    ...(totalBackups > 0 && bk.ultimoIntegro !== undefined
      ? [/** @type {[string, unknown]} */ ([
          "Integridade",
          bk.ultimoIntegro === true
            ? html`<span class="badge badge--success">Íntegra</span>`
            : bk.ultimoIntegro === false
              ? html`<span class="badge badge--danger">Corrompida</span>`
              : html`<span class="badge badge--muted">Não verificada</span>`,
        ])]
      : []),
    ...(bk.tamanhoTotalBytes > 0 ? [/** @type {[string, unknown]} */ (["Espaço em disco", formatarBytes(bk.tamanhoTotalBytes)])] : []),
  ];
  const medidorRetencao = retencao
    ? html`<div class="admin-saude__medidor">
        <div class="admin-saude__medidor-topo">
          <span>Retenção configurada</span>
          <strong>${totalBackups} de ${retencao} ${retencao === 1 ? "cópia" : "cópias"}</strong>
        </div>
        <progress class="admin-saude__progresso${totalBackups === 0 || corrompidos > 0 ? " is-alerta" : ""}"
                  value="${Math.min(totalBackups, retencao)}" max="${retencao}"
                  aria-label="Retenção de backups: ${totalBackups} de ${retencao} cópias"></progress>
      </div>`
    : null;

  const discord = integracoes.discordConfigurado;
  /** @type {Array<[string, unknown]>} */
  const linhasIntegracoes = [
    ...(discord !== null && discord !== undefined
      ? [/** @type {[string, unknown]} */ (["Alertas no Discord", discord ? "Configurado" : "Não configurado"])]
      : []),
    ["Atualizador automático", atualizadorHabilitado ? "Ligado" : "Desligado"],
    ...(atualizadorHabilitado
      ? [
          /** @type {[string, unknown]} */ (["Agentes", `${agentes.total ?? 0} (${agentes.ok ?? 0} em dia · ${agentes.offline ?? 0} sem contato)`]),
          ...(chaveAgentes ? [/** @type {[string, unknown]} */ (["Chave dos agentes", descreverChaveAgentes(chaveAgentes).texto])] : []),
        ]
      : []),
    ["Pacotes em disco", pacotes(dados.pacotes)],
  ];
  /** @type {[string, string]} */
  const seloIntegracoes = !atualizadorHabilitado
    ? ["Desligado", "muted"]
    : agentes.erro > 0
      ? [`${agentes.erro} com erro`, "danger"]
      : agentes.offline > 0
        ? [`${agentes.offline} sem contato`, "warning"]
        : ["Sem falhas reportadas", "success"];

  return html`
    <div class="admin-saude-wrap">
      <div class="admin-saude">
        ${blocoSaude({
          icone: "tabela",
          titulo: "Banco de dados",
          selo: bancoOk ? ["Íntegro", "success"] : ["Falha de integridade", "danger"],
          linhas: linhasBanco,
          complemento: volume,
          rodape: html`
            <a class="btn btn--small btn--ghost" href="/api/backups/atual/download" download>${iconeHtml("download")} Baixar banco</a>
            <button type="button" class="btn btn--small btn--ghost" data-ir-aba="dados">Abrir Dados ${iconeHtml("seta")}</button>`,
        })}
        ${blocoSaude({
          icone: "painel",
          titulo: "Servidor",
          selo: [`v${srv.versao ?? "?"}`, "muted"],
          linhas: linhasServidor,
          rodape: html`
            <button type="button" class="btn btn--small btn--ghost" data-ir-aba="pessoas">Pessoas e sessões ${iconeHtml("seta")}</button>
            <button type="button" class="btn btn--small btn--ghost" data-ir-aba="auditoria">Ver Auditoria ${iconeHtml("seta")}</button>`,
        })}
        ${blocoSaude({
          icone: "backups",
          titulo: "Backups",
          selo: seloBackups,
          linhas: linhasBackups,
          complemento: medidorRetencao,
          rodape: html`
            <button type="button" class="btn btn--small" data-action="fazer-copia">${iconeHtml("backups")} Fazer cópia agora</button>
            <button type="button" class="btn btn--small btn--ghost" data-ir-aba="backups">Gerenciar backups ${iconeHtml("seta")}</button>`,
        })}
        ${blocoSaude({
          icone: "distribuicao",
          titulo: "Integrações e agentes",
          selo: seloIntegracoes,
          linhas: linhasIntegracoes,
          complemento: !atualizadorHabilitado
            ? html`<p class="admin-saude__nota">O atualizador automático está desativado. Os alertas no Discord e as demais rotinas do painel funcionam normalmente.</p>`
            : null,
          rodape: html`<button type="button" class="btn btn--small btn--ghost" data-ir-aba="integracoes">Abrir Integrações ${iconeHtml("seta")}</button>`,
        })}
      </div>
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
 * @param {{icone: Parameters<typeof iconeHtml>[0], titulo: string, selo: [string, string], linhas: Array<[string, unknown]>, complemento?: unknown, rodape?: unknown}} b
 */
function blocoSaude({ icone, titulo, selo, linhas, complemento = null, rodape = null }) {
  return html`
    <section class="admin-saude__bloco">
      <header>
        <span class="admin-saude__icone" aria-hidden="true">${iconeHtml(icone)}</span>
        <h3>${titulo}</h3>
        <span class="badge badge--${selo[1]}">${selo[0]}</span>
      </header>
      <dl>
        ${linhas.map(([rotulo, valor]) => html`<div><dt>${rotulo}</dt><dd>${valor ?? "—"}</dd></div>`)}
      </dl>
      ${complemento}
      ${rodape && html`<footer class="admin-saude__rodape">${rodape}</footer>`}
    </section>`;
}
