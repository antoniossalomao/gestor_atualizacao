const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ValidationError, ForbiddenError } = require("../shared/errors");

/** Status que o agente pode reportar, agrupados pelo que significam no painel. */
const STATUS_SUCESSO = ["OK", "SUCESSO", "ATUALIZADO", "CONCLUIDO"];
const STATUS_FALHA = ["ERRO", "FALHA"];
/** Sem notícia por mais que isso, o agente é considerado offline. */
const HORAS_ATE_OFFLINE = 26;
/** Sistema em PENDENTE (esperando autorização da Fase 2) por mais que isso vira alerta. */
const HORAS_ATE_PENDENTE_DEMORADO = 24;

/**
 * Regras de negócio da distribuição de versões.
 *
 * O serviço valida entradas, calcula hashes, controla o ciclo rascunho /
 * publicada / substituída e monta o contrato consumido pelo Worker C#.
 * Nenhum controller ou view deve duplicar essas regras.
 *
 * Três mudanças estruturais em relação à primeira versão:
 *
 * **1. Toda versão pertence a um sistema.** Antes não havia esse campo, e
 * `check()` devolvia "a última publicada" sem olhar sistema nenhum -- o
 * agente do B_NFE podia baixar e instalar o pacote do B_VENDAS. Agora cada
 * sistema tem sua própria linha do tempo.
 *
 * **2. Publicar substitui a anterior do mesmo sistema.** Só existe uma versão
 * no ar por sistema, sempre. A anterior vira `substituida` (e não some do
 * banco): o efeito prático é o pedido -- ela sai de circulação na hora e o
 * agente nunca mais a recebe -- mas o histórico de "o que já rodou nos
 * clientes" continua existindo, que é o que se consulta quando algo quebra
 * em produção.
 *
 * **3. Dá para excluir de verdade** (`remove`), com o arquivo do pacote junto,
 * para limpar rascunhos errados e versões velhas que já não interessam.
 */
class VersaoService {
  constructor(db, historico) {
    this.db = db;
    this.historico = historico;
  }

  /**
   * Pasta onde os pacotes de versao ficam gravados, ao lado do gestao.db.
   *
   * Existe como propriedade publica porque o SaudeService precisa dela para
   * contar os pacotes e somar o tamanho em disco -- e ja tentava le-la como
   * `this.versoes.packagesDir`, que NAO EXISTIA. `fs.existsSync(undefined)`
   * devolve false em vez de lancar, entao o painel de Saude reportava
   * "0 pacotes, 0 bytes" para sempre, sem erro nenhum no log. Encontrado por
   * verificacao estatica de tipos, nao por alguem olhando a tela: o numero
   * zero e' plausivel demais para chamar atencao.
   */
  get packagesDir() {
    return path.join(path.dirname(this.db.path), "packages");
  }

  /** Lista versões para o painel, convertendo o JSON persistido em array. */
  list() {
    return this.db.versoes.list().map((item) => this._publicItem(item));
  }

  /** O que está no ar agora, uma linha por sistema. */
  ativas() {
    return this.db.versoes.publicadasPorSistema().map((item) => this._publicItem(item));
  }

  /** Devolve os retornos dos agentes, com filtros opcionais. */
  logs(filtros = {}) {
    return this.db.versoes.logs({
      limit: Math.min(Number(filtros.limit) || 50, 300),
      sistema: filtros.sistema || undefined,
      status: filtros.status || undefined,
      cnpj: filtros.cnpj || undefined,
      desde: filtros.desde || undefined,
    });
  }

  /**
   * Resolve um agente do painel a partir de um identificador informado pelo
   * usuário (CNPJ com ou sem pontuação, ou um código legado sem dígitos).
   * Compartilhado por toda ação que age sobre "o agente com este CNPJ" --
   * remover, pausar, retomar -- para as três nunca divergirem em como
   * casam o identificador contra `agentes()`.
   */
  _encontrarAgente(cnpj) {
    const identificador = String(cnpj || "").trim();
    if (!identificador) throw new ValidationError("Informe o identificador do agente.");

    const somenteDigitos = identificador.replace(/\D/g, "");
    const cnpjNumerico = somenteDigitos.length === 14 && /^[\d.\-/\s]+$/.test(identificador);
    const agente = this.db.versoes.agentes().find((item) => {
      const atual = String(item.cnpj || "").trim();
      return cnpjNumerico ? atual.replace(/\D/g, "") === somenteDigitos : atual === identificador;
    });
    if (!agente) throw new ValidationError("Agente não encontrado.");
    return agente;
  }

