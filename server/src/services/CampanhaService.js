const { OPCOES_STATUS } = require("../config/constantes");
const { dataValida } = require("./validacao");
const { ErroDeValidacao, ErroNaoEncontrado } = require("../shared/erros");
const { separarSistemas } = require("../shared/normalizacao");
const { acharSistema } = require("../database/SistemaRepository");
const { situacaoDoSistema, contaParaVersao } = require("./situacaoVersao");

const STATUS_CONCLUIDO = OPCOES_STATUS[OPCOES_STATUS.length - 1];
/** Status em que a tarefa não encaminha mais o cliente (ver abertasComCliente). */
const STATUS_ENCERRADOS = [STATUS_CONCLUIDO, "Sem resposta"];

/**
 * Campanhas de atualização (E11): "todo cliente de B_NFe precisa estar na
 * 25/09/2026". A meta fica na tabela; o andamento é calculado a cada leitura.
 *
 * Três regras que erram em silêncio e por isso têm teste
 * (server/tests/campanhas.test.js):
 *
 *  1. **Atendido é quem cumpre a meta pela regra de sempre.** O último
 *     atualização do cliente no sistema passa por `situacaoDoSistema`
 *     contra a VERSÃO-ALVO (não contra a oficial de hoje): atendido na data
 *     da versão-alvo ou depois conta (ADR-0008). Não existe "dar baixa"
 *     manual -- a baixa é registrar a atualização em Atualizações, como
 *     sempre. Uma segunda forma de marcar concluído seria um segundo
 *     lugar para a verdade discordar do histórico.
 *  2. **A meta não anda sozinha.** A versão-alvo é copiada na criação, e
 *     editar a campanha não a muda. Publicar uma oficial mais nova em
 *     Sistemas no meio da campanha não "desatende" ninguém.
 *  3. **"Já agendado" é uma tarefa em aberto do MESMO sistema.** Uma
 *     tarefa de instalação de outro sistema não faz o cliente parecer
 *     encaminhado. Ser atendido ganha de estar agendado.
 *  4. **Escolher os clientes substitui a cidade, não soma com ela.** Numa
 *     campanha de clientes escolhidos (`publico: "escolhidos"`) a lista é o
 *     filtro; a cidade é gravada vazia. E só entra quem tem o sistema no
 *     cadastro: um escolhido que perdeu o sistema some da lista (e do
 *     total) em vez de ficar "pendente" de algo que ele não usa.
 */
class CampanhaService {
  /**
   * @param {import("../database/BancoDeDados").BancoDeDados} db
   * @param {import('./HistoricoService').HistoricoService} historico
   * @param {import('./AgendamentoService').AgendamentoService} agendamentos
   */
  constructor(db, historico, agendamentos) {
    this.db = db;
    this.historico = historico;
    this.agendamentos = agendamentos;
  }

  /** Campanhas com o placar de cada uma (sem a lista de clientes). */
  list(situacao = "ativas") {
    const filtro = ["ativas", "encerradas", "todas"].includes(situacao) ? situacao : "ativas";
    const agendas = this._agendasAbertas();
    // Campanhas do mesmo sistema leem os mesmos clientes e atualizações: uma
    // consulta por SISTEMA, e não por campanha.
    const porSistema = new Map();
    return this.db.campanhas.list(filtro).map((c) => ({ ...c, ...this._placar(c, this._clientes(c, agendas, porSistema)) }));
  }

  /** Uma campanha com todos os clientes e a situação de cada um. */
  detalhe(id) {
    const campanha = this._achar(id);
    const clientes = this._clientes(campanha, this._agendasAbertas());
    return { ...campanha, ...this._placar(campanha, clientes), clientes };
  }

  create(input, usuario) {
    const dados = this._validar(input, { nova: true });
    const id = this.db.campanhas.insert({ ...dados, criadaPor: usuario?.nome || "" });
    this.historico.registrar(usuario, "criar", "campanha", `Campanha "${dados.titulo}" (${dados.sistemaNome} ${dados.versaoAlvo})`);
    return this.detalhe(id);
  }

