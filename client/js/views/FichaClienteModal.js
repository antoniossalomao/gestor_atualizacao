import { ErroApi } from "../api/ApiPainel.js";
import { Modal } from "../components/Modal.js";
import { avisoRapido } from "../components/AvisosRapidos.js";
import { estadoVazio } from "../components/estadoVazio.js";
import { iconeHtml, iconeSvg } from "../utils/icones.js";
import { copiarParaAreaDeTransferencia } from "../components/areaDeTransferencia.js";
import { relatorioDeAtualizacao, haQuantoTempo } from "../domain/relatorio.js";
import { tempoRelativo, formatarDataHora } from "../utils/data.js";
import { montarMatrizVersoes } from "../domain/matrizVersoes.js";
import { cartaoAcesso, CABECALHO_MATRIZ, linhaMatrizVersoes } from "../templates/consulta.js";
import { html, escaparHtml } from "../utils/html.js";

/**
 * Ficha 360° do Cliente em janela modal flutuante.
 * Reúne dados cadastrais, sistemas contratados, matriz de versões,
 * acessos remotos (AnyDesk/Bredas) e histórico recente de atualizações.
 */
export class FichaClienteModal {
  /**
   * @param {import('../api/ApiPainel').ApiPainel} api
   * @param {{ id?: number, nome: string, codigo?: string, cidade?: string, grupo?: string, regimeTributario?: string }} clienteRef
   * @param {object} [opcoes]
   * @param {string} [opcoes.role]
   * @param {(cliente: any) => void} [opcoes.onEditar]
   * @param {(id: number, nome: string) => void} [opcoes.onAcessos]
   */
  constructor(api, clienteRef, opcoes = {}) {
    this.api = api;
    this.clienteRef = typeof clienteRef === "string" ? { nome: clienteRef } : clienteRef;
    this.opcoes = opcoes;
    this.cliente = null;
    this.historico = [];
    this.painelVersoes = null;
    this.acessos = [];
    this.situacaoSistemas = [];
  }

  async open() {
    const { box, close } = Modal.abrirCaixa({
      largura: 960,
      classe: "modal-ficha-cliente",
    });
    this.box = box;
    this.close = close;

    const nomeInicial = this.clienteRef.nome || "Cliente";
    box.innerHTML = html`
      <div class="modal-ficha-cliente__topo">
        <div class="modal-ficha-cliente__identidade">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:var(--cor-accent); display:flex; align-items:center;">${iconeHtml("clientes")}</span>
            <h3 class="modal-ficha-cliente__nome">${nomeInicial}</h3>
          </div>
          <p class="modal-ficha-cliente__subtitulo">Carregando dados da ficha 360°...</p>
        </div>
        <div class="modal-ficha-cliente__acoes-topo">
          <button type="button" class="btn btn--icon btn--ghost" data-action="fechar-x" title="Fechar" aria-label="Fechar">
            ${iconeHtml("fechar")}
          </button>
        </div>
      </div>
      <div class="modal-ficha-cliente__corpo" data-role="corpo">
        <div style="padding:var(--sp-8) var(--sp-4); text-align:center; color:var(--cor-texto-sub);">
          <p>Buscando histórico, acessos e situação das versões...</p>
        </div>
      </div>
      <div class="modal-ficha-cliente__rodape">
        <button type="button" class="btn" data-action="fechar">Fechar</button>
      </div>
    `.toString();

    box.querySelector('[data-action="fechar-x"]')?.addEventListener("click", () => close());
    box.querySelector('[data-action="fechar"]')?.addEventListener("click", () => close());

    try {
      await this._carregarDados();
      this._renderizarConteudo();
    } catch (erro) {
      if (erro?.cancelled) return;
      avisoRapido.erro("Não foi possível carregar os dados deste cliente.");
      const corpo = box.querySelector('[data-role="corpo"]');
      if (corpo) {
        corpo.replaceChildren(
          estadoVazio({
            titulo: "Erro ao carregar cliente",
            descricao: erro instanceof ErroApi ? erro.message : "Não foi possível carregar os dados deste cliente.",
            icone: "alerta",
          })
        );
      }
    }
  }

