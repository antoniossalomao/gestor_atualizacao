const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { ValidationError, ForbiddenError } = require("../shared/errors");

// Mesmo arquivo que o server.js le no arranque (ver require("dotenv").config()
// em server.js) -- resolvido a partir deste arquivo, e nao do diretorio de
// trabalho do processo, para nao depender de onde o "npm start" foi chamado.
const ENV_PATH = path.join(__dirname, "..", "..", ".env");

// As cinco chaves do .env que hoje so podem ser trocadas editando o arquivo
// na mao e reiniciando o servidor -- ver .env.example, que ja descreve cada
// uma como "regra da equipe" (por isso nao moram no painel de Configuracoes
// pessoal, que e por conta -- ver ConfiguracoesPanel.js no front-end).
const CHAVES = [
  "AGENT_API_TOKEN",
  "PUBLIC_URL",
  "DISCORD_WEBHOOK_URL",
  "ALERTA_AGENTES_INTERVALO_MINUTOS",
  "AGENDAMENTO_ARQUIVAR_DIAS",
];

/**
 * Le e escreve as configuracoes "de equipe" do .env -- a chave e URL que o
 * agente C# de cada cliente usa para falar com este servidor, o webhook do
 * Discord e os dois intervalos ajustaveis.
 *
 * Existe porque, ate aqui, mudar qualquer uma dessas cinco coisas exigia
 * abrir o .env num editor de texto na maquina do servidor -- inacessivel
 * para quem so tem o navegador, e facil de digitar errado (um "=" a mais, um
 * espaco antes do valor) sem ninguem validar nada.
 *
 * O servidor continua lendo process.env no arranque (nada mudou em
 * server.js/Server.js): esta classe so le/escreve o ARQUIVO. Por isso toda
 * troca feita aqui só passa a valer depois que o processo Node reinicia --
 * o front-end avisa isso (ver `reinicioNecessario` em `ler`).
 */
class ConfiguracaoApiService {
  /**
   * @param {{historico?: import('./HistoricoService').HistoricoService, envPath?: string}} [deps]
   */
  constructor({ historico, envPath = ENV_PATH } = {}) {
    this.historico = historico || null;
    this.envPath = envPath;
  }

  /** @param {{id:number, nome:string, role:string}} usuarioLogado */
  ler(usuarioLogado) {
    this._exigirAdmin(usuarioLogado);
    const { valores } = this._lerArquivo();
    return this._formatar(valores);
  }

  /** Só gera -- não grava nada. Quem chamou decide se usa (preenchendo o campo) e depois salva. */
  gerarToken(usuarioLogado) {
    this._exigirAdmin(usuarioLogado);
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * @param {{id:number, nome:string, role:string}} usuarioLogado
   * @param {{agentApiToken:string, publicUrl:string, discordWebhookUrl:string, alertaAgentesIntervaloMinutos:number|string, agendamentoArquivarDias:number|string}} dados
   */
  salvar(usuarioLogado, dados) {
    this._exigirAdmin(usuarioLogado);
    const limpo = this._validar(dados || {});

    const { linhas } = this._lerArquivo();
    this._aplicar(linhas, "AGENT_API_TOKEN", limpo.agentApiToken);
    this._aplicar(linhas, "PUBLIC_URL", limpo.publicUrl);
    this._aplicar(linhas, "DISCORD_WEBHOOK_URL", limpo.discordWebhookUrl);
    this._aplicar(linhas, "ALERTA_AGENTES_INTERVALO_MINUTOS", String(limpo.alertaAgentesIntervaloMinutos));
    this._aplicar(linhas, "AGENDAMENTO_ARQUIVAR_DIAS", String(limpo.agendamentoArquivarDias));
    fs.writeFileSync(this.envPath, linhas.join("\n"));

    this.historico?.registrar(usuarioLogado, "atualizar", "configuracao", "Configurações da API atualizadas");

    return this.ler(usuarioLogado);
  }

  // ==========================================================================

  _formatar(valores) {
    const salvo = {
      agentApiToken: valores.AGENT_API_TOKEN || "",
      publicUrl: valores.PUBLIC_URL || "",
      discordWebhookUrl: valores.DISCORD_WEBHOOK_URL || "",
      alertaAgentesIntervaloMinutos: Number(valores.ALERTA_AGENTES_INTERVALO_MINUTOS) || 15,
      agendamentoArquivarDias: Number(valores.AGENDAMENTO_ARQUIVAR_DIAS) || 30,
    };
    // Compara o que esta gravado no arquivo com o que o processo atual tem
    // em memoria (carregado no arranque): diferente em qualquer uma das
    // cinco chaves quer dizer que alguem salvou algo aqui, ou editou o .env
    // na mao, depois da ultima vez que o servidor subiu.
    const reinicioNecessario = CHAVES.some((chave) => (valores[chave] || "") !== (process.env[chave] || ""));
    return { ...salvo, reinicioNecessario };
  }

  /** Le o .env como texto e devolve as linhas (para reescrever preservando comentarios) e um mapa chave->valor. */
  _lerArquivo() {
    let texto = "";
    try {
      texto = fs.readFileSync(this.envPath, "utf8");
    } catch {
      texto = "";
    }
    const linhas = texto.length ? texto.split(/\r?\n/) : [];
    const valores = {};
    for (const linha of linhas) {
      const m = linha.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) valores[m[1]] = m[2];
    }
    return { linhas, valores };
  }

