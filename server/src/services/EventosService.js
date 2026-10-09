const EventEmitter = require("events");

/**
 * Serviço de transmissão de eventos em tempo real via Server-Sent Events (SSE).
 *
 * Mantém a lista de respostas HTTP abertas (/api/eventos) com clientes do
 * painel autenticados e envia eventos pontuais quando dados mudam no servidor
 * (campanhas, agendamentos, atualizações, agentes, clientes e regras).
 */
class EventosService extends EventEmitter {
  constructor() {
    super();
    /** @type {Set<import("express").Response>} */
    this.conexoes = new Set();
    this.timerPing = null;
    this.INTERVALO_PING_MS = 25000;
  }

  iniciar() {
    if (this.timerPing) return;
    this.timerPing = setInterval(() => {
      this.ping();
    }, this.INTERVALO_PING_MS);
    if (this.timerPing.unref) this.timerPing.unref();
  }

  parar() {
    if (this.timerPing) {
      clearInterval(this.timerPing);
      this.timerPing = null;
    }
    for (const res of this.conexoes) {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    }
    this.conexoes.clear();
  }

  /**
   * Registra uma nova conexão SSE de um cliente autenticado.
   * @param {import("express").Response} res
   */
  conectar(res) {
    this.conexoes.add(res);
    res.on("close", () => {
      this.conexoes.delete(res);
    });
  }

  /**
   * Envia um comentário de ping SSE (: ping\n\n) para evitar encerramento
   * por timeout em proxies reversos (como Caddy / Nginx).
   */
  ping() {
    for (const res of this.conexoes) {
      try {
        res.write(": ping\n\n");
      } catch {
        this.conexoes.delete(res);
      }
    }
  }

  /**
   * Transmite um evento SSE para todos os clientes conectados.
   * @param {string} evento nome do evento (ex: "agente:log", "campanhas:alterado")
   * @param {Record<string, any>} [dados] payload JSON
   */
  emitir(evento, dados = {}) {
    const payload = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
    for (const res of this.conexoes) {
      try {
        res.write(payload);
      } catch {
        this.conexoes.delete(res);
      }
    }
    this.emit(evento, dados);
  }

  /** Quantidade de clientes atualmente conectados ao stream SSE. */
  totalConectados() {
    return this.conexoes.size;
  }
}

module.exports = { EventosService };