  async _carregarDados() {
    const nome = this.clienteRef.nome;
    const cliente = await this.api.get(`/clientes/by-nome/${encodeURIComponent(nome)}`, null, { key: "consulta:cliente" });
    if (!cliente) {
      throw new Error("Cliente não encontrado.");
    }
    this.cliente = cliente;

    const [historico, painelVersoes, acessos, situacaoSistemas] = await Promise.all([
      this.api.get(`/atualizacoes/recent-by-client/${encodeURIComponent(nome)}`, { limit: 10 }, { key: "consulta:historico" }).catch(() => []),
      this.api.get("/versoes/painel", null, { key: "consulta:painel" }).catch(() => null),
      this.api.get(`/clientes/${cliente.id}/acessos`, null, { key: "consulta:acessos" }).catch(() => []),
      this.api.get(`/atualizacoes/situacao-cliente/${encodeURIComponent(nome)}`, null, { key: "consulta:situacao" }).catch(() => []),
    ]);

    this.historico = Array.isArray(historico) ? historico : [];
    this.painelVersoes = painelVersoes;
    this.acessos = Array.isArray(acessos) ? acessos : [];
    this.situacaoSistemas = Array.isArray(situacaoSistemas) ? situacaoSistemas : [];
  }

  _renderizarConteudo() {
    const { cliente, historico, painelVersoes, acessos, situacaoSistemas } = this;
    const podeEditar = ["operador", "admin"].includes(this.opcoes.role);

    // 1. Atualizar cabeçalho
    const nomeEl = this.box.querySelector(".modal-ficha-cliente__nome");
    if (nomeEl) nomeEl.textContent = cliente.nome;

    const subtitulos = [];
    if (cliente.codigo) subtitulos.push(`Código: ${cliente.codigo}`);
    if (cliente.cidade) subtitulos.push(`Cidade: ${cliente.cidade}`);
    if (cliente.grupo) subtitulos.push(`Grupo/Rede: ${cliente.grupo}`);
    if (cliente.regimeTributario) subtitulos.push(`Regime: ${cliente.regimeTributario}`);
    const subtituloEl = this.box.querySelector(".modal-ficha-cliente__subtitulo");
    if (subtituloEl) {
      subtituloEl.textContent = subtitulos.length > 0 ? subtitulos.join(" · ") : "Sem informações cadastrais adicionais";
    }

    // Ações do topo
    const acoesTopo = this.box.querySelector(".modal-ficha-cliente__acoes-topo");
    if (acoesTopo) {
      acoesTopo.replaceChildren();
      if (podeEditar && typeof this.opcoes.onEditar === "function") {
        const btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className = "btn btn--small";
        btnEdit.innerHTML = html`${iconeHtml("editar")} Editar Cadastro`;
        btnEdit.addEventListener("click", () => {
          this.close();
          this.opcoes.onEditar(cliente);
        });
        acoesTopo.appendChild(btnEdit);
      }
      if (podeEditar && typeof this.opcoes.onAcessos === "function") {
        const btnAcessos = document.createElement("button");
        btnAcessos.type = "button";
        btnAcessos.className = "btn btn--small";
        btnAcessos.innerHTML = html`${iconeHtml("acessos")} Acessos Remotos`;
        btnAcessos.addEventListener("click", () => {
          this.close();
          this.opcoes.onAcessos(cliente.id, cliente.nome);
        });
        acoesTopo.appendChild(btnAcessos);
      }

      const btnCloseX = document.createElement("button");
      btnCloseX.type = "button";
      btnCloseX.className = "btn btn--icon btn--ghost";
      btnCloseX.title = "Fechar";
      btnCloseX.setAttribute("aria-label", "Fechar");
      btnCloseX.innerHTML = iconeHtml("fechar");
      btnCloseX.addEventListener("click", () => this.close());
      acoesTopo.appendChild(btnCloseX);
    }

    // 2. Montar Abas e Painéis no Corpo
    const corpo = this.box.querySelector('[data-role="corpo"]');
    if (!corpo) return;

    corpo.innerHTML = html`
      <nav class="modal-ficha-cliente__tabs" role="tablist" aria-label="Abas da ficha do cliente">
        <button type="button" class="btn is-active" data-client-tab="resumo">Resumo & Cadastro</button>
        <button type="button" class="btn" data-client-tab="acessos">Acessos Remotos (${acessos.length})</button>
        <button type="button" class="btn" data-client-tab="versoes">Matriz de Versões</button>
        <button type="button" class="btn" data-client-tab="timeline">Linha do Tempo (${historico.length})</button>
      </nav>
      <section class="client-hub-panel" data-client-panel="resumo" data-role="resumo-panel"></section>
      <section class="client-hub-panel" data-client-panel="acessos" hidden><div class="access-grid" data-role="acessos"></div></section>
      <section class="client-hub-panel" data-client-panel="versoes" hidden><div data-role="versao-matriz"></div></section>
      <section class="client-hub-panel" data-client-panel="timeline" hidden><div class="client-timeline" data-role="ultima"></div></section>
    `.toString();

    this._desenharResumo(corpo.querySelector('[data-role="resumo-panel"]'));
    this._desenharAcessos(corpo.querySelector('[data-role="acessos"]'));
    this._desenharMatrizVersoes(corpo.querySelector('[data-role="versao-matriz"]'));
    this._desenharLinhaDoTempo(corpo.querySelector('[data-role="ultima"]'));

    // Ligar alternância de abas
    const tabsBar = corpo.querySelector(".modal-ficha-cliente__tabs");
    tabsBar?.addEventListener("click", (e) => {
      const botao = e.target.closest("[data-client-tab]");
      if (!botao) return;
      for (const item of tabsBar.querySelectorAll("[data-client-tab]")) {
        item.classList.toggle("is-active", item === botao);
      }
      for (const painel of corpo.querySelectorAll("[data-client-panel]")) {
        painel.hidden = painel.dataset.clientPanel !== botao.dataset.clientTab;
      }
    });
  }

