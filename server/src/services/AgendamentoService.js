const { STATUS_OPTIONS } = require("../config/constants");
const { REGRAS } = require("../config/regrasEquipe");
const { dataValida, horaValida } = require("../shared/validation");
const { normalizarResponsavel } = require("./normalizacao");
const { ValidationError, NotFoundError, ConflictError } = require("../shared/errors");

/**
 * Regras de negocio da aba Agendamentos, em cima do AgendamentoRepository.
 */
class AgendamentoService {
  /**
   * @param {import('../database/Database').Database} db
   * @param {import('./HistoricoService').HistoricoService} historico
   */
  /**
   * @param {{valor(nome: string): any}} [regras] ConfiguracaoSistemaService; sem ele
   *   (testes), vale o padrão de config/regrasEquipe.js.
   */
  constructor(db, historico, regras) {
    this.db = db;
    this.historico = historico;
    this.regras = regras || { valor: (nome) => REGRAS[nome].padrao };
  }

  /**
   * A listagem arquiva antes de listar.
   *
   * Sem agendador nenhum, de proposito: o app nao tem um, e um cron so para
   * isto seria mais peca do que o problema pede. A varredura e um UPDATE com
   * WHERE que na esmagadora maioria das vezes nao casa com nada, numa tabela
   * de dezenas de linhas -- e roda exatamente quando alguem esta olhando a
   * lista, que e quando o resultado importa.
   *
   * O total devolvido ganha `arquivadas`: a tela precisa saber quantas
   * existem para oferecer o filtro sem mandar ninguem procurar no escuro.
   */
  list(search = "", status = "Todos", paginacao = {}) {
    this.arquivarAntigas();
    return {
      ...this.db.agendamentos.list(search, status, paginacao),
      arquivadas: this.db.agendamentos.contarArquivadas(),
      // A tela explica a regra ("concluídas há mais de N dias saem daqui"),
      // e o N vem daqui em vez de estar escrito na tela: quem mudar a regra
      // na Administração muda o comportamento E o texto, sem os dois se
      // contradizerem.
      arquivarDias: this.regras.valor("agendamentoArquivarDias"),
    };
  }

  /** @returns {number} quantas tarefas sairam da lista nesta varredura */
  arquivarAntigas() {
    return this.db.agendamentos.arquivarConcluidasAntigas(
      this.regras.valor("agendamentoArquivarDias"),
      STATUS_OPTIONS[STATUS_OPTIONS.length - 1]
    );
  }

  /** Traz uma tarefa arquivada de volta para a lista, reaberta. */
  reabrir(id, usuario) {
    const tarefa = this.db.agendamentos.find(id);
    if (!tarefa) throw new NotFoundError("Esta tarefa não existe mais.");
    if (this.db.agendamentos.reabrir(id, STATUS_OPTIONS[0]) === 0) {
      throw new NotFoundError("Esta tarefa não está arquivada.");
    }
    this.historico.registrar(usuario, "atualizar", "agendamento", `Tarefa "${tarefa.tarefa}" desarquivada e reaberta`);
    return { ...tarefa, status: STATUS_OPTIONS[0], concluidoEm: null };
  }

  /**
   * Arquiva uma tarefa concluida na hora, sem esperar `arquivarAntigas`
   * alcancar o prazo do .env. Restrito a tarefas "Concluído" pelo mesmo
   * motivo da varredura automatica: arquivar uma tarefa ainda pendente faria
   * "Reabrir" resetar o status dela para o primeiro da lista sem necessidade
   * (ver AgendamentoRepository.reabrir).
   */
  arquivar(id, usuario) {
    const tarefa = this.db.agendamentos.find(id);
    if (!tarefa) throw new NotFoundError("Esta tarefa não existe mais.");
    const statusConcluido = STATUS_OPTIONS[STATUS_OPTIONS.length - 1];
    if (tarefa.status !== statusConcluido) {
      throw new ValidationError(`Só é possível arquivar tarefas "${statusConcluido}".`);
    }
    if (this.db.agendamentos.arquivar(id) === 0) {
      throw new NotFoundError("Esta tarefa já está arquivada.");
    }
    this.historico.registrar(usuario, "atualizar", "agendamento", `Tarefa "${tarefa.tarefa}" arquivada`);
  }

  /** Tarefas pendentes vencidas/vencendo hoje, para o banner de lembrete. */
  lembretes() {
    return this.db.agendamentos.dueSoon();
  }

  create(input, usuario) {
    const data = this._validate(input);
    this.db.agendamentos.insert(data);
    this.historico.registrar(usuario, "criar", "agendamento", `Tarefa "${data.tarefa}"`);
    return data;
  }

  gerarLote(input, usuario) {
    const clientes = [...new Set((input.clientes || []).map((nome) => String(nome || "").trim()).filter(Boolean))];
    const sistema = String(input.sistema || "").trim();
    if (!sistema) throw new ValidationError("Informe o sistema do lote.");
    if (clientes.length === 0) throw new ValidationError("Nenhum cliente foi selecionado para o lote.");
    if (clientes.length > 500) throw new ValidationError("O lote pode conter no máximo 500 clientes.");
    const hoje = new Date();
    const data = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
    const itens = clientes.map((cliente) => this._validate({
      tarefa: `Atualizar ${sistema}${input.dataCorte ? ` — defasado antes de ${input.dataCorte}` : ""}`,
      cliente,
      responsavel: input.responsavel || usuario?.nome || "",
      data,
      horario: "",
      status: STATUS_OPTIONS[0],
    }));
    const criados = this.db.agendamentos.insertMany(itens);
    this.historico.registrar(usuario, "criar", "agendamento", `${criados} tarefas geradas em lote para ${sistema}`);
    return { criados };
  }

