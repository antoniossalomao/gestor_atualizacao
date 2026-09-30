const ExcelJS = require("exceljs");

const { COLUMNS, SISTEMA_SUPORTE_BREDAS, OBS_SUPORTE_BREDAS } = require("../config/constants");
const { REGRAS } = require("../config/regrasEquipe");
const { dataValida, parseData } = require("./validacao");
const { normalizarSistemas, normalizarResponsavel, splitSystems } = require("../shared/normalizacao");
const { ValidationError, NotFoundError, ConflictError } = require("../shared/errors");
const { situacaoDoSistema, situacaoDoCliente, contaComoAtraso, contaParaVersao, registroQueDecide, SISTEMA_PRINCIPAL } = require("./situacaoVersao");
const { acharSistema } = require("../database/SistemaRepository");
const { LIMITE_LINHAS_IMPORTACAO, LIMITE_LINHAS_EXPORTACAO } = require("../config/limitesPlanilha");
const { contarLinhasXlsx } = require("./contarLinhasXlsx");

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
   * @param {import('./NotificacaoService').NotificacaoService} [notifications]
   */
  /**
   * @param {{valor(nome: string): any}} [regras] ConfiguracaoSistemaService. Opcional
   *   para os testes que não mexem em regra: sem ele, vale o padrão de
   *   config/regrasEquipe.js.
   */
  constructor(db, historico, notifications, regras) {
    this.db = db;
    this.historico = historico;
    this.notifications = notifications;
    this.regras = regras || { valor: (nome) => REGRAS[nome].padrao };
  }

  list(search = "", responsavel = "Todos", paginacao = {}) {
    return this.db.atualizacoes.list(search, responsavel, paginacao);
  }

  distinctResponsaveis() {
    return this.db.atualizacoes.distinctResponsaveis();
  }

  create(input, usuario) {
    const data = this._validate(input);
    const sistemas = this._versoesNovas(data, input);
    this.db.atualizacoes.insert(this._paraTabela(data), sistemas);
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
    const lista = this._resolverSistemas(data);
    let sistemas;
    if (antes?.versoes_por_sistema) {
      // Editar observações ou datas não reaplica versões oficiais novas: cada
      // sistema que continua na atualização guarda a versão que já tinha, e
      // um sistema acrescentado na edição fica sem versão -- só uma
      // atualização nova grava de fato a versão do dia.
      const anteriores = new Map(this.db.atualizacoes.sistemasDe(id).map((s) => [s.id, s.versao]));
      sistemas = lista.map((s) => ({ ...s, versao: anteriores.get(s.id) ?? null }));
      this._resumirVersoes(data, sistemas);
    } else {
      sistemas = this._versoesLegadas(data, lista);
    }
    const revisaoEsperada = Number.isInteger(Number(input.revisao)) ? Number(input.revisao) : null;
    if (this.db.atualizacoes.update(id, this._paraTabela(data), sistemas, revisaoEsperada, usuario?.nome || "") === 0) {
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
    const [suporte] = this.db.sistemas.resolverOuCriar([SISTEMA_SUPORTE_BREDAS]);
    const marcado = this.db.clientes.adicionarSistema(data.cliente, suporte.id);
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

  /**
   * Clientes que usam um sistema especifico, com a data da ultima
   * atualizacao NAQUELE sistema e uma situacao calculada a partir de uma
   * Data opcional filtra a última data de atualização. A classificação de
   * versão continua usando exclusivamente a referência oficial cadastrada.
   * @param {string} sistema
   * @param {string} [atualizacaoAntesDe] dd/mm/aaaa
   * @param {Date} [hoje]
   */
  relatorioPorSistema(sistema, atualizacaoAntesDe, hoje = new Date()) {
    const sistemaLimpo = (sistema || "").trim();
    if (!sistemaLimpo) throw new ValidationError("Informe o sistema.");
    const alvo = this.db.sistemas.resolver(sistemaLimpo);
    if (alvo && (!alvo.ativo || !contaParaVersao(alvo))) return [];
    const oficial = alvo?.ultima_versao || "";
    if (atualizacaoAntesDe && !dataValida(atualizacaoAntesDe)) {
      throw new ValidationError("Campo 'Última atualização antes de' precisa estar no formato dd/mm/aaaa.");
    }
    const limiteAtualizacao = atualizacaoAntesDe ? parseData(atualizacaoAntesDe) : null;
    if (!alvo) return [];

    const ultimas = new Map(this.db.atualizacoes.ultimaPorClienteNoSistema(alvo.id).map((r) => [r.cliente_id, r]));
    const principal = this._principalPorCliente(alvo);
    const resultado = [];
    const prazo = this._prazoVersao(hoje);
    for (const { id, nome, cidade } of this.db.clientes.clientesDoSistema(alvo.id)) {
      const { registro, pelaDataDe } = registroQueDecide(alvo, ultimas.get(id), principal(id));
      if (limiteAtualizacao && (!registro?.data || !parseData(registro.data) || parseData(registro.data) >= limiteAtualizacao)) continue;
      const { situacao } = situacaoDoSistema(registro, oficial, prazo);
      resultado.push({ cliente: nome, cidade: cidade || "—", ultima: registro?.data || "Nunca", oficial: oficial || "Não informada", situacao, pelaDataDe });
    }
    resultado.sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));
    return resultado;
  }

  /** Os sistemas da atualização, resolvidos no catálogo (ver SistemaRepository.resolverOuCriar). */
  /** @param {Array<any>} [catalogo] ver SistemaRepository.resolverOuCriar */
  _resolverSistemas(data, catalogo) {
    const lista = this.db.sistemas.resolverOuCriar(splitSystems(data.sistema), catalogo);
    // O nome que fica é o do catálogo: "Vendas" digitado vira "B_Vendas".
    data.sistema = lista.map((s) => s.nome).join(", ");
    return lista;
  }

  /**
   * Versão de cada sistema de uma atualização NOVA: a oficial cadastrada em
   * Sistemas, desde que já existisse na data da atualização. Grava a
   * atualização como "versões por sistema" (ver migracoes.js).
   */
  _versoesNovas(data, input) {
    const lista = this._resolverSistemas(data);
    // Desfazer uma exclusão devolve exatamente o que saiu, inclusive um
    // registro legado (sem versões por sistema).
    if (input.restaurarVersoes === true) {
      if (input.versoes_sistemas == null) return this._versoesLegadas(data, lista);
      let mapa;
      try { mapa = JSON.parse(input.versoes_sistemas); } catch { throw new ValidationError("Versões inválidas."); }
      if (!mapa || Array.isArray(mapa) || typeof mapa !== "object") throw new ValidationError("Versões inválidas.");
      const sistemas = lista.map((s) => {
        const chave = Object.keys(mapa).find((nome) => nome === s.nome) ?? Object.keys(mapa).find((nome) => this.db.sistemas.resolver(nome)?.id === s.id);
        const valor = chave == null ? null : mapa[chave] ?? null;
        if (valor !== null && (typeof valor !== "string" || valor.length > 100)) throw new ValidationError("Versões inválidas.");
        return { ...s, versao: valor };
      });
      this._resumirVersoes(data, sistemas);
      return sistemas;
    }
    const oficiais = new Map(this.db.sistemas.todos().map((s) => [s.id, contaParaVersao(s) ? s.ultima_versao : ""]));
    const dataAtualizacao = parseData(data.data);
    const sistemas = lista.map((s) => {
      const oficial = oficiais.get(s.id);
      // Não atribuir uma versão publicada depois da data da atualização.
      const disponivel = oficial && dataAtualizacao && parseData(oficial) <= dataAtualizacao;
      return { ...s, versao: disponivel ? oficial : !oficial && lista.length === 1 ? data.versao || null : null };
    });
    this._resumirVersoes(data, sistemas);
    return sistemas;
  }

  /**
   * Registro legado (importado de planilha, ou de antes da versão oficial):
   * o texto de "versao" é a verdade, e só vale por sistema quando o
   * atualização tem um sistema só.
   */
  _versoesLegadas(data, lista) {
    data.versoes_sistemas = null;
    data.versoesPorSistema = false;
    return lista.map((s) => ({ ...s, versao: lista.length === 1 ? data.versao || null : null }));
  }

  /** Monta o texto de "versao" e o `versoes_sistemas` que a API entrega. */
  _resumirVersoes(data, sistemas) {
    data.versoesPorSistema = true;
    data.versoes_sistemas = JSON.stringify(Object.fromEntries(sistemas.map((s) => [s.nome, s.versao])));
    const valores = [...new Set(sistemas.map((s) => s.versao))];
    data.versao = valores.length === 1 ? valores[0] || "" : sistemas.map((s) => `${s.nome}: ${s.versao || "Não informada"}`).join("; ");
  }

  /**
   * O que vai para a tabela `atualizacoes`. O cliente é ligado pelo id
   * quando o nome digitado tem cadastro -- e aí o nome gravado é o do
   * cadastro, com a grafia dele.
   */
  _paraTabela(data) {
    const cliente = this.db.clientes.resolverNome(data.cliente);
    if (cliente) data.cliente = cliente.nome;
    const versoesPorSistema = data.versoesPorSistema;
    // Marcação interna de _resumirVersoes/_versoesLegadas: não faz parte do
    // registro que volta para a tela nem do que vai para o histórico.
    delete data.versoesPorSistema;
    return {
      cliente: data.cliente,
      cliente_id: cliente?.id ?? null,
      versao: data.versao,
      responsavel: data.responsavel,
      data: data.data,
      motivo: data.motivo,
      maquinas: data.maquinas,
      obs: data.obs,
      versoes_por_sistema: versoesPorSistema ? 1 : 0,
    };
  }

  relatorioPeriodo(search = "", responsavel = "Todos", periodo = {}) {
    validarPeriodo(periodo);
    return this._resumoPeriodo(this.db.atualizacoes.exportAll(search, responsavel, periodo), { search, responsavel, periodo });
  }

  /**
   * As contagens do relatório sobre registros JÁ lidos. Separado de
   * relatorioPeriodo para a exportação montar a aba Resumo com a mesma lista
   * da aba de dados: antes ela consultava o histórico inteiro duas vezes, e
   * guardava as duas cópias na memória ao mesmo tempo (medido: P05).
   */
  _resumoPeriodo(registros, { search, responsavel, periodo }) {
    const contar = (extrair) => {
      const mapa = new Map();
      for (const registro of registros) for (const nome of new Set(extrair(registro))) {
        const chave = nome.trim().toLowerCase();
        const item = mapa.get(chave) || { nome: nome.trim(), total: 0 };
        item.total++;
        mapa.set(chave, item);
      }
      return [...mapa.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
    };
    return { filtros: { search, responsavel, ...periodo }, total: registros.length,
      clientes: new Set(registros.map((r) => r.cliente.trim().toLowerCase())).size,
      porSistema: contar((r) => splitSystems(r.sistema).length ? splitSystems(r.sistema) : ["Não informado"]),
      porResponsavel: contar((r) => [r.responsavel || "Não informado"]), registros };
  }

  situacaoCliente(nome, hoje = new Date()) {
    const prazo = this._prazoVersao(hoje);
    const cliente = this.db.clientes.getByNome(nome);
    const ultimas = new Map(this.db.atualizacoes.ultimaPorSistemaDoCliente(nome).map((u) => [u.sistema_id, u]));
    const catalogo = new Map(this.db.sistemas.todos().map((s) => [s.id, s]));
    const ids = new Set([...(cliente ? this.db.clientes.sistemasDoCliente(cliente.id) : []), ...ultimas.keys()]);
    const idPrincipal = this.db.sistemas.resolver(SISTEMA_PRINCIPAL)?.id;
    const principal = { tem: ids.has(idPrincipal), registro: ultimas.get(idPrincipal) };
    return [...ids]
      .map((id) => {
        const sistema = catalogo.get(id);
        const { registro: quemDecide, pelaDataDe } = registroQueDecide(sistema, ultimas.get(id), principal);
        // A versão instalada é sempre a do PRÓPRIO sistema; só a data que
        // decide a situação pode vir do B_Vendas.
        const registro = ultimas.get(id);
        const instalada = registro?.versao || "";
        const contaNaSituacao = contaParaVersao(sistema);
        const oficial = contaNaSituacao ? sistema.ultima_versao || "" : "";
        const { situacao } = contaNaSituacao
          ? situacaoDoSistema(quemDecide, oficial, prazo)
          : { situacao: sistema.controla_versao ? "Sistema inativo" : "Componente fixo" };
        // `contaNaSituacao` falso = sistema fixo (B_Atualizador, Suporte
        // Bredas) ou fora do catálogo: a ficha mostra, mas ele não entra na
        // situação consolidada do cliente (a do Resumo).
        return { sistema: sistema.nome, instalada, oficial, situacao, contaNaSituacao, fixo: !sistema.controla_versao, data: registro?.data || "", pelaDataDe: contaNaSituacao ? pelaDataDe : null };
      })
      .sort((a, b) => (a.sistema < b.sistema ? -1 : a.sistema > b.sistema ? 1 : 0));
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
      // Todos, inclusive os inativos: um nome antigo do histórico precisa
      // cair no sistema que ele sempre foi, não virar uma grafia nova.
      catalogo: this.db.sistemas.todos().map((s) => s.nome),
      conhecidos: this.db.atualizacoes.distinctResponsaveis(),
    };
  }

  /**
   * Grava "B_NFe", não "B_NFE"; "Camila", não "CAMILA".
   *
   * Este é o lado do problema que olha para a frente -- o histórico que já
   * estava gravado foi acertado de uma vez (primeiro por um script de
   * faxina, depois pela migração 1 em database/migracoes.js), com as MESMAS
   * funções. Sem isto aqui, aquela faxina seria uma foto: o campo continua
   * livre, e em alguns meses haveria "B_NFE" de novo.
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
  resumo(hoje = new Date()) {
    const mesStr = `${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
    const hojeStr = `${String(hoje.getDate()).padStart(2, "0")}/${mesStr}`;
    const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const diaComparavel = Math.min(hoje.getDate(), new Date(hoje.getFullYear(), hoje.getMonth(), 0).getDate());
    const ateAtualComparavel = `${String(diaComparavel).padStart(2, "0")}/${mesStr}`;
    const mesAnteriorStr = `${String(mesAnterior.getMonth() + 1).padStart(2, "0")}/${mesAnterior.getFullYear()}`;
    const ateAnterior = `${String(diaComparavel).padStart(2, "0")}/${mesAnteriorStr}`;

    const totalClientes = this.db.clientes.count();
    const totalAtualizacoes = this.db.atualizacoes.count();
    const mesCount = this.db.atualizacoes.countForMonth(mesStr, hojeStr);
    const mesAtualComparavel = this.db.atualizacoes.countForMonth(mesStr, ateAtualComparavel);
    const mesAnteriorComparavel = this.db.atualizacoes.countForMonth(mesAnteriorStr, ateAnterior);
    const desatualizadoDias = this.regras.valor("desatualizadoDias");
    const semAtualizacao = this._clientesSemAtualizacao(hoje, desatualizadoDias);
    const situacaoClientes = this._situacaoDosClientes(hoje);
    const prazoVersaoDias = this.regras.valor("prazoVersaoDias");
    const porResponsavel = this.db.atualizacoes.countsByResponsavel();
    const atualizadosMesPorSistema = this._atualizadosMesPorSistema(mesStr, mesAnteriorStr, diaComparavel);
    // Tendencia mensal (grafico do Resumo) e tempo medio de resolucao das
    // tarefas de Agendamentos vivem em tabelas diferentes desta classe,
    // mas moram aqui porque o Resumo ja busca tudo numa chamada so -- mesmo
    // motivo por tras de "atualizadosMesPorSistema" acima.
    const atualizacoesPorMes = this.db.atualizacoes.porMes(12, hoje);
    const tempoMedioResolucao = this.db.agendamentos.tempoMedioResolucaoPorResponsavel();

    return {
      totalClientes,
      totalAtualizacoes,
      mesCount,
      mesAtualComparavel,
      mesAnteriorComparavel,
      // Tempo sem atualização e situação de versão são perguntas DIFERENTES,
      // e por isso duas chaves. Antes o Resumo chamava de "em dia" o
      // complemento da lista abaixo: cliente atendido ontem com a NFe velha
      // aparecia em dia, e cliente sem visita há 3 meses mas sem nenhuma
      // versão nova para receber aparecia desatualizado.
      semAtualizacao,
      // A tela escreve "Sem atualização há mais de N dias" com este N, e não
      // com um número próprio: é regra da equipe, editável, e o rótulo tem
      // que contar a mesma regra que a lista acima usou.
      desatualizadoDias,
      // O card diz o prazo que usou ("desatualizado depois de N dias da
      // oficial"), pelo mesmo motivo do desatualizadoDias acima.
      prazoVersaoDias,
      situacaoClientes,
      porResponsavel,
      atualizadosMesPorSistema,
      atualizacoesPorMes,
      tempoMedioResolucao,
    };
  }

  /**
   * Situação de versão de cada cliente (ver situacaoVersao.js), agrupada.
   * As listas vão inteiras para a tela: o clique num total abre exatamente
   * os clientes que ele contou, sem uma segunda consulta que pudesse
   * discordar do número.
   *
   * Os sistemas de um cliente são os do cadastro MAIS os que aparecem no
   * histórico dele (mesmo conjunto da ficha), tirando fixos e inativos.
   */
  _situacaoDosClientes(hoje = new Date()) {
    const prazo = this._prazoVersao(hoje);
    const catalogo = new Map(this.db.sistemas.todos().map((s) => [s.id, s]));
    /** @type {Map<number, Map<number, {data: string, versao: string|null}>>} */
    const ultimas = new Map();
    for (const u of this.db.atualizacoes.ultimaPorClienteESistema()) {
      if (!ultimas.has(u.cliente_id)) ultimas.set(u.cliente_id, new Map());
      ultimas.get(u.cliente_id).set(u.sistema_id, u);
    }
    /** @type {Map<number, Set<number>>} */
    const cadastro = new Map();
    for (const { cliente_id: c, sistema_id: s } of this.db.clientes.sistemasDeTodos()) {
      if (!cadastro.has(c)) cadastro.set(c, new Set());
      cadastro.get(c).add(s);
    }

    const idPrincipal = this.db.sistemas.resolver(SISTEMA_PRINCIPAL)?.id;
    const grupos = { desatualizado: [], aguardando: [], em_dia: [], sem_atualizaveis: [] };
    /** Quantos clientes estão atrasados em cada sistema -- os "mais atrasados" do card. */
    const atrasosPorSistema = new Map();
    /** Quantos clientes avaliados usam cada sistema -- o "de quantos" do card. */
    const clientesPorSistema = new Map();
    for (const { id, nome, cidade } of this.db.clientes.allBasic()) {
      const doCliente = ultimas.get(id) || new Map();
      const ids = new Set([...(cadastro.get(id) || []), ...doCliente.keys()]);
      const principal = { tem: ids.has(idPrincipal), registro: doCliente.get(idPrincipal) };
      const sistemas = [];
      for (const sistemaId of ids) {
        const sistema = catalogo.get(sistemaId);
        if (!contaParaVersao(sistema)) continue;
        const { registro } = registroQueDecide(sistema, doCliente.get(sistemaId), principal);
        const { situacao } = situacaoDoSistema(registro, sistema.ultima_versao, prazo);
        sistemas.push({ sistema: sistema.nome, situacao });
        clientesPorSistema.set(sistema.nome, (clientesPorSistema.get(sistema.nome) || 0) + 1);
        if (contaComoAtraso(situacao)) atrasosPorSistema.set(sistema.nome, (atrasosPorSistema.get(sistema.nome) || 0) + 1);
      }
      sistemas.sort((a, b) => a.sistema.localeCompare(b.sistema, "pt-BR"));
      const { grupo, decididoPor } = situacaoDoCliente(sistemas);
      grupos[grupo].push({ nome, cidade: cidade || "—", sistemas, decididoPor });
    }
    for (const lista of Object.values(grupos)) lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    return {
      ...grupos,
      sistemasMaisAtrasados: [...atrasosPorSistema]
        // `clientes` é o denominador: "196 atrasados" sozinho não diz se é
        // quase todo mundo ou uma fração de uma base grande.
        .map(([sistema, total]) => ({ sistema, total, clientes: clientesPorSistema.get(sistema) || total }))
        .sort((a, b) => b.total - a.total || a.sistema.localeCompare(b.sistema, "pt-BR")),
    };
  }

  /**
   * Para a aba Sistemas: `(clienteId) => {tem, registro}` do B_Vendas de cada
   * cliente, lido de uma vez só -- e só quando o sistema pedido depende dele.
   * "Tem" é o mesmo critério da ficha e do Resumo: no cadastro ou no histórico.
   */
  _principalPorCliente(alvo) {
    const nenhum = () => ({ tem: false, registro: null });
    if (!alvo.atualiza_com_principal) return nenhum;
    const principal = this.db.sistemas.resolver(SISTEMA_PRINCIPAL);
    if (!principal) return nenhum;
    const ultimas = new Map(this.db.atualizacoes.ultimaPorClienteNoSistema(principal.id).map((r) => [r.cliente_id, r]));
    const cadastrados = new Set(this.db.clientes.clientesDoSistema(principal.id).map((c) => c.id));
    return (clienteId) => ({ tem: cadastrados.has(clienteId) || ultimas.has(clienteId), registro: ultimas.get(clienteId) });
  }

  /** O prazo depois da versão oficial (ver situacaoVersao.js, decisão 4), lido na hora. */
  _prazoVersao(hoje) {
    return { prazoDias: this.regras.valor("prazoVersaoDias"), hoje };
  }

  /**
   * Quantos clientes (de cada sistema conhecido) foram atualizados NAQUELE
   * sistema este mês -- diferente de contar linhas cru pelo texto de
   * "sistema" (que na prática guarda a lista inteira separada por vírgula,
   * então contar por string dava uma "sopa" de combinações em vez de um
   * total por sistema de verdade). Cruza os sistemas que cada cliente tem
   * cadastrado com as atualizações do mês naquele sistema.
   *
   * Cada sistema vem com o `anterior` (o mesmo número no mês anterior, até
   * o mesmo dia -- o recorte do indicador "este mês") para o gráfico mostrar
   * ▲/▼. Contra o mês anterior inteiro, todo sistema apareceria em queda nos
   * primeiros dias do mês. Sistemas zerados nos dois meses
   * ficam de fora: o gráfico listava o catálogo inteiro, a maioria em zero,
   * e o que importava se perdia entre eles.
   * @param {string} mesStr formato "mm/aaaa"
   * @param {string} mesAnteriorStr formato "mm/aaaa"
   * @param {number} diaComparavel
   * @returns {Array<{label: string, total: number, anterior: number}>}
   */
  _atualizadosMesPorSistema(mesStr, mesAnteriorStr, diaComparavel) {
    const anterior = new Map(this.db.atualizacoes.atualizadosNoMesPorSistema(mesAnteriorStr, diaComparavel).map((r) => [r.label, r.total]));
    return this.db.atualizacoes
      .atualizadosNoMesPorSistema(mesStr)
      .map((r) => ({ label: r.label, total: r.total, anterior: anterior.get(r.label) || 0 }))
      .filter((r) => r.total > 0 || r.anterior > 0)
      .sort((a, b) => b.total - a.total || b.anterior - a.anterior || a.label.localeCompare(b.label, "pt-BR"));
  }

  /**
   * Clientes cuja última atualização passou de `limiteDias` (ou nunca
   * aconteceu). Não diz nada sobre versão -- ver _situacaoDosClientes.
   */
  _clientesSemAtualizacao(hoje, limiteDias) {
    const ultimas = this.db.atualizacoes.ultimaDataPorCliente();
    const resultado = [];
    for (const { id, nome, cidade } of this.db.clientes.allBasic()) {
      const dataStr = ultimas.get(id);
      let dias = NUNCA;
      if (dataStr) {
        const d = parseData(dataStr);
        // Formato invalido (erro de digitacao antigo) tratado como "nunca".
        dias = d ? Math.floor((hoje - d) / MS_POR_DIA) : NUNCA;
      }
      if (dias > limiteDias) {
        resultado.push({ nome, cidade: cidade || "—", ultima: dataStr || "Nunca", dias });
      }
    }
    resultado.sort((a, b) => b.dias - a.dias);
    return resultado;
  }

  /**
   * Prévia da importação: lê a planilha e diz o que aconteceria, SEM gravar
   * nada -- nem sistema novo no catálogo (por isso a checagem usa
   * `acharSistema`, e não `resolverOuCriar`). É o passo que a tela mostra
   * antes do "Importar", para ninguém descobrir depois de aplicado que metade
   * das datas estava em outro formato.
   * @param {Buffer} buffer
   */
  async previaImportacao(buffer) {
    return this._resumoLeitura(await this._lerPlanilha(buffer));
  }

  /**
   * Importa a planilha: cria uma atualização por linha VÁLIDA.
   *
   * Como era: toda linha com cliente entrava, inclusive com data fora do
   * formato (que quebra ordenação e situação em silêncio), e cada linha era
   * gravada por conta própria -- uma falha no meio deixava metade do arquivo
   * dentro, sem aviso de onde parou.
   *
   * Como é:
   *  - linha com erro (cliente em branco, data inválida) fica de fora e volta
   *    na resposta com o número da linha e o tipo do erro;
   *  - possível duplicidade (mesmo cliente, data e sistemas de uma
   *    atualização já registrada, ou repetida na própria planilha) fica de
   *    fora quando `pularDuplicadas` -- o padrão da tela, porque o caso comum
   *    é importar o mesmo arquivo duas vezes;
   *  - tudo numa transação só: ou o lote inteiro entra, ou nada entra.
   *
   * Continua valendo: planilha é histórico, grava como registro legado, sem
   * atribuir a versão oficial de hoje a uma atualização de meses atrás
   * (`_versoesLegadas`).
   * @param {Buffer} buffer conteudo do arquivo enviado
   * @param {{id:number, nome:string}|null} usuario
   * @param {{pularDuplicadas?: boolean}} [opcoes]
   */
  async importXlsx(buffer, usuario, { pularDuplicadas = false } = {}) {
    const leitura = await this._lerPlanilha(buffer);
    const aplicar = leitura.linhas.filter((l) => !l.erro && !(pularDuplicadas && l.duplicada));
    const naoCadastrados = new Set();
    // Lido uma vez para o lote todo, e não uma por linha (medido: P05).
    const catalogo = this.db.sistemas.todos();
    this.db.transacao(() => {
      for (const { registro } of aplicar) {
        const sistemas = this._versoesLegadas(registro, this._resolverSistemas(registro, catalogo));
        const linha = this._paraTabela(registro);
        if (linha.cliente_id == null) naoCadastrados.add(registro.cliente);
        this.db.atualizacoes.insert(linha, sistemas);
        this._marcarSuporteBredasSeNecessario(registro, usuario);
      }
    });
    const resumo = this._resumoLeitura(leitura);
    const inserted = aplicar.length;
    const ignoradas = leitura.linhas.length - inserted;
    // Só quando algo entrou: a entrada é "criar atualização", e registrar
    // "0 importados" encheria a Auditoria de criações que não aconteceram.
    if (inserted > 0) {
      this.historico.registrar(
        usuario,
        "criar",
        "atualizacao",
        `Importação de planilha: ${inserted} registro(s) importado(s)${ignoradas ? `, ${ignoradas} ignorado(s)` : ""}`,
        { importados: inserted, comErro: resumo.comErro, duplicadasIgnoradas: pularDuplicadas ? resumo.duplicadas : 0 }
      );
    }
    return { ...resumo, inserted, ignoradas, naoCadastrados: [...naoCadastrados].sort() };
  }

  /**
   * Lê e classifica cada linha, sem gravar. Erro de ARQUIVO (não abre, sem
   * linhas, sem a coluna Cliente) é ValidationError: não há o que prever.
   * Erro de LINHA (cliente em branco, data) e aviso (cliente sem cadastro,
   * sistema fora do catálogo, duplicidade) ficam em cada linha.
   * @param {Buffer} buffer
   */
  async _lerPlanilha(buffer) {
    const brutas = await lerLinhasDaPlanilha(buffer, LIMITE_LINHAS_IMPORTACAO);
    if (brutas.length === 0) throw new ValidationError("A planilha está vazia: a primeira aba precisa ter ao menos uma linha.");

    const expected = COLUMNS.map((c) => c.key);
    const cabecalho = (brutas[0].numero === 1 ? brutas[0].valores : []).map((h) => h.trim());
    const colMap = {};
    const colunasIgnoradas = [];
    cabecalho.forEach((h, idx) => {
      const match = COLUMNS.find((c) => h.toLowerCase() === c.key || h.toLowerCase() === c.label.toLowerCase());
      if (match) colMap[match.key] = idx;
      else if (h) colunasIgnoradas.push(h);
    });
    // Menos de duas colunas reconhecidas: a planilha não tem o nosso
    // cabeçalho, e vale a ordem fixa de COLUMNS (como sempre foi).
    const semCabecalho = Object.keys(colMap).length < 2;
    if (!semCabecalho && colMap.cliente == null) {
      throw new ValidationError('A coluna "Cliente" não foi encontrada no cabeçalho. Ela é obrigatória.');
    }
    // Sem cabeçalho, a linha 1 já é DADO: começa nela, e o que havia nela não
    // é "coluna ignorada". (Começar sempre na 2 descartava o primeiro
    // atualização em silêncio -- e uma planilha de uma linha só dava "vazia".)
    const primeira = semCabecalho ? 1 : 2;
    if (semCabecalho) colunasIgnoradas.length = 0;

    // Fora do laço: a planilha pode ter centenas de linhas, e catálogo,
    // responsáveis e o que já está gravado não mudam no meio da leitura.
    const contexto = this._contextoNormalizacao();
    const catalogo = this.db.sistemas.todos();
    const existentes = new Set(this.db.atualizacoes.linhasParaDuplicidade().map((l) => chaveDuplicidade(l.cliente, l.data, l.sistema, catalogo)));
    const vistas = new Set();
    const linhas = [];
    for (const { numero: r, valores } of brutas) {
      if (r < primeira) continue;
      const record = {};
      expected.forEach((key, idx) => {
        const pos = semCabecalho ? idx : colMap[key];
        record[key] = pos != null ? String(valores[pos] ?? "").trim() : "";
      });
      const linha = { linha: r, cliente: record.cliente, data: record.data, sistema: record.sistema, erro: null, avisos: [], duplicada: false, registro: null };
      linhas.push(linha);
      if (!record.cliente) {
        linha.erro = { tipo: "cliente", mensagem: "Cliente em branco." };
        continue;
      }
      if (!dataValida(record.data)) {
        linha.erro = { tipo: "data", mensagem: `Data "${record.data}" fora do formato dd/mm/aaaa.` };
        continue;
      }
      // A planilha é a origem MAIS suja de todas -- foi dela que vieram as
      // 144 grafias de sistema do histórico antigo. Normalizar aqui também
      // (e não só no cadastro pela tela) é o que impede a próxima importação
      // de desfazer a faxina.
      const registro = this._normalizar(record, contexto);
      linha.registro = registro;
      linha.sistema = registro.sistema;
      if (!this.db.clientes.resolverNome(registro.cliente)) {
        linha.avisos.push({ tipo: "cliente", mensagem: "Cliente sem cadastro: entra no histórico, mas só aparece no Resumo e na ficha quando houver cliente com o mesmo nome." });
      }
      const foraDoCatalogo = splitSystems(registro.sistema).filter((nome) => !acharSistema(catalogo, nome));
      if (foraDoCatalogo.length) {
        linha.avisos.push({ tipo: "sistema", mensagem: `Sistema fora do catálogo (${foraDoCatalogo.join(", ")}): entra como inativo.` });
      }
      const chave = chaveDuplicidade(registro.cliente, registro.data, registro.sistema, catalogo);
      if (existentes.has(chave) || vistas.has(chave)) {
        linha.duplicada = true;
        linha.avisos.push({ tipo: "duplicidade", mensagem: existentes.has(chave) ? "Já existe atualização com o mesmo cliente, data e sistemas." : "Repetida nesta planilha." });
      }
      vistas.add(chave);
    }
    if (linhas.length === 0) throw new ValidationError(semCabecalho ? "A planilha está vazia." : "A planilha não tem nenhuma linha preenchida abaixo do cabeçalho.");
    return { linhas, colunasIgnoradas, semCabecalho };
  }

  /** O que a tela mostra: contagens e as linhas com erro ou aviso (não as limpas). */
  _resumoLeitura({ linhas, colunasIgnoradas, semCabecalho }) {
    const comErro = linhas.filter((l) => l.erro).length;
    const semCadastro = new Set(linhas.filter((l) => l.avisos.some((a) => a.tipo === "cliente")).map((l) => l.registro.cliente));
    return {
      total: linhas.length,
      validas: linhas.length - comErro,
      comErro,
      duplicadas: linhas.filter((l) => !l.erro && l.duplicada).length,
      clientesSemCadastro: semCadastro.size,
      colunasIgnoradas,
      semCabecalho,
      // Só as linhas que pedem atenção, e no máximo 200 -- uma planilha de
      // mil linhas toda errada não precisa virar uma resposta de mil itens.
      ocorrencias: linhas
        .filter((l) => l.erro || l.avisos.length)
        .slice(0, 200)
        .map(({ linha, cliente, data, sistema, erro, avisos }) => ({ linha, cliente, data, sistema, erro, avisos })),
    };
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
    validarPeriodo(periodo);
    // Conta ANTES de ler: acima do limite, recusa sem montar nada na memória
    // (ver config/limitesPlanilha.js).
    const total = this.db.atualizacoes.contarFiltrados(search, responsavel, periodo);
    if (total > LIMITE_LINHAS_EXPORTACAO) {
      throw new ValidationError(
        `A exportação teria ${total.toLocaleString("pt-BR")} linhas; o limite é ${LIMITE_LINHAS_EXPORTACAO.toLocaleString("pt-BR")}. ` +
          "Filtre por período (botão Filtros) e exporte em partes."
      );
    }
    const registros = this.db.atualizacoes.exportAll(search, responsavel, periodo);
    for (const row of registros) {
      ws.addRow(COLUMNS.map((c) => row[c.key]));
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: COLUMNS.length } };
    ws.columns.forEach((col, i) => { col.width = [32, 30, 40, 24, 16, 30, 14, 60][i] || 24; });
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24476B" } };
    ws.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });
    const resumo = this._resumoPeriodo(registros, { search, responsavel, periodo });
    const meta = workbook.addWorksheet("Resumo");
    meta.addRows([["Relatório de atualizações"], ["De", periodo.desde || "Sem limite"], ["Até", periodo.ate || "Sem limite"], ["Busca", search || "Todas"], ["Responsável", responsavel], ["Atualizações", resumo.total], ["Clientes distintos", resumo.clientes], [], ["Sistema", "Atualizações"], ...resumo.porSistema.map((r) => [r.nome, r.total]), [], ["Responsável", "Atualizações"], ...resumo.porResponsavel.map((r) => [r.nome, r.total])]);
    meta.columns = [{ width: 38 }, { width: 35 }];
    meta.getRow(1).font = { bold: true, size: 16 };
    return workbook.xlsx.writeBuffer();
  }
}