  /** Troca (ou acrescenta, se a chave ainda nao existir) uma linha "CHAVE=valor" dentro do array de linhas, na hora. */
  _aplicar(linhas, chave, valor) {
    const regex = new RegExp(`^${chave}=`);
    const idx = linhas.findIndex((l) => regex.test(l));
    const linhaNova = `${chave}=${valor}`;
    if (idx >= 0) {
      linhas[idx] = linhaNova;
      return;
    }
    if (linhas.length && linhas[linhas.length - 1] !== "") linhas.push("");
    linhas.push(linhaNova);
  }

  /**
   * Nenhum destes valores pode conter quebra de linha: como a gravacao e uma
   * linha "CHAVE=valor" por vez, uma quebra de linha dentro do valor criaria
   * uma segunda linha que o parser do dotenv leria como outra variavel
   * (ou, na chave da API, um jeito de injetar uma linha qualquer no .env).
   */
  _validar({ agentApiToken, publicUrl, discordWebhookUrl, alertaAgentesIntervaloMinutos, agendamentoArquivarDias }) {
    const token = String(agentApiToken ?? "").trim();
    if (!token) throw new ValidationError("A chave da API não pode ficar vazia.");
    if (token.length < 16 || token.length > 200) {
      throw new ValidationError("A chave da API precisa ter entre 16 e 200 caracteres.");
    }
    if (/[\r\n=#]/.test(token)) throw new ValidationError("A chave da API contém caracteres inválidos.");

    const publicUrlLimpa = String(publicUrl ?? "").trim().replace(/\/+$/, "");
    if (!publicUrlLimpa) throw new ValidationError("A URL pública não pode ficar vazia.");
    this._validarUrl(publicUrlLimpa, "URL pública", ["http:", "https:"]);

    const webhook = String(discordWebhookUrl ?? "").trim();
    if (webhook) this._validarUrl(webhook, "Webhook do Discord", ["https:"]);

    const intervalo = Number(alertaAgentesIntervaloMinutos);
    if (!Number.isInteger(intervalo) || intervalo < 1 || intervalo > 1440) {
      throw new ValidationError("O intervalo de checagem dos agentes precisa ser um número inteiro entre 1 e 1440 minutos.");
    }

    const dias = Number(agendamentoArquivarDias);
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
      throw new ValidationError("Os dias para arquivar tarefas concluídas precisam ser um número inteiro entre 1 e 365.");
    }

    return {
      agentApiToken: token,
      publicUrl: publicUrlLimpa,
      discordWebhookUrl: webhook,
      alertaAgentesIntervaloMinutos: intervalo,
      agendamentoArquivarDias: dias,
    };
  }

  _validarUrl(valor, rotulo, protocolosPermitidos) {
    if (/[\r\n]/.test(valor)) throw new ValidationError(`${rotulo} contém caracteres inválidos.`);
    let parsed;
    try {
      parsed = new URL(valor);
    } catch {
      throw new ValidationError(`${rotulo} inválida.`);
    }
    if (!protocolosPermitidos.includes(parsed.protocol)) {
      throw new ValidationError(`${rotulo} precisa começar com ${protocolosPermitidos.join(" ou ")}`);
    }
  }

  /**
   * So administradores: a chave da API e um segredo compartilhado com o
   * agente C# de TODOS os clientes, e trocar a URL publica ou o webhook do
   * Discord afeta a equipe inteira -- nao e uma decisao de uma conta comum,
   * mesmo mode "todo login tem acesso completo" que o resto do app segue
   * (ver AuthService.deleteUser, mesma restricao).
   */
  _exigirAdmin(usuarioLogado) {
    if (!usuarioLogado || usuarioLogado.role !== "admin") {
      throw new ForbiddenError("Apenas administradores podem ver ou alterar a configuração da API.");
    }
  }
}

module.exports = { ConfiguracaoApiService };
