const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");

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
   * Remove do painel um agente e todos os retornos associados ao seu CNPJ.
   * Ele reaparece normalmente caso volte a enviar um retorno depois disso.
   */
  removerAgente(cnpj, usuario) {
    const identificador = String(cnpj || "").trim();
    if (!identificador) throw new ValidationError("Informe o identificador do agente.");

    const somenteDigitos = identificador.replace(/\D/g, "");
    const cnpjNumerico = somenteDigitos.length === 14 && /^[\d.\-/\s]+$/.test(identificador);
    const agente = this.db.versoes.agentes().find((item) => {
      const atual = String(item.cnpj || "").trim();
      return cnpjNumerico ? atual.replace(/\D/g, "") === somenteDigitos : atual === identificador;
    });
    if (!agente) throw new ValidationError("Agente não encontrado.");

    const retornosExcluidos = this.db.versoes.removerAgente(identificador);
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
      return {
        ...a,
        online,
        horasSemContato,
        // "Está na versão que publicamos?" é a pergunta central do painel e
        // não dava para responder antes: a tela mostrava o status do agente,
        // mas não contra o que ele deveria estar rodando.
        versaoAlvo: alvo,
        atualizado: alvo != null && a.ultimaVersao === alvo,
        situacao: derivarSituacao({
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
  create(input, usuario, file, baseUrl) {
    if (file) {
      input = {
        ...input,
        tamanhoBytes: file.size,
        pacotes: [
          {
            file: file.filename,
            url: `${baseUrl}/api/update/packages/${encodeURIComponent(file.filename)}`,
            sha256: sha256(file.path),
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
   * Publica uma versão e aposenta automaticamente a anterior do mesmo sistema.
   *
   * Devolve `{ versao, substituidas }` para a tela poder dizer exatamente o
   * que saiu do ar -- publicar é a ação de maior consequência do sistema
   * inteiro (ela muda o que centenas de máquinas vão baixar hoje à noite), e
   * uma confirmação genérica de "publicado com sucesso" esconde isso.
   */
  publish(id, usuario) {
    const atual = this.db.versoes.find(id);
    if (!atual) throw new ValidationError("Versão não encontrada.");
    if (atual.status === "publicada") throw new ValidationError("Esta versão já está publicada.");
    if (!atual.sistema) throw new ValidationError("Esta versão não tem sistema definido e não pode ser publicada.");

    const agora = new Date().toISOString();
    const anteriores = this.db.versoes.publicadasDoSistemaExceto(atual.sistema, id);
    const item = this.db.versoes.publish(id, agora);
    this.db.versoes.substituir(anteriores.map((v) => v.id), agora, id);

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
   * Remove uma versão e o arquivo do pacote -- inclusive a que está no ar
   * (a pedido: antes isso era bloqueado, mas o único jeito de tirar uma
   * versão publicada de vez era publicar outra por cima, o que nem sempre é
   * o que se quer). Excluir a publicada deixa o sistema sem versão-alvo até
   * a próxima publicação (`check()` simplesmente responde "sem atualização"
   * nesse meio-tempo) -- não quebra nada, só destrava o histórico.
   */
  remove(id, usuario) {
    const atual = this.db.versoes.find(id);
    if (!atual) throw new ValidationError("Versão não encontrada.");
    const eraPublicada = atual.status === "publicada";

    for (const pacote of JSON.parse(atual.pacotesJson || "[]")) {
      const caminho = this._caminhoPacote(pacote.file);
      // Falhar ao apagar o arquivo (permissão, arquivo já sumiu) não pode
      // impedir a remoção do registro -- o registro é a fonte da verdade.
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
    return path.join(path.dirname(this.db.path), "packages", safeName);
  }

  _publicItem(item) {
    return { ...item, pacotes: JSON.parse(item.pacotesJson || "[]") };
  }
}

/**
 * Traduz o estado bruto de um agente na situação que o painel mostra.
 * A ordem importa: "offline" ganha de tudo (não dá para afirmar nada sobre
 * uma máquina que sumiu), erro ganha de desatualizado, e um PENDENTE (Fase 2)
 * ganha uma situação própria em vez de cair no "desatualizado" genérico --
 * antes disso, um sistema esperando autorização há dias parecia só mais um
 * "desatualizado" qualquer, indistinguível de um agente que nunca nem baixou
 * a atualização.
 */
function derivarSituacao({ online, status, ultimaVersao, alvo, horasSemContato, detalhes }) {
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

/** Calcula o digest do pacote que será usado pelo agente para conferir integridade. */
function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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
