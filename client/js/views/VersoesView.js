import { View } from "../core/View.js";
import { toast } from "../core/Toast.js";
import { icon } from "../core/icons.js";
import { emptyState } from "../core/EmptyState.js";
import { escapeAttr, escapeHtml, plural } from "../core/html.js";
import { formatarDataHora, tempoRelativo, formatarBytes } from "../core/date.js";
import { Modal } from "../core/Modal.js";
import { ApiError } from "../api/ApiClient.js";

const STATUS = {
  publicada: { texto: "No ar", classe: "badge--success" },
  rascunho: { texto: "Rascunho", classe: "badge--warning" },
  substituida: { texto: "Substituída", classe: "badge--muted" },
};

/**
 * Catálogo das versões do atualizador automático.
 *
 * Esta tela usa somente `versoes_atualizador`. O histórico operacional da
 * aba Atualizações não representa uma publicação e, por isso, não pode ser
 * apresentado como "versão registrada" nem fornecer a data de uma release.
 */
export class VersoesView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this.versions = [];
    this.systems = [];
    this.busca = "";
    this.filtroStatus = "todos";
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = `
      <div class="toolbar versions-toolbar">
        <div class="toolbar-spacer"></div>
        <button type="button" class="btn btn--small btn--ghost" data-action="refresh">${icon("atualizar")} Atualizar dados</button>
      </div>

      <div class="version-management-layout">
        <form class="card distribution-form" data-role="form">
          <div class="section-heading">
            <div><span class="dashboard-intro__eyebrow">Nova entrega</span><h2>Preparar versão</h2></div>
          </div>

          <div class="form-grid form-grid--2">
            <div class="field">
              <label class="field__label" for="version-system">Sistema</label>
              <select class="input" id="version-system" name="sistema" required data-role="form-system">
                <option value="">Selecione o sistema…</option>
              </select>
              <small class="field__help" data-role="system-help">Vem do cadastro da aba Sistemas.</small>
            </div>
            <div class="field">
              <label class="field__label" for="version-number">Versão</label>
              <input class="input" id="version-number" name="versao" placeholder="2026.08.10" required
                     pattern="\\d+(\\.\\d+){1,3}([-.][0-9A-Za-z.-]+)?" />
            </div>
          </div>

          <div class="field">
            <label class="field__label" for="version-package">Arquivo compactado</label>
            <input class="input distribution-file" id="version-package" type="file" name="pacote" accept=".7z,.zip,.rar" required />
            <small class="field__help">O SHA-256 e a URL de download serão gerados automaticamente.</small>
          </div>

          <div class="field">
            <span class="field__label" id="version-changelog-label">O que mudou nesta entrega</span>
            <div class="changelog-editor" data-role="changelog-items" aria-labelledby="version-changelog-label"></div>
            <button type="button" class="btn btn--small btn--ghost" data-action="add-changelog-item">${icon("plus")} Adicionar item</button>
            <textarea name="observacoes" hidden data-role="changelog-value"></textarea>
          </div>

          <div class="distribution-note" data-role="replacement-warning" hidden>
            <span class="distribution-note__icon" aria-hidden="true">i</span>
            <div><strong>Destino da publicação</strong><p data-role="replacement-text"></p></div>
          </div>

          <div class="upload-progress" data-role="upload-progress" hidden>
            <span class="upload-progress__track"><span class="upload-progress__fill"></span></span>
            <span data-role="upload-progress-text">0%</span>
          </div>

          <button class="btn btn--accent" type="submit">${icon("upload")} Enviar versão</button>
        </form>

        <div class="card">
          <div class="section-heading">
            <div><span class="dashboard-intro__eyebrow">Distribuição ativa</span><h2 class="card__title">No ar agora</h2></div>
            <span class="result-count" data-role="publishedCount"></span>
          </div>
          <div class="published-list" data-role="published"></div>
        </div>
      </div>

      <div class="version-stats" data-role="stats"></div>
      <div data-role="coverage"></div>

      <div class="card">
        <div class="section-heading">
          <div><span class="dashboard-intro__eyebrow">Catálogo</span><h2 class="card__title">Histórico de versões</h2></div>
          <span class="result-count" data-role="historyCount"></span>
        </div>
        <div class="toolbar versions-filters">
          <div class="field">
            <label class="field__label" for="versions-search">Buscar</label>
            <input type="search" class="input" id="versions-search" data-role="search" placeholder="Sistema ou versão..." />
          </div>
          <div class="field">
            <label class="field__label" for="versions-status">Status</label>
            <select class="input" id="versions-status" data-role="status">
              <option value="todos">Todos</option>
              <option value="publicada">No ar</option>
              <option value="rascunho">Rascunhos</option>
              <option value="substituida">Substituídas</option>
            </select>
          </div>
          <div class="toolbar-spacer"></div>
        </div>
        <div class="table-wrap">
          <table class="data-table versions-table">
            <thead><tr>
              <th scope="col">Sistema</th><th scope="col">Versão</th><th scope="col">Status</th>
              <th scope="col">Publicada em</th><th scope="col">Pacote</th><th scope="col">Tamanho</th>
              <th scope="col">Alterações</th><th scope="col">Ações</th>
            </tr></thead>
            <tbody data-role="history"></tbody>
          </table>
        </div>
      </div>
    `;

    this.form = this.container.querySelector('[data-role="form"]');
    this.systemSelect = this.container.querySelector('[data-role="form-system"]');
    this.changelogItems = this.container.querySelector('[data-role="changelog-items"]');
    this.changelogValue = this.container.querySelector('[data-role="changelog-value"]');
    this.uploadProgress = this.container.querySelector('[data-role="upload-progress"]');

    if (this.ctx?.user?.role === "consulta") {
      this.form.hidden = true;
    }

    this.form.addEventListener("submit", (event) => this._submit(event));
    this.systemSelect.addEventListener("change", () => this._updateReplacementWarning());
    this.container.querySelector('[data-action="add-changelog-item"]').addEventListener("click", () => this._addChangelogItem("", true));
    this._resetChangelog();
    this.container.querySelector('[data-action="refresh"]').addEventListener("click", () => this.refresh(true));
    this.container.querySelector('[data-role="search"]').addEventListener("input", (event) => {
      this.busca = event.target.value.trim().toLowerCase();
      this._renderHistory();
    });
    this.container.querySelector('[data-role="status"]').addEventListener("change", (event) => {
      this.filtroStatus = event.target.value;
      this._renderHistory();
    });
  }

  async refresh(showToast = false) {
    const dados = await this.swr(
      "versoes:catalogo",
      async () => {
        const [systems, versions] = await Promise.all([
          this.api.get("/sistemas", null, { key: "versoes:sistemas-cadastrados" }),
          this.api.get("/versoes", null, { key: "versoes:lista" }),
        ]);
        return { systems, versions };
      },
      ({ systems, versions }) => {
        this.systems = systems || [];
        this.versions = versions || [];
        this._populateSystems();
        this._render();
      }
    );

    if (showToast && dados) toast.info("Dados de versões atualizados.");
  }

  _render() {
    const publicadas = this.versions.filter((v) => v.status === "publicada");
    const rascunhos = this.versions.filter((v) => v.status === "rascunho");
    const substituidas = this.versions.filter((v) => v.status === "substituida");
    const sistemasPublicados = new Set(publicadas.map((v) => v.sistema));
    const semPublicacao = this.systems.filter((s) => !sistemasPublicados.has(s));

    this._renderStats(publicadas.length, rascunhos.length, substituidas.length, semPublicacao);
    this._renderPublished(publicadas);
    this._renderHistory();
    this._updateReplacementWarning();
  }

  _renderStats(publicadas, rascunhos, substituidas, semPublicacao) {
    this.container.querySelector('[data-role="stats"]').innerHTML = `
      <div class="card version-stat"><span>Versões no ar</span><strong>${publicadas}</strong></div>
      <div class="card version-stat${rascunhos > 0 ? " version-stat--pending" : ""}"><span>Aguardando publicação</span><strong>${rascunhos}</strong></div>
      <div class="card version-stat"><span>Versões substituídas</span><strong>${substituidas}</strong></div>
      <div class="card version-stat${semPublicacao.length > 0 ? " version-stat--alerta" : ""}"><span>Sistemas sem publicação</span><strong>${semPublicacao.length}</strong></div>
    `;

    const coverage = this.container.querySelector('[data-role="coverage"]');
    coverage.replaceChildren();
    if (!semPublicacao.length) return;

    const details = document.createElement("details");
    details.className = "version-coverage card";
    details.innerHTML = `
      <summary>${plural(semPublicacao.length, "sistema")} ainda sem versão publicada</summary>
      <div class="version-coverage__systems">${semPublicacao.map((s) => `<span>${escapeHtml(s)}</span>`).join("")}</div>
    `;
    coverage.appendChild(details);
  }

  _renderPublished(versions) {
    const list = this.container.querySelector('[data-role="published"]');
    list.replaceChildren();
    this.container.querySelector('[data-role="publishedCount"]').textContent = plural(versions.length, "versão", "versões");

    if (!versions.length) {
      list.appendChild(
        emptyState({
          titulo: "Nenhuma versão publicada",
          descricao: "Prepare o primeiro pacote no formulário ao lado e publique quando estiver pronto para os agentes.",
          icone: "distribuicao",
        })
      );
      return;
    }

    for (const item of versions) {
      const article = document.createElement("article");
      article.className = "published-release";
      article.innerHTML = `
        <div class="published-release__version">${escapeHtml(item.versao)}</div>
        <div class="published-release__body">
          <strong>${escapeHtml(item.sistema || "Sistema não informado")}</strong>
          <span data-role="meta"></span>
          <div data-role="changelog"></div>
        </div>
        <div class="published-release__state"><span class="badge badge--success">No ar</span></div>
      `;
      const meta = article.querySelector('[data-role="meta"]');
      const pacotes = Array.isArray(item.pacotes) ? item.pacotes : [];
      meta.textContent = `${formatarDataHora(item.publicadoEm)} · ${plural(pacotes.length, "pacote")} · ${formatarBytes(item.tamanhoBytes)}`;
      meta.title = `Publicada ${tempoRelativo(item.publicadoEm)}`;
      article.querySelector('[data-role="changelog"]').appendChild(renderChangelog(item.observacoes));
      list.appendChild(article);
    }
  }

  _renderHistory() {
    const body = this.container.querySelector('[data-role="history"]');
    if (!body) return;
    body.replaceChildren();

    const filtradas = this.versions.filter((item) => {
      if (this.filtroStatus !== "todos" && item.status !== this.filtroStatus) return false;
      if (!this.busca) return true;
      return `${item.sistema || ""} ${item.versao || ""}`.toLowerCase().includes(this.busca);
    });

    const count = this.container.querySelector('[data-role="historyCount"]');
    count.textContent =
      filtradas.length === this.versions.length
        ? plural(this.versions.length, "versão", "versões")
        : `${filtradas.length} de ${plural(this.versions.length, "versão", "versões")}`;

    if (!filtradas.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.className = "table-empty";
      td.appendChild(
        emptyState({
          titulo: this.versions.length ? "Nenhuma versão com esse filtro" : "Nenhuma versão cadastrada",
          descricao: this.versions.length
            ? "Tente outro sistema ou selecione um status diferente."
            : "As versões enviadas pelo formulário acima aparecerão aqui.",
          icone: this.versions.length ? "busca" : "versoes",
        })
      );
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    for (const item of filtradas) {
      const status = STATUS[item.status] || STATUS.rascunho;
      const pacotes = Array.isArray(item.pacotes) ? item.pacotes : [];
      const nomesPacotes = pacotes.map((p) => p.file).filter(Boolean).join(", ");
      const observacoes = resumoObservacoes(item.observacoes);
      const row = document.createElement("tr");
      row.className = "is-readonly";
      row.innerHTML = `
        <td><strong>${escapeHtml(item.sistema || "—")}</strong></td>
        <td><span class="version-chip">${escapeHtml(item.versao)}</span></td>
        <td><span class="badge ${status.classe}">${status.texto}</span></td>
        <td>${item.publicadoEm ? escapeHtml(formatarDataHora(item.publicadoEm)) : "—"}</td>
        <td class="versions-table__package" title="${escapeAttr(nomesPacotes)}">${escapeHtml(nomesPacotes || "—")}</td>
        <td>${formatarBytes(item.tamanhoBytes)}</td>
        <td class="versions-table__notes" title="${escapeAttr(observacoes)}">${escapeHtml(observacoes || "Sem notas")}</td>
        <td class="table-actions" data-role="actions"></td>
      `;
      const actions = row.querySelector('[data-role="actions"]');
      const isAdmin = this.ctx?.user?.role === "admin";

      if (item.status !== "publicada") {
        if (isAdmin) {
          const publish = document.createElement("button");
          publish.type = "button";
          publish.className = "btn btn--small btn--accent";
          publish.textContent = "Publicar";
          publish.addEventListener("click", () => this._publish(item, publish));
          actions.appendChild(publish);
        } else {
          const rascunho = document.createElement("span");
          rascunho.className = "text-muted";
          rascunho.textContent = "Rascunho";
          actions.appendChild(rascunho);
        }
      } else {
        const active = document.createElement("span");
        active.className = "text-muted";
        active.textContent = "No ar";
        actions.appendChild(active);
      }

      if (isAdmin) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn btn--small btn--danger";
        remove.textContent = "Excluir";
        remove.addEventListener("click", () => this._remove(item, remove));
        actions.appendChild(remove);
      }
      body.appendChild(row);
    }
  }

  _populateSystems() {
    const current = this.systemSelect.value;
    this.systemSelect.innerHTML =
      `<option value="">Selecione o sistema…</option>` +
      this.systems.map((system) => `<option value="${escapeAttr(system)}">${escapeHtml(system)}</option>`).join("");
    if (this.systems.includes(current)) this.systemSelect.value = current;
    this.container.querySelector('[data-role="system-help"]').textContent = this.systems.length
      ? "Vem do cadastro da aba Sistemas."
      : "Nenhum sistema cadastrado. Cadastre um na aba Clientes antes de enviar.";
  }

  _updateReplacementWarning() {
    const warning = this.container.querySelector('[data-role="replacement-warning"]');
    const text = this.container.querySelector('[data-role="replacement-text"]');
    const system = this.systemSelect.value;
    if (!system) {
      warning.hidden = true;
      return;
    }
    const active = this.versions.find((item) => item.status === "publicada" && item.sistema === system);
    warning.hidden = false;
    text.textContent = active
      ? `O envio cria um rascunho. Quando ele for publicado, a versão ${active.versao} sairá do ar.`
      : `O envio cria um rascunho. Esta será a primeira versão publicada de ${system}.`;
  }

  _resetChangelog() {
    this.changelogItems.replaceChildren();
    this._addChangelogItem("", false);
  }

  _addChangelogItem(value = "", focus = false) {
    const line = document.createElement("div");
    line.className = "changelog-item";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "input";
    input.placeholder = "ex.: Corrige cálculo de desconto no orçamento";
    input.value = value;
    input.addEventListener("input", () => this._syncChangelog());

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "changelog-item__remove";
    remove.setAttribute("aria-label", "Remover este item");
    remove.title = "Remover este item";
    remove.textContent = "✕";
    remove.addEventListener("click", () => {
      line.remove();
      if (!this.changelogItems.children.length) this._addChangelogItem("", false);
      this._syncChangelog();
    });

    line.append(input, remove);
    this.changelogItems.appendChild(line);
    if (focus) input.focus();
    this._syncChangelog();
  }

  _syncChangelog() {
    const items = [...this.changelogItems.querySelectorAll("input")]
      .map((input) => input.value.trim())
      .filter(Boolean);
    this.changelogValue.value = items.map((item) => `- ${item}`).join("\n");
  }

  async _submit(event) {
    event.preventDefault();
    const formData = new FormData(this.form);
    if (!formData.get("sistema")) {
      await Modal.alert("Validação", "Escolha a qual sistema esta versão pertence.", "warning");
      this.systemSelect.focus();
      return;
    }

    const button = this.form.querySelector('button[type="submit"]');
    button.disabled = true;
    this._showProgress(0);
    try {
      await this.api.postForm("/versoes", formData, { onProgress: (percent) => this._showProgress(percent) });
      this.form.reset();
      this._resetChangelog();
      this._updateReplacementWarning();
      toast.success("Versão enviada como rascunho. Revise e publique no histórico abaixo.");
      this._invalidateVersions();
      await this.refresh();
    } catch (error) {
      await Modal.alert("Não foi possível salvar", error instanceof ApiError ? error.message : "Erro inesperado.", "error");
    } finally {
      button.disabled = false;
      this._hideProgress();
    }
  }

  _showProgress(percent) {
    this.uploadProgress.hidden = false;
    const fill = this.uploadProgress.querySelector(".upload-progress__fill");
    const text = this.uploadProgress.querySelector('[data-role="upload-progress-text"]');
    if (percent == null) {
      this.uploadProgress.classList.add("is-indeterminate");
      text.textContent = "Enviando…";
      return;
    }
    this.uploadProgress.classList.remove("is-indeterminate");
    fill.style.width = `${percent}%`;
    text.textContent = percent >= 100 ? "Processando no servidor…" : `${percent}%`;
  }

  _hideProgress() {
    this.uploadProgress.hidden = true;
    this.uploadProgress.classList.remove("is-indeterminate");
    this.uploadProgress.querySelector(".upload-progress__fill").style.width = "0";
  }

  async _publish(item, button) {
    const current = this.versions.find((version) => version.status === "publicada" && version.sistema === item.sistema);
    const confirmed = await Modal.confirm(
      "Publicar versão",
      current
        ? `A versão ${item.versao} de ${item.sistema} passará a ser distribuída imediatamente.\n\nA versão ${current.versao} sairá do ar.`
        : `A versão ${item.versao} de ${item.sistema} passará a ser distribuída para os agentes.`,
      { confirmLabel: "Publicar", danger: false }
    );
    if (!confirmed) return;

    button.disabled = true;
    try {
      const result = await this.api.post(`/versoes/${item.id}/publicar`);
      const replaced = result?.substituidas || [];
      toast.success(
        replaced.length ? `Versão ${item.versao} no ar. A ${replaced[0].versao} foi substituída.` : `Versão ${item.versao} publicada.`
      );
      this._invalidateVersions();
      await this.refresh();
    } catch (error) {
      await Modal.alert("Não foi possível publicar", error instanceof ApiError ? error.message : "Erro inesperado.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async _remove(item, button) {
    const active = item.status === "publicada";
    const confirmed = await Modal.confirm(
      "Excluir versão",
      active
        ? `Esta é a versão no ar de ${item.sistema}. Excluí-la interrompe novas entregas desse sistema até outra publicação.\n\nO pacote também será apagado e a ação não pode ser desfeita.`
        : `Excluir a versão ${item.versao} de ${item.sistema}?\n\nO pacote também será apagado e a ação não pode ser desfeita.`,
      { confirmLabel: "Excluir" }
    );
    if (!confirmed) return;

    button.disabled = true;
    try {
      await this.api.delete(`/versoes/${item.id}`);
      toast.success(`Versão ${item.versao} excluída.`);
      this._invalidateVersions();
      await this.refresh();
    } catch (error) {
      await Modal.alert("Não foi possível excluir", error instanceof ApiError ? error.message : "Erro inesperado.", "error");
      button.disabled = false;
    }
  }

  _invalidateVersions() {
    this.cache?.invalidar("versoes:");
    this.cache?.invalidar("distribuicao:");
  }
}

function resumoObservacoes(observacoes) {
  return String(observacoes || "")
    .split("\n")
    .map((linha) => linha.trim().replace(/^-\s*/, ""))
    .filter(Boolean)
    .join(" · ");
}

function renderChangelog(observacoes) {
  const linhas = String(observacoes || "")
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);
  const itens = linhas.filter((linha) => linha.startsWith("- ")).map((linha) => linha.slice(2).trim());

  if (itens.length > 0 && itens.length === linhas.length) {
    const ul = document.createElement("ul");
    ul.className = "published-release__changelog";
    for (const item of itens) {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    }
    return ul;
  }
  if (linhas.length === 0) {
    const span = document.createElement("span");
    span.className = "published-release__empty-notes";
    span.textContent = "Sem notas desta versão.";
    return span;
  }
  const p = document.createElement("p");
  p.textContent = linhas.join("\n");
  return p;
}
