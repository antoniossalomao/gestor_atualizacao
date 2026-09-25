/**
 * Situação de versão dos clientes, do jeito que a tela apresenta. A REGRA
 * (quem está em dia) mora no servidor, em services/situacaoVersao.js; aqui
 * só há rótulo, ordem e conta de porcentagem -- o que não precisa do DOM e
 * por isso pode ser testado no Node.
 */

/**
 * Os três grupos que o card do Resumo mostra, na ordem da barra. A chave é a
 * mesma que o /resumo devolve em `situacaoClientes`. "sem_atualizaveis" não
 * entra: quem só tem sistema fixo (ou nenhum) fica fora da conta, e aparece
 * só como uma nota embaixo do card.
 */
export const GRUPOS_SITUACAO = [
  { chave: "em_dia", rotulo: "Em dia", severidade: "boa", descricao: "B_Vendas na versão oficial (sem B_Vendas: todos os sistemas)." },
  { chave: "desatualizado", rotulo: "Desatualizados", severidade: "alta", descricao: "B_Vendas com versão anterior à oficial (sem B_Vendas: algum sistema)." },
  { chave: "pendente", rotulo: "Verificação pendente", severidade: "media", descricao: "Sem atraso confirmado, mas falta informação para decidir." },
];

/** A explicação de "pela data", repetida onde o rótulo aparece. */
export const AJUDA_PELA_DATA =
  "Sem versão registrada na atualização: a situação foi deduzida comparando a data da atualização com a data da versão oficial.";

/**
 * "Em dia (pela data)" quando a situação não veio de uma versão registrada.
 * @param {string} situacao
 * @param {boolean} [pelaData]
 */
export function rotuloSituacao(situacao, pelaData) {
  return pelaData ? `${situacao} (pela data)` : situacao;
}

/**
 * Porcentagem inteira de `parte` em `total`. Sem total, 0 -- e não NaN, nem
 * "100% em dia" de um conjunto vazio (quem mostra decide o estado vazio).
 * @param {number} parte
 * @param {number} total
 */
export function percentual(parte, total) {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

/**
 * Totais do card a partir do `situacaoClientes` do /resumo. `avaliados` é o
 * denominador das porcentagens: só quem tem ao menos um sistema que
 * controla versão.
 * @param {Record<string, any[]>} situacao
 */
export function totaisSituacao(situacao) {
  const contar = (chave) => (situacao?.[chave] || []).length;
  const grupos = GRUPOS_SITUACAO.map((g) => ({ ...g, total: contar(g.chave) }));
  const avaliados = grupos.reduce((soma, g) => soma + g.total, 0);
  return {
    grupos: grupos.map((g) => ({ ...g, pct: percentual(g.total, avaliados) })),
    avaliados,
    foraDaAvaliacao: contar("sem_atualizaveis"),
  };
}

/**
 * O que a lista de um grupo mostra na coluna "Sistemas": os sistemas que
 * puseram o cliente naquele grupo. Quem tem B_Vendas foi decidido só por
 * ele (`decididoPor`, ver services/situacaoVersao.js no servidor), então só
 * ele aparece. Sem B_Vendas, um desatualizado lista os atrasados (não os em
 * dia), e um pendente lista os que estão sem informação.
 * @param {string} grupo
 * @param {Array<{sistema: string, situacao: string, pelaData?: boolean}>} sistemas
 * @param {string|null} [decididoPor]
 */
export function sistemasQueExplicam(grupo, sistemas, decididoPor = null) {
  const relevantes = decididoPor
    ? sistemas.filter((s) => s.sistema === decididoPor)
    : grupo === "desatualizado"
      ? sistemas.filter((s) => s.situacao === "Desatualizado")
      : grupo === "pendente"
        ? sistemas.filter((s) => s.situacao !== "Em dia" && s.situacao !== "Desatualizado")
        : sistemas;
  return relevantes
    .map((s) => (grupo === "pendente" ? `${s.sistema}: ${s.situacao.toLowerCase()}` : `${s.sistema}${s.pelaData ? " (pela data)" : ""}`))
    .join(", ");
}