/** Período do relatório e da exportação: datas válidas, e a inicial antes da final. */
function validarPeriodo(periodo) {
  for (const data of [periodo.desde, periodo.ate]) {
    if (data && !dataValida(data)) throw new ValidationError("Período inválido.");
  }
  if (periodo.desde && periodo.ate && parseData(periodo.desde) > parseData(periodo.ate)) throw new ValidationError("A data inicial deve ser anterior à final.");
}

/**
 * Chave da "possível duplicidade" de importação: cliente (sem caixa nem
 * espaços nas pontas), data e os sistemas RESOLVIDOS no catálogo, sem caixa e
 * em ordem alfabética. Usada dos dois lados -- o que já está gravado e o que
 * vem da planilha --, e é por isso que mora num lugar só.
 *
 * Resolver no catálogo é o que faz "Vendas" na planilha casar com o "B_Vendas"
 * gravado (a normalização da planilha mantém o nome como veio; quem casa sem
 * o prefixo B_ é `acharSistema`). E ordenar é o que faz "B_NFe, B_Vendas"
 * casar com "B_Vendas, B_NFe". Sem as duas coisas, reimportar o mesmo arquivo
 * com "pular duplicidades" duplicava o histórico mesmo assim.
 * @param {Array<{nome: string}>} catalogo `sistemas.todos()`
 */
