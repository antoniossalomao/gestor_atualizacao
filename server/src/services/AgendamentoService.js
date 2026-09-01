const { STATUS_OPTIONS } = require("../config/constants");
const { dataValida } = require("./validation");
const { ValidationError, NotFoundError } = require("./errors");

/**
 * Regras de negocio da aba Agendamentos, em cima do AgendamentoRepository.
 */
class AgendamentoService {
  /**
   * @param {import('../database/Database').Database} db
   * @param {import('./HistoricoService').HistoricoService} historico
   */
  constructor(db, historico) {
    this.db = db;
    this.historico = historico;
  }

  list(search = "", status = "Todos", paginacao = {}) {
    return this.db.agendamentos.list(search, status, paginacao);
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
    if (this.db.agendamentos.update(id, data) === 0) {
      throw new NotFoundError("Esta tarefa não existe mais. Ela pode ter sido excluída por outra pessoa.");
    }
    this.historico.registrar(usuario, "atualizar", "agendamento", `Tarefa "${data.tarefa}"`);
    return data;
  }

  delete(id, usuario) {
    if (this.db.agendamentos.delete(id) === 0) {
      throw new NotFoundError("Esta tarefa não existe mais.");
    }
    this.historico.registrar(usuario, "excluir", "agendamento", `Tarefa #${id}`);
  }

  /** Atalho: marca a tarefa com o ultimo status da lista ("Concluído"). */
  markDone(id, usuario) {
    if (this.db.agendamentos.markDone(id, STATUS_OPTIONS[STATUS_OPTIONS.length - 1]) === 0) {
      throw new NotFoundError("Esta tarefa não existe mais.");
    }
    this.historico.registrar(usuario, "marcar_concluida", "agendamento", `Tarefa #${id} concluída`);
  }

  _validate(input) {
    const tarefa = (input.tarefa || "").trim();
    if (!tarefa) throw new ValidationError("Campo 'Tarefa' é obrigatório.");
    const data = (input.data || "").trim();
    if (!dataValida(data)) throw new ValidationError("Campo 'Data' precisa estar no formato dd/mm/aaaa.");
    const status = STATUS_OPTIONS.includes(input.status) ? input.status : STATUS_OPTIONS[0];
    return {
      tarefa,
      cliente: (input.cliente || "").trim(),
      responsavel: (input.responsavel || "").trim(),
      data,
      status,
    };
  }
}

module.exports = { AgendamentoService };
