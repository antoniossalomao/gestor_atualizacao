const { ValidationError, NotFoundError } = require("./errors");

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
    // AtualizacaoRepository.lastMaquinasByClient.
    const maquinasPorCliente = this.db.atualizacoes.lastMaquinasByClient();
    return { rows: rows.map((row) => toClienteDTO(row, maquinasPorCliente[row.nome] ?? 0)), total, page, pageSize };
  }

  names() {
    return this.db.clientes.names();
  }

  /** Grupos/redes já cadastrados, para autocompletar do campo "Grupo/rede". */
  grupos() {
    return this.db.clientes.grupos();
  }

  getById(id) {
    const row = this.db.clientes.getById(id);
    if (!row) throw new NotFoundError("Cliente não encontrado.");
    return toClienteDTO(row, this.db.atualizacoes.lastMaquinasForClient(row.nome));
  }

  getByNome(nome) {
    const row = this.db.clientes.getByNome(nome);
    if (!row) return null;
    return toClienteDTO(row, this.db.atualizacoes.lastMaquinasForClient(row.nome));
  }

  /**
   * @param {{codigo?: string, nome: string, cidade?: string, sistemas?: string[]}} input
   * @param {{id:number, nome:string}|null} usuario quem está fazendo a ação (para o histórico)
   */
  create(input, usuario) {
    const { nome, codigo, cidade, sistemasTexto, grupo } = this._validate(input);
    // Bloqueia nome duplicado ANTES de inserir: dois clientes com o mesmo
    // nome fariam a Consulta e o Resumo enxergarem so um deles (o
    // historico de atualizacoes/agendamentos liga pelo NOME, nao por id).
    if (this.db.clientes.nameExists(nome)) {
      throw new ValidationError(`Já existe um cliente chamado '${nome}'.`);
    }
    this.db.clientes.insert(codigo, nome, cidade, sistemasTexto, grupo);
    this.historico.registrar(usuario, "criar", "cliente", `Cliente "${nome}"`);
    return toClienteDTO(this.db.clientes.getByNome(nome), this.db.atualizacoes.lastMaquinasForClient(nome));
  }

  update(id, input, usuario) {
    const existente = this.db.clientes.getById(id);
    if (!existente) throw new NotFoundError("Cliente não encontrado.");
    const { nome, codigo, cidade, sistemasTexto, grupo } = this._validate(input);
    if (this.db.clientes.nameExists(nome, id)) {
      throw new ValidationError(`Já existe um cliente chamado '${nome}'.`);
    }
    // A propagacao do rename para atualizacoes/agendamentos acontece
    // dentro de ClienteRepository.update (regra critica de integridade).
    this.db.clientes.update(id, codigo, nome, cidade, sistemasTexto, grupo);
    const descricao =
      existente.nome !== nome ? `Cliente "${existente.nome}" renomeado para "${nome}"` : `Cliente "${nome}"`;
    this.historico.registrar(usuario, "atualizar", "cliente", descricao);
    return toClienteDTO(this.db.clientes.getById(id), this.db.atualizacoes.lastMaquinasForClient(nome));
  }

  delete(id, usuario) {
    const existente = this.db.clientes.getById(id);
    if (!existente) throw new NotFoundError("Cliente não encontrado.");
    this.db.clientes.delete(id);
    this.historico.registrar(usuario, "excluir", "cliente", `Cliente "${existente.nome}"`);
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
    const afetados = this.db.clientes.addSistemaToMany(registros.map((r) => r.id), limpo);
    if (afetados > 0) {
      const nomes = registros.slice(0, 3).map((r) => r.nome).join(", ") + (registros.length > 3 ? ` e mais ${registros.length - 3}` : "");
      this.historico.registrar(usuario, "atualizar", "cliente", `Sistema "${limpo}" adicionado a ${afetados} cliente(s) de uma vez (${nomes})`);
    }
    return { afetados, total: registros.length };
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
   * Remove um sistema do catálogo -- e, junto, tira ele da lista de
   * qualquer cliente que o tivesse marcado (ver
   * ClienteRepository.removeSistemaDeTodos).
   *
   * O que NÃO é tocado, de propósito: atualizações já registradas
   * (`atualizacoes.sistema`) e versões já publicadas
   * (`versoes_atualizador.sistema`) continuam com o nome antigo. São
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
    const clientesAfetados = this.db.clientes.removeSistemaDeTodos(limpo);
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
    const sistemasTexto = Array.isArray(input.sistemas) ? input.sistemas.join(", ") : "";
    return { nome, codigo, cidade, sistemasTexto, grupo };
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
 * Converte a linha crua do banco (sistemas como texto "a, b, c") num objeto
 * de API (sistemas como array). "maquinas" não é uma coluna de clientes --
 * vem calculada à parte (ver AtualizacaoRepository.lastMaquinasByClient/
 * lastMaquinasForClient) e é só anexada aqui.
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
    maquinas,
  };
}

module.exports = { ClienteService };
