const { ErroDeValidacao, ErroNaoEncontrado, ErroDeConflito } = require("../shared/erros");
const { SISTEMA_PRINCIPAL } = require("./situacaoVersao");
const { textoDoCampo } = require("./validacao");

/**
 * Regras de negocio da aba Clientes, em cima do ClienteRepository /
 * SistemaRepository. A validacao mora aqui, e nao na tela, para servir tanto
 * a rota HTTP quanto os testes.
 */
class ClienteService {
  /**
   * @param {import("../database/BancoDeDados").BancoDeDados} db
   * @param {import('./HistoricoService').HistoricoService} historico
   */
  constructor(db, historico, eventos = null) {
    this.db = db;
    this.historico = historico;
    this.eventos = eventos;
  }

  /** @param {{page?: number, pageSize?: number}} paginacao */
  list(search = "", paginacao = {}) {
    const { rows, total, page, pageSize } = this.db.clientes.list(search, paginacao);
    // Um mapa só (não uma consulta por linha) com a quantidade de máquinas
    // de cada cliente, lida da atualização mais recente dele -- ver
    // AtualizacaoRepository.maquinasPorCliente.
    const maquinasPorCliente = this.db.atualizacoes.maquinasPorCliente();
    return { rows: rows.map((row) => paraClienteDto(row, maquinasPorCliente.get(row.id) ?? 0)), total, page, pageSize };
  }

  names() {
    return this.db.clientes.names();
  }

  /** Ver ClienteRepository.semSistema. */
  semSistema() {
    return this.db.clientes.semSistema();
  }

  opcoesPorCodigo() {
    return this.db.clientes.opcoesPorCodigo();
  }

  proximoCodigo() {
    return this.db.clientes.proximoCodigo();
  }

  /** Grupos/redes já cadastrados, para autocompletar do campo "Grupo/rede". */
  grupos() {
    return this.db.clientes.grupos();
  }

  cidades() {
    return this.db.clientes.cidades();
  }

  obterPorId(id) {
    const row = this.db.clientes.obterPorId(id);
    if (!row) throw new ErroNaoEncontrado("Cliente não encontrado.");
    return paraClienteDto(row, this.db.atualizacoes.maquinasDoCliente(row.id));
  }

  obterPorNome(nome) {
    const row = this.db.clientes.obterPorNome(nome);
    if (!row) return null;
    return paraClienteDto(row, this.db.atualizacoes.maquinasDoCliente(row.id));
  }

  /**
   * @param {{codigo?: string, autoCodigo?: boolean, nome: string, cidade?: string, sistemas?: string[]}} input
   * @param {{id:number, nome:string}|null} usuario quem está fazendo a ação (para o histórico)
   */
  create(input, usuario) {
    let { nome, codigo, cidade, sistemas, grupo, regimeTributario } = this._validar(input);
    // Bloqueia nome duplicado ANTES de inserir: dois clientes com o mesmo
    // nome seriam indistinguiveis nas telas que listam por nome, e o vinculo
    // de uma atualização digitada pelo nome escolheria um deles as cegas.
    if (this.db.clientes.nomeExiste(nome)) {
      throw new ErroDeValidacao(`Já existe um cliente chamado '${nome}'.`);
    }
    if (!codigo && input.autoCodigo) {
      codigo = this.db.clientes.proximoCodigo();
    }
    if (codigo && this.db.clientes.codigoExiste(codigo)) {
      throw new ErroDeValidacao(`Já existe um cliente com o código '${codigo}'.`);
    }
    const id = this.db.clientes.insert(codigo, nome, cidade, this._idsDosSistemas(sistemas), grupo, regimeTributario);
    this.historico.registrar(usuario, "criar", "cliente", `Cliente "${nome}"${codigo ? ` (código ${codigo})` : ""}`);
    this.eventos?.emitir("clientes:alterado", { id, acao: "criar", nome });
    return paraClienteDto(this.db.clientes.obterPorId(id), this.db.atualizacoes.maquinasDoCliente(id));
  }