  _desenharResumo(container) {
    if (!container) return;
    const { cliente, historico } = this;
    const ultimaData = historico?.[0]?.data || null;
    const tempoUltima = ultimaData ? haQuantoTempo(ultimaData) : "";
    const ultimoTexto = ultimaData ? `${ultimaData}${tempoUltima ? ` (${tempoUltima})` : ""}` : "Nenhuma atualização registrada";

    const statsGrid = document.createElement("div");
    statsGrid.className = "resumo-compacto-grid";
    statsGrid.style.cssText = "display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:var(--sp-3); margin-bottom:var(--sp-4);";
    statsGrid.innerHTML = html`
      <div class="card stat-card" style="padding:var(--sp-3); margin:0;">
        <div class="stat-card__label" style="font-size:var(--txt-xs); color:var(--cor-texto-fraco); text-transform:uppercase; font-weight:var(--peso-forte);">Última atualização</div>
        <div class="stat-card__value" style="font-size:var(--txt-base); font-weight:var(--peso-medio); margin-top:4px;">${ultimoTexto}</div>
      </div>
    `.toString();
    container.appendChild(statsGrid);

    const cadastro = document.createElement("div");
    cadastro.className = "info-grid";
    cadastro.append(
      itemDeInformacao("Código", cliente.codigo),
      itemDeInformacao("Grupo / Rede", cliente.grupo),
      itemDeInformacao("Cidade", cliente.cidade),
      itemDeInformacao("Regime tributário", cliente.regimeTributario),
      itemDeInformacao("Sistemas contratados", (cliente.sistemas || []).join(", "), true)
    );
    container.appendChild(cadastro);
  }

