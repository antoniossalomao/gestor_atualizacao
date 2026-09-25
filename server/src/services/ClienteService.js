const { ValidationError, NotFoundError, ConflictError } = require("../shared/errors");

/**
 * Regras de negocio da aba Clientes, em cima do ClienteRepository /
 * SistemaRepository. Equivalente ao que hoje fica espalhado dentro de
 * gestor/views/clientes.py (a view Tkinter fazia validacao E desenho de
 * tela juntos; aqui a validacao vira uma classe propria, reaproveitavel
 * tanto pela rota HTTP quanto por testes).
 */
class ClienteService {
  /**
   * @param {import('../database/Database').Database} db
   * @param {import('./HistoricoService').HistoricoService} historico
   */
  constructor(db, historico) {
    this.db = db;
    this.historico = historico;
  }

  /** @param {{page?: number, pageSize?: number}} paginacao */
  list(search = "", paginacao = {}) {
    const { rows, total, page, pageSize } = this.db.clientes.list(search, paginacao);
    // Um mapa só (não uma consulta por linha) com a quantidade de máquinas
    // de cada cliente, lida da atualização mais recente dele -- ver
    // AtualizacaoRepository.maquinasPorCliente.
    const maquinasPorCliente = this.db.atualizacoes.maquinasPorCliente();
    return { rows: rows.map((row) => toClienteDTO(row, maquinasPorCliente.get(row.id) ?? 0)), total, page, pageSize };
  }

  names() {
    return this.db.clientes.names();
  }

  opcoesPorCodigo() {
    return this.db.clientes.opcoesPorCodigo();
  }

  /** Grupos/redes já cadastrados, para autocompletar do campo "Grupo/rede". */
  grupos() {
    return this.db.clientes.grupos();
  }

  getById(id) {
    const row = this.db.clientes.getById(id);
    if (!row) throw new NotFoundError("Cliente não encontrado.");
    return toClienteDTO(row, this.db.atualizacoes.maquinasDoCliente(row.id));
  }

  getByNome(nome) {
    const row = this.db.clientes.getByNome(nome);
    if (!row) return null;
    return toClienteDTO(row, this.db.atualizacoes.maquinasDoCliente(row.id));
  }

  /**
   * @param {{codigo?: string, nome: string, cidade?: string, sistemas?: string[]}} input
   * @param {{id:number, nome:string}|null} usuario quem está fazendo a ação (para o histórico)
   */
  create(input, usuario) {
    const { nome, codigo, cidade, sistemas, grupo } = this._validate(input);
    // Bloqueia nome duplicado ANTES de inserir: dois clientes com o mesmo
    // nome seriam indistinguiveis nas telas que listam por nome, e o vinculo
    // de um atendimento digitado pelo nome escolheria um deles as cegas.
    if (this.db.clientes.nameExists(nome)) {
      throw new ValidationError(`Já existe um cliente chamado '${nome}'.`);
    }
    const id = this.db.clientes.insert(codigo, nome, cidade, this._idsDosSistemas(sistemas), grupo);
    this.historico.registrar(usuario, "criar", "cliente", `Cliente "${nome}"`);
    return toClienteDTO(this.db.clientes.getById(id), this.db.atualizacoes.maquinasDoCliente(id));
  }