  update(id, input, usuario) {
    const existente = this.db.clientes.obterPorId(id);
    if (!existente) throw new ErroNaoEncontrado("Cliente não encontrado.");
    const { nome, codigo, cidade, sistemas, grupo, regimeTributario } = this._validar(input);
    if (this.db.clientes.nomeExiste(nome, id)) {
      throw new ErroDeValidacao(`Já existe um cliente chamado '${nome}'.`);
    }
    if (codigo && this.db.clientes.codigoExiste(codigo, id)) {
      throw new ErroDeValidacao(`Já existe um cliente com o código '${codigo}'.`);
    }
    // O nome copiado nas atualizações/agendamentos ligados acompanha o
    // rename dentro de ClienteRepository.update.
    const revisaoEsperada = Number.isInteger(Number(input.revisao)) ? Number(input.revisao) : null;
    if (this.db.clientes.update(id, codigo, nome, cidade, this._idsDosSistemas(sistemas), grupo, revisaoEsperada, usuario?.nome || "", regimeTributario) === 0) {
      const agora = this.db.clientes.obterPorId(id);
      if (agora && revisaoEsperada != null) throw new ErroDeConflito(`Este cliente foi atualizado por ${agora.atualizadoPor || "outra pessoa"}. Confira os dados antes de sobrescrever.`, paraClienteDto(agora));
      throw new ErroNaoEncontrado("Cliente não encontrado.");
    }
    const descricao =
      existente.nome !== nome ? `Cliente "${existente.nome}" renomeado para "${nome}"` : `Cliente "${nome}"`;
    const depois = this.db.clientes.obterPorId(id);
    this.historico.registrar(usuario, "atualizar", "cliente", descricao, { antes: paraClienteDto(existente), depois: paraClienteDto(depois) });
    this.eventos?.emitir("clientes:alterado", { id, acao: "atualizar", nome });
    return paraClienteDto(this.db.clientes.obterPorId(id), this.db.atualizacoes.maquinasDoCliente(id));
  }

  /** Ids dos sistemas marcados, na ordem -- ver SistemaRepository.resolverOuCriar. */
  _idsDosSistemas(nomes) {
    return this.db.sistemas.resolverOuCriar(nomes).map((s) => s.id);
  }

  delete(id, usuario) {
    const existente = this.db.clientes.obterPorId(id);
    if (!existente) throw new ErroNaoEncontrado("Cliente não encontrado.");
    this.db.clientes.delete(id);
    this.historico.registrar(usuario, "excluir", "cliente", `Cliente "${existente.nome}"`, { antes: paraClienteDto(existente), depois: null });
    this.eventos?.emitir("clientes:alterado", { id, acao: "excluir" });
  }

  /**
   * Exclui vários clientes de uma vez. Diferente da exclusão em lote de
   * Atualizações/Agendamentos, NÃO oferece "Desfazer": recriar um cliente
   * perde o id antigo e, com o cadastro de Acessos remotos, perde também as
   * credenciais de AnyDesk/Suporte Bredas daquele cliente (apagadas junto
   * via ON DELETE CASCADE -- ver BancoDeDados._migrate) -- um "desfazer" que
   * finge ter voltado tudo ao normal, mas silenciosamente perdeu senha de
   * acesso, seria pior que não ter Desfazer nenhum. Por isso a tela usa
   * confirmação antes, igual já fazia para excluir um cliente só.
   */
  excluirVarios(ids, usuario) {
    const registros = this.db.clientes.buscarPorIds(ids);
    if (registros.length === 0) {
      throw new ErroNaoEncontrado("Nenhum dos clientes selecionados existe mais. A lista pode estar desatualizada.");
    }
    const excluidos = this.db.clientes.excluirVarios(registros.map((r) => r.id));
    const nomes = registros.slice(0, 3).map((r) => r.nome).join(", ") + (registros.length > 3 ? ` e mais ${registros.length - 3}` : "");
    this.historico.registrar(usuario, "excluir", "cliente", `${excluidos} clientes excluídos de uma vez (${nomes})`);
    this.eventos?.emitir("clientes:alterado", { acao: "excluir-lote", total: excluidos });
    return { excluidos };
  }

