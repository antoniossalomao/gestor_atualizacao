const { BaseRepository } = require("./BaseRepository");
const { chave } = require("../shared/normalizacao");

/**
 * Catálogo de sistemas. Cada atendimento e cada cliente aponta para uma
 * linha daqui pelo id (tabelas `atualizacao_sistemas` e `cliente_sistemas`).
 *
 * `ativo = 0` é o sistema que saiu do catálogo mas continua no histórico
 * (CTe, B_Rat...): some das telas de cadastro, e os atendimentos antigos
 * continuam apontando para ele. Por isso "excluir" um sistema desativa em
 * vez de apagar -- apagar a linha deixaria órfão tudo o que já foi feito
 * nele, e a chave estrangeira nem deixaria.
 */
class SistemaRepository extends BaseRepository {
  get table() {
    return "sistemas";
  }

  /** Nomes do catálogo ativo -- os checkboxes de Clientes e o select de Sistemas. */
  list() {
    return this.conn.prepare("SELECT nome FROM sistemas WHERE ativo = 1 ORDER BY nome").all().map((r) => r.nome);
  }

  /**
   * Todos, inclusive os inativos -- para casar nomes antigos do histórico.
   * `*` em vez da lista de colunas: a migração 1 usa este método num banco
   * que ainda não tem `controla_versao` (criada só na migração 2), e uma
   * lista explícita quebraria a migração de toda instalação antiga.
   */
  todos() {
    return this.conn.prepare("SELECT * FROM sistemas ORDER BY nome").all();
  }

  versoes() {
    return this.conn.prepare("SELECT nome, ultima_versao AS data FROM sistemas WHERE ativo = 1 AND controla_versao = 1 ORDER BY nome").all();
  }

  salvarVersao(nome, data) {
    return this.conn.prepare("UPDATE sistemas SET ultima_versao = ? WHERE lower(nome) = lower(?) AND ativo = 1 AND controla_versao = 1").run(data, nome).changes;
  }

  /** Classificação e referência preservada, inclusive dos inativos do histórico. */
  catalogo() {
    return this.conn.prepare("SELECT id, nome, ativo, controla_versao AS controlaVersao, ultima_versao AS ultimaVersao FROM sistemas ORDER BY nome").all();
  }

  getById(id) {
    return this.conn.prepare("SELECT id, nome, ativo, controla_versao AS controlaVersao, ultima_versao AS ultimaVersao FROM sistemas WHERE id = ?").get(id);
  }

  classificar(id, controlaVersao) {
    return this.conn.prepare("UPDATE sistemas SET controla_versao = ? WHERE id = ? AND ativo = 1").run(controlaVersao ? 1 : 0, id).changes;
  }

  /**
   * Adiciona um sistema ao catálogo. Um nome que já existe INATIVO volta a
   * ficar ativo (com o mesmo id, então o histórico dele reaparece junto);
   * devolve false se já existia ativo.
   */
  add(nome) {
    const existente = this.conn.prepare("SELECT id, ativo FROM sistemas WHERE lower(nome) = lower(?)").get(nome);
    if (existente?.ativo) return false;
    if (existente) {
      this.conn.prepare("UPDATE sistemas SET ativo = 1 WHERE id = ?").run(existente.id);
      return true;
    }
    this.conn.prepare("INSERT INTO sistemas (nome) VALUES (?)").run(nome);
    return true;
  }

  /**
   * Tira um sistema do catálogo: desativa e desmarca de todo cliente. Os
   * atendimentos antigos continuam apontando para ele. Devolve o id e
   * quantos clientes perderam a marcação, ou null se não havia um sistema
   * ATIVO com esse nome.
   * @returns {{id: number, clientesAfetados: number} | null}
   */
  remove(nome) {
    const linha = this.conn.prepare("SELECT id FROM sistemas WHERE lower(nome) = lower(?) AND ativo = 1").get(nome);
    if (!linha) return null;
    return this.conn.transaction(() => {
      this.conn.prepare("UPDATE sistemas SET ativo = 0 WHERE id = ?").run(linha.id);
      const clientesAfetados = this.conn.prepare("DELETE FROM cliente_sistemas WHERE sistema_id = ?").run(linha.id).changes;
      return { id: linha.id, clientesAfetados };
    })();
  }

  /**
   * O sistema que um nome digitado quer dizer, ativo ou não, ou null.
   *
   * Casa primeiro pela grafia (sem caixa, acento nem pontuação, a mesma
   * `chave` da normalização) e depois ignorando o prefixo "B_" -- "Vendas"
   * é o B_Vendas, e "DFE" e "B_DFe" são o mesmo sistema. É a regra que o
   * antigo `sameSystem` aplicava a cada leitura; agora roda uma vez, na
   * gravação, e o resto do programa só compara ids.
   * @returns {{id: number, nome: string, ativo: number, ultima_versao: string, controla_versao: number} | null}
   */
  resolver(nome) {
    return achar(this.todos(), nome);
  }

  /**
   * Ids dos sistemas de uma lista de nomes, na ordem dada e sem repetir.
   * Um nome que não existe no catálogo é cadastrado INATIVO: o registro
   * guarda o que foi digitado sem inventar outro destino, e o nome não
   * aparece nas telas de cadastro até alguém ativá-lo em "+ Novo Sistema".
   * @param {string[]} nomes
   * @returns {{id: number, nome: string}[]}
   */
  resolverOuCriar(nomes) {
    const catalogo = this.todos();
    const inserir = this.conn.prepare("INSERT INTO sistemas (nome, ativo) VALUES (?, 0)");
    const saida = [];
    for (const bruto of nomes) {
      const nome = String(bruto || "").trim();
      if (!nome) continue;
      let sistema = achar(catalogo, nome);
      if (!sistema) {
        const id = Number(inserir.run(nome).lastInsertRowid);
        sistema = { id, nome, ativo: 0, ultima_versao: "", controla_versao: 1 };
        catalogo.push(sistema);
      }
      if (!saida.some((s) => s.id === sistema.id)) saida.push({ id: sistema.id, nome: sistema.nome });
    }
    return saida;
  }
}

function semPrefixoB(k) {
  return k.startsWith("B") ? k.slice(1) : k;
}

function achar(catalogo, nome) {
  const k = chave(nome);
  if (!k) return null;
  return catalogo.find((s) => chave(s.nome) === k) || catalogo.find((s) => semPrefixoB(chave(s.nome)) === semPrefixoB(k)) || null;
}

module.exports = { SistemaRepository, acharSistema: achar };
