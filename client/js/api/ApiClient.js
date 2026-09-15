/**
 * Erro lançado quando a API responde com um status de erro (4xx/5xx). Guarda
 * a mensagem que o servidor mandou (ver server/src/middlewares/errorHandler.js)
 * para poder mostrar ela direto num toast/modal, sem o resto do código
 * precisar saber nada sobre o formato da resposta HTTP.
 */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Erro lançado quando uma requisição foi cancelada de propósito -- porque
 * outra, mais nova, tomou o lugar dela (ver `key` em `get`). Quem chamou deve
 * simplesmente ignorar: não é falha, é a resposta que não interessa mais.
 */
export class RequestCancelled extends Error {
  constructor() {
    super("Requisição cancelada.");
    this.name = "RequestCancelled";
    this.cancelled = true;
  }
}

const TIMEOUT_PADRAO_MS = 15000;
// Upload de pacote (.7z de dezenas de MB) não cabe no timeout normal: numa
// rede lenta, 15s não dão nem para o primeiro terço do arquivo.
const TIMEOUT_UPLOAD_MS = 10 * 60 * 1000;

/**
 * Encapsula todas as chamadas HTTP para o backend (`/api/...`). Nenhuma
 * outra parte do front-end usa `fetch` diretamente -- assim, se um dia a
 * forma de conversar com o servidor mudar (outro formato de erro, outra
 * base de URL), só este arquivo precisa mudar.
 *
 * Três responsabilidades que ele centraliza, e que antes estavam espalhadas
 * (ou faltando):
 *
 *  1. **Cancelamento por chave.** Passando `{ key: "clientes:busca" }`, uma
 *     requisição nova cancela a anterior de mesma chave. Sem isso, digitar
 *     "abc" rápido dispara três buscas e a resposta de "ab" podia chegar
 *     DEPOIS da de "abc" e sobrescrever a tabela com o resultado errado.
 *  2. **Sessão expirada.** Qualquer 401, em qualquer chamada, avisa uma vez
 *     só através de `onUnauthorized`. Antes, só o carregamento de aba tratava
 *     isso -- um 401 ao clicar em "Adicionar" virava "erro inesperado".
 *  3. **Timeout em tudo**, inclusive nos envios/downloads de arquivo, que
 *     antes ficavam pendurados para sempre se o servidor sumisse no meio.
 */
export class ApiClient {
  constructor(baseUrl = "/api") {
    this.baseUrl = baseUrl;
    /** @type {Map<string, AbortController>} requisições em voo, por chave */
    this.inFlight = new Map();
    /** @type {(() => void)|null} chamado no primeiro 401 depois de um login válido */
    this.onUnauthorized = null;
    this._unauthorizedNotified = false;
    /**
     * Se a última conversa com o servidor deu certo. Começa otimista: o app só
     * chega aqui depois de a página ter sido baixada DO servidor, então supor
     * que ele está de pé é a aposta certa -- e um aviso de "sem conexão"
     * piscando no arranque de toda sessão seria ruído puro.
     */
    this._online = true;
  }

  /**
   * @param {string} path
   * @param {object} [params] vira query string (chaves vazias são omitidas)
   * @param {{key?: string}} [options] `key` cancela a requisição anterior de mesma chave
   */
  get(path, params, options = {}) {
    const query = params ? `?${new URLSearchParams(cleanParams(params))}` : "";
    return this._request(`${path}${query}`, { method: "GET" }, options);
  }

  post(path, body, options = {}) {
    return this._request(path, { method: "POST", body: JSON.stringify(body) }, options);
  }

  put(path, body, options = {}) {
    return this._request(path, { method: "PUT", body: JSON.stringify(body) }, options);
  }