  /**
   * Marca um sistema em vários clientes de uma vez (ex.: "esses 8 clientes
   * agora têm NFCe"), em vez de abrir o cadastro de cada um e marcar o
   * checkbox individualmente.
   */
  adicionarSistemaEmLote(ids, nomeSistema, usuario) {
    const limpo = textoDoCampo(nomeSistema, "Sistema");
    if (!limpo) throw new ErroDeValidacao("Escolha um sistema.");
    const registros = this.db.clientes.buscarPorIds(ids);
    if (registros.length === 0) {
      throw new ErroNaoEncontrado("Nenhum dos clientes selecionados existe mais. A lista pode estar desatualizada.");
    }
    const [sistema] = this.db.sistemas.resolverOuCriar([limpo]);
    const afetados = this.db.clientes.adicionarSistemaALotes(registros.map((r) => r.id), sistema.id);
    if (afetados > 0) {
      const nomes = registros.slice(0, 3).map((r) => r.nome).join(", ") + (registros.length > 3 ? ` e mais ${registros.length - 3}` : "");
      this.historico.registrar(usuario, "atualizar", "cliente", `Sistema "${limpo}" adicionado a ${afetados} cliente(s) de uma vez (${nomes})`);
      this.eventos?.emitir("clientes:alterado", { acao: "sistema-lote", afetados });
    }
    return { afetados, total: registros.length };
  }

  salvarVersaoSistema(nome, data, usuario, versaoEsperada) {
    const { dataValida } = require("./validacao");
    if (typeof data !== "string" || (data !== "" && !dataValida(data))) {
      throw new ErroDeValidacao("Informe uma data válida no formato dd/mm/aaaa.");
    }
    const sistema = this.db.sistemas.resolver(nome);
    if (!sistema?.ativo) throw new ErroNaoEncontrado("Sistema não encontrado.");
    if (!sistema.controla_versao) throw new ErroDeValidacao(`"${sistema.nome}" é um componente fixo e não recebe versão oficial.`);
    if (typeof versaoEsperada !== "string") throw new ErroDeValidacao("Informe a referência anterior para evitar sobrescrever outra edição.");
    if (sistema.ultima_versao !== versaoEsperada) throw new ErroDeConflito("A versão oficial mudou desde que você abriu a edição. Recarregue a lista antes de salvar.");
    const antes = { nome: sistema.nome, data: sistema.ultima_versao || "" };
    if (!this.db.sistemas.salvarVersaoSeAtual(sistema.nome, data, versaoEsperada, usuario?.nome || "")) {
      throw new ErroDeConflito("A versão oficial foi alterada por outra pessoa. Recarregue a lista antes de salvar.");
    }
    this.historico.registrar(usuario, "atualizar", "sistema", `Última versão de ${sistema.nome}: ${data || "não informada"}`, { antes, depois: { nome: sistema.nome, data } });
    return { nome: sistema.nome, data };
  }