  /**
   * Remove do painel um agente e todos os retornos associados ao seu CNPJ.
   * Ele reaparece normalmente caso volte a enviar um retorno depois disso.
   */
  removerAgente(cnpj, usuario) {
    const agente = this._encontrarAgente(cnpj);

    const retornosExcluidos = this.db.versoes.removerAgente(agente.cnpj);
    if (retornosExcluidos === 0) {
      throw new ValidationError("Nenhum retorno do agente foi excluído. Atualize a tela e tente novamente.");
    }
    this.historico.registrar(
      usuario,
      "excluir",
      "agente",
      `Agente ${agente.empresa || agente.cnpj} (${agente.cnpj}) excluído com ${retornosExcluidos} retorno(s)`
    );
    return { ok: true, retornosExcluidos };
  }

  /**
   * Pausa remotamente um agente: o Worker C# desse cliente para de verificar
   * e aplicar atualizações a partir do próximo ciclo (poll de 10s no caminho
   * saudável -- ver GET /update/status/:cnpj e o "check-safety-net" em
   * check() abaixo, para agentes que ainda não têm o pre-check dedicado). O
   * agente continua rodando e comunicando normalmente; só a Fase 1
   * (checar/baixar) e a Fase 3/4 (aplicar) ficam suspensas. Reversível a
   * qualquer momento por retomarAgente().
   */
  pausarAgente(cnpj, usuario, motivo) {
    const agente = this._encontrarAgente(cnpj);
    this.db.versoes.pausarAgente(agente.cnpj, usuario?.id, motivo ? String(motivo).trim() : null);
    this.historico.registrar(
      usuario,
      "pausar",
      "agente",
      `Agente ${agente.empresa || agente.cnpj} (${agente.cnpj}) pausado${motivo ? `: ${motivo}` : ""}`
    );
    return { ok: true };
  }

  /** Retoma um agente pausado -- ele volta a verificar atualizações no próximo ciclo. */
  retomarAgente(cnpj, usuario) {
    const agente = this._encontrarAgente(cnpj);
    this.db.versoes.retomarAgente(agente.cnpj);
    this.historico.registrar(usuario, "retomar", "agente", `Agente ${agente.empresa || agente.cnpj} (${agente.cnpj}) retomado`);
    return { ok: true };
  }

  /** Consultado pelo Worker C# (GET /update/status/:cnpj) a cada ciclo saudável. */
  statusAgente(cnpj) {
    return { pausado: this.db.versoes.pausado(String(cnpj || "").trim()) };
  }

  /**
   * Panorama completo do atualizador automático: o que está publicado, como
   * está cada agente, e os indicadores do período.
   *
   * É uma chamada só de propósito. O painel precisa das quatro coisas ao
   * mesmo tempo e elas têm que ser coerentes entre si -- buscar em quatro
   * requisições separadas abre espaço para a tela mostrar um total que não
   * bate com a lista logo abaixo dele.
   */
  painel() {
    const agora = Date.now();
    const desde24h = new Date(agora - 24 * 3600 * 1000).toISOString();
    const limiteOffline = agora - HORAS_ATE_OFFLINE * 3600 * 1000;

    const ativas = this.ativas();
    const versaoPorSistema = new Map(ativas.map((v) => [v.sistema, v.versao]));

    const agentes = this.db.versoes.agentes().map((a) => {
      const ultima = a.ultimaComunicacao ? new Date(a.ultimaComunicacao).getTime() : 0;
      const online = ultima >= limiteOffline;
      const alvo = versaoPorSistema.get(a.ultimoSistema) || null;
      const status = String(a.ultimoStatus || "").toUpperCase();
      const horasSemContato = ultima ? Math.floor((agora - ultima) / 3600000) : null;
      const pausado = Boolean(a.pausadoEm);
      return {
        ...a,
        online,
        pausado,
        horasSemContato,
        // "Está na versão que publicamos?" é a pergunta central do painel e
        // não dava para responder antes: a tela mostrava o status do agente,
        // mas não contra o que ele deveria estar rodando.
        versaoAlvo: alvo,
        atualizado: alvo != null && a.ultimaVersao === alvo,
        situacao: derivarSituacao({
          pausado,
          online,
          status,
          ultimaVersao: a.ultimaVersao,
          alvo,
          horasSemContato,
          detalhes: a.ultimoDetalhe,
        }),
        taxaSucesso: a.total > 0 ? Math.round((a.sucessos / a.total) * 100) : null,
      };
    });

    const comErro = agentes.filter((a) => a.situacao === "erro").length;
    const comPendencias = agentes.filter((a) => a.situacao === "pendencias").length;
    const desatualizados = agentes.filter((a) => a.situacao === "desatualizado").length;
    const offline = agentes.filter((a) => !a.online).length;
    const pausados = agentes.filter((a) => a.pausado).length;
    const aguardandoAutorizacao = agentes.filter(
      (a) => a.situacao === "aguardando_autorizacao" || a.situacao === "aguardando_autorizacao_demorada"
    ).length;
    const porStatus24h = this.db.versoes.contagemPorStatus(desde24h);

    return {
      geradoEm: new Date().toISOString(),
      ativas,
      agentes,
      indicadores: {
        totalAgentes: agentes.length,
        emDia: agentes.filter((a) => a.situacao === "ok").length,
        desatualizados,
        comErro,
        comPendencias,
        offline,
        pausados,
        aguardandoAutorizacao,
        execucoes24h: porStatus24h.reduce((s, l) => s + l.total, 0),
        falhas24h: porStatus24h.filter((l) => STATUS_FALHA.includes(l.status)).reduce((s, l) => s + l.total, 0),
        porStatus24h,
      },
    };
  }