function chaveDuplicidade(cliente, data, sistema, catalogo) {
  const sistemas = splitSystems(sistema)
    .map((nome) => (acharSistema(catalogo, nome)?.nome || nome).toLowerCase())
    .sort()
    .join(",");
  return `${String(cliente || "").trim().toLowerCase()}|${data || ""}|${sistemas}`;
}

/**
 * As linhas preenchidas da PRIMEIRA aba, como texto (número e data viram
 * texto; célula vazia vira ""), recusando planilha acima do limite.
 *
 * Duas barreiras, porque o `workbook.xlsx.load` do ExcelJS monta a planilha
 * INTEIRA na memória antes de dar para contar uma linha sequer:
 *  1. antes do load, a contagem barata de <row> no zip (contarLinhasXlsx),
 *     com folga de 2x -- é o teto de MEMÓRIA: um arquivo errado de 50 mil
 *     linhas é recusado sem custar 1,75 GB (medido, P05);
 *  2. depois do load, o limite exato, de linhas PREENCHIDAS.
 * Nos dois casos nada é gravado: a leitura vem antes da transação.
 *
 * Linhas totalmente vazias ficam de fora; `numero` é o da planilha, que é o
 * que a tela mostra ao apontar uma linha com erro.
 *
 * @param {Buffer} buffer
 * @param {number} limite linhas de dados aceitas (o cabeçalho não conta)
 * @returns {Promise<Array<{numero: number, valores: string[]}>>}
 */