  _desenharAcessos(container) {
    if (!container) return;
    const { acessos } = this;
    if (acessos.length === 0) {
      container.appendChild(
        estadoVazio({
          titulo: "Nenhum acesso remoto cadastrado",
          descricao: "Cadastre as máquinas e identificadores AnyDesk/Suporte Bredas.",
          icone: "acessos",
        })
      );
      return;
    }
    for (const acesso of acessos) {
      const card = document.createElement("article");
      card.className = "access-card";
      card.innerHTML = cartaoAcesso(acesso);
      card.addEventListener("click", async (e) => {
        const tipo = e.target.closest("[data-copy]")?.dataset.copy;
        if (!tipo) return;
        const valor = tipo === "anydesk" ? acesso.anydesk : (acesso.suporte_bredas || acesso.suporteBredas);
        if (valor && await copiarParaAreaDeTransferencia(valor)) {
          avisoRapido.sucesso("Acesso copiado.");
        }
      });
      container.appendChild(card);
    }
  }

  _desenharMatrizVersoes(container) {
    if (!container) return;
    const { cliente, historico, painelVersoes, situacaoSistemas } = this;
    const fixos = situacaoSistemas.filter((s) => s.fixo);
    const nomesFixos = new Set(fixos.map((s) => s.sistema.toLocaleLowerCase("pt-BR")));
    const linhas = montarMatrizVersoes(cliente, historico, painelVersoes, situacaoSistemas)
      .filter((linha) => !nomesFixos.has(linha.sistema.toLocaleLowerCase("pt-BR")));

    if (linhas.length === 0 && fixos.length === 0) {
      container.replaceChildren(
        estadoVazio({
          titulo: "Nenhum sistema associado",
          descricao: "Este cliente não possui sistemas vinculados nem registros prévios.",
          icone: "sistemas",
        })
      );
      return;
    }

    container.replaceChildren();

    // 1. Matriz de sistemas atualizáveis
    if (linhas.length > 0) {
      const tableWrap = document.createElement("div");
      tableWrap.className = "table-wrap";
      tableWrap.style.marginBottom = "var(--sp-3)";

      const table = document.createElement("table");
      table.className = "data-table";
      table.innerHTML = CABECALHO_MATRIZ;

      const tbody = table.querySelector("tbody");
      for (const linha of linhas) {
        const tr = document.createElement("tr");
        tr.className = "is-readonly";
        tr.innerHTML = linhaMatrizVersoes(linha);
        tbody.appendChild(tr);
      }

      tableWrap.appendChild(table);
      container.appendChild(tableWrap);
    }

    // 2. Componentes fixos
    if (fixos.length > 0) {
      const secao = document.createElement("section");
      secao.style.cssText = "margin-top:var(--sp-3); padding:var(--sp-3); border:1px solid var(--cor-borda); border-radius:var(--raio-md);";
      const titulo = document.createElement("h4");
      titulo.textContent = "Serviços/componentes fixos";
      titulo.style.margin = "0 0 var(--sp-2)";
      const lista = document.createElement("ul");
      lista.style.margin = "0";
      lista.style.paddingLeft = "var(--sp-4)";
      for (const sistema of fixos) {
        const item = document.createElement("li");
        item.textContent = sistema.sistema;
        lista.appendChild(item);
      }
      secao.append(titulo, lista);
      container.appendChild(secao);
    }

    // 3. Telemetria de agentes
    const nomeNorm = (cliente.nome || "").trim().toLowerCase();
    const agentes = (painelVersoes?.agentes || []).filter((a) => {
      return a.empresa && a.empresa.trim().toLowerCase() === nomeNorm;
    });

    if (agentes.length > 0) {
      const telemetriaSecao = document.createElement("section");
      telemetriaSecao.className = "telemetria-agentes";
      telemetriaSecao.style.cssText = "margin-top:var(--sp-4); padding-top:var(--sp-3); border-top:1px solid var(--cor-borda);";
      telemetriaSecao.innerHTML = html`
        <h4 style="margin:0 0 var(--sp-1);">Telemetria dos Agentes</h4>
        <p class="text-muted" style="font-size:var(--txt-xs); margin-bottom:var(--sp-3);">
          Dados reportados em tempo real pelas máquinas clientes. A situação de cada sistema vem das atualizações registradas.
        </p>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Máquina</th>
                <th scope="col">Versão Reportada</th>
                <th scope="col">Último Contato</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              ${agentes.map(
                (a) => html`
                  <tr class="is-readonly">
                    <td><strong>${a.maquina || "Servidor"}</strong></td>
                    <td>${a.ultimaVersao ? html`<span class="version-chip">${a.ultimaVersao}</span>` : "—"}</td>
                    <td title="${formatarDataHora(a.ultimaComunicacao)}">${tempoRelativo(a.ultimaComunicacao)}</td>
                    <td><span class="badge ${a.situacao === "ok" ? "badge--success" : "badge--warning"}">${a.situacao || "Ativo"}</span></td>
                  </tr>
                `
              )}
            </tbody>
          </table>
        </div>
      `.toString();
      container.appendChild(telemetriaSecao);
    }
  }