  /** Resolve um pacote sem permitir que o nome escape da pasta de uploads. */
  download(filename) {
    const filePath = this._caminhoPacote(filename);
    if (!filePath || !fs.existsSync(filePath)) throw new ValidationError("Pacote não encontrado.");
    return filePath;
  }

  /** Cria um rascunho e transforma o upload em um pacote do contrato da API. */
  async create(input, usuario, file, baseUrl) {
    try {
      if (file) {
        const hash = await sha256Stream(file.path);
        input = {
          ...input,
          tamanhoBytes: file.size,
          pacotes: [
            {
              file: file.filename,
              url: `${baseUrl}/api/update/packages/${encodeURIComponent(file.filename)}`,
              sha256: hash,
              bytes: file.size,
            },
          ],
        };
      }
      const data = this._validate(input);
      const item = this.db.versoes.insert({
        ...data,
        criadoEm: new Date().toISOString(),
        criadoPor: usuario?.id || null,
      });
      this.historico.registrar(usuario, "criar", "versao", `Versão ${item.versao} de ${item.sistema} criada`);
      return this._publicItem(item);
    } catch (err) {
      // Limpeza de arquivo órfão quando qualquer falha ocorre antes da persistência
      if (file?.path) {
        try {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch {
          /* ignora erro de limpeza */
        }
      }
      throw err;
    }
  }

  /** Atualiza apenas rascunhos; versões publicadas são imutáveis. */
  update(id, input, usuario) {
    const atual = this.db.versoes.find(id);
    if (!atual) throw new ValidationError("Versão não encontrada.");
    if (atual.status === "publicada") throw new ValidationError("Uma versão publicada não pode ser alterada.");
    const item = this.db.versoes.update(id, this._validate({ ...atual, ...input }));
    this.historico.registrar(usuario, "atualizar", "versao", `Versão ${item.versao} de ${item.sistema} atualizada`);
    return this._publicItem(item);
  }

  /**
   * Publica uma versão e aposenta automaticamente a anterior do mesmo sistema
   * em uma ÚNICA transação atômica no banco de dados.
   * Restrito ao perfil de Administrador.
   */
  publish(id, usuario) {
    if (usuario && usuario.role !== "admin") {
      throw new ForbiddenError("Apenas administradores podem publicar versões.");
    }
    const atual = this.db.versoes.find(id);
    if (!atual) throw new ValidationError("Versão não encontrada.");
    if (atual.status === "publicada") throw new ValidationError("Esta versão já está publicada.");
    if (!atual.sistema) throw new ValidationError("Esta versão não tem sistema definido e não pode ser publicada.");

    // Validação preventiva: os arquivos do pacote precisam existir no disco
    const pacotes = JSON.parse(atual.pacotesJson || "[]");
    if (!pacotes || pacotes.length === 0) {
      throw new ValidationError("Esta versão não possui pacote associado e não pode ser publicada.");
    }
    for (const pct of pacotes) {
      const caminho = this._caminhoPacote(pct.file);
      if (!caminho || !fs.existsSync(caminho)) {
        throw new ValidationError(`O arquivo do pacote '${pct.file}' não foi encontrado no disco do servidor.`);
      }
    }

    const agora = new Date().toISOString();
    const anteriores = this.db.versoes.publicadasDoSistemaExceto(atual.sistema, id);
    const item = this.db.versoes.publicarESubstituir(
      id,
      agora,
      anteriores.map((v) => v.id),
      id
    );

    this.historico.registrar(usuario, "publicar", "versao", `Versão ${item.versao} de ${item.sistema} publicada`);
    for (const antiga of anteriores) {
      this.historico.registrar(
        usuario,
        "atualizar",
        "versao",
        `Versão ${antiga.versao} de ${antiga.sistema} substituída pela ${item.versao}`
      );
    }
    return { versao: this._publicItem(item), substituidas: anteriores.map((v) => this._publicItem(v)) };
  }

  /**
   * Remove uma versão e o arquivo do pacote.
   * Restrito ao perfil de Administrador.
   */
  remove(id, usuario) {
    if (usuario && usuario.role !== "admin") {
      throw new ForbiddenError("Apenas administradores podem excluir versões.");
    }
    const atual = this.db.versoes.find(id);
    if (!atual) throw new ValidationError("Versão não encontrada.");
    const eraPublicada = atual.status === "publicada";

    for (const pacote of JSON.parse(atual.pacotesJson || "[]")) {
      const caminho = this._caminhoPacote(pacote.file);
      try {
        if (caminho && fs.existsSync(caminho)) fs.unlinkSync(caminho);
      } catch {
        /* segue */
      }
    }

    this.db.versoes.remove(id);
    this.historico.registrar(
      usuario,
      "excluir",
      "versao",
      `Versão ${atual.versao} de ${atual.sistema} excluída${eraPublicada ? " (estava publicada -- sistema fica sem versão-alvo)" : ""}`
    );
    return { ok: true, eraPublicada };
  }

  /**
   * Responde ao polling do agente, agora POR SISTEMA.
   *
   * `sistema` é obrigatório: sem ele, a única resposta possível seria "a
   * última versão de qualquer coisa", que é exatamente o comportamento
   * perigoso que existia antes.
   */
  check(cnpj, versaoAtual, sistema) {
    const alvo = String(sistema || "").trim();
    if (!alvo) throw new ValidationError("Informe o sistema no parâmetro 'sistema'.");

    // Rede de seguranca: o Worker C# atual consulta GET /update/status/:cnpj
    // ANTES disto e nem chega a chamar check() se estiver pausado, mas um
    // agente ainda rodando uma versão anterior (sem esse pre-check) não pode
    // continuar recebendo pacotes só porque não sabe perguntar sobre pausa.
    const identificador = String(cnpj || "").trim();
    if (identificador && this.db.versoes.pausado(identificador)) {
      return { update_available: false, sistema: alvo, pausado: true };
    }

    const latest = this.db.versoes.latestPublished(alvo);
    if (!latest || compareVersions(latest.versao, versaoAtual || "0.0.0") <= 0) {
      return { update_available: false, sistema: alvo };
    }
    return {
      update_available: true,
      sistema: alvo,
      version: latest.versao,
      packages: JSON.parse(latest.pacotesJson),
      script_url: latest.scriptUrl || "",
      notes: latest.observacoes || "",
    };
  }

  /** Persiste o resultado de uma execução no cliente. */
  log(input) {
    const cnpj = String(input.cnpj || "").trim();
    const status = String(input.status || "").trim().toUpperCase();
    if (!cnpj || !status) throw new ValidationError("CNPJ e status são obrigatórios.");
    this.db.versoes.addLog({
      cnpj,
      hwid: String(input.hwid || "").trim(),
      maquina: String(input.maquina || input.machine || "").trim(),
      sistema: String(input.sistema || input.system || "").trim(),
      versao: String(input.versao || input.version || "").trim(),
      versaoAnterior: String(input.versaoAnterior || input.previous_version || "").trim(),
      duracaoMs: Number(input.duracaoMs || input.duration_ms) || null,
      fase: String(input.fase || input.phase || "").trim(),
      status,
      detalhes: String(input.detalhes || input.details || "").trim(),
      criadoEm: new Date().toISOString(),
    });
    return { ok: true };
  }

  /** Normaliza e valida dados vindos do formulário ou de uma chamada interna. */
  _validate(input = {}) {
    const sistema = String(input.sistema || input.system || "").trim();
    if (!sistema) throw new ValidationError("Escolha a qual sistema esta versão pertence.");

    const versao = String(input.versao || input.version || "").trim();
    if (!/^\d+(\.\d+){1,3}([-.][0-9A-Za-z.-]+)?$/.test(versao)) {
      throw new ValidationError("Informe uma versão válida, como 2026.08.10.");
    }

    let pacotes;
    try {
      pacotes = typeof input.pacotes === "string" ? JSON.parse(input.pacotes) : input.pacotes || [];
    } catch {
      throw new ValidationError("Pacotes precisam estar em JSON válido.");
    }
    if (!Array.isArray(pacotes) || pacotes.length === 0) throw new ValidationError("Cadastre pelo menos um pacote.");
    for (const pacote of pacotes) {
      if (!pacote.file || !pacote.url || !pacote.sha256) {
        throw new ValidationError("Cada pacote precisa de arquivo, URL e SHA-256.");
      }
    }

    return {
      sistema,
      versao,
      scriptUrl: String(input.scriptUrl || input.script_url || "").trim(),
      pacotesJson: JSON.stringify(pacotes),
      observacoes: String(input.observacoes || "").trim(),
      tamanhoBytes: Number(input.tamanhoBytes) || null,
    };
  }

  /** Caminho absoluto de um pacote, barrando nome que tente sair da pasta. */
  _caminhoPacote(filename) {
    const safeName = path.basename(String(filename || ""));
    if (!safeName || safeName === "." || safeName === "..") return null;
    return path.join(this.packagesDir, safeName);
  }

  _publicItem(item) {
    return { ...item, pacotes: JSON.parse(item.pacotesJson || "[]") };
  }
}

/**
 * Traduz o estado bruto de um agente na situação que o painel mostra.
 * A ordem importa: "pausado" ganha de tudo -- foi um humano quem decidiu
 * parar aquele agente, então isso é mais relevante do que "offline" ou
 * "desatualizado", mesmo que a última comunicação já date de antes da pausa
 * (um Worker pausado não reporta mais nada, então cedo ou tarde ele também
 * cruzaria HORAS_ATE_OFFLINE por conta própria). Depois de "pausado",
 * "offline" ganha de tudo o mais (não dá para afirmar nada sobre uma máquina
 * que sumiu), erro ganha de desatualizado, e um PENDENTE (Fase 2) ganha uma
 * situação própria em vez de cair no "desatualizado" genérico -- antes
 * disso, um sistema esperando autorização há dias parecia só mais um
 * "desatualizado" qualquer, indistinguível de um agente que nunca nem baixou
 * a atualização.
 */
function derivarSituacao({ pausado, online, status, ultimaVersao, alvo, horasSemContato, detalhes }) {
  if (pausado) return "pausado";
  if (!online) return "offline";
  if (STATUS_FALHA.includes(status)) return "erro";
  // O agente pode concluir a troca dos executáveis e reportar SUCESSO mesmo
  // tendo pulado scripts que falharam. Isso não é "Em dia": exige revisão.
  if (/\b\d+\s+script\(s\)\s+pulado\(s\)\s+por erro/i.test(String(detalhes || ""))) return "pendencias";
  if (status === "PENDENTE") {
    return horasSemContato != null && horasSemContato >= HORAS_ATE_PENDENTE_DEMORADO
      ? "aguardando_autorizacao_demorada"
      : "aguardando_autorizacao";
  }
  if (alvo && ultimaVersao !== alvo) return "desatualizado";
  if (STATUS_SUCESSO.includes(status)) return "ok";
  return "pendente";
}

/** Calcula o digest do pacote via stream assíncrono para não travar o Event Loop do Node.js. */
function sha256Stream(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", (err) => reject(err));
    hash.on("error", (err) => reject(err));
    hash.on("finish", () => resolve(hash.digest("hex")));
    stream.pipe(hash);
  });
}

/** Compara versões numéricas sem depender da ordem lexicográfica das strings. */
function compareVersions(left, right) {
  const a = String(left).split(/[.-]/).map((part) => Number(part) || 0);
  const b = String(right || "0.0.0").split(/[.-]/).map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}

module.exports = { VersaoService, HORAS_ATE_OFFLINE, HORAS_ATE_PENDENTE_DEMORADO };
