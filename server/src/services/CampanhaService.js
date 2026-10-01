const ExcelJS = require("exceljs");

const { OPCOES_STATUS } = require("../config/constantes");
const { dataValida } = require("./validacao");
const { ErroDeValidacao, ErroNaoEncontrado } = require("../shared/erros");
const { splitSystems } = require("../shared/normalizacao");
const { acharSistema } = require("../database/SistemaRepository");
const { situacaoDoSistema, contaParaVersao } = require("./situacaoVersao");

const STATUS_CONCLUIDO = OPCOES_STATUS[OPCOES_STATUS.length - 1];
/** Status em que a tarefa não encaminha mais o cliente (ver abertasComCliente). */
const STATUS_ENCERRADOS = [STATUS_CONCLUIDO, "Sem resposta"];

/** Situação de um cliente DENTRO da campanha. Não se sobrepõem: somam o total. */
const SITUACOES = { concluido: "Concluído", agendado: "Já agendado", pendente: "Pendente" };

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
 */
class CampanhaService {
  /**
   * @param {import('../database/Database').Database} db
   * @param {import('./HistoricoService').HistoricoService} historico
   */
  constructor(db, historico) {
    this.db = db;
    this.historico = historico;
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

  /** Título, descrição, prazo e cidade. Sistema e versão-alvo são a meta: ficam como foram criados. */
  update(id, input, usuario) {
    const atual = this._achar(id);
    const dados = this._validar({ ...input, cidade: input.cidade ?? atual.cidade, sistema: atual.sistema, versaoAlvo: atual.versaoAlvo }, { nova: false, cidadeAtual: atual.cidade });
    this.db.campanhas.update(atual.id, dados);
    this.historico.registrar(usuario, "atualizar", "campanha", `Campanha "${dados.titulo}"`);
    return this.detalhe(atual.id);
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

  /** Planilha com quem ainda falta (pendentes e já agendados). */
  async exportarPendentesXlsx(id) {
    const campanha = this.detalhe(id);
    const faltam = campanha.clientes.filter((c) => c.situacao !== "concluido");
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Pendentes");
    const colunas = ["Cliente", "Código", "Cidade", "Situação", "Última atualização", "Versão recebida", "Agendado para", "Responsável da tarefa"];
    ws.addRow(colunas);
    for (const c of faltam) {
      ws.addRow([c.nome, c.codigo, c.cidade, SITUACOES[c.situacao], c.ultima || "Nunca", c.versaoRecebida || "Não informada", c.agendamento?.data || "", c.agendamento?.responsavel || ""]);
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(ws.rowCount, 1), column: colunas.length } };
    ws.columns.forEach((col, i) => { col.width = [36, 12, 22, 16, 20, 18, 16, 24][i]; });
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24476B" } };
    const meta = workbook.addWorksheet("Campanha");
    meta.addRows([
      ["Campanha", campanha.titulo],
      ["Sistema", campanha.sistema],
      ["Versão-alvo", campanha.versaoAlvo],
      ["Prazo", campanha.prazo || "Sem prazo"],
      ["Cidade", campanha.cidade || "Todas as cidades"],
      ["Clientes na campanha", campanha.totalClientes],
      ["Atualizados", campanha.atendidos],
      ["Já agendados", campanha.agendados],
      ["Pendentes", campanha.pendentes],
      ["Gerado em", new Date().toLocaleString("pt-BR")],
    ]);
    meta.columns = [{ width: 24 }, { width: 40 }];
    return { buffer: await workbook.xlsx.writeBuffer(), campanha };
  }

  _achar(id) {
    const campanha = this.db.campanhas.find(Number(id));
    if (!campanha) throw new ErroNaoEncontrado("Esta campanha não existe mais.");
    return campanha;
  }

  _validar(input, { nova, cidadeAtual = "" }) {
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
    if (!nova) return { titulo, descricao, prazo, cidade };
    if (!versaoAlvo || !dataValida(versaoAlvo)) throw new ErroDeValidacao("Campo 'Versão-alvo' precisa estar no formato dd/mm/aaaa.");
    const sistema = this.db.sistemas.resolver(String(input.sistema || ""));
    if (!sistema || !sistema.ativo) throw new ErroDeValidacao("Escolha um sistema do catálogo.");
    // Fixos (B_Atualizador, Suporte Bredas) não têm versão para cobrar -- a
    // campanha nunca terminaria, e ficaria todo mundo "pendente" de nada.
    if (!contaParaVersao(sistema)) throw new ErroDeValidacao(`"${sistema.nome}" não controla versão e não pode ter campanha.`);
    return { titulo, descricao, prazo, cidade, versaoAlvo, sistemaId: sistema.id, sistemaNome: sistema.nome };
  }

  /** Tarefas em aberto por cliente, com os ids dos sistemas que cada uma cita. */
  _agendasAbertas() {
    const catalogo = this.db.sistemas.todos();
    /** @type {Map<number, Array<{id:number, tarefa:string, data:string, responsavel:string, sistemas:Set<number>}>>} */
    const porCliente = new Map();
    for (const t of this.db.agendamentos.abertasComCliente(STATUS_ENCERRADOS)) {
      const sistemas = new Set(splitSystems(t.sistema).map((nome) => acharSistema(catalogo, nome)?.id).filter(Boolean));
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
    const lista = cadastro.filter((cliente) => !campanha.cidade || (cliente.cidade || "").trim().toLocaleLowerCase("pt-BR") === campanha.cidade.toLocaleLowerCase("pt-BR")).map(({ id, nome, codigo, cidade }) => {
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

function prazoPassou(prazo, hoje = new Date()) {
  const [d, m, a] = prazo.split("/").map(Number);
  const fimDoPrazo = new Date(a, m - 1, d, 23, 59, 59, 999);
  return hoje > fimDoPrazo;
}

module.exports = { CampanhaService, SITUACOES_CAMPANHA: SITUACOES };
