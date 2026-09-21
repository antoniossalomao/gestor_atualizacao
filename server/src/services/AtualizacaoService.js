const ExcelJS = require("exceljs");

const { COLUMNS, DESATUALIZADO_DIAS, SISTEMA_SUPORTE_BREDAS, OBS_SUPORTE_BREDAS } = require("../config/constants");
const { dataValida, parseData } = require("../shared/validation");
const { normalizarSistemas, normalizarResponsavel } = require("./normalizacao");
const { ValidationError, NotFoundError, ConflictError } = require("../shared/errors");

// Sentinela: cliente nunca atualizado, sempre no topo da lista de
// pendencias (ninguem esta "mais atrasado" do que quem nunca foi atualizado).
const NUNCA = Number.MAX_SAFE_INTEGER;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Regras de negocio da aba Atualizacoes: CRUD, importacao/exportacao de
 * planilha, e os calculos usados na aba Resumo (que no app original ficavam
 * dentro de gestor/views/resumo.py, misturados com o desenho da tela).
 */
class AtualizacaoService {
  /**
   * @param {import('../database/Database').Database} db
   * @param {import('./HistoricoService').HistoricoService} historico
   * @param {import('./NotificationService').NotificationService} [notifications]
   */
  constructor(db, historico, notifications) {
    this.db = db;
    this.historico = historico;
    this.notifications = notifications;
  }

  list(search = "", responsavel = "Todos", paginacao = {}) {
    return this.db.atualizacoes.list(search, responsavel, paginacao);
  }

  distinctResponsaveis() {
    return this.db.atualizacoes.distinctResponsaveis();
  }

  create(input, usuario) {
    const data = this._validate(input);
    this.db.atualizacoes.insert(data);
    this.historico.registrar(usuario, "criar", "atualizacao", `Atualização de "${data.cliente}" (${data.sistema || "sem sistema"})`);
    this._marcarSuporteBredasSeNecessario(data, usuario);
    // Sem "await" de proposito: uma notificacao (ou uma falha nela) nao
    // pode atrasar nem derrubar a resposta HTTP deste cadastro.
    this.notifications?.notifyAtualizacao(data);
    return data;
  }

  // Um UPDATE/DELETE que nao encontra o id nao e' erro do SQLite -- ele
  // simplesmente afeta zero linhas e volta calado. Sem checar isso, a tela
  // recebia "salvo com sucesso" por uma edicao que nunca aconteceu, e o
  // historico registrava uma alteracao inexistente. Com varias pessoas
  // usando o app, isso e' rotina: alguem exclui o registro enquanto outra
  // pessoa esta com ele aberto. Mesma regra que ClienteService ja seguia.
  update(id, input, usuario) {
    const data = this._validate(input);
    const antes = this.db.atualizacoes.find(id);
    const revisaoEsperada = Number.isInteger(Number(input.revisao)) ? Number(input.revisao) : null;
    if (this.db.atualizacoes.update(id, data, revisaoEsperada, usuario?.nome || "") === 0) {
      const agora = this.db.atualizacoes.find(id);
      if (agora && revisaoEsperada != null) throw new ConflictError(`Esta atualização foi alterada por ${agora.atualizadoPor || "outra pessoa"}. Confira os dados antes de sobrescrever.`, agora);
      throw new NotFoundError("Esta atualização não existe mais. Ela pode ter sido excluída por outra pessoa.");
    }
    this.historico.registrar(usuario, "atualizar", "atualizacao", `Atualização #${id} de "${data.cliente}"`, { antes, depois: data });
    this._marcarSuporteBredasSeNecessario(data, usuario);
    return data;
  }

  /**
   * Quando a observacao de uma atualizacao registra "Adicionado o Suporte
   * Bredas", marca esse sistema automaticamente no cadastro do cliente --
   * sem isso, quem digita a obs precisaria lembrar de repetir a mesma
   * informacao manualmente na aba Clientes. Idempotente (ver
   * ClienteRepository.adicionarSistema): so grava no historico quando de
   * fato muda algo.
   * @param {{cliente: string, obs?: string}} data
   * @param {{id:number, nome:string}|null} usuario
   */
  _marcarSuporteBredasSeNecessario(data, usuario) {
    if (!(data.obs || "").toLowerCase().includes(OBS_SUPORTE_BREDAS)) return;
    const marcado = this.db.clientes.adicionarSistema(data.cliente, SISTEMA_SUPORTE_BREDAS);
    if (marcado) {
      this.historico.registrar(
        usuario,
        "atualizar",
        "cliente",
        `Cliente "${data.cliente}" marcado com "${SISTEMA_SUPORTE_BREDAS}" (detectado na obs de uma atualização)`
      );
    }
  }

