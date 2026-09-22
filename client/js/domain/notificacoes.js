/**
 * O que o Gestor tem a dizer sem ter sido perguntado, reunido num lugar só:
 * agendamento vencido ou vencendo hoje, e agente que parou de se comportar.
 *
 * Isto morava em dois lugares que não se conheciam -- a faixa amarela no topo
 * do app (só agendamentos) e o bloco "Precisa de Atenção" do Resumo (só
 * agentes). Dois avisos grandes, em lugares diferentes, contando pedaços do
 * mesmo assunto: "o que está pendente agora". Juntar aqui é o que permite ter
 * UM contador no sino do cabeçalho -- dois contadores somando coisas
 * diferentes seria pior do que nenhum.
 *
 * Não toca no DOM de propósito (ver ADR-0005), e é aqui que mora a conta que
 * erra em silêncio. O card "Agendamento atrasado" do Resumo, por exemplo,
 * passou a vida inteira invisível: a tela lia `lembretes.atrasados` e o
 * servidor devolve um ARRAY puro (ver AgendamentoRepository.dueSoon). Nada
 * quebrava, nenhum erro aparecia -- o card simplesmente nunca existia. Com a
 * contagem fora da tela, o teste pega.
 */

/**
 * @typedef {object} Notificacao
 * @property {string} chave identificador estável do grupo
 * @property {"erro"|"alerta"} tom o quanto aquilo grita
 * @property {string} icone nome no conjunto de ícones (ver utils/icons.js)
 * @property {string} titulo a frase contada, com o número dentro
 * @property {string} detalhe quem, por extenso, até onde couber
 * @property {number} quantidade o que entra no contador do sino
 * @property {string} destino aba para onde o clique leva
 * @property {Record<string, string>|null} params filtro que a aba deve aplicar
 */

/**
 * Agentes nestas situações merecem aviso, cada um com o filtro que abre
 * exatamente essa lista em Distribuição.
 *
 * "Aguardando autorização demorada" ganhou linha própria em vez de ser somado
 * às pendências: são coisas diferentes (uma espera humano, a outra espera
 * revisão), e o seletor de Distribuição já as separa -- juntá-las aqui
 * mandaria a pessoa para um filtro que não mostra metade do que ela clicou.
 */
/** @type {Array<{situacao: string, tom: "erro"|"alerta", icone: string, singular: string, plural: string}>} */
const SITUACOES_DE_AGENTE = [
  { situacao: "erro", tom: "erro", icone: "alerta", singular: "agente com falha", plural: "agentes com falha" },
  { situacao: "pendencias", tom: "alerta", icone: "alerta", singular: "agente com pendência", plural: "agentes com pendências" },
  {
    situacao: "aguardando_autorizacao_demorada",
    tom: "alerta",
    icone: "relogio",
    singular: "agente esperando autorização há tempo demais",
    plural: "agentes esperando autorização há tempo demais",
  },
  { situacao: "offline", tom: "alerta", icone: "alerta", singular: "agente sem contato", plural: "agentes sem contato" },
];

/**
 * Monta a lista que o sino mostra, da pior notícia para a menos urgente.
 *
 * Agrupa em vez de listar item a item: com trinta agentes fora do ar, trinta
 * linhas num menu suspenso não é informação, é um paredão que ninguém lê. O
 * número responde "quanto", os primeiros nomes respondem "quem", e o clique
 * leva à tela que responde o resto.
 *
 * @param {{lembretes?: any, painel?: any}} [dados] como vieram da API --
 *   `lembretes` de `/agendamentos/lembretes`, `painel` de `/versoes/painel`
 *   (que é `null` com o Atualizador desativado).
 * @returns {Notificacao[]}
 */
export function montarNotificacoes({ lembretes, painel } = {}) {
  const tarefas = Array.isArray(lembretes) ? lembretes : [];
  const hoje = comoNumero(new Date());
  // Uma data ilegível não prova atraso: fica em "hoje", que é o balde que
  // pede atenção sem acusar. Ela chegou aqui porque o SQL já a julgou vencida.
  const atrasadas = tarefas.filter((t) => {
    const dia = dataComoNumero(t?.data);
    return dia !== null && dia < hoje;
  });
  const deHoje = tarefas.filter((t) => !atrasadas.includes(t));

  const agentes = Array.isArray(painel?.agentes) ? painel.agentes : [];

  return [
    grupo({
      chave: "agendamentos-atrasados",
      tom: "erro",
      icone: "calendario",
      itens: atrasadas,
      singular: "agendamento atrasado",
      plural: "agendamentos atrasados",
      nomeDe: (t) => t?.cliente || t?.tarefa,
      destino: "agendamentos",
    }),
    ...SITUACOES_DE_AGENTE.map((s) =>
      grupo({
        chave: `agentes-${s.situacao}`,
        tom: s.tom,
        icone: s.icone,
        itens: agentes.filter((a) => a?.situacao === s.situacao),
        singular: s.singular,
        plural: s.plural,
        nomeDe: (a) => a?.empresa || a?.cnpj,
        destino: "distribuicao",
        params: { situacao: s.situacao },
      })
    ),
    grupo({
      chave: "agendamentos-hoje",
      tom: "alerta",
      icone: "relogio",
      itens: deHoje,
      singular: "agendamento para hoje",
      plural: "agendamentos para hoje",
      nomeDe: (t) => t?.cliente || t?.tarefa,
      destino: "agendamentos",
    }),
  ].filter((n) => n !== null);
}

/** Quanto o contador do sino mostra. @param {Notificacao[]} notificacoes */
export function totalDe(notificacoes) {
  return (notificacoes || []).reduce((soma, n) => soma + (n?.quantidade || 0), 0);
}

/**
 * Um grupo, ou `null` quando não há nada a contar -- grupo vazio vira linha
 * "0 agentes com falha", que é exatamente o tipo de ruído que treina todo
 * mundo a ignorar o sino.
 *
 * @param {{chave: string, tom: "erro"|"alerta", icone: string, itens: any[],
 *          singular: string, plural: string, nomeDe: (item: any) => string|undefined,
 *          destino: string, params?: Record<string, string>|null}} config
 * @returns {Notificacao|null}
 */
function grupo({ chave, tom, icone, itens, singular, plural, nomeDe, destino, params = null }) {
  if (itens.length === 0) return null;
  return {
    chave,
    tom,
    icone,
    titulo: `${itens.length} ${itens.length === 1 ? singular : plural}`,
    detalhe: nomes(itens.map(nomeDe)),
    quantidade: itens.length,
    destino,
    params,
  };
}

/**
 * "Mercado Central, Padaria do Zé e mais 3".
 *
 * Dois nomes e um resto: é o que cabe numa linha de menu sem quebrar, e é
 * quanto basta para reconhecer se o problema é onde se imaginava.
 */
function nomes(lista) {
  const validos = lista.map((n) => String(n || "").trim()).filter(Boolean);
  if (validos.length === 0) return "";
  const mostrados = validos.slice(0, 2).join(", ");
  const resto = validos.length - 2;
  return resto > 0 ? `${mostrados} e mais ${resto}` : mostrados;
}

/** dd/mm/aaaa -> 20260922, comparável como número. `null` se não for data. */
function dataComoNumero(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto || "").trim());
  if (!m) return null;
  const [, dia, mes, ano] = m;
  return Number(`${ano}${mes}${dia}`);
}

/** O mesmo formato, para a data de hoje. @param {Date} d */
function comoNumero(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return Number(`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`);
}