  patch(path, body, options = {}) {
    return this._request(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }, options);
  }

  delete(path, options = {}) {
    return this._request(path, { method: "DELETE" }, options);
  }

  /** Envia um arquivo (multipart/form-data) -- usado pela importação de planilha. */
  postFile(path, file, fieldName = "arquivo") {
    const form = new FormData();
    form.append(fieldName, file);
    return this.postForm(path, form);
  }

  /**
   * Envia um FormData. Usa XMLHttpRequest em vez de `fetch` por um motivo
   * único: só o XHR expõe o progresso de UPLOAD (`upload.onprogress`). Como
   * os pacotes de distribuição têm dezenas de megabytes, mandar sem barra de
   * progresso deixa a tela parada por minutos, sem nenhum sinal de que algo
   * está acontecendo.
   *
   * @param {string} path
   * @param {FormData} form
   * @param {{onProgress?: (pct: number|null) => void}} [options]
   */
  postForm(path, form, { onProgress } = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${this.baseUrl}${path}`);
      xhr.withCredentials = true;
      xhr.timeout = TIMEOUT_UPLOAD_MS;

      if (onProgress) {
        xhr.upload.addEventListener("progress", (e) => {
          // `lengthComputable` é falso quando o servidor/proxy não informa o
          // tamanho total -- aí avisamos `null` e a barra vira indeterminada,
          // em vez de mostrar uma porcentagem inventada.
          onProgress(e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : null);
        });
        // O upload termina bem antes da resposta chegar (o servidor ainda vai
        // processar o arquivo): 100% aqui significa "terminou de enviar".
        xhr.upload.addEventListener("load", () => onProgress(100));
      }

      xhr.addEventListener("load", () => {
        if (xhr.status === 204) return resolve(null);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            return resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null);
          } catch {
            return resolve(null);
          }
        }
        if (xhr.status === 401) this._notifyUnauthorized();
        reject(new ApiError(extractXhrError(xhr), xhr.status));
      });
      xhr.addEventListener("error", () => reject(new ApiError("Não foi possível conectar ao servidor.", 0)));
      xhr.addEventListener("timeout", () => reject(new ApiError("O envio demorou demais e foi cancelado.", 408)));
      xhr.addEventListener("abort", () => reject(new RequestCancelled()));

      xhr.send(form);
    });
  }

  /** Baixa um arquivo binário (usado pela exportação de planilha) e devolve um Blob. */
  async getFile(path, params) {
    const query = params ? `?${new URLSearchParams(cleanParams(params))}` : "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_UPLOAD_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}${query}`, {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!res.ok) {
        if (res.status === 401) this._notifyUnauthorized();
        throw new ApiError(await this._extractError(res), res.status);
      }
      return await res.blob();
    } catch (error) {
      if (error.name === "AbortError") throw new ApiError("O download demorou demais e foi cancelado.", 408);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Cancela a requisição em voo de uma chave (ex.: ao sair de uma tela). */
  cancel(key) {
    const controller = this.inFlight.get(key);
    if (controller) {
      controller.abort();
      this.inFlight.delete(key);
    }
  }

  /** Depois de um login bem-sucedido, volta a permitir o aviso de sessão expirada. */
  resetUnauthorized() {
    this._unauthorizedNotified = false;
  }

  async _request(path, options, { key } = {}) {
    // Uma chave = no máximo uma requisição viva. A anterior é abortada, e o
    // `await` de quem a esperava rejeita com RequestCancelled (ignorado por
    // quem chamou), então só a resposta mais nova chega a renderizar.
    if (key) this.cancel(key);

    const controller = new AbortController();
    if (key) this.inFlight.set(key, controller);
    // Distingue "abortei porque veio uma requisição mais nova" de "estourou o
    // tempo": os dois chegam ao `catch` como AbortError, mas significam coisas
    // opostas para o usuário (uma é silenciosa, a outra é um erro de verdade).
    let expirou = false;
    const timer = setTimeout(() => {
      expirou = true;
      controller.abort();
    }, TIMEOUT_PADRAO_MS);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        credentials: "same-origin",
        headers: options.body ? { "Content-Type": "application/json" } : undefined,
        signal: controller.signal,
        ...options,
      });
      // Respondeu -- inclusive com 4xx/5xx. Um 400 é o servidor conversando:
      // quem está fora do ar não recusa nada, não responde.
      this._marcarConexao(true);
      return await this._parse(res);
    } catch (error) {
      if (error.name === "AbortError") {
        if (expirou) {
          this._marcarConexao(false);
          throw new ApiError("O servidor demorou para responder. Tente novamente.", 408);
        }
        throw new RequestCancelled();
      }
      if (error instanceof ApiError) throw error;
      this._marcarConexao(false);
      throw new ApiError("Não foi possível conectar ao servidor.", 0);
    } finally {
      clearTimeout(timer);
      if (key && this.inFlight.get(key) === controller) this.inFlight.delete(key);
    }
  }

  /**
   * Avisa a tela quando o servidor cai e quando ele volta -- só na TROCA de
   * estado, nunca a cada requisição.
   *
   * Existe porque o serviço do Windows reinicia (atualização, reboot da
   * máquina que hospeda) enquanto as pessoas estão com o app aberto. Até aqui
   * isso era invisível: a tela continuava mostrando os dados de antes, e o
   * primeiro clique em "Adicionar" é que virava um "não foi possível conectar"
   * solto, sem dizer se o problema era daquele registro ou de tudo.
   *
   * Um evento no `document`, e não um callback: quem precisa saber disso não é
   * quem chamou a API (esse já recebeu o erro dele), é a casca do app.
   */
  _marcarConexao(ok) {
    if (this._online === ok) return;
    this._online = ok;
    document.dispatchEvent(new CustomEvent("conexao:mudou", { detail: { online: ok } }));
  }

  /**
   * Registra que a máquina ficou sem rede, sem precisar de uma requisição para
   * descobrir isso -- é o que o evento `offline` do navegador conta, e ele
   * chega na hora em que o cabo sai.
   *
   * Existe para o estado ter UM dono. A faixa de "sem conexão" chegou a se
   * mostrar sozinha nesse evento, e o resultado foi um travamento silencioso:
   * o `ApiClient` continuava se achando online, então a primeira resposta boa
   * depois da volta não era uma TROCA de estado, não disparava `conexao:mudou`
   * -- e a faixa ficava na tela para sempre, sobre um app que já estava
   * funcionando. Quem descobre a queda avisa aqui; quem apaga a faixa continua
   * sendo a resposta do servidor.
   */
  marcarOffline() {
    this._marcarConexao(false);
  }

  /** Se a última conversa com o servidor deu certo. */
  get online() {
    return this._online;
  }

  async _parse(res) {
    if (res.status === 204) return null;
    if (!res.ok) {
      if (res.status === 401) this._notifyUnauthorized();
      throw new ApiError(await this._extractError(res), res.status);
    }
    const texto = await res.text();
    return texto ? JSON.parse(texto) : null;
  }

  /**
   * Avisa UMA vez que a sessão caiu. Sem essa trava, uma tela que dispara
   * três chamadas em paralelo abriria três telas de login empilhadas.
   */
  _notifyUnauthorized() {
    if (this._unauthorizedNotified) return;
    this._unauthorizedNotified = true;
    if (this.onUnauthorized) this.onUnauthorized();
  }

  async _extractError(res) {
    try {
      const data = await res.json();
      return data.error || "Ocorreu um erro inesperado.";
    } catch {
      return "Ocorreu um erro inesperado.";
    }
  }
}

function extractXhrError(xhr) {
  try {
    return JSON.parse(xhr.responseText).error || "Ocorreu um erro inesperado.";
  } catch {
    return "Ocorreu um erro inesperado.";
  }
}

/** Remove chaves com valor vazio/undefined antes de montar a query string. */
function cleanParams(params) {
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") out[key] = value;
  }
  return out;
}
