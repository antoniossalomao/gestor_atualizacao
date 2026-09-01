/**
 * Pequeno conjunto de ícones em SVG inline (estilo "linha", 20x20),
 * usados na navegação por abas e em alguns botões -- puramente
 * decorativo/de orientação visual, sem nenhuma lógica.
 *
 * São inline (e não um arquivo de fonte ou sprite externo) porque assim
 * herdam a cor do texto via `currentColor` e não custam nenhuma requisição
 * a mais -- com pouco mais de vinte ícones, o peso é irrelevante.
 */
const PATHS = {
  resumo: '<path d="M3 3v14a1 1 0 001 1h14M7 14v-4M11 14V6M15 14v-7" stroke-linecap="round" stroke-linejoin="round"/>',
  atualizacoes:
    '<path d="M4 4v5h5M16 16v-5h-5M4.5 9a7 7 0 0112-4.5L19 7M15.5 11a7 7 0 01-12 4.5L1 13" stroke-linecap="round" stroke-linejoin="round"/>',
  distribuicao: '<path d="M4 4h12v12H4zM8 8h4M8 12h4" stroke-linecap="round" stroke-linejoin="round"/><path d="m13 3 3 3" stroke-linecap="round"/>',
  versoes: '<rect x="4" y="3" width="12" height="14" rx="2"/><path d="M8 7h4M8 10h4M8 13h2" stroke-linecap="round"/>',
  agendamentos:
    '<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2v4M13 2v4" stroke-linecap="round"/>',
  clientes:
    '<circle cx="7" cy="7" r="3"/><path d="M1 17c0-3 2.5-5 6-5s6 2 6 5M14 4.5c1.7.3 3 1.8 3 3.5s-1.3 3.2-3 3.5M17 17c0-2.5-1.7-4.3-4-4.8" stroke-linecap="round" stroke-linejoin="round"/>',
  consulta: '<circle cx="9" cy="9" r="6"/><path d="M17 17l-4-4" stroke-linecap="round"/>',
  historico: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2" stroke-linecap="round" stroke-linejoin="round"/>',
  sistemas: '<path d="M3 4h14l-5.5 6.5V16l-3 1.5v-7L3 4z" stroke-linecap="round" stroke-linejoin="round"/>',
  users: '<rect x="2" y="3" width="16" height="14" rx="2"/><circle cx="7.5" cy="8.5" r="2"/><path d="M4.5 14.5c0-1.7 1.3-2.5 3-2.5s3 .8 3 2.5M12.5 7.5h4M12.5 10.5h3" stroke-linecap="round"/>',
  backups:
    '<rect x="2" y="6" width="16" height="11" rx="1.5"/><path d="M2 6l1.5-3h13L18 6M8 10.5h4" stroke-linecap="round" stroke-linejoin="round"/>',
  logout: '<path d="M8 3H4a1 1 0 00-1 1v12a1 1 0 001 1h4M13 14l4-4-4-4M6 10h11" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: '<path d="M10 4v12M4 10h12" stroke-linecap="round"/>',
  minus: '<path d="M4 10h12" stroke-linecap="round"/>',
  upload: '<path d="M10 13V3M6 7l4-4 4 4M4 15v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke-linecap="round" stroke-linejoin="round"/>',
  download: '<path d="M10 3v10M6 9l4 4 4-4M4 15v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke-linecap="round" stroke-linejoin="round"/>',

  // -- acrescentados na revisão de interface --
  busca: '<circle cx="9" cy="9" r="6"/><path d="M17 17l-4-4" stroke-linecap="round"/>',
  atualizar: '<path d="M17 10a7 7 0 11-2.05-4.95M17 3v4h-4" stroke-linecap="round" stroke-linejoin="round"/>',
  alerta: '<path d="M10 3.5 2.5 16.5h15L10 3.5zM10 8.5v3.5M10 14.2v.1" stroke-linecap="round" stroke-linejoin="round"/>',
  vazio: '<path d="M2.5 11.5h4l1.2 2.2h4.6l1.2-2.2h4M3.5 11.5 5.8 4.4A1.4 1.4 0 0 1 7.1 3.5h5.8a1.4 1.4 0 0 1 1.3.9l2.3 7.1v3.6a1.4 1.4 0 0 1-1.4 1.4H4.9a1.4 1.4 0 0 1-1.4-1.4z" stroke-linecap="round" stroke-linejoin="round"/>',
  temaClaro: '<circle cx="10" cy="10" r="3.6"/><path d="M10 1.8v2M10 16.2v2M18.2 10h-2M3.8 10h-2M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4M15.8 15.8l-1.4-1.4M5.6 5.6 4.2 4.2" stroke-linecap="round"/>',
  temaEscuro: '<path d="M16.5 11.8A7 7 0 0 1 8.2 3.5a7 7 0 1 0 8.3 8.3z" stroke-linecap="round" stroke-linejoin="round"/>',
  temaSistema: '<rect x="2.5" y="4" width="15" height="10" rx="1.5"/><path d="M7 17h6M10 14v3" stroke-linecap="round"/>',
  teclado: '<rect x="2" y="5" width="16" height="10" rx="1.6"/><path d="M5.5 8.5h.01M8.5 8.5h.01M11.5 8.5h.01M14.5 8.5h.01M6.5 11.5h7" stroke-linecap="round"/>',
  painel: '<rect x="2.5" y="3.5" width="15" height="13" rx="1.8"/><path d="M8 3.5v13" stroke-linecap="round"/>',
  seta: '<path d="M7 4l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>',
  check: '<path d="M4 10.5l4 4 8-9" stroke-linecap="round" stroke-linejoin="round"/>',
};

/** @param {keyof typeof PATHS} name @returns {string} markup do `<svg>` pronto pra inserir via innerHTML */
export function icon(name) {
  const inner = PATHS[name] || "";
  return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false">${inner}</svg>`;
}
