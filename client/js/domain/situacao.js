/**
 * Situação de versão dos clientes, do jeito que a tela apresenta. A REGRA
 * (quem está em dia) mora no servidor, em services/situacaoVersao.js; aqui
 * só há rótulo, ordem e conta de porcentagem -- o que não precisa do DOM e
 * por isso pode ser testado no Node.
 */

/**
 * Os grupos que o card do Resumo mostra, na ordem da barra. A chave é a
 * mesma que o /resumo devolve em `situacaoClientes`. "sem_atualizaveis" não
 * entra: quem só tem sistema fixo (ou nenhum) fica fora da conta, e aparece
 * só como uma nota embaixo do card.
 */
export const GRUPOS_SITUACAO = [
  { chave: "em_dia", rotulo: "Em dia", severidade: "boa", descricao: "B_Vendas atualizado na data da versão oficial ou depois (sem B_Vendas: todos os sistemas)." },
  // Neutro, e não amarelo: ninguém está errado ainda. É a versão oficial que
  // acabou de sair, dentro do prazo da equipe (A07).
  { chave: "aguardando", rotulo: "Aguardando atualização", severidade: "neutra", descricao: "Atualizado pouco antes da versão oficial, que ainda está dentro do prazo da equipe." },
  { chave: "desatualizado", rotulo: "Desatualizados", severidade: "alta", descricao: "B_Vendas nunca atualizado, ou com a última atualização antes da versão oficial e o prazo vencido (sem B_Vendas: algum sistema assim)." },
];

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
 * Texto da coluna "Sistemas" das listas do Resumo. QUAIS sistemas explicam o
 * grupo é regra do servidor (`explicam`, em services/situacaoVersao.js);
 * aqui só se escreve, e quem nunca foi atualizado diz isso.
 * @param {Array<{sistema: string, situacao: string}>} explicam
 */
export function descreverSistemasQueExplicam(explicam) {
  return explicam
    .map((s) => (s.situacao === "Nunca atualizado" || s.situacao === "Sem informação" ? `${s.sistema} (${s.situacao.toLowerCase()})` : s.sistema))
    .join(", ");
}