  /**
   * Clientes que têm o sistema no cadastro -- a lista de onde a tela escolhe
   * quem entra numa campanha "só para clientes escolhidos".
   *
   * `atendido` diz se o cliente JÁ cumpre a versão-alvo informada (a mesma
   * regra da campanha), para a tela filtrar "só quem ainda falta". Sem
   * versão-alvo válida não há como dizer, e vai `null` -- e não `false`, que
   * faria todo mundo parecer pendente.
   * @param {string} nomeSistema
   * @param {string} [versaoAlvo] dd/mm/aaaa
   */
  clientesDoSistema(nomeSistema, versaoAlvo = "") {
    const sistema = this.db.sistemas.resolver(String(nomeSistema || ""));
    if (!sistema || !sistema.ativo) throw new ErroDeValidacao("Escolha um sistema do catálogo.");
    const alvo = String(versaoAlvo || "").trim();
    const julga = alvo !== "" && dataValida(alvo);
    const ultimas = julga ? new Map(this.db.atualizacoes.ultimaPorClienteNoSistema(sistema.id).map((r) => [r.cliente_id, r])) : null;
    return this.db.clientes
      .clientesDoSistemaComCodigo(sistema.id)
      .map(({ id, nome, codigo, cidade, grupo, regime }) => ({
        id,
        nome,
        codigo: codigo || "",
        cidade: (cidade || "").trim(),
        grupo: (grupo || "").trim(),
        regime: (regime || "").trim(),
        atendido: ultimas ? situacaoDoSistema(ultimas.get(id), alvo).situacao === "Em dia" : null,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  /**
   * Título, descrição, prazo, cidade e público. Sistema e versão-alvo são a
   * meta: ficam como foram criados. Sem `publico`/`clientes` no corpo, o
   * público atual é mantido.
   */
  update(id, input, usuario) {
    const atual = this._achar(id);
    const publico = input.publico ?? atual.publico;
    // Escolhidos que perderam o sistema ficam de fora do que é reenviado: o
    // que o usuário não vê não pode derrubar uma edição de título.
    const guardados = publico === "escolhidos" ? this._escolhidosDoSistema(atual) : [];
    const dados = this._validar(
      { ...input, publico, clientes: input.clientes ?? guardados, cidade: input.cidade ?? atual.cidade, sistema: atual.sistema, versaoAlvo: atual.versaoAlvo },
      { nova: false, cidadeAtual: atual.cidade, sistemaAtual: { id: atual.sistemaId, nome: atual.sistema } }
    );
    this.db.campanhas.update(atual.id, dados);
    this.historico.registrar(usuario, "atualizar", "campanha", `Campanha "${dados.titulo}"`);
    return this.detalhe(atual.id);
  }

  /**
   * Acrescenta clientes a uma campanha de clientes escolhidos, sem reenviar a
   * lista toda (é o que o botão "Adicionar cliente" do detalhe faz).
   * @param {number|string} id
   * @param {unknown} clientes ids dos clientes a acrescentar
   */
  adicionarClientes(id, clientes, usuario) {
    const campanha = this._achar(id);
    this._exigirListaEditavel(campanha);
    if (!Array.isArray(clientes) || clientes.length === 0) throw new ErroDeValidacao("Escolha pelo menos um cliente para acrescentar.");
    const doSistema = this._idsDoSistema(campanha.sistemaId);
    const ids = [...new Set(clientes.map(Number))];
    if (ids.some((cid) => !Number.isInteger(cid) || !doSistema.has(cid))) throw new ErroDeValidacao(`Há cliente que não usa o sistema "${campanha.sistema}".`);
    const jaEstavam = new Set(this._escolhidosDoSistema(campanha));
    const novos = ids.filter((cid) => !jaEstavam.has(cid));
    this.db.campanhas.adicionarClientes(campanha.id, novos);
    if (novos.length > 0) this.historico.registrar(usuario, "atualizar", "campanha", `Campanha "${campanha.titulo}": ${novos.length} cliente(s) acrescentado(s)`);
    return this.detalhe(campanha.id);
  }

  /** Tira um cliente de uma campanha de clientes escolhidos. A campanha não fica sem nenhum. */
  removerCliente(id, clienteId, usuario) {
    const campanha = this._achar(id);
    this._exigirListaEditavel(campanha);
    const cid = Number(clienteId);
    const escolhidos = this._escolhidosDoSistema(campanha);
    if (!escolhidos.includes(cid)) throw new ErroNaoEncontrado("Este cliente não está na campanha.");
    if (escolhidos.length === 1) throw new ErroDeValidacao("A campanha precisa de pelo menos um cliente. Para desfazê-la, exclua ou encerre a campanha.");
    this.db.campanhas.removerCliente(campanha.id, cid);
    const nome = this.db.clientes.obterPorId(cid)?.nome || `#${cid}`;
    this.historico.registrar(usuario, "atualizar", "campanha", `Campanha "${campanha.titulo}": cliente "${nome}" retirado`);
    return this.detalhe(campanha.id);
  }

  /**
   * Cria a tarefa de atualização de quem está pendente: de todos, ou só dos
   * `clientes` pedidos (o botão "Agendar" da linha). O texto da tarefa e a
   * prioridade moram aqui, e não na tela, para a linha e o lote não divergirem.
   *
   * Só vira tarefa quem está "pendente" AGORA. Pedir um cliente que outra
   * pessoa acabou de agendar (ou que acabou de ser atendido) não cria nada
   * para ele, em vez de duplicar a tarefa -- e foi também o que impede um
   * clique duplo no lote de agendar todo mundo duas vezes.
   * @param {number|string} id
   * @param {{clientes?: unknown, data?: string}} [pedido] sem `clientes`: todos os pendentes
   * @returns {{criadas: number, clientes: string[]}}
   */
  agendar(id, pedido = {}, usuario) {
    const campanha = this.detalhe(id);
    if (campanha.encerradaEm) throw new ErroDeValidacao("Reabra a campanha para agendar atualizações.");
    const data = String(pedido.data || "").trim() || hojeBR();
    if (!dataValida(data)) throw new ErroDeValidacao("Campo 'Data' precisa estar no formato dd/mm/aaaa.");
    let alvos = campanha.clientes;
    if (pedido.clientes !== undefined) {
      if (!Array.isArray(pedido.clientes) || pedido.clientes.length === 0) throw new ErroDeValidacao("Escolha pelo menos um cliente para agendar.");
      const pedidos = new Set(pedido.clientes.map(Number));
      if ([...pedidos].some((cid) => !campanha.clientes.some((c) => c.id === cid))) throw new ErroDeValidacao("Há cliente que não está nesta campanha.");
      alvos = campanha.clientes.filter((c) => pedidos.has(c.id));
    }
    const pendentes = alvos.filter((c) => c.situacao === "pendente");
    const tarefas = pendentes.map((c) => ({
      tarefa: tarefaDaCampanha(campanha),
      cliente: c.nome,
      sistema: campanha.sistema,
      responsavel: usuario?.nome || "",
      // Campanha com prazo é urgente de verdade; sem prazo, rotina.
      prioridade: campanha.prazo ? "Alta" : "Normal",
      data,
      obs: campanha.prazo ? `Prazo da campanha: ${campanha.prazo}` : "",
    }));
    this.agendamentos.createMany(tarefas, usuario, `Campanha "${campanha.titulo}": ${tarefas.length} tarefa(s) de atualização agendada(s)`);
    return { criadas: tarefas.length, clientes: pendentes.map((c) => c.nome) };
  }

  /** Encerra e congela o placar: a campanha encerrada mostra o resultado que teve. */
  encerrar(id, usuario) {
    const { totalClientes, atendidos, titulo } = this.detalhe(id);
    if (this.db.campanhas.encerrar(Number(id), { usuarioNome: usuario?.nome || "", total: totalClientes, atendidos }) === 0) {
      throw new ErroDeValidacao("Esta campanha já está encerrada.");
    }
    this.historico.registrar(usuario, "atualizar", "campanha", `Campanha "${titulo}" encerrada com ${atendidos} de ${totalClientes} cliente(s) atualizado(s)`);
    return this.detalhe(id);
  }

  reabrir(id, usuario) {
    const campanha = this._achar(id);
    if (this.db.campanhas.reabrir(campanha.id) === 0) throw new ErroDeValidacao("Esta campanha não está encerrada.");
    this.historico.registrar(usuario, "atualizar", "campanha", `Campanha "${campanha.titulo}" reaberta`);
    return this.detalhe(campanha.id);
  }

  /** Apaga só a campanha: atualizações e tarefas criadas por causa dela continuam. */
  remove(id, usuario) {
    const campanha = this._achar(id);
    this.db.campanhas.delete(campanha.id);
    this.historico.registrar(usuario, "excluir", "campanha", `Campanha "${campanha.titulo}"`);
  }

  _achar(id) {
    const campanha = this.db.campanhas.find(Number(id));
    if (!campanha) throw new ErroNaoEncontrado("Esta campanha não existe mais.");
    return campanha;
  }

  /**
   * Só nas campanhas de clientes escolhidas e ainda abertas: a de "todos"
   * não tem lista para mexer (o certo é editar o público), e a encerrada
   * mostra o placar congelado, que uma lista nova desmentiria.
   */
  _exigirListaEditavel(campanha) {
    if (campanha.publico !== "escolhidos") throw new ErroDeValidacao("Esta campanha vale para todos os clientes do sistema. Para escolher clientes, edite a campanha.");
    if (campanha.encerradaEm) throw new ErroDeValidacao("Reabra a campanha para mudar quem entra nela.");
  }

  /**
   * Escolhidos que ainda têm o sistema: o que a tela vê. Quem perdeu o
   * sistema continua ligado, mas fica de fora -- e do que é reenviado.
   */
  _escolhidosDoSistema(campanha) {
    const doSistema = this._idsDoSistema(campanha.sistemaId);
    return this.db.campanhas.idsClientes(campanha.id).filter((cid) => doSistema.has(cid));
  }

  _idsDoSistema(sistemaId) {
    return new Set(this.db.clientes.clientesDoSistemaComCodigo(sistemaId).map((c) => c.id));
  }

  /**
   * Quem entra na campanha. "todos" vale para o sistema inteiro (ou a
   * cidade); "escolhidos" exige pelo menos um cliente que tenha o sistema.
   * @param {any} input
   * @param {{id: number, nome: string}} sistema
   * @param {string} cidade
   */
  _publico(input, sistema, cidade) {
    const publico = input.publico ?? "todos";
    if (publico !== "todos" && publico !== "escolhidos") throw new ErroDeValidacao("Público da campanha inválido.");
    if (publico === "todos") return { publico, cidade, clienteIds: [] };
    if (!Array.isArray(input.clientes) || input.clientes.length === 0) throw new ErroDeValidacao("Escolha pelo menos um cliente para a campanha.");
    const doSistema = this._idsDoSistema(sistema.id);
    const clienteIds = [...new Set(input.clientes.map(Number))];
    if (clienteIds.some((cid) => !Number.isInteger(cid) || !doSistema.has(cid))) throw new ErroDeValidacao(`Há cliente escolhido que não usa o sistema "${sistema.nome}".`);
    return { publico, cidade: "", clienteIds };
  }

  _validar(input, { nova, cidadeAtual = "", sistemaAtual = null }) {
    const titulo = String(input.titulo || "").trim();
    const descricao = String(input.descricao || "").trim();
    const prazo = String(input.prazo || "").trim();
    const cidadeInformada = String(input.cidade || "").trim();
    const cidade = cidadeInformada ? [cidadeAtual, ...this.db.clientes.cidades()].find((item) => item.toLocaleLowerCase("pt-BR") === cidadeInformada.toLocaleLowerCase("pt-BR")) : "";
    if (cidadeInformada && !cidade) throw new ErroDeValidacao("Escolha uma cidade cadastrada nos clientes.");
    const versaoAlvo = String(input.versaoAlvo || "").trim();
    if (!titulo) throw new ErroDeValidacao("Informe o título da campanha.");
    if (titulo.length > 120) throw new ErroDeValidacao("O título pode ter no máximo 120 caracteres.");
    if (descricao.length > 1000) throw new ErroDeValidacao("A descrição pode ter no máximo 1000 caracteres.");
    if (!dataValida(prazo)) throw new ErroDeValidacao("Campo 'Prazo' precisa estar no formato dd/mm/aaaa.");
    if (!nova) return { titulo, descricao, prazo, ...this._publico(input, sistemaAtual, cidade) };
    if (!versaoAlvo || !dataValida(versaoAlvo)) throw new ErroDeValidacao("Campo 'Versão-alvo' precisa estar no formato dd/mm/aaaa.");
    const sistema = this.db.sistemas.resolver(String(input.sistema || ""));
    if (!sistema || !sistema.ativo) throw new ErroDeValidacao("Escolha um sistema do catálogo.");
    // Fixos (B_Atualizador, Suporte Bredas) não têm versão para cobrar -- a
    // campanha nunca terminaria, e ficaria todo mundo "pendente" de nada.
    if (!contaParaVersao(sistema)) throw new ErroDeValidacao(`"${sistema.nome}" não controla versão e não pode ter campanha.`);
    return { titulo, descricao, prazo, versaoAlvo, sistemaId: sistema.id, sistemaNome: sistema.nome, ...this._publico(input, sistema, cidade) };
  }

  /** Tarefas em aberto por cliente, com os ids dos sistemas que cada uma cita. */
  _agendasAbertas() {
    const catalogo = this.db.sistemas.todos();
    /** @type {Map<number, Array<{id:number, tarefa:string, data:string, responsavel:string, sistemas:Set<number>}>>} */
    const porCliente = new Map();
    for (const t of this.db.agendamentos.abertasComCliente(STATUS_ENCERRADOS)) {
      const sistemas = new Set(separarSistemas(t.sistema).map((nome) => acharSistema(catalogo, nome)?.id).filter(Boolean));
      if (sistemas.size === 0) continue;
      if (!porCliente.has(t.clienteId)) porCliente.set(t.clienteId, []);
      porCliente.get(t.clienteId).push({ id: t.id, tarefa: t.tarefa, data: t.data, responsavel: t.responsavel, sistemas });
    }
    return porCliente;
  }

  /** @param {Map<number, {ultimas: Map<number, any>, cadastro: any[]}>} [porSistema] cache opcional por sistema */
  _clientes(campanha, agendas, porSistema = new Map()) {
    if (!porSistema.has(campanha.sistemaId)) {
      porSistema.set(campanha.sistemaId, {
        ultimas: new Map(this.db.atualizacoes.ultimaPorClienteNoSistema(campanha.sistemaId).map((r) => [r.cliente_id, r])),
        cadastro: this.db.clientes.clientesDoSistemaComCodigo(campanha.sistemaId),
      });
    }
    const { ultimas, cadastro } = porSistema.get(campanha.sistemaId);
    const escolhidos = campanha.publico === "escolhidos" ? new Set(this.db.campanhas.idsClientes(campanha.id)) : null;
    const entra = (cliente) => escolhidos
      ? escolhidos.has(cliente.id)
      : !campanha.cidade || (cliente.cidade || "").trim().toLocaleLowerCase("pt-BR") === campanha.cidade.toLocaleLowerCase("pt-BR");
    const lista = cadastro.filter(entra).map(({ id, nome, codigo, cidade }) => {
      const registro = ultimas.get(id);
      // Sem prazo, de propósito: a campanha pergunta "já chegou na meta?", e
      // o prazo depois da oficial (A07) só adia o "desatualizado" do Resumo.
      const { situacao: frente } = situacaoDoSistema(registro, campanha.versaoAlvo);
      const agendamento = (agendas.get(id) || []).find((t) => t.sistemas.has(campanha.sistemaId));
      const situacao = frente === "Em dia" ? "concluido" : agendamento ? "agendado" : "pendente";
      return {
        id,
        nome,
        codigo: codigo || "",
        cidade: cidade || "",
        situacao,
        ultima: registro?.data || "",
        versaoRecebida: registro?.versao || "",
        agendamento: situacao === "agendado" ? { id: agendamento.id, tarefa: agendamento.tarefa, data: agendamento.data, responsavel: agendamento.responsavel } : null,
      };
    });
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return lista;
  }

  _placar(campanha, clientes) {
    const conta = (s) => clientes.filter((c) => c.situacao === s).length;
    // Encerrada: vale o placar congelado. Os contadores de hoje continuam
    // disponíveis na lista de clientes, mas o resumo é o do encerramento.
    const encerrada = Boolean(campanha.encerradaEm);
    const totalClientes = encerrada && campanha.totalFinal != null ? campanha.totalFinal : clientes.length;
    const atendidos = encerrada && campanha.atendidosFinal != null ? campanha.atendidosFinal : conta("concluido");
    return {
      totalClientes,
      atendidos,
      agendados: encerrada ? 0 : conta("agendado"),
      pendentes: encerrada ? Math.max(0, totalClientes - atendidos) : conta("pendente"),
      // Sem cliente nenhum não é "100%": não há o que comemorar.
      percentual: totalClientes > 0 ? Math.floor((atendidos / totalClientes) * 100) : null,
      atrasada: !encerrada && Boolean(campanha.prazo) && prazoPassou(campanha.prazo) && conta("concluido") < clientes.length,
    };
  }
}

/** Texto da tarefa criada por "agendar": nomeia a campanha para quem abrir Agendamentos saber de onde veio. */
function tarefaDaCampanha(campanha) {
  return `Atualizar ${campanha.sistema} para ${campanha.versaoAlvo} — ${campanha.titulo}`;
}

/** Hoje, como dd/mm/aaaa (o formato das datas deste sistema). */
function hojeBR(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function prazoPassou(prazo, hoje = new Date()) {
  const [d, m, a] = prazo.split("/").map(Number);
  const fimDoPrazo = new Date(a, m - 1, d, 23, 59, 59, 999);
  return hoje > fimDoPrazo;
}

module.exports = { CampanhaService };