  delete(id, usuario) {
    const existente = this.db.atualizacoes.find(id);
    if (this.db.atualizacoes.delete(id) === 0) {
      throw new NotFoundError("Esta atualização não existe mais.");
    }
    this.historico.registrar(usuario, "excluir", "atualizacao", `Atualização #${id}`, { antes: existente, depois: null });
  }

  /**
   * Exclui varios registros de uma vez (selecao multipla na aba Atualizacoes).
   *
   * Devolve os registros que sairam, porque a tela oferece "Desfazer" e
   * precisa saber o que recriar -- ver `findByIds`. A leitura acontece ANTES
   * da exclusao, pelo motivo obvio, e o historico ganha UMA linha para a
   * operacao inteira: trinta linhas dizendo "excluiu #12", "excluiu #13"
   * afogariam o historico e esconderiam justamente o que aconteceu (uma
   * exclusao em massa, que e' o evento que alguem vai querer achar depois).
   *
   * @param {number[]} ids
   * @returns {{excluidos: number, registros: object[]}}
   */
  deleteMany(ids, usuario) {
    const registros = this.db.atualizacoes.findByIds(ids);
    if (registros.length === 0) {
      throw new NotFoundError("Nenhum dos registros selecionados existe mais. A lista pode estar desatualizada.");
    }

    const excluidos = this.db.atualizacoes.deleteMany(registros.map((r) => r.id));

    const clientes = [...new Set(registros.map((r) => r.cliente).filter(Boolean))];
    const resumoClientes = clientes.slice(0, 3).join(", ") + (clientes.length > 3 ? ` e mais ${clientes.length - 3}` : "");
    this.historico.registrar(
      usuario,
      "excluir",
      "atualizacao",
      `${excluidos} atualizações excluídas de uma vez${resumoClientes ? ` (${resumoClientes})` : ""}`
    );

    return { excluidos, registros };
  }

  /** Registro mais recente de um cliente especifico (aba Consultar Cliente). */
  lastUpdateForClient(nome) {
    return this.db.atualizacoes.lastUpdateForClient(nome);
  }

  /**
   * As últimas N atualizações de um cliente específico (aba Consultar Cliente,
   * "Histórico recente").
   *
   * `limit=todas` pede o histórico completo -- é o que o relatório do cliente
   * (aba Atualizações, botão "Gerar Relatório") usa, porque ele existe
   * justamente para mostrar tudo o que já foi feito naquele cliente. `-1` é
   * como o SQLite escreve "sem limite" num LIMIT. O teto de 50 continua
   * valendo para qualquer número, que é o caso do "Histórico recente".
   */
  recentUpdatesForClient(nome, limit = 5) {
    const efetivo = String(limit) === "todas" ? -1 : Math.min(Math.max(Number(limit) || 5, 1), 50);
    return this.db.atualizacoes.recentUpdatesForClient(nome, efetivo);
  }

  /** Última versão registrada para cada sistema do histórico operacional. */
  latestVersionBySystem() {
    return this.db.atualizacoes.latestVersionBySystem();
  }

