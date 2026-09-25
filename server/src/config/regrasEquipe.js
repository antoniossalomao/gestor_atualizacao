const { ValidationError } = require("../shared/errors");

/**
 * As regras que valem para a EQUIPE INTEIRA (não para uma conta): quantos
 * dias sem atualização contam como "desatualizado", quando uma tarefa
 * concluída é arquivada, o webhook do Discord, e assim por diante.
 *
 * Moram no banco (tabela `configuracoes_sistema`), editadas pela tela
 * Administração, e valem na hora. Antes, cada uma estava num lugar:
 *  - algumas no `.env`, que a tela reescrevia (ConfiguracaoApiService,
 *    removido), e só passavam a valer depois de reiniciar o servidor;
 *  - outras fixas no código (`DESATUALIZADO_DIAS`, `BACKUP_KEEP`), sem jeito
 *    de ajustar;
 *  - o dia de arquivar tarefa tinha três padrões diferentes: 30 no código, 7
 *    no .env.example e o valor do .env de cada instalação.
 * O `.env` ficou só com infraestrutura e segredos (porta, caminho do banco,
 * SESSION_SECRET, AGENT_API_TOKEN, proxy).
 *
 * Esta tabela é a ÚNICA definição de cada regra: tipo, faixa válida, valor
 * padrão. Quem lê (ConfiguracaoSistemaService, e o Database, para os backups)
 * e quem valida partem daqui -- a faixa nunca é repetida em outro lugar.
 *
 * Campos de cada regra:
 *  - `chave`: nome da linha no banco. `atualizador_habilitado` já existia
 *    com esse nome, antes desta tabela.
 *  - `env`: a variável do `.env` de onde o valor é importado UMA vez, na
 *    primeira subida depois desta mudança (ver
 *    ConfiguracaoSistemaService.importarValoresIniciais). Depois disso o
 *    `.env` deixa de ser lido para essa regra.
 *  - `publica`: pode ir para qualquer conta logada (a tela precisa dela para
 *    explicar o que mostra). As outras só vão para administrador.
 *  - `sensivel`: o valor é um segredo em si (a URL do webhook do Discord dá
 *    a qualquer um que a tenha o poder de postar no canal). Nunca vai para o
 *    Histórico: lá fica só "alterado".
 */
const REGRAS = {
  atualizadorHabilitado: {
    chave: "atualizador_habilitado",
    tipo: "booleano",
    padrao: true,
    publica: true,
    rotulo: "Atualizador habilitado",
  },
  desatualizadoDias: {
    chave: "desatualizado_dias",
    tipo: "inteiro",
    min: 7,
    max: 730,
    padrao: 60,
    publica: true,
    // A chave continua "desatualizado_dias" (já gravada nas instalações),
    // mas desde o card "Atualização dos Clientes" a regra mede só tempo sem
    // atualização -- versão atrasada é outra conta (services/situacaoVersao.js).
    rotulo: "Dias sem atualização até o cliente entrar na lista do Resumo",
  },
  agendamentoArquivarDias: {
    chave: "agendamento_arquivar_dias",
    tipo: "inteiro",
    min: 1,
    max: 365,
    padrao: 30,
    publica: true,
    env: "AGENDAMENTO_ARQUIVAR_DIAS",
    rotulo: "Dias até uma tarefa concluída ser arquivada",
  },
  backupsManter: {
    chave: "backups_manter",
    tipo: "inteiro",
    min: 3,
    max: 100,
    padrao: 10,
    rotulo: "Cópias automáticas do banco guardadas",
  },
  alertaAgentesIntervaloMinutos: {
    chave: "alerta_agentes_intervalo_minutos",
    tipo: "inteiro",
    min: 1,
    max: 1440,
    padrao: 15,
    env: "ALERTA_AGENTES_INTERVALO_MINUTOS",
    rotulo: "Intervalo da checagem de agentes (minutos)",
  },
  discordWebhookUrl: {
    chave: "discord_webhook_url",
    tipo: "url",
    protocolos: ["https:"],
    // Só o Discord: o servidor faz POST nesta URL (avisos e o botão de
    // teste), e aceitar qualquer https deixaria a tela disparar requisições
    // do servidor para onde quem a preenche quiser.
    hosts: ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"],
    padrao: "",
    sensivel: true,
    env: "DISCORD_WEBHOOK_URL",
    rotulo: "Webhook do Discord",
  },
  publicUrl: {
    chave: "public_url",
    tipo: "url",
    protocolos: ["http:", "https:"],
    padrao: "",
    env: "PUBLIC_URL",
    rotulo: "URL pública do servidor",
  },
};