  _desenharLinhaDoTempo(container) {
    if (!container) return;
    const { cliente, historico } = this;
    if (!historico || historico.length === 0) {
      container.appendChild(
        estadoVazio({
          titulo: "Nenhuma atualização registrada",
          descricao: `Nenhuma atualização encontrada para ${cliente.nome}.`,
          icone: "atualizacoes",
        })
      );
      return;
    }

    historico.forEach((registro, indice) => {
      if (indice > 0) {
        const separador = document.createElement("hr");
        separador.className = "separator";
        container.appendChild(separador);
      }
      const grid = document.createElement("article");
      grid.className = "info-grid";

      const topoLinha = document.createElement("div");
      topoLinha.className = "info-grid__item info-grid__item--wide";
      topoLinha.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--sp-2);";
      topoLinha.innerHTML = html`
        <strong style="font-size:var(--txt-base);">${registro.data || "Sem data"} — ${registro.sistema || "Sistema não informado"}</strong>
        <button type="button" class="btn btn--small btn--ghost" data-action="copiar-chamado" data-index="${indice}" title="Copiar chamado formatado para área de transferência">
          ${iconeHtml("copiar")} Copiar Chamado
        </button>
      `.toString();
      grid.appendChild(topoLinha);

      grid.appendChild(itemDeInformacao("Data", registro.data));
      grid.appendChild(itemDeInformacao("Sistema", registro.sistema));
      grid.appendChild(itemDeInformacao("Versão", registro.versao));
      grid.appendChild(itemDeInformacao("Atualizado por", registro.responsavel));
      grid.appendChild(itemDeInformacao("Máquinas", registro.maquinas));
      grid.appendChild(itemDeInformacao("Motivo", registro.motivo, true));
      if (registro.obs) grid.appendChild(itemDeInformacao("Obs", registro.obs, true));
      container.appendChild(grid);
    });

    container.addEventListener("click", async (e) => {
      const btn = e.target.closest('[data-action="copiar-chamado"]');
      if (!btn) return;
      const idx = Number(btn.dataset.index);
      const reg = historico[idx];
      if (!reg) return;
      const anterior = historico[idx + 1] || null;
      const textoChamado = relatorioDeAtualizacao(reg, { cliente, anterior });
      if (await copiarParaAreaDeTransferencia(textoChamado)) {
        avisoRapido.sucesso("Chamado copiado para a área de transferência.");
      }
    });
  }
}

function itemDeInformacao(label, value, wide = false) {
  const div = document.createElement("div");
  div.className = "info-grid__item" + (wide ? " info-grid__item--wide" : "");
  const l = document.createElement("div");
  l.className = "info-grid__label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "info-grid__value";
  v.textContent = value || "—";
  div.append(l, v);
  return div;
}