  /**
   * Clientes que usam um sistema especifico, com a data da ultima
   * atualizacao NAQUELE sistema e uma situacao calculada a partir de uma
   * data de corte opcional. Usado pela aba de relatorio por sistema (ex.:
   * "quais clientes de NFCe nao atualizaram desde a mudanca grande de tal
   * data").
   * @param {string} sistema
   * @param {string} [dataCorteStr] dd/mm/aaaa -- sem ela, so mostra a ultima data (sem marcar "Desatualizado")
   */
  relatorioPorSistema(sistema, dataCorteStr) {
    const sistemaLimpo = (sistema || "").trim();
    if (!sistemaLimpo) throw new ValidationError("Informe o sistema.");
    let dataCorte = null;
    if (dataCorteStr) {
      if (!dataValida(dataCorteStr)) {
        throw new ValidationError("Campo 'Data de corte' precisa estar no formato dd/mm/aaaa.");
      }
      dataCorte = parseData(dataCorteStr);
    }

    const ultimas = this.db.atualizacoes.lastDateByClientAndSistema(sistemaLimpo);
    const resultado = [];
    for (const { nome, cidade, sistemas } of this.db.clientes.allBasicComSistemas()) {
      const usaSistema = (sistemas || "")
        .split(",")
        .map((s) => s.trim())
        .includes(sistemaLimpo);
      if (!usaSistema) continue;

      const dataStr = ultimas[nome];
      const d = dataStr ? parseData(dataStr) : null;
      let situacao;
      if (!d) situacao = "Nunca atualizado";
      else if (dataCorte) situacao = d < dataCorte ? "Desatualizado" : "Em dia";
      else situacao = "Atualizado";

      resultado.push({ cliente: nome, cidade: cidade || "—", ultima: dataStr || "Nunca", situacao });
    }
    resultado.sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));
    return resultado;
  }

  _validate(input) {
    const cliente = (input.cliente || "").trim();
    if (!cliente) throw new ValidationError("Campo 'Cliente' é obrigatório.");
    const data = (input.data || "").trim();
    if (!dataValida(data)) throw new ValidationError("Campo 'Data' precisa estar no formato dd/mm/aaaa.");
    const registro = { cliente, data };
    for (const { key } of COLUMNS) {
      if (key !== "cliente" && key !== "data") registro[key] = (input[key] || "").trim();
    }
    return this._normalizar(registro, this._contextoNormalizacao());
  }

  /**
   * O que `normalizarSistemas`/`normalizarResponsavel` precisam para decidir a
   * grafia canônica. Sai numa chamada só porque a importação de planilha
   * normaliza centenas de linhas seguidas, e consultar catálogo e
   * responsáveis por linha seria trabalho repetido à toa.
   */
  _contextoNormalizacao() {
    return {
      catalogo: this.db.sistemas.list(),
      conhecidos: this.db.atualizacoes.distinctResponsaveis(),
    };
  }

  /**
   * Grava "B_NFe", não "B_NFE"; "Camila", não "CAMILA".
   *
   * Este é o lado do problema que olha para a frente -- o histórico que já
   * estava gravado foi acertado de uma vez por scripts/normalizar-historico.js,
   * com as MESMAS funções. Sem isto aqui, aquela faxina seria uma foto: o
   * campo continua livre, e em alguns meses haveria "B_NFE" de novo.
   *
   * Um nome que não casa com nada é mantido como veio, de propósito. Inventar
   * destino para o desconhecido estragaria em silêncio a primeira atualização
   * de um sistema novo, que é justamente quando ninguém está olhando.
   */
  _normalizar(registro, { catalogo, conhecidos }) {
    return {
      ...registro,
      sistema: normalizarSistemas(registro.sistema, catalogo),
      responsavel: normalizarResponsavel(registro.responsavel, conhecidos),
    };
  }

  /**
   * Indicadores da tela de Resumo: totais, atualizacoes do mes, clientes
   * desatualizados (com dias parados) e contagem por responsavel.
   */
  resumo() {
    const hoje = new Date();
    const mesStr = `${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;

    const totalClientes = this.db.clientes.count();
    const totalAtualizacoes = this.db.atualizacoes.count();
    const mesCount = this.db.atualizacoes.countForMonth(mesStr);
    const desatualizados = this._clientesDesatualizados(hoje);
    const porResponsavel = this.db.atualizacoes.countsByResponsavel();
    const atualizadosMesPorSistema = this._atualizadosMesPorSistema(mesStr);
    // Tendencia mensal (grafico do Resumo) e tempo medio de resolucao das
    // tarefas de Agendamentos vivem em tabelas diferentes desta classe,
    // mas moram aqui porque o Resumo ja busca tudo numa chamada so -- mesmo
    // motivo por tras de "atualizadosMesPorSistema" acima.
    const atualizacoesPorMes = this.db.atualizacoes.porMes(12);
    const tempoMedioResolucao = this.db.agendamentos.tempoMedioResolucaoPorResponsavel();

    return {
      totalClientes,
      totalAtualizacoes,
      mesCount,
      desatualizados,
      porResponsavel,
      atualizadosMesPorSistema,
      atualizacoesPorMes,
      tempoMedioResolucao,
      emDia: totalClientes - desatualizados.length,
    };
  }

  /**
   * Quantos clientes (de cada sistema conhecido) foram atualizados NAQUELE
   * sistema este mês -- diferente de contar linhas cru pelo texto de
   * "sistema" (que na prática guarda a lista inteira separada por vírgula,
   * então contar por string dava uma "sopa" de combinações em vez de um
   * total por sistema de verdade). Cruza os sistemas que cada cliente tem
   * cadastrado (clientes.sistemas) com a última atualização daquele
   * cliente NAQUELE sistema (mesma lógica de relatorioPorSistema).
   * @param {string} mesStr formato "mm/aaaa"
   */
  _atualizadosMesPorSistema(mesStr) {
    const clientes = this.db.clientes.allBasicComSistemas();
    const resultado = [];
    for (const sistema of this.db.sistemas.list()) {
      const ultimas = this.db.atualizacoes.lastDateByClientAndSistema(sistema);
      let total = 0;
      for (const { nome, sistemas } of clientes) {
        const usaSistema = (sistemas || "")
          .split(",")
          .map((s) => s.trim())
          .includes(sistema);
        if (!usaSistema) continue;
        const dataStr = ultimas[nome];
        if (dataStr && dataStr.slice(3) === mesStr) total += 1;
      }
      resultado.push({ label: sistema, total });
    }
    resultado.sort((a, b) => b.total - a.total);
    return resultado;
  }

  /** Clientes cuja ultima atualizacao passou de DESATUALIZADO_DIAS (ou nunca aconteceu). */
  _clientesDesatualizados(hoje) {
    const ultimas = this.db.atualizacoes.lastDateByClient();
    const resultado = [];
    for (const { codigo, nome, cidade } of this.db.clientes.allBasic()) {
      const dataStr = ultimas[nome];
      let dias = NUNCA;
      if (dataStr) {
        const d = parseData(dataStr);
        // Formato invalido (erro de digitacao antigo) tratado como "nunca".
        dias = d ? Math.floor((hoje - d) / MS_POR_DIA) : NUNCA;
      }
      if (dias > DESATUALIZADO_DIAS) {
        resultado.push({ nome, cidade: cidade || "—", ultima: dataStr || "Nunca", dias });
      }
    }
    resultado.sort((a, b) => b.dias - a.dias);
    return resultado;
  }

  /**
   * Le uma planilha (.xlsx) e cria um registro de atualizacao para cada
   * linha, com deteccao de cabecalho (nomes de coluna) ou, se nao
   * reconhecer, cai para a ordem fixa de COLUMNS.
   * @param {Buffer} buffer conteudo do arquivo enviado
   * @param {{id:number, nome:string}|null} usuario
   */
  async importXlsx(buffer, usuario) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const ws = workbook.worksheets[0];
    if (!ws || ws.rowCount === 0) {
      return { inserted: 0, naoCadastrados: [] };
    }

    const expected = COLUMNS.map((c) => c.key);
    const header = rowToStrings(ws.getRow(1)).map((h) => h.trim().toLowerCase());
    const colMap = {};
    header.forEach((h, idx) => {
      const match = COLUMNS.find((c) => h === c.key || h === c.label.toLowerCase());
      if (match) colMap[match.key] = idx;
    });
    const usePositional = Object.keys(colMap).length < 2;

    const nomesCadastrados = new Set(this.db.clientes.names());
    const naoCadastrados = new Set();
    // Fora do laço: a planilha pode ter centenas de linhas, e catálogo e
    // responsáveis não mudam no meio da importação.
    const contexto = this._contextoNormalizacao();
    let inserted = 0;

    for (let r = 2; r <= ws.rowCount; r++) {
      const valores = rowToStrings(ws.getRow(r));
      if (valores.every((v) => v === "")) continue;

      const record = {};
      if (usePositional) {
        expected.forEach((key, idx) => {
          record[key] = valores[idx] ?? "";
        });
      } else {
        expected.forEach((key) => {
          const idx = colMap[key];
          record[key] = idx != null ? valores[idx] ?? "" : "";
        });
      }
      if (!record.cliente) continue;

      // A planilha é a origem MAIS suja de todas -- foi dela que vieram as
      // 144 grafias de sistema do histórico antigo. Normalizar aqui também
      // (e não só no cadastro pela tela) é o que impede a próxima importação
      // de desfazer a faxina.
      const registro = this._normalizar(record, contexto);
      if (!nomesCadastrados.has(registro.cliente)) naoCadastrados.add(registro.cliente);
      this.db.atualizacoes.insert(registro);
      this._marcarSuporteBredasSeNecessario(registro, usuario);
      inserted += 1;
    }

    if (inserted > 0) {
      this.historico.registrar(usuario, "criar", "atualizacao", `Importação de planilha: ${inserted} registro(s)`);
    }
    return { inserted, naoCadastrados: [...naoCadastrados].sort() };
  }

  /**
   * Gera o .xlsx de exportacao como um Buffer, pronto para download.
   * Aceita os mesmos filtros da listagem: exportar precisa devolver o que a
   * pessoa esta vendo na tela, nao o historico inteiro.
   */
  async exportXlsxBuffer(search = "", responsavel = "Todos", periodo = {}) {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Atualizações");
    ws.addRow(COLUMNS.map((c) => c.label));
    for (const row of this.db.atualizacoes.exportAll(search, responsavel, periodo)) {
      ws.addRow(COLUMNS.map((c) => row[c.key]));
    }
    return workbook.xlsx.writeBuffer();
  }
}

/** Todas as celulas de uma linha do exceljs como strings (numero/data viram texto; vazio vira ""). */
function rowToStrings(row) {
  const out = [];
  // row.values[0] nao existe (exceljs comeca em 1); percorremos ate row.cellCount.
  for (let i = 1; i <= row.cellCount; i++) {
    const cell = row.getCell(i);
    out[i - 1] = cellToString(cell.value);
  }
  return out;
}

function cellToString(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "object" && value.text) return String(value.text);
  return String(value);
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

module.exports = { AtualizacaoService, NUNCA };