  update(id, input, usuario) {
    const existente = this.db.clientes.getById(id);
    if (!existente) throw new NotFoundError("Cliente não encontrado.");
    const { nome, codigo, cidade, sistemas, grupo } = this._validate(input);
    if (this.db.clientes.nameExists(nome, id)) {
      throw new ValidationError(`Já existe um cliente chamado '${nome}'.`);
    }
    // O nome copiado nos atendimentos/agendamentos ligados acompanha o
    // rename dentro de ClienteRepository.update.
    const revisaoEsperada = Number.isInteger(Number(input.revisao)) ? Number(input.revisao) : null;
    if (this.db.clientes.update(id, codigo, nome, cidade, this._idsDosSistemas(sistemas), grupo, revisaoEsperada, usuario?.nome || "") === 0) {
      const agora = this.db.clientes.getById(id);
      if (agora && revisaoEsperada != null) throw new ConflictError(`Este cliente foi atualizado por ${agora.atualizadoPor || "outra pessoa"}. Confira os dados antes de sobrescrever.`, toClienteDTO(agora));
      throw new NotFoundError("Cliente não encontrado.");
    }
    const descricao =
      existente.nome !== nome ? `Cliente "${existente.nome}" renomeado para "${nome}"` : `Cliente "${nome}"`;
    const depois = this.db.clientes.getById(id);
    this.historico.registrar(usuario, "atualizar", "cliente", descricao, { antes: toClienteDTO(existente), depois: toClienteDTO(depois) });
    return toClienteDTO(this.db.clientes.getById(id), this.db.atualizacoes.maquinasDoCliente(id));
  }

  /** Ids dos sistemas marcados, na ordem -- ver SistemaRepository.resolverOuCriar. */
  _idsDosSistemas(nomes) {
    return this.db.sistemas.resolverOuCriar(nomes).map((s) => s.id);
  }

  delete(id, usuario) {
    const existente = this.db.clientes.getById(id);
    if (!existente) throw new NotFoundError("Cliente não encontrado.");
    this.db.clientes.delete(id);
    this.historico.registrar(usuario, "excluir", "cliente", `Cliente "${existente.nome}"`, { antes: toClienteDTO(existente), depois: null });
  }

  /**
   * Exclui vários clientes de uma vez. Diferente da exclusão em lote de
   * Atualizações/Agendamentos, NÃO oferece "Desfazer": recriar um cliente
   * perde o id antigo e, com o cadastro de Acessos remotos, perde também as
   * credenciais de AnyDesk/Suporte Bredas daquele cliente (apagadas junto
   * via ON DELETE CASCADE -- ver Database._migrate) -- um "desfazer" que
   * finge ter voltado tudo ao normal, mas silenciosamente perdeu senha de
   * acesso, seria pior que não ter Desfazer nenhum. Por isso a tela usa
   * confirmação antes, igual já fazia para excluir um cliente só.
   */
  deleteMany(ids, usuario) {
    const registros = this.db.clientes.findByIds(ids);
    if (registros.length === 0) {
      throw new NotFoundError("Nenhum dos clientes selecionados existe mais. A lista pode estar desatualizada.");
    }
    const excluidos = this.db.clientes.deleteMany(registros.map((r) => r.id));
    const nomes = registros.slice(0, 3).map((r) => r.nome).join(", ") + (registros.length > 3 ? ` e mais ${registros.length - 3}` : "");
    this.historico.registrar(usuario, "excluir", "cliente", `${excluidos} clientes excluídos de uma vez (${nomes})`);
    return { excluidos };
  }

  /**
   * Marca um sistema em vários clientes de uma vez (ex.: "esses 8 clientes
   * agora têm NFCe"), em vez de abrir o cadastro de cada um e marcar o
   * checkbox individualmente.
   */
  addSistemaMany(ids, nomeSistema, usuario) {
    const limpo = (nomeSistema || "").trim();
    if (!limpo) throw new ValidationError("Escolha um sistema.");
    const registros = this.db.clientes.findByIds(ids);
    if (registros.length === 0) {
      throw new NotFoundError("Nenhum dos clientes selecionados existe mais. A lista pode estar desatualizada.");
    }
    const [sistema] = this.db.sistemas.resolverOuCriar([limpo]);
    const afetados = this.db.clientes.addSistemaToMany(registros.map((r) => r.id), sistema.id);
    if (afetados > 0) {
      const nomes = registros.slice(0, 3).map((r) => r.nome).join(", ") + (registros.length > 3 ? ` e mais ${registros.length - 3}` : "");
      this.historico.registrar(usuario, "atualizar", "cliente", `Sistema "${limpo}" adicionado a ${afetados} cliente(s) de uma vez (${nomes})`);
    }
    return { afetados, total: registros.length };
  }

