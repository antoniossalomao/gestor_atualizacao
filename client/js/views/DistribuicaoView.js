import { View } from "../core/View.js";
import { icon } from "../core/icons.js";
import { toast } from "../core/Toast.js";
import { Modal } from "../core/Modal.js";
import { emptyState } from "../core/EmptyState.js";
import { escapeHtml, plural } from "../core/html.js";
import { formatarDataHora, tempoRelativo, formatarBytes, formatarDuracao } from "../core/date.js";
import { ApiError } from "../api/ApiClient.js";
import { notificacoes } from "../core/notify.js";
import { aparencia } from "../core/appearance.js";

/** Como cada situação de agente aparece na tela. */
const SITUACOES = {
  ok: { label: "Em dia", badge: "badge--success" },
  desatualizado: { label: "Desatualizado", badge: "badge--warning" },
  erro: { label: "Com erro", badge: "badge--danger" },
  offline: { label: "Sem contato", badge: "badge--muted" },
  pendente: { label: "Em andamento", badge: "badge--accent" },
};

/**
 * Painel de distribuição do atualizador automático.
 *
 * A tela foi refeita em cima de três problemas concretos:
 *
 * **1. Não dava para dizer de qual sistema era a versão.** O formulário tinha
 * "Versão" e "Arquivo", só isso -- e o backend guardava a versão sem sistema
 * nenhum, o que fazia o agente de qualquer sistema receber a última versão
 * publicada, qualquer que fosse ela. Agora o sistema é o PRIMEIRO campo, vem
 * do mesmo cadastro da aba Sistemas, e é obrigatório.
 *
 * **2. Não havia como tirar uma versão do ar.** Agora publicar uma versão
 * substitui automaticamente a anterior do mesmo sistema (só existe uma no ar
 * por sistema, sempre), e rascunhos/versões substituídas podem ser excluídas
 * de vez, com o pacote junto.
 *
 * **3. O acompanhamento era raso.** A tabela de agentes mostrava último
 * status, data e duas contagens -- que, pior, eram calculadas em cima dos 30
 * últimos registros que a listagem trazia, e não do total real. Não dava para
 * responder a pergunta central: "quais clientes ainda NÃO estão na versão que
 * publiquei?". Agora o backend agrega tudo (`/versoes/painel`) e a tela mostra
 * situação por agente, versão instalada contra versão alvo, tempo sem
 * contato, taxa de sucesso, máquina, duração da execução e filtros.
 */
