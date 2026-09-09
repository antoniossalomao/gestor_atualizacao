import { View } from "../core/View.js";
import { toast } from "../core/Toast.js";
import { icon } from "../core/icons.js";
import { emptyState } from "../core/EmptyState.js";
import { escapeHtml, plural } from "../core/html.js";
import { formatarDataHora, tempoRelativo, formatarBytes } from "../core/date.js";

/**
 * Inventário de versões do ecossistema.
 *
 * Duas origens diferentes, lado a lado de propósito:
 *  - **última versão por sistema** vem do histórico de atualizações feitas na
 *    mão pela equipe (aba Atualizações) -- é o que está instalado por aí;
 *  - **versões publicadas** vem do módulo de distribuição -- é o que o
 *    atualizador automático está entregando.
 *
 * Comparar as duas é o ponto da tela: quando divergem, existe cliente rodando
 * uma versão que já não é a oficial. Antes as duas listas apareciam sem
 * nenhuma ligação entre si; agora o sistema é a chave que as amarra.
 */
export class VersoesView extends View {
  constructor(container, api, ctx) {
    super(container, api, ctx);
    this._buildDom();
  }

  _buildDom() {
    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-spacer"></div>
        <button class="btn btn--small btn--ghost" data-action="refresh">${icon("atualizar")} Atualizar dados</button>
      </div>

      <div class="version-stats" data-role="stats"></div>

      <div class="card">
        <div class="section-heading">
          <div><span class="dashboard-intro__eyebrow">Estado atual</span><h2 class="card__title">Última versão por sistema</h2></div>
          <span class="result-count" data-role="systemCount"></span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th scope="col">Sistema</th><th scope="col">Versão registrada</th>
              <th scope="col">Data</th><th scope="col">Versão publicada</th><th scope="col">Situação</th>
            </tr></thead>
            <tbody data-role="systems"></tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="section-heading">
          <div><span class="dashboard-intro__eyebrow">Canal do agente</span><h2 class="card__title">Versões publicadas</h2></div>
          <span class="result-count" data-role="publishedCount"></span>
        </div>
        <div class="published-list" data-role="published"></div>
      </div>
    `;
    this.container.querySelector('[data-action="refresh"]').addEventListener("click", () => this.refresh(true));
  }

  async refresh(showToast = false) {
    const dados = await this.swr(
      "versoes:inventario",
      async () => {
        const [systems, versions] = await Promise.all([
          this.api.get("/atualizacoes/versoes-por-sistema", null, { key: "versoes:sistemas" }),
          this.api.get("/versoes", null, { key: "versoes:lista" }),
        ]);
        return { systems, versions };
      },
      ({ systems, versions }) => this._render(systems, versions)
    );

    if (showToast && dados) toast.info("Dados de versões atualizados.");
  }

  _render(systems, versions) {
    const publicadas = versions.filter((v) => v.status === "publicada");
    // Mapa sistema -> versão publicada: é o que permite comparar cada linha
    // do inventário com o que o atualizador está de fato distribuindo.
    const publicadaPorSistema = new Map(publicadas.map((v) => [v.sistema, v]));

    this._renderStats(systems, publicadas);
    this._renderSystems(systems, publicadaPorSistema);
    this._renderPublished(publicadas);
  }

  _renderStats(systems, publicadas) {
    const semCanal = systems.filter((s) => !publicadas.some((p) => p.sistema === s.sistema)).length;
    this.container.querySelector('[data-role="stats"]').innerHTML = `
      <div class="card version-stat"><span>Sistemas acompanhados</span><strong>${systems.length}</strong></div>
      <div class="card version-stat"><span>Publicados para o agente</span><strong>${publicadas.length}</strong></div>
      <div class="card version-stat"><span>Sem versão publicada</span><strong>${semCanal}</strong></div>
    `;
  }

  _renderSystems(systems, publicadaPorSistema) {
    const body = this.container.querySelector('[data-role="systems"]');
    body.replaceChildren();
    this.container.querySelector('[data-role="systemCount"]').textContent = plural(systems.length, "sistema");

    if (!systems.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.className = "table-empty";
      td.appendChild(
        emptyState({
          titulo: "Nenhuma versão registrada",
          descricao: "Registre atualizações na aba Atualizações para o inventário aparecer aqui.",
          icone: "versoes",
        })
      );
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    for (const item of systems) {
      const publicada = publicadaPorSistema.get(item.sistema);
      const situacao = !publicada
        ? { texto: "Sem canal", classe: "badge--muted", dica: "Nenhuma versão deste sistema foi publicada para o atualizador." }
        : publicada.versao === item.versao
        ? { texto: "Alinhada", classe: "badge--success", dica: "O registro bate com o que está publicado." }
        : { texto: "Divergente", classe: "badge--warning", dica: `Publicada ${publicada.versao}, registrada ${item.versao}.` };

      const row = document.createElement("tr");
      row.className = "is-readonly";
      row.innerHTML = `
        <td><strong>${escapeHtml(item.sistema)}</strong></td>
        <td><span class="version-chip">${escapeHtml(item.versao)}</span></td>
        <td>${escapeHtml(item.data)}</td>
        <td>${publicada ? `<span class="version-chip">${escapeHtml(publicada.versao)}</span>` : "—"}</td>
        <td><span class="badge ${situacao.classe}" title="${escapeHtml(situacao.dica)}">${situacao.texto}</span></td>
      `;
      body.appendChild(row);
    }
  }

  _renderPublished(versions) {
    const list = this.container.querySelector('[data-role="published"]');
    list.replaceChildren();
    this.container.querySelector('[data-role="publishedCount"]').textContent = plural(versions.length, "release");

    if (!versions.length) {
      list.appendChild(
        emptyState({
          titulo: "Nenhuma versão publicada",
          descricao: "Envie e publique um pacote na aba Distribuição para os agentes começarem a receber.",
          icone: "distribuicao",
          acao: { label: "Ir para Distribuição", onClick: () => this.navigate("distribuicao") },
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
          ${item.observacoes ? `<p>${escapeHtml(item.observacoes)}</p>` : ""}
        </div>
        <div class="published-release__state">NO AR</div>
      `;
      const meta = article.querySelector('[data-role="meta"]');
      meta.textContent = `Publicada ${tempoRelativo(item.publicadoEm)} · ${plural(item.pacotes.length, "pacote")} · ${formatarBytes(item.tamanhoBytes)}`;
      meta.title = formatarDataHora(item.publicadoEm);
      list.appendChild(article);
    }
  }
}
