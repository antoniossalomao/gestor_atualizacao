import { formatarBytes, formatarDataHora } from "../utils/data.js";

/**
 * Regras da tela Administração que não dependem do DOM.
 */

/**
 * O que mudou entre as regras salvas e o que está no formulário -- só as
 * regras listadas em `nomes`, normalizadas para o tipo da definição (o
 * `<input type="number">` devolve texto).
 *
 * Serve a duas coisas: o botão "Salvar" só acende quando isto não está vazio
 * (salvar sem mudar nada gerava um evento vazio no Histórico), e o pedido ao
 * servidor leva só o que mudou -- as outras regras do mesmo formulário não
 * são regravadas por cima de uma alteração que outro admin tenha acabado de
 * fazer em outra aba.
 *
 * @param {Record<string, unknown>} salvas valores atuais, vindos do servidor
 * @param {Record<string, unknown>} formulario valores como estão na tela
 * @param {Record<string, {tipo: string}>} definicoes
 * @param {string[]} nomes regras que este formulário edita
 * @returns {Record<string, unknown>}
 */
export function alteracoesRegras(salvas, formulario, definicoes, nomes) {
  /** @type {Record<string, unknown>} */
  const mudou = {};
  for (const nome of nomes) {
    const tipo = definicoes[nome]?.tipo;
    let valor = formulario[nome];
    if (tipo === "inteiro") {
      const texto = String(valor ?? "").trim();
      // Número inválido vai como está, para o SERVIDOR recusar com a mensagem
      // da regra ("entre 1 e 365") -- converter para NaN aqui perderia isso.
      valor = texto !== "" && Number.isFinite(Number(texto)) ? Number(texto) : texto;
    } else if (tipo === "url") {
      valor = String(valor ?? "").trim();
    }
    if (valor !== salvas[nome]) mudou[nome] = valor;
  }
  return mudou;
}

/**
 * A situação da chave dos agentes (AGENT_API_TOKEN), dita em português. A
 * chave nunca chega ao navegador -- só se ela existe e como termina.
 * @param {{situacao: "ausente"|"exemplo"|"configurada", final?: string}|null|undefined} chave
 * @returns {{texto: string, tom: "ok"|"alerta"|"perigo"}}
 */
export function descreverChaveAgentes(chave) {
  if (chave?.situacao === "configurada") return { texto: `Configurada, terminando em …${chave.final}`, tom: "ok" };
  if (chave?.situacao === "exemplo") {
    return { texto: "Ainda é o valor de exemplo do .env.example, que é público. Troque antes de ligar agentes.", tom: "perigo" };
  }
  return { texto: "Não configurada. Sem ela, nenhum agente consegue falar com o servidor.", tom: "alerta" };
}

/**
 * "3d 4h 12m" a partir de segundos. Zero ou inválido vira "0m": o servidor
 * acabou de subir, e "0s" dava a impressão de relógio parado.
 * @param {number} segundos
 */