export class DistribuicaoView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.sistemas = [];
    this.painel = null;
    this.filtroSituacao = "todos";
    this.filtroSistema = "";
    this.buscaAgente = "";
    this._timer = null;
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-spacer"></div>
        <button type="button" class="btn btn--small btn--ghost" data-action="refresh">${icon("atualizar")} Atualizar</button>
      </div>

      <div class="distribution-metrics" data-role="indicadores"></div>

      <div class="distribution-layout">
        <form class="card distribution-form" data-role="form">
          <div class="section-heading">
            <div><span class="dashboard-intro__eyebrow">Nova entrega</span><h2>Preparar versão</h2></div>
          </div>

          <div class="form-grid form-grid--2">
            <div class="field">
              <label class="field__label" for="dist-sistema">Sistema</label>
              <select class="input" id="dist-sistema" name="sistema" required data-role="sistema">
                <option value="">Selecione o sistema…</option>
              </select>
              <small class="field__help" data-role="ajuda-sistema">Vem do cadastro da aba Sistemas.</small>
            </div>
            <div class="field">
              <label class="field__label" for="dist-versao">Versão</label>
              <input class="input" id="dist-versao" name="versao" placeholder="2026.08.10" required
                     pattern="\\d+(\\.\\d+){1,3}([-.][0-9A-Za-z.-]+)?" />
              <div class="field__hint" data-role="hint-versao"></div>
            </div>
          </div>

          <div class="field">
            <label class="field__label" for="dist-pacote">Arquivo compactado</label>
            <input class="input distribution-file" id="dist-pacote" type="file" name="pacote" accept=".7z,.zip,.rar" required />
            <small class="field__help">O SHA-256 e a URL de download são gerados pela API a partir deste arquivo.</small>
          </div>

          <div class="field">
            <label class="field__label" for="dist-obs">Observações</label>
            <textarea class="input distribution-notes" id="dist-obs" name="observacoes"
                      placeholder="O que mudou nesta entrega..."></textarea>
          </div>

          <!-- Aviso do que vai acontecer ao publicar: aparece assim que um
               sistema é escolhido, dizendo qual versão sai do ar. -->
          <div class="upload-progress" data-role="progresso" hidden>
            <span class="upload-progress__track"><span class="upload-progress__fill"></span></span>
            <span data-role="progresso-texto">0%</span>
          </div>

          <button class="btn btn--accent" type="submit">${icon("upload")} Enviar versão</button>
        </form>

        <div class="distribution-side">
          <div class="card">
            <h2 class="card__title">No ar agora</h2>
            <div class="active-versions" data-role="ativas"></div>
          </div>
          <div class="card">
            <div class="section-heading">
              <h2 class="card__title">Últimos retornos</h2>
              <span class="result-count" data-role="logs-count"></span>
            </div>
            <div class="agent-log-list" data-role="logs"></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="section-heading">
          <div><span class="dashboard-intro__eyebrow">Acompanhamento por cliente</span><h2 class="card__title">Situação dos agentes</h2></div>
          <span class="result-count" data-role="agentes-count"></span>
        </div>
        <div class="toolbar">
          <div class="field">
            <label class="field__label" for="dist-busca">Buscar</label>
            <input type="search" class="input" id="dist-busca" data-role="busca" placeholder="Empresa, CNPJ ou máquina..." />
          </div>
          <div class="field">
            <label class="field__label" for="dist-f-situacao">Situação</label>
            <select class="input" id="dist-f-situacao" data-role="filtro-situacao">
              <option value="todos">Todas</option>
              <option value="desatualizado">Desatualizados</option>
              <option value="erro">Com erro</option>
              <option value="offline">Sem contato</option>
              <option value="ok">Em dia</option>
              <option value="pendente">Em andamento</option>
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="dist-f-sistema">Sistema</label>
            <select class="input" id="dist-f-sistema" data-role="filtro-sistema"><option value="">Todos</option></select>
          </div>
          <div class="toolbar-spacer"></div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th scope="col">Empresa</th><th scope="col">Situação</th><th scope="col">Sistema</th>
              <th scope="col">Instalada</th><th scope="col">Publicada</th><th scope="col">Último contato</th>
              <th scope="col">Execuções</th><th scope="col">Sucesso</th>
            </tr></thead>
            <tbody data-role="agentes"></tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="section-heading">
          <div><span class="dashboard-intro__eyebrow">Histórico de entregas</span><h2 class="card__title">Versões cadastradas</h2></div>
          <span class="result-count" data-role="count"></span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th scope="col">Sistema</th><th scope="col">Versão</th><th scope="col">Status</th>
              <th scope="col">Tamanho</th><th scope="col">Publicada em</th><th scope="col">Ações</th>
            </tr></thead>
            <tbody data-role="versions"></tbody>
          </table>
        </div>
      </div>
    `;

    this.form = this.container.querySelector('[data-role="form"]');
    this.sistemaSelect = this.container.querySelector('[data-role="sistema"]');
    this.progresso = this.container.querySelector('[data-role="progresso"]');
    this.buscaInput = this.container.querySelector('[data-role="busca"]');
    this.filtroSituacaoSelect = this.container.querySelector('[data-role="filtro-situacao"]');
    this.filtroSistemaSelect = this.container.querySelector('[data-role="filtro-sistema"]');

    this.form.addEventListener("submit", (e) => this._submit(e));
    this.sistemaSelect.addEventListener("change", () => this._atualizarAvisoSubstituicao());
    this.container.querySelector('[data-action="refresh"]').addEventListener("click", () => this.refresh(true));

    this.buscaInput.addEventListener("input", () => {
      this.buscaAgente = this.buscaInput.value.trim().toLowerCase();
      this._renderAgentes();
    });
    this.filtroSituacaoSelect.addEventListener("change", () => {
      this.filtroSituacao = this.filtroSituacaoSelect.value;
      this._renderAgentes();
    });
    this.filtroSistemaSelect.addEventListener("change", () => {
      this.filtroSistema = this.filtroSistemaSelect.value;
      this._renderAgentes();
    });

    // Auto-atualização: um painel de monitoramento com botão manual só mostra
    // a verdade quando alguém lembra de clicar. Pausa quando a aba do
    // navegador não está visível -- não faz sentido consultar o servidor a
    // cada 30s para uma tela que ninguém está olhando.
    this.on(document, "visibilitychange", () => {
      if (document.visibilityState === "visible" && this.visivel) this._ligarPolling();
      else this._desligarPolling();
    });
  }

  aplicarParams() {
    /* nada a fazer -- a tela não recebe parâmetros por rota */
  }

  async refresh(manual = false) {
    // Os sistemas mudam raramente; buscar sempre é desperdício, então vão
    // pelo cache compartilhado com as outras abas.
    const sistemas = await this.swr("sistemas", () => this.api.get("/sistemas", null, { key: "dist:sistemas" }), (lista) => {
      this.sistemas = lista;
      this._preencherSistemas(lista);
    });
    this.sistemas = sistemas || [];

    await this.swr(
      "distribuicao:painel",
      () => this.api.get("/versoes/painel", null, { key: "dist:painel" }),
      (dados) => {
        this.painel = dados;
        this._renderIndicadores(dados.indicadores);
        this._renderAtivas(dados.ativas);
        this._renderAgentes();
        this._atualizarAvisoSubstituicao();
      }
    );

    await this.swr(
      "distribuicao:versoes",
      () => this.api.get("/versoes", null, { key: "dist:versoes" }),
      (versoes) => this._renderVersions(versoes)
    );

    await this.swr(
      "distribuicao:logs",
      () => this.api.get("/versoes/logs", { limit: 12 }, { key: "dist:logs" }),
      (logs) => {
        this._renderLogs(logs);
        // Avisa fora do navegador sobre falhas novas (ver core/notify.js).
        // Fica aqui, no desenho, e não no polling: assim vale também para a
        // primeira carga e para o "Atualizar" manual, e a lista consultada é
        // exatamente a que a tela está mostrando.
        notificacoes.sincronizar(logs);
      }
    );

    this._ligarPolling();
    if (manual) toast.info("Painel atualizado.");
  }

  _ligarPolling() {
    this._desligarPolling();
    // Ritmo escolhido em Configurações; 0 significa "não atualizar sozinho"
    // (útil para quem deixa a aba aberta o dia todo numa rede lenta).
    const intervalo = aparencia.ritmoPainel();
    if (!intervalo) return;
    this._timer = setInterval(() => {
      if (!this.visivel || document.visibilityState !== "visible") return;
      // Invalida só o painel: as versões e os sistemas não mudam sozinhos,
      // quem muda o tempo todo é o retorno dos agentes.
      this.cache?.invalidar("distribuicao:painel");
      this.cache?.invalidar("distribuicao:logs");
      this.refresh().catch(() => {
        /* falha de rede num refresh de fundo não merece alarme na tela */
      });
    }, intervalo);
  }

  _desligarPolling() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  _preencherSistemas(sistemas) {
    const atual = this.sistemaSelect.value;
    this.sistemaSelect.innerHTML =
      `<option value="">Selecione o sistema…</option>` +
      sistemas.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    if (sistemas.includes(atual)) this.sistemaSelect.value = atual;

    const filtroAtual = this.filtroSistemaSelect.value;
    this.filtroSistemaSelect.innerHTML =
      `<option value="">Todos</option>` + sistemas.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    this.filtroSistemaSelect.value = sistemas.includes(filtroAtual) ? filtroAtual : "";

    const ajuda = this.container.querySelector('[data-role="ajuda-sistema"]');
    if (sistemas.length === 0) {
      ajuda.textContent = "Nenhum sistema cadastrado — cadastre um na aba Clientes antes de publicar.";
    } else {
      ajuda.textContent = "Vem do cadastro da aba Sistemas.";
    }
  }

  /**
   * Diz, ANTES de enviar, qual versão vai sair do ar. Publicar é a ação de
   * maior consequência da tela -- ela decide o que centenas de máquinas vão
   * baixar -- e uma substituição automática silenciosa seria uma surpresa
   * ruim na primeira vez que acontecesse.
   */
  _atualizarAvisoSubstituicao() {
    const aviso = this.container.querySelector('[data-role="aviso-substituicao"]');
    if (!aviso) return;

    const texto = this.container.querySelector('[data-role="aviso-texto"]');
    const sistema = this.sistemaSelect.value;
    const noAr = this.painel?.ativas.find((v) => v.sistema === sistema);

    if (!sistema) {
      aviso.hidden = true;
      return;
    }
    aviso.hidden = false;
    texto.textContent = noAr
      ? `Ao publicar, a versão ${noAr.versao} de ${sistema} sai do ar imediatamente e os agentes passam a baixar a nova.`
      : `Nenhuma versão de ${sistema} está publicada. Esta será a primeira que os agentes vão receber.`;
  }

  async _submit(event) {
    event.preventDefault();
    const formData = new FormData(this.form);
    if (!formData.get("sistema")) {
      Modal.alert("Validação", "Escolha a qual sistema esta versão pertence.", "warning");
      this.sistemaSelect.focus();
      return;
    }

    const button = this.form.querySelector("button[type=submit]");
    button.disabled = true;
    this._mostrarProgresso(0);

    try {
      await this.api.postForm("/versoes", formData, { onProgress: (pct) => this._mostrarProgresso(pct) });
      this.form.reset();
      this._atualizarAvisoSubstituicao();
      toast.success("Versão enviada. Ela fica como rascunho até você publicar.");
      this._invalidarTudo();
      await this.refresh();
    } catch (error) {
      Modal.alert("Não foi possível salvar", error instanceof ApiError ? error.message : "Erro inesperado.", "error");
    } finally {
      button.disabled = false;
      this._esconderProgresso();
    }
  }

  _mostrarProgresso(pct) {
    this.progresso.hidden = false;
    const fill = this.progresso.querySelector(".upload-progress__fill");
    const texto = this.progresso.querySelector('[data-role="progresso-texto"]');
    if (pct == null) {
      this.progresso.classList.add("is-indeterminate");
      texto.textContent = "Enviando…";
      return;
    }
    this.progresso.classList.remove("is-indeterminate");
    fill.style.width = `${pct}%`;
    texto.textContent = pct >= 100 ? "Processando no servidor…" : `${pct}%`;
  }

  _esconderProgresso() {
    this.progresso.hidden = true;
    this.progresso.querySelector(".upload-progress__fill").style.width = "0";
  }

  _invalidarTudo() {
    this.cache?.invalidar("distribuicao:");
  }

  _renderIndicadores(ind) {
    this.container.querySelector('[data-role="indicadores"]').innerHTML = `
      <div class="card metric-card"><span>Agentes monitorados</span><strong>${ind.totalAgentes}</strong></div>
      <div class="card metric-card"><span>Na versão publicada</span><strong>${ind.emDia}</strong></div>
      <div class="card metric-card${ind.desatualizados > 0 ? " metric-card--danger" : ""}"><span>Ainda desatualizados</span><strong>${ind.desatualizados}</strong></div>
      <div class="card metric-card${ind.comErro > 0 ? " metric-card--danger" : ""}"><span>Com erro</span><strong>${ind.comErro}</strong></div>
      <div class="card metric-card"><span>Sem contato (24h+)</span><strong>${ind.offline}</strong></div>
      <div class="card metric-card"><span>Execuções nas 24h</span><strong>${ind.execucoes24h}</strong></div>
    `;
  }

  _renderAtivas(ativas) {
    const box = this.container.querySelector('[data-role="ativas"]');
    box.replaceChildren();
    if (!ativas.length) {
      box.appendChild(
        emptyState({
          titulo: "Nenhuma versão publicada",
          descricao: "Envie um pacote e publique para os agentes começarem a receber.",
          icone: "distribuicao",
        })
      );
      return;
    }
    for (const v of ativas) {
      const linha = document.createElement("div");
      linha.className = "active-version";
      linha.innerHTML = `
        <div class="active-version__head">
          <strong>${escapeHtml(v.sistema)}</strong>
          <span class="version-chip">${escapeHtml(v.versao)}</span>
        </div>
        <span class="active-version__meta">Publicada ${tempoRelativo(v.publicadoEm)} · ${formatarBytes(v.tamanhoBytes)}</span>
      `;
      linha.querySelector(".active-version__meta").title = formatarDataHora(v.publicadoEm);
      box.appendChild(linha);
    }
  }

  _renderAgentes() {
    const corpo = this.container.querySelector('[data-role="agentes"]');
    const contador = this.container.querySelector('[data-role="agentes-count"]');
    corpo.replaceChildren();

    const todos = this.painel?.agentes || [];
    const filtrados = todos.filter((a) => {
      if (this.filtroSituacao !== "todos" && a.situacao !== this.filtroSituacao) return false;
      if (this.filtroSistema && a.ultimoSistema !== this.filtroSistema) return false;
      if (this.buscaAgente) {
        const alvo = `${a.empresa} ${a.cnpj} ${a.maquina || ""} ${a.cidade || ""}`.toLowerCase();
        if (!alvo.includes(this.buscaAgente)) return false;
      }
      return true;
    });

    contador.textContent =
      filtrados.length === todos.length
        ? plural(todos.length, "agente")
        : `${filtrados.length} de ${plural(todos.length, "agente")}`;

    if (filtrados.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.className = "table-empty";
      td.appendChild(
        emptyState({
          titulo: todos.length === 0 ? "Nenhum agente comunicou ainda" : "Nenhum agente com esse filtro",
          descricao:
            todos.length === 0
              ? "Assim que o Atualizador rodar num cliente, ele aparece aqui com a versão instalada."
              : "Tente afrouxar a busca ou trocar a situação selecionada.",
          icone: todos.length === 0 ? "distribuicao" : "busca",
        })
      );
      tr.appendChild(td);
      corpo.appendChild(tr);
      return;
    }

    for (const a of filtrados) {
      const s = SITUACOES[a.situacao] || SITUACOES.pendente;
      const tr = document.createElement("tr");
      tr.className = "is-readonly";
      tr.innerHTML = `
        <td>
          <strong>${escapeHtml(a.empresa)}</strong>
          <small class="table-subtext">${escapeHtml(a.cnpj)}${a.maquina ? ` · ${escapeHtml(a.maquina)}` : ""}</small>
        </td>
        <td><span class="badge ${s.badge}">${s.label}</span></td>
        <td>${escapeHtml(a.ultimoSistema || "—")}</td>
        <td>${a.ultimaVersao ? `<span class="version-chip">${escapeHtml(a.ultimaVersao)}</span>` : "—"}</td>
        <td>${a.versaoAlvo ? escapeHtml(a.versaoAlvo) : "—"}</td>
        <td data-role="contato"></td>
        <td>${a.total}</td>
        <td>${a.taxaSucesso == null ? "—" : `${a.taxaSucesso}%`}</td>
      `;
      const contato = tr.querySelector('[data-role="contato"]');
      contato.textContent = tempoRelativo(a.ultimaComunicacao);
      contato.title = `${formatarDataHora(a.ultimaComunicacao)}${a.ultimoDetalhe ? `\n${a.ultimoDetalhe}` : ""}`;
      corpo.appendChild(tr);
    }
  }

  _renderLogs(logs) {
    const list = this.container.querySelector('[data-role="logs"]');
    const contador = this.container.querySelector('[data-role="logs-count"]');
    list.replaceChildren();
    contador.textContent = logs.length ? plural(logs.length, "retorno") : "";

    if (!logs.length) {
      list.appendChild(
        emptyState({ titulo: "Nenhum retorno ainda", descricao: "Os agentes reportam aqui a cada execução.", icone: "historico" })
      );
      return;
    }

    for (const log of logs) {
      const erro = ["ERRO", "FALHA"].includes(String(log.status).toUpperCase());
      const item = document.createElement("div");
      item.className = "agent-log";
      // Cada retorno agora carrega o contexto que faltava: qual sistema, de
      // qual versão para qual versão, e quanto tempo levou.
      const contexto = [
        log.sistema,
        log.versaoAnterior && log.versao ? `${log.versaoAnterior} → ${log.versao}` : log.versao,
        formatarDuracao(log.duracaoMs) !== "—" ? formatarDuracao(log.duracaoMs) : null,
      ]
        .filter(Boolean)
        .join(" · ");
      item.innerHTML = `
        <div class="agent-log__dot${erro ? " is-error" : ""}"></div>
        <div>
          <strong>${escapeHtml(log.empresa || log.cnpj)}</strong>
          <span>${escapeHtml(log.status)} · ${tempoRelativo(log.criadoEm)}</span>
          ${contexto ? `<p class="agent-log__ctx">${escapeHtml(contexto)}</p>` : ""}
          <p>${escapeHtml(log.detalhes || "Sem detalhes")}</p>
        </div>
      `;
      item.querySelector("span").title = formatarDataHora(log.criadoEm);
      list.appendChild(item);
    }
  }

  _renderVersions(versions) {
    const body = this.container.querySelector('[data-role="versions"]');
    body.replaceChildren();
    this.container.querySelector('[data-role="count"]').textContent = plural(versions.length, "versão", "versões");

    if (!versions.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.className = "table-empty";
      td.appendChild(
        emptyState({
          titulo: "Nenhuma versão cadastrada",
          descricao: "Use o formulário acima para enviar o primeiro pacote.",
          icone: "versoes",
        })
      );
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    const rotuloStatus = {
      publicada: { texto: "No ar", classe: "badge--success" },
      substituida: { texto: "Substituída", classe: "badge--muted" },
      rascunho: { texto: "Rascunho", classe: "badge--warning" },
    };

    for (const item of versions) {
      const st = rotuloStatus[item.status] || rotuloStatus.rascunho;
      const row = document.createElement("tr");
      row.className = "is-readonly";
      row.innerHTML = `
        <td><strong>${escapeHtml(item.sistema || "—")}</strong></td>
        <td><span class="version-chip">${escapeHtml(item.versao)}</span></td>
        <td><span class="badge ${st.classe}">${st.texto}</span>${
        item.substituidoEm ? `<small class="table-subtext">${tempoRelativo(item.substituidoEm)}</small>` : ""
      }</td>
        <td>${formatarBytes(item.tamanhoBytes)}</td>
        <td>${item.publicadoEm ? formatarDataHora(item.publicadoEm) : "—"}</td>
        <td data-role="acoes"></td>
      `;

      const acoes = row.querySelector('[data-role="acoes"]');
      acoes.classList.add("table-actions");
      acoes.style.display = "flex";
      acoes.style.gap = "6px";

      if (item.status !== "publicada") {
        const publicar = document.createElement("button");
        publicar.type = "button";
        publicar.className = "btn btn--small btn--accent";
        publicar.textContent = "Publicar";
        publicar.addEventListener("click", () => this._publicar(item, publicar));
        acoes.appendChild(publicar);

        const excluir = document.createElement("button");
        excluir.type = "button";
        excluir.className = "btn btn--small btn--danger";
        excluir.textContent = "Excluir";
        excluir.addEventListener("click", () => this._excluir(item, excluir));
        acoes.appendChild(excluir);
      } else {
        const ativa = document.createElement("span");
        ativa.className = "text-muted";
        ativa.style.fontSize = "var(--txt-sm)";
        ativa.textContent = "Ativa";
        // A versão no ar não pode ser excluída: apagá-la deixaria os agentes
        // daquele sistema sem nada para baixar no meio de uma janela de
        // atualização. Para tirá-la do ar, publica-se a próxima.
        ativa.title = "Para tirar esta versão do ar, publique uma mais nova deste sistema.";
        acoes.appendChild(ativa);
      }
      body.appendChild(row);
    }
  }

  async _publicar(item, botao) {
    const noAr = this.painel?.ativas.find((v) => v.sistema === item.sistema);
    const ok = await Modal.confirm(
      "Publicar versão",
      noAr
        ? `A versão ${item.versao} de ${item.sistema} passa a ser a única disponível para os agentes.\n\n` +
            `A versão ${noAr.versao}, que está no ar, sai de circulação imediatamente.`
        : `A versão ${item.versao} de ${item.sistema} passa a ser distribuída para os agentes deste sistema.`,
      { confirmLabel: "Publicar", danger: false }
    );
    if (!ok) return;

    botao.disabled = true;
    try {
      const resultado = await this.api.post(`/versoes/${item.id}/publicar`);
      const substituidas = resultado?.substituidas || [];
      toast.success(
        substituidas.length
          ? `Versão ${item.versao} no ar. A ${substituidas[0].versao} saiu de circulação.`
          : `Versão ${item.versao} publicada.`
      );
      this._invalidarTudo();
      await this.refresh();
    } catch (err) {
      Modal.alert("Não foi possível publicar", err instanceof ApiError ? err.message : "Erro inesperado.", "error");
    } finally {
      botao.disabled = false;
    }
  }

  async _excluir(item, botao) {
    const ok = await Modal.confirm(
      "Excluir versão",
      `Excluir a versão ${item.versao} de ${item.sistema}?\n\nO pacote enviado também é apagado do servidor. Esta ação não pode ser desfeita.`,
      { confirmLabel: "Excluir" }
    );
    if (!ok) return;

    botao.disabled = true;
    try {
      await this.api.delete(`/versoes/${item.id}`);
      toast.success(`Versão ${item.versao} excluída.`);
      this._invalidarTudo();
      await this.refresh();
    } catch (err) {
      Modal.alert("Não foi possível excluir", err instanceof ApiError ? err.message : "Erro inesperado.", "error");
      botao.disabled = false;
    }
  }

  destroy() {
    this._desligarPolling();
    super.destroy();
  }
}
