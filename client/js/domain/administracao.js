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
  if (totalCopias === 0) {
    pendencias.push({ texto: "Nenhuma cópia de segurança ainda.", tom: "alerta", aba: "backups" });
  } else {
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
  const linhas = [
    `Diagnóstico do Gestor de Atualizações — ${formatarDataHora(conferidoEm.toISOString())}`,
    "",
    `Situação: ${situacao.titulo}`,
    ...situacao.pendencias.map((p) => `  - ${p.texto}`),
    "",
    `Servidor: v${dados?.servidor?.versao ?? "?"} · Node ${dados?.servidor?.node ?? "?"} · ${dados?.servidor?.plataforma ?? "?"}`,
    `No ar há: ${formatarTempoAtivo(dados?.servidor?.uptimeSegundos)}`,
    `Memória: ${dados?.servidor?.memoriaHeapUsadaMB ?? "?"} MB de ${dados?.servidor?.memoriaHeapTotalMB ?? "?"} MB`,
    `Banco: ${dados?.banco?.caminho ?? "?"} · ${formatarBytes(dados?.banco?.tamanhoBytes)} · integridade ${dados?.banco?.integridade ?? "?"} · ${String(dados?.banco?.journalMode ?? "?").toUpperCase()}`,
    `Backups: ${dados?.backups?.total ?? 0} · último ${dados?.backups?.ultimo ? formatarDataHora(dados.backups.ultimo) : "nenhum"}`,
    atualizadorHabilitado
      ? `Agentes: ${agentes.total ?? 0} (${agentes.ok ?? 0} em dia · ${agentes.offline ?? 0} sem contato · ${agentes.erro ?? 0} com erro)`
      : "Atualizador: desligado",
    `Pacotes em disco: ${dados?.pacotes?.total ? `${dados.pacotes.total} (${formatarBytes(dados.pacotes.tamanhoBytes)})` : "nenhum"}`,
  ];
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