  /**
   * @param {boolean} controlaVersao
   * @param {boolean} [atualizaComPrincipal] sem ele, a marcação de dependente do B_Vendas não muda
   */
  classificarSistema(id, controlaVersao, usuario, atualizaComPrincipal) {
    if (typeof controlaVersao !== "boolean") throw new ErroDeValidacao("Informe se o sistema controla versão.");
    if (atualizaComPrincipal !== undefined && typeof atualizaComPrincipal !== "boolean") {
      throw new ErroDeValidacao(`Informe se o sistema atualiza junto com o ${SISTEMA_PRINCIPAL}.`);
    }
    const sistema = this.db.sistemas.obterPorId(Number(id));
    if (!sistema?.ativo) throw new ErroNaoEncontrado("Sistema não encontrado no catálogo ativo.");
    if (atualizaComPrincipal && sistema.nome.toLowerCase() === SISTEMA_PRINCIPAL.toLowerCase()) {
      throw new ErroDeValidacao(`O ${SISTEMA_PRINCIPAL} não pode depender dele mesmo.`);
    }
    const mudaClasse = Boolean(sistema.controlaVersao) !== controlaVersao;
    const mudaDependencia = atualizaComPrincipal !== undefined && Boolean(sistema.atualizaComPrincipal) !== atualizaComPrincipal;
    if (!mudaClasse && !mudaDependencia) return sistema;
    if (mudaClasse) this.db.sistemas.classificar(sistema.id, controlaVersao);
    if (mudaDependencia) this.db.sistemas.marcarDependente(sistema.id, atualizaComPrincipal);
    const depois = this.db.sistemas.obterPorId(sistema.id);
    const partes = [];
    if (mudaClasse) partes.push(`classificado como ${controlaVersao ? "atualizável" : "componente fixo"}`);
    if (mudaDependencia) partes.push(atualizaComPrincipal ? `marcado como atualizado junto com o ${SISTEMA_PRINCIPAL}` : `desmarcado de atualizar junto com o ${SISTEMA_PRINCIPAL}`);
    this.historico.registrar(usuario, "atualizar", "sistema", `Sistema "${sistema.nome}" ${partes.join(" e ")}`, { antes: sistema, depois });
    return depois;
  }

  listarSistemas() {
    return this.db.sistemas.list();
  }

  /** @returns {{created: boolean}} created=false quando o sistema ja existia */
  addSistema(nome, usuario) {
    const limpo = textoDoCampo(nome, "Sistema");
    if (!limpo) throw new ErroDeValidacao("Informe um nome para o sistema.");
    const created = this.db.sistemas.add(limpo);
    if (!created) throw new ErroDeValidacao(`O sistema '${limpo}' já existe.`);
    this.historico.registrar(usuario, "criar", "sistema", `Sistema "${limpo}"`);
    return { created: true };
  }