/**
 * Valida e normaliza um valor vindo da tela (ou do `.env`, na importação).
 * @param {string} nome
 * @param {unknown} valor
 * @returns {boolean|number|string}
 */
function validarRegra(nome, valor) {
  const regra = REGRAS[nome];
  if (!regra) throw new ValidationError(`Regra desconhecida: ${nome}.`);

  if (regra.tipo === "booleano") {
    if (typeof valor !== "boolean") throw new ValidationError(`"${regra.rotulo}" precisa ser sim ou não.`);
    return valor;
  }

  if (regra.tipo === "inteiro") {
    // Aceita "30" (vindo de <input> ou do .env), mas não "30 dias" nem 30.5:
    // Number("") é 0, então o vazio precisa ser recusado antes.
    const n = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : valor;
    if (typeof n !== "number" || !Number.isInteger(n) || n < regra.min || n > regra.max) {
      throw new ValidationError(`"${regra.rotulo}" precisa ser um número inteiro entre ${regra.min} e ${regra.max}.`);
    }
    return n;
  }

  // url: vazio é permitido (significa "não configurado").
  const texto = String(valor ?? "").trim();
  if (!texto) return "";
  let url;
  try {
    url = new URL(texto);
  } catch {
    throw new ValidationError(`"${regra.rotulo}" não é um endereço válido.`);
  }
  if (!regra.protocolos.includes(url.protocol)) {
    throw new ValidationError(`"${regra.rotulo}" precisa começar com ${regra.protocolos.map((p) => `${p}//`).join(" ou ")}.`);
  }
  if (regra.hosts && !regra.hosts.includes(url.hostname)) {
    throw new ValidationError(`"${regra.rotulo}" precisa ser um endereço do Discord (discord.com).`);
  }
  // Sem barra no fim: a URL pública é concatenada com "/api/..." e sairia "//api".
  return nome === "publicUrl" ? texto.replace(/\/+$/, "") : texto;
}

/**
 * Converte o texto gravado no banco de volta para o tipo da regra. Um valor
 * gravado que não passa mais na validação (faixa mudou entre versões, banco
 * editado à mão) cai no padrão em vez de derrubar quem está lendo -- o
 * servidor precisa subir e o Resumo precisa abrir mesmo assim.
 * @param {string} nome
 * @param {string|null} texto
 */
function converterRegra(nome, texto) {
  const regra = REGRAS[nome];
  if (texto === null || texto === undefined) return regra.padrao;
  try {
    if (regra.tipo === "booleano") return validarRegra(nome, texto === "true");
    return validarRegra(nome, texto);
  } catch {
    return regra.padrao;
  }
}

/**
 * Lê uma regra direto do repositório. Para quem está ABAIXO dos serviços e
 * não pode depender de ConfiguracaoSistemaService -- hoje, só o Database ao
 * podar os backups na subida.
 * @param {{get(chave: string): string|null}} repositorio
 * @param {string} nome
 */
function lerRegra(repositorio, nome) {
  return converterRegra(nome, repositorio.get(REGRAS[nome].chave));
}

module.exports = { REGRAS, validarRegra, converterRegra, lerRegra };