export function formatarTempoAtivo(segundos) {
  if (!Number.isFinite(segundos) || segundos < 60) return "menos de 1m";
  const dias = Math.floor(segundos / 86400);
  const horas = Math.floor((segundos % 86400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const partes = [];
  if (dias > 0) partes.push(`${dias}d`);
  if (horas > 0 || dias > 0) partes.push(`${horas}h`);
  partes.push(`${minutos}m`);
  return partes.join(" ");
}

/**
 * Papel normalizado: contas antigas ainda podem vir com "user", que é o
 * operador de hoje (ver exigirPapel no servidor).
 * @param {string|undefined} role
 * @returns {"admin"|"operador"|"consulta"}
 */
export function papelNormalizado(role) {
  if (role === "admin" || role === "consulta") return role;
  return "operador";
}

/** Cópia mais velha que isto já pede atenção: o servidor faz uma a cada início. */
export const DIAS_BACKUP_ANTIGO = 7;

/**
 * O resumo do Diagnóstico: o que precisa de atenção, do mais grave ao menos.
 *
 * Antes a frase do topo vinha só de `statusGeral` do servidor (banco íntegro
 * e nenhum agente com erro), e dizia "Tudo em ordem" logo acima de um bloco
 * "Nenhuma cópia" amarelo e com a chave dos agentes ainda no valor de
 * exemplo. Frase e blocos se contradiziam; agora a frase é o pior bloco.
 *
 * @param {any} dados resposta de /api/saude
 * @param {{atualizadorHabilitado: boolean, chaveAgentes?: {situacao: string}|null, agora?: number}} opcoes
 * @returns {{tom: "ok"|"alerta"|"perigo", titulo: string, pendencias: Array<{texto: string, tom: "alerta"|"perigo", aba: string}>}}
 */
export function situacaoDiagnostico(dados, { atualizadorHabilitado, chaveAgentes = null, agora = Date.now() }) {
  /** @type {Array<{texto: string, tom: "alerta"|"perigo", aba: string}>} */
  const pendencias = [];
  if (dados?.banco?.integridade !== "ok") {
    pendencias.push({ texto: "O banco de dados falhou na verificação de integridade.", tom: "perigo", aba: "backups" });
  }
  const totalCopias = dados?.backups?.total ?? 0;
  const corrompidos = dados?.backups?.corrompidos ?? 0;
  if (totalCopias === 0) {
    pendencias.push({ texto: "Nenhuma cópia de segurança ainda.", tom: "alerta", aba: "backups" });
  } else {
    if (corrompidos > 0) {
      pendencias.push({
        texto:
          corrompidos === 1
            ? "1 cópia de segurança falhou na verificação de integridade."
            : `${corrompidos} cópias de segurança falharam na verificação de integridade.`,
        tom: "alerta",
        aba: "backups",
      });
    }
    const ultima = Date.parse(dados?.backups?.ultimo ?? "");
    const dias = Number.isFinite(ultima) ? Math.floor((agora - ultima) / 86400000) : null;
    if (dias !== null && dias >= DIAS_BACKUP_ANTIGO) {
      pendencias.push({ texto: `A cópia de segurança mais recente é de ${dias} dias atrás.`, tom: "alerta", aba: "backups" });
    }
  }
  if (atualizadorHabilitado) {
    const comErro = dados?.agentes?.erro ?? 0;
    if (comErro > 0) {
      pendencias.push({ texto: comErro === 1 ? "1 agente com erro." : `${comErro} agentes com erro.`, tom: "alerta", aba: "integracoes" });
    }
    if (chaveAgentes?.situacao === "exemplo") {
      pendencias.push({ texto: "A chave dos agentes ainda é o valor de exemplo, que é público.", tom: "perigo", aba: "integracoes" });
    } else if (chaveAgentes?.situacao === "ausente") {
      pendencias.push({ texto: "A chave dos agentes não está configurada.", tom: "alerta", aba: "integracoes" });
    }
  }
  pendencias.sort((a, b) => (a.tom === b.tom ? 0 : a.tom === "perigo" ? -1 : 1));
  if (pendencias.length === 0) return { tom: "ok", titulo: "Tudo em ordem.", pendencias };
  return {
    tom: pendencias[0].tom,
    titulo: pendencias.length === 1 ? "1 ponto precisa de atenção." : `${pendencias.length} pontos precisam de atenção.`,
    pendencias,
  };
}

/**
 * Quantas contas há de cada papel -- o resumo em cima da tabela de pessoas.
 * @param {Array<{role?: string}>} usuarios
 * @returns {{admin: number, operador: number, consulta: number}}
 */
export function contarPapeis(usuarios) {
  const contagem = { admin: 0, operador: 0, consulta: 0 };
  for (const u of usuarios || []) contagem[papelNormalizado(u.role)] += 1;
  return contagem;
}

/**
 * Quantas pendências cada aba da Administração tem -- o numerozinho ao lado
 * do nome da aba. Avisos que só apareciam ao abrir o Diagnóstico (chave dos
 * agentes de exemplo, nenhuma cópia) ficavam semanas sem ninguém ver.
 * @param {Array<{aba: string}>} pendencias
 * @returns {Record<string, number>}
 */
export function pendenciasPorAba(pendencias) {
  /** @type {Record<string, number>} */
  const porAba = {};
  for (const p of pendencias) porAba[p.aba] = (porAba[p.aba] || 0) + 1;
  return porAba;
}

/**
 * Sistemas atualizáveis e ativos sem versão oficial cadastrada: ficam como
 * "Sem versão oficial" em todo cliente e não contam contra ninguém -- quem
 * esqueceu de cadastrar a versão não percebe que o sistema saiu da conta.
 * @param {Array<{nome: string, ativo?: number|boolean, controlaVersao?: number|boolean, ultimaVersao?: string|null}>} catalogo
 */
export function sistemasSemReferencia(catalogo) {
  return (catalogo || []).filter((s) => s.ativo && s.controlaVersao && !s.ultimaVersao).map((s) => s.nome);
}

/**
 * Resume o modo de acesso HTTP/HTTPS retornado por /api/saude.
 * @param {{https?: boolean, proxy?: boolean, soLocal?: boolean}|null|undefined} transporte
 * @returns {{texto: string, selo: [string, string]}}
 */
export function descreverTransporte(transporte) {
  if (transporte?.https) return { texto: "HTTPS via proxy", selo: ["HTTPS", "success"] };
  if (transporte?.soLocal) return { texto: "HTTP local (127.0.0.1)", selo: ["Local", "muted"] };
  return { texto: "HTTP sem proxy", selo: ["HTTP", "warning"] };
}

/**
 * Lista objetiva das verificações feitas pelo Diagnóstico -- mostra ao
 * administrador o que realmente foi conferido quando o topo diz "Tudo em ordem.".
 * @param {any} dados resposta de /api/saude
 * @param {{atualizadorHabilitado: boolean, chaveAgentes?: {situacao: string}|null, agora?: number}} opcoes
 * @returns {Array<{chave: string, rotulo: string, detalhe: string, tom: "ok"|"alerta"|"perigo"|"neutro"}>}
 */
export function verificacoesDiagnostico(dados, { atualizadorHabilitado, chaveAgentes = null, agora = Date.now() }) {
  /** @type {Array<{chave: string, rotulo: string, detalhe: string, tom: "ok"|"alerta"|"perigo"|"neutro"}>} */
  const itens = [];

  const bancoOk = dados?.banco?.integridade === "ok";
  const ms = dados?.banco?.verificacaoMs;
  itens.push({
    chave: "integridade",
    rotulo: "Integridade SQLite",
    detalhe: bancoOk ? (Number.isFinite(ms) ? `OK · ${ms} ms` : "OK") : "Falha detectada",
    tom: bancoOk ? "ok" : "perigo",
  });

  const journal = String(dados?.banco?.journalMode || "").toLowerCase();
  itens.push({
    chave: "journal",
    rotulo: journal === "wal" ? "Gravação WAL" : "Modo de gravação",
    detalhe: journal === "wal" ? "Ativo" : journal ? journal.toUpperCase() : "Desconhecido",
    tom: journal === "wal" ? "ok" : "alerta",
  });

  const totalBackups = dados?.backups?.total ?? 0;
  const corrompidos = dados?.backups?.corrompidos ?? 0;
  const retencao = dados?.backups?.retencao;
  const ultimoIntegro = dados?.backups?.ultimoIntegro;
  const ultimaMs = Date.parse(dados?.backups?.ultimo ?? "");
  const diasBackup = Number.isFinite(ultimaMs) ? Math.floor((agora - ultimaMs) / 86400000) : null;
  if (totalBackups === 0) {
    itens.push({ chave: "backups", rotulo: "Backups", detalhe: "Nenhuma cópia", tom: "alerta" });
  } else if (corrompidos > 0) {
    itens.push({
      chave: "backups",
      rotulo: "Backups",
      detalhe: corrompidos === 1 ? "1 corrompida" : `${corrompidos} corrompidas`,
      tom: "alerta",
    });
  } else if (diasBackup !== null && diasBackup >= DIAS_BACKUP_ANTIGO) {
    itens.push({ chave: "backups", rotulo: "Backups", detalhe: `Última há ${diasBackup} dias`, tom: "alerta" });
  } else {
    const contagem = retencao
      ? `${totalBackups} de ${retencao}`
      : `${totalBackups} ${totalBackups === 1 ? "cópia" : "cópias"}`;
    itens.push({
      chave: "backups",
      rotulo: "Backups",
      detalhe: ultimoIntegro === true ? `${contagem} · íntegra` : contagem,
      tom: "ok",
    });
  }

  if (dados?.servidor?.transporte) {
    const t = dados.servidor.transporte;
    itens.push({
      chave: "transporte",
      rotulo: "Conexão",
      detalhe: descreverTransporte(t).texto,
      tom: t.https ? "ok" : t.soLocal ? "neutro" : "alerta",
    });
  }

  if (atualizadorHabilitado) {
    const erro = dados?.agentes?.erro ?? 0;
    const offline = dados?.agentes?.offline ?? 0;
    const ok = dados?.agentes?.ok ?? 0;
    if (chaveAgentes?.situacao === "exemplo") {
      itens.push({ chave: "agentes", rotulo: "Agentes", detalhe: "Chave de exemplo", tom: "perigo" });
    } else if (chaveAgentes?.situacao === "ausente") {
      itens.push({ chave: "agentes", rotulo: "Agentes", detalhe: "Chave ausente", tom: "alerta" });
    } else if (erro > 0) {
      itens.push({ chave: "agentes", rotulo: "Agentes", detalhe: erro === 1 ? "1 com erro" : `${erro} com erro`, tom: "alerta" });
    } else if (offline > 0) {
      itens.push({ chave: "agentes", rotulo: "Agentes", detalhe: `${offline} sem contato`, tom: "alerta" });
    } else {
      itens.push({ chave: "agentes", rotulo: "Agentes", detalhe: `${ok} em dia`, tom: "ok" });
    }
  }

  return itens;
}

/**
 * O Diagnóstico em texto puro, para colar numa conversa com o suporte. Antes
 * a ajuda pedia "anote a tela, o que você fez e a hora", e o administrador
 * copiava número por número dos blocos -- ou mandava um print que não dava
 * para pesquisar.
 *
 * Só o que ajuda a diagnosticar e nada que dê acesso: o nome do arquivo do
 * banco, e não o caminho; a situação da chave dos agentes, e não ela.
 * @param {any} dados resposta de /api/saude
 * @param {ReturnType<typeof situacaoDiagnostico>} situacao
 * @param {{atualizadorHabilitado: boolean, conferidoEm: Date, navegador?: string}} opcoes
 */
export function textoDiagnostico(dados, situacao, { atualizadorHabilitado, conferidoEm, navegador = "" }) {
  const agentes = dados?.agentes || {};
  const srv = dados?.servidor || {};
  const memoria = srv.memoriaRssMB != null
    ? `${srv.memoriaRssMB} MB no processo (heap ${srv.memoriaHeapUsadaMB ?? "?"} MB de ${srv.memoriaHeapTotalMB ?? "?"} MB)`
    : `${srv.memoriaHeapUsadaMB ?? "?"} MB de ${srv.memoriaHeapTotalMB ?? "?"} MB`;
  const esquema = dados?.banco?.versaoEsquema != null ? ` · esquema v${dados.banco.versaoEsquema}` : "";
  const totalCopias = dados?.backups?.total ?? 0;
  const retencaoTexto = dados?.backups?.retencao ? ` · retenção ${dados.backups.retencao}` : "";
  const tamanhoBackups = dados?.backups?.tamanhoTotalBytes ? ` · ${formatarBytes(dados.backups.tamanhoTotalBytes)}` : "";

  const linhas = [
    `Diagnóstico do Gestor de Atualizações — ${formatarDataHora(conferidoEm.toISOString())}`,
    "",
    `Situação: ${situacao.titulo}`,
    ...situacao.pendencias.map((p) => `  - ${p.texto}`),
    "",
    `Servidor: v${srv.versao ?? "?"} · Node ${srv.node ?? "?"} · ${srv.plataforma ?? "?"}`,
    `No ar há: ${formatarTempoAtivo(srv.uptimeSegundos)}`,
    `Memória: ${memoria}`,
  ];
  if (srv.transporte) linhas.push(`Acesso: ${descreverTransporte(srv.transporte).texto}`);
  if (srv.sessoesAtivas != null) linhas.push(`Sessões abertas: ${srv.sessoesAtivas}`);
  linhas.push(
    `Banco: ${dados?.banco?.caminho ?? "?"} · ${formatarBytes(dados?.banco?.tamanhoBytes)} · integridade ${dados?.banco?.integridade ?? "?"} · ${String(dados?.banco?.journalMode ?? "?").toUpperCase()}${esquema}`
  );
  if (dados?.banco?.registros) {
    const r = dados.banco.registros;
    linhas.push(
      `Base: ${r.clientes ?? 0} clientes · ${r.atualizacoes ?? 0} atualizações · ${r.agendamentosAtivos ?? 0} agendamentos ativos · ${r.campanhasAtivas ?? 0} campanhas ativas · ${r.usuarios ?? 0} contas`
    );
  }
  linhas.push(
    `Backups: ${totalCopias} · último ${dados?.backups?.ultimo ? formatarDataHora(dados.backups.ultimo) : "nenhum"}${retencaoTexto}${tamanhoBackups}`,
    atualizadorHabilitado
      ? `Agentes: ${agentes.total ?? 0} (${agentes.ok ?? 0} em dia · ${agentes.offline ?? 0} sem contato · ${agentes.erro ?? 0} com erro)`
      : "Atualizador: desligado",
    `Pacotes em disco: ${dados?.pacotes?.total ? `${dados.pacotes.total} (${formatarBytes(dados.pacotes.tamanhoBytes)})` : "nenhum"}`
  );
  if (dados?.integracoes?.discordConfigurado !== null && dados?.integracoes?.discordConfigurado !== undefined) {
    linhas.push(`Discord: ${dados.integracoes.discordConfigurado ? "configurado" : "não configurado"}`);
  }
  if (navegador) linhas.push(`Navegador: ${navegador}`);
  return linhas.join("\n");
}

/**
 * O que mudou na classificação dos sistemas, para o "Salvar" único da lista.
 * Antes havia um Salvar por linha: quem reclassificava cinco sistemas
 * clicava cinco vezes, e uma linha alterada e esquecida não avisava ninguém.
 *
 * Só vai o que mudou de verdade -- voltar um sistema para como estava não o
 * manda ao servidor (cada envio vira uma linha na Auditoria). "Atualiza junto
 * com o B_Vendas" só existe para atualizável: num sistema que vira Fixo, a
 * caixa não é enviada.
 * @param {Array<{id: number, controlaVersao: number|boolean, atualizaComPrincipal?: number|boolean}>} sistemas como estão salvos
 * @param {Record<string, {controlaVersao: boolean, atualizaComPrincipal?: boolean}>} escolhas como estão na tela, por id
 * @returns {Array<{id: number, controlaVersao: boolean, atualizaComPrincipal?: boolean}>}
 */
export function alteracoesClassificacao(sistemas, escolhas) {
  const mudancas = [];
  for (const s of sistemas) {
    const e = escolhas[String(s.id)];
    if (!e) continue;
    const mudouTipo = e.controlaVersao !== Boolean(s.controlaVersao);
    const temCaixa = e.controlaVersao && e.atualizaComPrincipal !== undefined;
    const mudouCaixa = temCaixa && e.atualizaComPrincipal !== Boolean(s.atualizaComPrincipal);
    if (!mudouTipo && !mudouCaixa) continue;
    mudancas.push({ id: s.id, controlaVersao: e.controlaVersao, ...(temCaixa ? { atualizaComPrincipal: e.atualizaComPrincipal } : {}) });
  }
  return mudancas;
}