async function lerLinhasDaPlanilha(buffer, limite) {
  const grande = () =>
    new ValidationError(
      `A planilha tem mais de ${limite.toLocaleString("pt-BR")} linhas, o limite por importação. ` +
        "Divida o arquivo em partes menores e importe uma de cada vez. Nada foi gravado."
    );
  const aproximado = contarLinhasXlsx(buffer);
  if (aproximado !== null && aproximado > (limite + 1) * 2) throw grande();

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ValidationError("Não foi possível abrir o arquivo. Envie uma planilha Excel (.xlsx) sem senha.");
  }
  const ws = workbook.worksheets[0];
  if (!ws) return [];
  const linhas = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const valores = [];
    // row.values[0] não existe (o ExcelJS começa em 1).
    for (let i = 1; i <= row.cellCount; i++) valores[i - 1] = cellToString(row.getCell(i).value);
    if (valores.every((v) => v === "")) continue;
    linhas.push({ numero: r, valores });
    // +1: o cabeçalho, quando houver, também é uma linha lida aqui.
    if (linhas.length > limite + 1) throw grande();
  }
  return linhas;
}

function cellToString(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "object") {
    // Texto com formatação (parte em negrito, cor): antes virava
    // "[object Object]" -- e era gravado assim, em silêncio.
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text ?? "").join("");
    if (value.text != null) return String(value.text); // hiperlink
    // Fórmula: vale o resultado calculado que o Excel guardou no arquivo.
    if ("result" in value) return cellToString(value.result);
  }
  return String(value);
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

module.exports = { AtualizacaoService, NUNCA };