  /**
   * Tira um sistema do catálogo -- e, junto, desmarca ele de qualquer
   * cliente que o tivesse (ver SistemaRepository.remove).
   *
   * O que NÃO é tocado, de propósito: o sistema continua existindo, inativo,
   * e as atualizações já registradas (`atualizacao_sistemas`) e as versões
   * já publicadas (`versoes_atualizador.sistema`) continuam apontando para
   * ele. São
   * registros do que JÁ aconteceu -- uma atualização feita ano passado no
   * sistema "Sped" continua tendo sido, de fato, no "Sped", mesmo que hoje
   * ele não seja mais oferecido para clientes novos. Apagar esse rastro
   * seria reescrever histórico, não limpar cadastro.
   *
   * @returns {{removed: true, clientesAfetados: number}}
   */
  removerSistema(nome, usuario) {
    const limpo = textoDoCampo(nome, "Sistema");
    if (!limpo) throw new ErroDeValidacao("Informe o nome do sistema.");
    const removido = this.db.sistemas.remove(limpo);
    if (!removido) throw new ErroNaoEncontrado(`O sistema "${limpo}" não está cadastrado.`);
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

  _validar(input) {
    const nome = textoDoCampo(input.nome, "Cliente");
    if (!nome) throw new ErroDeValidacao("Campo 'Cliente' é obrigatório.");
    const codigo = textoDoCampo(input.codigo, "Código");
    const cidade = textoDoCampo(input.cidade, "Cidade");
    const grupo = textoDoCampo(input.grupo, "Grupo");
    const regimeTributario = String(input.regimeTributario || "").trim();
    if (regimeTributario.length > 100) throw new ErroDeValidacao("Regime tributário pode ter no máximo 100 caracteres.");
    const sistemas = Array.isArray(input.sistemas) ? input.sistemas.map((s) => String(s || "").trim()).filter(Boolean) : [];
    return { nome, codigo, cidade, sistemas, grupo, regimeTributario };
  }

  /** Acessos remotos (AnyDesk / Suporte Bredas) das máquinas de um cliente -- aba Clientes, botão "Acessos". */
  listarAcessos(clienteId) {
    const cliente = this.db.clientes.obterPorId(clienteId);
    if (!cliente) throw new ErroNaoEncontrado("Cliente não encontrado.");
    return this.db.clienteAcessos.listarPorCliente(clienteId);
  }

  adicionarAcesso(clienteId, input, usuario) {
    const cliente = this.db.clientes.obterPorId(clienteId);
    if (!cliente) throw new ErroNaoEncontrado("Cliente não encontrado.");
    const { maquina, anydesk, suporteBredas, observacoes } = this._validarAcesso(input);
    const id = this.db.clienteAcessos.insert(clienteId, maquina, anydesk, suporteBredas, observacoes);
    this.historico.registrar(usuario, "criar", "acesso", `Acesso "${maquina}" de "${cliente.nome}"`);
    return this.db.clienteAcessos.obterPorId(id);
  }

  alterarAcesso(id, input, usuario) {
    const existente = this.db.clienteAcessos.obterPorId(id);
    if (!existente) throw new ErroNaoEncontrado("Acesso não encontrado.");
    const { maquina, anydesk, suporteBredas, observacoes } = this._validarAcesso(input);
    this.db.clienteAcessos.update(id, maquina, anydesk, suporteBredas, observacoes);
    const cliente = this.db.clientes.obterPorId(existente.clienteId);
    this.historico.registrar(usuario, "atualizar", "acesso", `Acesso "${maquina}" de "${cliente ? cliente.nome : existente.clienteId}"`);
    return this.db.clienteAcessos.obterPorId(id);
  }

  removerAcesso(id, usuario) {
    const existente = this.db.clienteAcessos.obterPorId(id);
    if (!existente) throw new ErroNaoEncontrado("Acesso não encontrado.");
    this.db.clienteAcessos.delete(id);
    const cliente = this.db.clientes.obterPorId(existente.clienteId);
    this.historico.registrar(
      usuario,
      "excluir",
      "acesso",
      `Acesso "${existente.maquina}" de "${cliente ? cliente.nome : existente.clienteId}"`
    );
  }

  _validarAcesso(input) {
    const maquina = textoDoCampo(input.maquina, "Máquina");
    if (!maquina) throw new ErroDeValidacao("Campo 'Máquina' é obrigatório.");
    const anydesk = textoDoCampo(input.anydesk, "AnyDesk");
    const suporteBredas = textoDoCampo(input.suporteBredas, "Suporte Bredas");
    const observacoes = textoDoCampo(input.observacoes, "Observações");
    return { maquina, anydesk, suporteBredas, observacoes };
  }
}

/**
 * Converte a linha da visão `clientes_v` (sistemas como texto "a, b, c") num
 * objeto de API (sistemas como array). "maquinas" não é uma coluna de
 * clientes -- vem calculada à parte (ver AtualizacaoRepository.
 * maquinasPorCliente/maquinasDoCliente) e é só anexada aqui.
 */
function paraClienteDto(row, maquinas = 0) {
  if (!row) return null;
  return {
    id: row.id,
    codigo: row.codigo || "",
    nome: row.nome,
    cidade: row.cidade || "",
    regimeTributario: row.regimeTributario || "",
    sistemas: row.sistemas ? row.sistemas.split(",").map((s) => s.trim()).filter(Boolean) : [],
    grupo: row.grupo || "",
    revisao: row.revisao,
    atualizadoEm: row.atualizadoEm || null,
    atualizadoPor: row.atualizadoPor || "",
    maquinas,
  };
}

module.exports = { ClienteService };
