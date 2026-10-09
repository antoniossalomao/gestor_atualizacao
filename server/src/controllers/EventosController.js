/**
 * Controlador do endpoint de streaming em tempo real via Server-Sent Events (SSE).
 */
class EventosController {
  /** @param {import('../services/EventosService').EventosService} eventosService */
  constructor(eventosService) {
    this.eventosService = eventosService;
  }

  stream = (req, res) => {
    // Configura cabeçalhos HTTP específicos para Server-Sent Events
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    // Evento de confirmação de conexão inicial
    res.write(
      `event: conectado\ndata: ${JSON.stringify({ status: "ok", timestamp: new Date().toISOString() })}\n\n`
    );

    this.eventosService.conectar(res);
  };
}

module.exports = { EventosController };

