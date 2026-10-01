/**
 * Estado dos dados de uma tela: quando chegou o que está sendo mostrado e se
 * a última tentativa de atualizar falhou (aviso de dados desatualizados; ver o
 * CHANGELOG de 29/09/2026).
 *
 * Existe porque o `swr()` da View, para não trocar a tela por uma mensagem de
 * erro, continua mostrando o dado anterior quando uma busca nova falha -- e
 * fazia isso em silêncio. A tela parecia atualizada, e não estava: quem
 * decidia olhando o Resumo não tinha como saber que os números eram de uma
 * hora atrás. Agora a View mostra um aviso com o horário do dado e um botão
 * de tentar de novo, e ele some sozinho quando uma busca volta a dar certo.
 *
 * Puro (sem DOM) para ser testável; quem desenha o aviso é a View.
 *
 * Os estados, do ponto de vista de quem olha a tela:
 * - carregando pela primeira vez: o esqueleto da tabela (sem aviso);
 * - revalidando: a barra fina no topo da view (View._indicarRevalidacao);
 * - atualizado: nada;
 * - erro com dados anteriores: aviso "mostrando os dados de hoje às 14:32";
 * - erro sem dados: aviso "não foi possível carregar".
 */

/**
 * O "lugar" da tela que uma chave de cache ocupa. As chaves com filtro têm a
 * forma "area:tipo:filtros" ("clientes:lista:busca|página|..."), e mudar o
 * filtro troca a chave mas não o lugar: é a mesma tabela. Sem agrupar, uma
 * falha na busca "abc" continuaria avisando depois de a pessoa apagar a busca
 * e a tabela voltar a carregar normalmente.
 *
 * @param {string} chave
 */
export function grupoDaChave(chave) {
  const partes = chave.split(":");
  return partes.length >= 3 ? `${partes[0]}:${partes[1]}` : chave;
}

/** Respostas do proxy (Caddy) quando o painel atrás dele está fora do ar. */
const INDISPONIVEL = new Set([502, 503, 504]);

/**
 * O motivo da falha, em palavras de quem usa. `null` quando não é falha que
 * a tela deva mostrar:
 * - cancelamento: outra busca, mais nova, tomou o lugar desta (troca de
 *   filtro, digitação rápida) -- avisar seria erro falso;
 * - 401: a sessão acabou, e quem cuida disso é a volta para o login.
 *
 * Recebe o erro por "formato" (status, cancelled), não pela classe, para não
 * depender do ApiPainel.
 *
 * @param {any} erro
 * @returns {{tipo: "conexao"|"tempo"|"servidor"|"recusa"|"inesperado", texto: string} | null}
 */
export function descreverFalha(erro) {
  if (!erro || erro.cancelled === true) return null;
  const status = typeof erro.status === "number" ? erro.status : null;
  if (status === 401) return null;
  if (status === 0) return { tipo: "conexao", texto: "Sem conexão com o servidor." };
  if (status !== null && INDISPONIVEL.has(status)) return { tipo: "conexao", texto: "O servidor do painel não está respondendo." };
  if (status === 408) return { tipo: "tempo", texto: "O servidor demorou demais para responder." };
  if (status !== null && status >= 500) return { tipo: "servidor", texto: "O servidor teve um erro ao buscar os dados." };
  if (status !== null && status >= 400) {
    return { tipo: "recusa", texto: erro.message || "O servidor recusou a consulta." };
  }
  // Não veio do servidor: um erro de programação ao desenhar a resposta.
  return { tipo: "inesperado", texto: "Erro inesperado ao montar a tela." };
}

/**
 * "hoje às 14:32", "ontem às 09:05" ou "28/09 às 14:32".
 *
 * @param {number} em timestamp
 * @param {number} [agora]
 */
export function formatarMomento(em, agora = Date.now()) {
  const d = new Date(em);
  const hora = `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
  const dia = inicioDoDia(d);
  const hoje = inicioDoDia(new Date(agora));
  if (dia === hoje) return `hoje às ${hora}`;
  // setDate em vez de "menos 24 h": no dia de troca de horário de verão o dia
  // não tem 24 h.
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  if (dia === ontem.getTime()) return `ontem às ${hora}`;
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)} às ${hora}`;
}

/** @param {number} n */
function doisDigitos(n) {
  return String(n).padStart(2, "0");
}

/** @param {Date} d */
function inicioDoDia(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * @typedef {{em: number|null, falha: {tipo: string, texto: string}|null, falhaEm: number}} EstadoGrupo
 */

export class EstadoDados {
  constructor() {
    /** @type {Map<string, EstadoGrupo>} */
    this.grupos = new Map();
  }

  /** @param {string} chave */
  _grupo(chave) {
    const nome = grupoDaChave(chave);
    let g = this.grupos.get(nome);
    if (!g) {
      g = { em: null, falha: null, falhaEm: 0 };
      this.grupos.set(nome, g);
    }
    return g;
  }

  /**
   * A tela desenhou um dado guardado, obtido em `em`. NÃO limpa a falha: o
   * dado guardado é o mesmo velho de antes, e o aviso sumir e voltar a cada
   * revalidação seria pisca-pisca.
   *
   * @param {string} chave
   * @param {number} em
   */
  exibido(chave, em) {
    this._grupo(chave).em = em;
  }

  /**
   * A busca deu certo: o dado na tela é de agora e o aviso deste lugar sai.
   *
   * @param {string} chave
   * @param {number} [em]
   */
  sucesso(chave, em = Date.now()) {
    const g = this._grupo(chave);
    g.em = em;
    g.falha = null;
  }

  /**
   * A busca falhou. Devolve se a falha passou a ser avisada (false para
   * cancelamento e sessão expirada, que não são assunto da tela).
   *
   * @param {string} chave
   * @param {unknown} erro
   * @param {number} [agora]
   */
  falhou(chave, erro, agora = Date.now()) {
    const falha = descreverFalha(erro);
    if (!falha) return false;
    const g = this._grupo(chave);
    g.falha = falha;
    g.falhaEm = agora;
    return true;
  }

  /**
   * O que o aviso da tela deve dizer, ou `null` se não há o que avisar.
   * Com mais de um lugar falhando, vale o dado MAIS VELHO (é o que a pessoa
   * precisa saber) e o motivo da falha mais recente.
   *
   * @param {number} [agora]
   * @returns {{semDados: boolean, titulo: string, detalhe: string, tipo: string} | null}
   */
  aviso(agora = Date.now()) {
    const falhando = [...this.grupos.values()].filter((g) => g.falha);
    if (falhando.length === 0) return null;
    const recente = falhando.reduce((a, b) => (b.falhaEm > a.falhaEm ? b : a));
    const falha = /** @type {{tipo: string, texto: string}} */ (recente.falha);
    const semDados = falhando.some((g) => g.em === null);
    if (semDados) {
      return { semDados, titulo: "Não foi possível carregar os dados desta tela.", detalhe: falha.texto, tipo: falha.tipo };
    }
    const maisVelho = Math.min(...falhando.map((g) => /** @type {number} */ (g.em)));
    return {
      semDados,
      titulo: `Não foi possível atualizar. Mostrando os dados de ${formatarMomento(maisVelho, agora)}.`,
      detalhe: falha.texto,
      tipo: falha.tipo,
    };
  }
}
