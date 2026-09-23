import { html } from "../utils/html.js";

/**
 * Marcação da ficha do cliente (aba Consultar Cliente). As contas da matriz
 * de versões estão em domain/matrizVersoes.js; aqui só o desenho.
 */

/**
 * Cartão de acesso remoto de uma máquina. O ID do AnyDesk e o do Suporte
 * Bredas são digitados à mão no cadastro -- texto livre.
 * @param {{maquina?: string, anydesk?: string, suporte_bredas?: string, suporteBredas?: string}} acesso
 */
export function cartaoAcesso(acesso) {
  return html`<h3>${acesso.maquina}</h3>
    <p><span>AnyDesk</span><strong>${acesso.anydesk || "—"}</strong></p>
    <p><span>Suporte Bredas</span><strong>${acesso.suporte_bredas || acesso.suporteBredas || "—"}</strong></p>
    <div class="form-actions"><button type="button" class="btn btn--small" data-copy="anydesk">Copiar AnyDesk</button>
    <button type="button" class="btn btn--small" data-copy="bredas">Copiar Suporte</button></div>`;
}

/** Cabeçalho da tabela da matriz de versões. */
export const CABECALHO_MATRIZ = html`
  <thead>
    <tr>
      <th scope="col">Sistema</th>
      <th scope="col" style="text-align: right">Instalada</th>
      <th scope="col" style="text-align: right">Publicada</th>
      <th scope="col">Estado</th>
      <th scope="col">Último contato</th>
    </tr>
  </thead>
  <tbody></tbody>`;

/**
 * Conteúdo de uma `<tr>` da matriz. A versão instalada pode vir do que o
 * agente reportou ou do que alguém digitou num registro de atualização -- nos
 * dois casos, texto de fora.
 * @param {import("../domain/matrizVersoes.js").LinhaMatriz} linha
 */
export function linhaMatrizVersoes(linha) {
  return html`
    <td data-label="Sistema"><strong>${linha.sistema}</strong></td>
    <td data-label="Instalada" style="text-align: right">
      ${linha.instalada ? html`<span class="version-chip">${linha.instalada}</span>` : "—"}
    </td>
    <td data-label="Publicada" style="text-align: right">
      ${linha.publicada || html`<span class="text-muted">Nenhuma</span>`}
    </td>
    <td data-label="Estado">
      <span class="badge ${linha.estadoBadge}">${linha.estadoLabel}</span>
    </td>
    <td data-label="Último contato" title="${linha.contatoTitle}">
      ${linha.contatoTexto}
    </td>`;
}
