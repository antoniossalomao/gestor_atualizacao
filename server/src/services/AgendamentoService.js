const { OPCOES_STATUS, OPCOES_PRIORIDADE } = require("../config/constantes");
const { REGRAS } = require("../config/regrasEquipe");
const { dataValida, horaValida } = require("./validacao");
const { normalizarResponsavel } = require("../shared/normalizacao");
const { ErroDeValidacao, ErroNaoEncontrado, ErroDeConflito } = require("../shared/erros");

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
      OPCOES_STATUS[OPCOES_STATUS.length - 1]
    );
  }

  /** Traz uma tarefa arquivada de volta para a lista, reaberta. */
  reabrir(id, usuario) {
    const tarefa = this.db.agendamentos.find(id);
    if (!tarefa) throw new ErroNaoEncontrado("Esta tarefa não existe mais.");
    if (this.db.agendamentos.reabrir(id, OPCOES_STATUS[0]) === 0) {
      throw new ErroNaoEncontrado("Esta tarefa não está arquivada.");
    }
    this.historico.registrar(usuario, "atualizar", "agendamento", `Tarefa "${tarefa.tarefa}" desarquivada e reaberta`);
    return { ...tarefa, status: OPCOES_STATUS[0], concluidoEm: null };
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
    if (!tarefa) throw new ErroNaoEncontrado("Esta tarefa não existe mais.");
    const statusConcluido = OPCOES_STATUS[OPCOES_STATUS.length - 1];
    if (tarefa.status !== statusConcluido) {
      throw new ErroDeValidacao(`Só é possível arquivar tarefas "${statusConcluido}".`);
    }
    if (this.db.agendamentos.arquivar(id) === 0) {
      throw new ErroNaoEncontrado("Esta tarefa já está arquivada.");
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
    const statusConcluido = OPCOES_STATUS[OPCOES_STATUS.length - 1];
    const atual = this.db.agendamentos.find(id);
    let concluidoEm = null;
    if (data.status === statusConcluido) {
      concluidoEm = atual && atual.status === statusConcluido ? atual.concluidoEm : new Date().toISOString();
    }
    const revisaoEsperada = Number.isInteger(Number(input.revisao)) ? Number(input.revisao) : null;
    if (this.db.agendamentos.update(id, { ...data, concluidoEm }, revisaoEsperada, usuario?.nome || "") === 0) {
      const agora = this.db.agendamentos.find(id);
      if (agora && revisaoEsperada != null) throw new ErroDeConflito(`Este agendamento foi atualizado por ${agora.atualizadoPor || "outra pessoa"}. Confira os dados antes de sobrescrever.`, agora);
      throw new ErroNaoEncontrado("Esta tarefa não existe mais. Ela pode ter sido excluída por outra pessoa.");
    }
    this.historico.registrar(usuario, "atualizar", "agendamento", `Tarefa "${data.tarefa}"`, { antes: atual, depois: data });
    // Devolve a linha RELIDA, com a `revisao` nova. Devolver só `data` (sem
    // revisão) fazia o quadro guardar a revisão antiga depois de arrastar um
    // cartão: a mudança seguinte no mesmo cartão -- voltar de "Em Andamento"
    // para "A Fazer", por exemplo -- batia em 409 contra a própria pessoa, e
    // o quadro só voltava a aceitar mudanças depois de um F5.
    return this.db.agendamentos.find(id);
  }

  delete(id, usuario) {
    const atual = this.db.agendamentos.find(id);
    if (this.db.agendamentos.delete(id) === 0) {
      throw new ErroNaoEncontrado("Esta tarefa não existe mais.");
    }
    this.historico.registrar(usuario, "excluir", "agendamento", `Tarefa #${id}`, { antes: atual, depois: null });
  }

  /** Atalho: marca a tarefa com o ultimo status da lista ("Concluído"). */
  markDone(id, usuario) {
    if (this.db.agendamentos.markDone(id, OPCOES_STATUS[OPCOES_STATUS.length - 1]) === 0) {
      throw new ErroNaoEncontrado("Esta tarefa não existe mais.");
    }
    this.historico.registrar(usuario, "marcar_concluida", "agendamento", `Tarefa #${id} concluída`);
  }

  _validate(input) {
    const tarefa = (input.tarefa || "").trim();
    if (!tarefa) throw new ErroDeValidacao("Campo 'Tarefa' é obrigatório.");
    const data = (input.data || "").trim();
    if (!dataValida(data)) throw new ErroDeValidacao("Campo 'Data' precisa estar no formato dd/mm/aaaa.");
    const horario = (input.horario || "").trim();
    if (!horaValida(horario)) throw new ErroDeValidacao("Campo 'Horário' precisa estar no formato hh:mm.");
    const status = OPCOES_STATUS.includes(input.status) ? input.status : OPCOES_STATUS[0];
    const prioridade = OPCOES_PRIORIDADE.includes(input.prioridade) ? input.prioridade : "Normal";
    return {
      tarefa,
      cliente: (input.cliente || "").trim(),
      sistema: (input.sistema || "").trim(),
      // Mesma grafia canônica das Atualizações, e de propósito buscada LÁ: é
      // a mesma equipe, e é lá que está o volume que define qual grafia vale
      // ("Camila", não "CAMILA"). Sem isto, o campo Responsável de uma aba
      // divergia do da outra -- foi assim que "Marcos/lennon" nasceu aqui.
      responsavel: normalizarResponsavel(input.responsavel, this.db.atualizacoes.distinctResponsaveis()),
      prioridade,
      data,
      horario,
      status,
      obs: (input.obs || "").trim(),
    };
  }
}

module.exports = { AgendamentoService };
