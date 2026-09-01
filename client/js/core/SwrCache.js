/**
 * Cache "stale-while-revalidate" para respostas da API.
 *
 * O problema que ele resolve: antes, TODA troca de aba refazia as duas ou três
 * chamadas daquela tela do zero, e a tabela ficava em branco (ou com o
 * esqueleto) até a resposta voltar. Como as pessoas ficam pulando entre
 * Resumo, Atualizações e Clientes o tempo todo, isso significava esperar por
 * dados que, na prática, não tinham mudado.
 *
 * A estratégia é a mesma que bibliotecas como SWR e React Query popularizaram:
 *
 *   1. Tem valor guardado? Mostra IMEDIATAMENTE (a tela aparece pronta).
 *   2. Em paralelo, busca a versão nova no servidor.
 *   3. Chegou algo diferente do que está na tela? Redesenha.
 *
 * O passo 3 é importante: se a resposta nova for igual à guardada (o caso
 * comum), não redesenhamos nada -- evita o "pisca" de uma tabela sendo
 * reconstruída sem nenhuma mudança visível.
 *
 * Valores mais velhos que `maxAgeMs` são descartados: dados de meia hora atrás
 * não servem nem como aproximação, é melhor mostrar o esqueleto.
 */
const MAX_AGE_PADRAO_MS = 5 * 60 * 1000;

export class SwrCache {
  constructor({ maxAgeMs = MAX_AGE_PADRAO_MS } = {}) {
    this.maxAgeMs = maxAgeMs;
    /** @type {Map<string, {valor: any, serializado: string, em: number}>} */
    this.entradas = new Map();
  }

  /** Valor guardado para a chave, ou `undefined` se não existe / venceu. */
  peek(chave) {
    const entrada = this.entradas.get(chave);
    if (!entrada) return undefined;
    if (Date.now() - entrada.em > this.maxAgeMs) {
      this.entradas.delete(chave);
      return undefined;
    }
    return entrada.valor;
  }

  set(chave, valor) {
    this.entradas.set(chave, { valor, serializado: estavel(valor), em: Date.now() });
  }

  /** True se `valor` é diferente do que já está guardado nessa chave. */
  mudou(chave, valor) {
    const entrada = this.entradas.get(chave);
    return !entrada || entrada.serializado !== estavel(valor);
  }

  /** Quando o valor guardado foi buscado (timestamp), ou `null`. */
  buscadoEm(chave) {
    return this.entradas.get(chave)?.em ?? null;
  }

  /**
   * Descarta o que foi guardado. Sem argumento, limpa tudo; com um prefixo,
   * limpa só as chaves que começam com ele -- é assim que um "Adicionar
   * cliente" invalida todas as listagens de clientes de uma vez, incluindo as
   * de outras abas que também dependem desse dado.
   */
  invalidar(prefixo) {
    if (prefixo == null) {
      this.entradas.clear();
      return;
    }
    for (const chave of [...this.entradas.keys()]) {
      if (chave.startsWith(prefixo)) this.entradas.delete(chave);
    }
  }
}

/**
 * Serializa um valor de forma ESTÁVEL (chaves de objeto sempre na mesma
 * ordem), para poder comparar duas respostas por igualdade de texto.
 * `JSON.stringify` puro não serve: `{a:1,b:2}` e `{b:2,a:1}` viram textos
 * diferentes, e o SQLite não garante a ordem das colunas entre consultas.
 */
function estavel(valor) {
  return JSON.stringify(valor, (_chave, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)));
    }
    return v;
  });
}