  // Ver o comentario equivalente em AtualizacaoService: "zero linhas
  // afetadas" precisa virar 404, senao a tela confirma uma alteracao que
  // nao aconteceu numa tarefa que outra pessoa ja excluiu.
  update(id, input, usuario) {
    const data = this._validate(input);
    // concluido_em so existe enquanto a tarefa ESTA "Concluído" agora:
    // acabou de virar -> grava a hora; deixou de ser (reaberta) -> limpa;
    // continua concluída de uma edição pra outra -> preserva a data
    // original (senão editar o responsável de uma tarefa já fechada
    // "resetaria" o tempo de resolução dela).
    const statusConcluido = STATUS_OPTIONS[STATUS_OPTIONS.length - 1];
    const atual = this.db.agendamentos.find(id);
    let concluidoEm = null;
    if (data.status === statusConcluido) {
      concluidoEm = atual && atual.status === statusConcluido ? atual.concluidoEm : new Date().toISOString();
    }
    const revisaoEsperada = Number.isInteger(Number(input.revisao)) ? Number(input.revisao) : null;
    if (this.db.agendamentos.update(id, { ...data, concluidoEm }, revisaoEsperada, usuario?.nome || "") === 0) {
      const agora = this.db.agendamentos.find(id);
      if (agora && revisaoEsperada != null) throw new ConflictError(`Este agendamento foi atualizado por ${agora.atualizadoPor || "outra pessoa"}. Confira os dados antes de sobrescrever.`, agora);
      throw new NotFoundError("Esta tarefa não existe mais. Ela pode ter sido excluída por outra pessoa.");
    }
    this.historico.registrar(usuario, "atualizar", "agendamento", `Tarefa "${data.tarefa}"`, { antes: atual, depois: data });
    return data;
  }

  delete(id, usuario) {
    const atual = this.db.agendamentos.find(id);
    if (this.db.agendamentos.delete(id) === 0) {
      throw new NotFoundError("Esta tarefa não existe mais.");
    }
    this.historico.registrar(usuario, "excluir", "agendamento", `Tarefa #${id}`, { antes: atual, depois: null });
  }

  /** Atalho: marca a tarefa com o ultimo status da lista ("Concluído"). */
  markDone(id, usuario) {
    if (this.db.agendamentos.markDone(id, STATUS_OPTIONS[STATUS_OPTIONS.length - 1]) === 0) {
      throw new NotFoundError("Esta tarefa não existe mais.");
    }
    this.historico.registrar(usuario, "marcar_concluida", "agendamento", `Tarefa #${id} concluída`);
  }

  /**
   * Exclui várias tarefas de uma vez. Devolve `{ excluidos, registros }` --
   * `registros` são os dados ANTES de sumirem, com que a tela recria tudo se
   * a pessoa apertar "Desfazer" (mesmo padrão de AtualizacaoService.deleteMany).
   */
  deleteMany(ids, usuario) {
    const registros = this.db.agendamentos.findByIds(ids);
    if (registros.length === 0) {
      throw new NotFoundError("Nenhuma das tarefas selecionadas existe mais. A lista pode estar desatualizada.");
    }
    const excluidos = this.db.agendamentos.deleteMany(registros.map((r) => r.id));
    this.historico.registrar(usuario, "excluir", "agendamento", `${excluidos} tarefas excluídas de uma vez`);
    return { excluidos, registros };
  }

  /**
   * Marca várias tarefas como concluídas de uma vez. Só toca as que AINDA
   * não estavam concluídas (idempotente, e evita sujar o histórico com
   * tarefas que já estavam assim) -- `registros` devolve o estado ANTERIOR
   * só dessas, para o "Desfazer" da tela restaurar o status/data de
   * conclusão exatos que cada uma tinha, não um "A Fazer" genérico.
   */
  markDoneMany(ids, usuario) {
    const doneLabel = STATUS_OPTIONS[STATUS_OPTIONS.length - 1];
    const registros = this.db.agendamentos.findByIds(ids);
    if (registros.length === 0) {
      throw new NotFoundError("Nenhuma das tarefas selecionadas existe mais. A lista pode estar desatualizada.");
    }
    const pendentes = registros.filter((r) => r.status !== doneLabel);
    const concluidos = pendentes.length > 0 ? this.db.agendamentos.markDoneMany(pendentes.map((r) => r.id), doneLabel) : 0;
    if (concluidos > 0) {
      this.historico.registrar(usuario, "marcar_concluida", "agendamento", `${concluidos} tarefas concluídas de uma vez`);
    }
    return { concluidos, registros: pendentes };
  }

  _validate(input) {
    const tarefa = (input.tarefa || "").trim();
    if (!tarefa) throw new ValidationError("Campo 'Tarefa' é obrigatório.");
    const data = (input.data || "").trim();
    if (!dataValida(data)) throw new ValidationError("Campo 'Data' precisa estar no formato dd/mm/aaaa.");
    const horario = (input.horario || "").trim();
    if (!horaValida(horario)) throw new ValidationError("Campo 'Horário' precisa estar no formato hh:mm.");
    const status = STATUS_OPTIONS.includes(input.status) ? input.status : STATUS_OPTIONS[0];
    return {
      tarefa,
      cliente: (input.cliente || "").trim(),
      // Mesma grafia canônica das Atualizações, e de propósito buscada LÁ: é
      // a mesma equipe, e é lá que está o volume que define qual grafia vale
      // ("Camila", não "CAMILA"). Sem isto, o campo Responsável de uma aba
      // divergia do da outra -- foi assim que "Marcos/lennon" nasceu aqui.
      responsavel: normalizarResponsavel(input.responsavel, this.db.atualizacoes.distinctResponsaveis()),
      data,
      horario,
      status,
    };
  }
}

module.exports = { AgendamentoService };