  salvarVersaoSistema(nome, data, usuario, versaoEsperada) {
    const { dataValida } = require("../shared/validation");
    if (typeof data !== "string" || (data !== "" && !dataValida(data))) {
      throw new ValidationError("Informe uma data válida no formato dd/mm/aaaa.");
    }
    const sistema = this.db.sistemas.resolver(nome);
    if (!sistema?.ativo) throw new NotFoundError("Sistema não encontrado.");
    if (!sistema.controla_versao) throw new ValidationError(`"${sistema.nome}" é um componente fixo e não recebe versão oficial.`);
    if (typeof versaoEsperada !== "string") throw new ValidationError("Informe a referência anterior para evitar sobrescrever outra edição.");
    if (sistema.ultima_versao !== versaoEsperada) throw new ConflictError("A versão oficial mudou desde que você abriu a edição. Recarregue a lista antes de salvar.");
    const antes = { nome: sistema.nome, data: sistema.ultima_versao || "" };
    if (!this.db.sistemas.salvarVersaoSeAtual(sistema.nome, data, versaoEsperada, usuario?.nome || "")) {
      throw new ConflictError("A versão oficial foi alterada por outra pessoa. Recarregue a lista antes de salvar.");
    }
    this.historico.registrar(usuario, "atualizar", "sistema", `Última versão de ${sistema.nome}: ${data || "não informada"}`, { antes, depois: { nome: sistema.nome, data } });
    return { nome: sistema.nome, data };
  }

  classificarSistema(id, controlaVersao, usuario) {
    if (typeof controlaVersao !== "boolean") throw new ValidationError("Informe se o sistema controla versão.");
    const sistema = this.db.sistemas.getById(Number(id));
    if (!sistema?.ativo) throw new NotFoundError("Sistema não encontrado no catálogo ativo.");
    if (Boolean(sistema.controlaVersao) === controlaVersao) return sistema;
    this.db.sistemas.classificar(sistema.id, controlaVersao);
    const depois = this.db.sistemas.getById(sistema.id);
    this.historico.registrar(usuario, "atualizar", "sistema", `Sistema "${sistema.nome}" classificado como ${controlaVersao ? "atualizável" : "componente fixo"}`, { antes: sistema, depois });
    return depois;
  }

  listSistemas() {
    return this.db.sistemas.list();
  }

  /** @returns {{created: boolean}} created=false quando o sistema ja existia */
  addSistema(nome, usuario) {
    const limpo = (nome || "").trim();
    if (!limpo) throw new ValidationError("Informe um nome para o sistema.");
    const created = this.db.sistemas.add(limpo);
    if (!created) throw new ValidationError(`O sistema '${limpo}' já existe.`);
    this.historico.registrar(usuario, "criar", "sistema", `Sistema "${limpo}"`);
    return { created: true };
  }

  /**
   * Tira um sistema do catálogo -- e, junto, desmarca ele de qualquer
   * cliente que o tivesse (ver SistemaRepository.remove).
   *
   * O que NÃO é tocado, de propósito: o sistema continua existindo, inativo,
   * e os atendimentos já registrados (`atualizacao_sistemas`) e as versões
   * já publicadas (`versoes_atualizador.sistema`) continuam apontando para
   * ele. São
   * registros do que JÁ aconteceu -- uma atualização feita ano passado no
   * sistema "Sped" continua tendo sido, de fato, no "Sped", mesmo que hoje
   * ele não seja mais oferecido para clientes novos. Apagar esse rastro
   * seria reescrever histórico, não limpar cadastro.
   *
   * @returns {{removed: true, clientesAfetados: number}}
   */
  removeSistema(nome, usuario) {
    const limpo = (nome || "").trim();
    if (!limpo) throw new ValidationError("Informe o nome do sistema.");
    const removido = this.db.sistemas.remove(limpo);
    if (!removido) throw new NotFoundError(`O sistema "${limpo}" não está cadastrado.`);
    const { clientesAfetados } = removido;
    this.historico.registrar(
      usuario,
      "excluir",
      "sistema",
      clientesAfetados > 0
        ? `Sistema "${limpo}" (removido também de ${clientesAfetados} cliente(s))`
        : `Sistema "${limpo}"`
    );
    return { removed: true, clientesAfetados };
  }

  _validate(input) {
    const nome = (input.nome || "").trim();
    if (!nome) throw new ValidationError("Campo 'Cliente' é obrigatório.");
    const codigo = (input.codigo || "").trim();
    const cidade = (input.cidade || "").trim();
    const grupo = (input.grupo || "").trim();
    const sistemas = Array.isArray(input.sistemas) ? input.sistemas.map((s) => String(s || "").trim()).filter(Boolean) : [];
    return { nome, codigo, cidade, sistemas, grupo };
  }

  /** Acessos remotos (AnyDesk / Suporte Bredas) das máquinas de um cliente -- aba Clientes, botão "Acessos". */
  listAcessos(clienteId) {
    const cliente = this.db.clientes.getById(clienteId);
    if (!cliente) throw new NotFoundError("Cliente não encontrado.");
    return this.db.clienteAcessos.listByCliente(clienteId);
  }

  addAcesso(clienteId, input, usuario) {
    const cliente = this.db.clientes.getById(clienteId);
    if (!cliente) throw new NotFoundError("Cliente não encontrado.");
    const { maquina, anydesk, suporteBredas, observacoes } = this._validateAcesso(input);
    const id = this.db.clienteAcessos.insert(clienteId, maquina, anydesk, suporteBredas, observacoes);
    this.historico.registrar(usuario, "criar", "acesso", `Acesso "${maquina}" de "${cliente.nome}"`);
    return this.db.clienteAcessos.getById(id);
  }

  updateAcesso(id, input, usuario) {
    const existente = this.db.clienteAcessos.getById(id);
    if (!existente) throw new NotFoundError("Acesso não encontrado.");
    const { maquina, anydesk, suporteBredas, observacoes } = this._validateAcesso(input);
    this.db.clienteAcessos.update(id, maquina, anydesk, suporteBredas, observacoes);
    const cliente = this.db.clientes.getById(existente.clienteId);
    this.historico.registrar(usuario, "atualizar", "acesso", `Acesso "${maquina}" de "${cliente ? cliente.nome : existente.clienteId}"`);
    return this.db.clienteAcessos.getById(id);
  }

  removeAcesso(id, usuario) {
    const existente = this.db.clienteAcessos.getById(id);
    if (!existente) throw new NotFoundError("Acesso não encontrado.");
    this.db.clienteAcessos.delete(id);
    const cliente = this.db.clientes.getById(existente.clienteId);
    this.historico.registrar(
      usuario,
      "excluir",
      "acesso",
      `Acesso "${existente.maquina}" de "${cliente ? cliente.nome : existente.clienteId}"`
    );
  }

  _validateAcesso(input) {
    const maquina = (input.maquina || "").trim();
    if (!maquina) throw new ValidationError("Campo 'Máquina' é obrigatório.");
    const anydesk = (input.anydesk || "").trim();
    const suporteBredas = (input.suporteBredas || "").trim();
    const observacoes = (input.observacoes || "").trim();
    return { maquina, anydesk, suporteBredas, observacoes };
  }
}

/**
 * Converte a linha da visão `clientes_v` (sistemas como texto "a, b, c") num
 * objeto de API (sistemas como array). "maquinas" não é uma coluna de
 * clientes -- vem calculada à parte (ver AtualizacaoRepository.
 * maquinasPorCliente/maquinasDoCliente) e é só anexada aqui.
 */
function toClienteDTO(row, maquinas = 0) {
  if (!row) return null;
  return {
    id: row.id,
    codigo: row.codigo || "",
    nome: row.nome,
    cidade: row.cidade || "",
    sistemas: row.sistemas ? row.sistemas.split(",").map((s) => s.trim()).filter(Boolean) : [],
    grupo: row.grupo || "",
    revisao: row.revisao,
    atualizadoEm: row.atualizadoEm || null,
    atualizadoPor: row.atualizadoPor || "",
    maquinas,
  };
}

module.exports = { ClienteService };
