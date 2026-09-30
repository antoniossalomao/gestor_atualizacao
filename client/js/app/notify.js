import { settings } from "./prefs.js";
import { aparencia } from "./appearance.js";
import { emSilencio } from "../domain/notificacoes.js";

/**
 * Avisos do sistema operacional para falhas de agente.
 *
 * O problema: a aba Distribuição já pergunta ao servidor a cada poucos
 * segundos como foram as execuções dos agentes, mas o resultado só existe
 * enquanto alguém está com AQUELA aba aberta e olhando para ela. Uma
 * atualização que quebrou às 14h numa máquina de cliente ficava esperando
 * alguém passar por ali por acaso.
 *
 * Isto avisa fora do navegador. Três cuidados que fazem a diferença entre um
 * aviso útil e um app que ninguém aguenta:
 *
 *  - **desligado por padrão.** Notificação é intrusiva; quem quiser, liga em
 *    Configurações. Nada de pedir permissão no primeiro segundo de uso, que é
 *    a forma mais rápida de a pessoa clicar em "Bloquear" para sempre;
 *  - **só falhas.** Sucesso é o esperado -- avisar a cada acerto treinaria
 *    todo mundo a ignorar os avisos, inclusive os que importam;
 *  - **cada falha uma vez só.** O painel relê a mesma lista de retornos a
 *    cada ciclo; sem guardar o que já foi anunciado, o mesmo erro viraria um
 *    alarme novo a cada poucos segundos, para sempre.
 */
const CHAVE = "notificarFalhas";

/** Ids já anunciados. Vive só nesta sessão -- ver `sincronizar`. */
const anunciados = new Set();
let primeiraLeitura = true;

/**
 * Falhas que chegaram durante o horário silencioso (com "falhas passam
 * mesmo no silêncio" desligado). Não se perdem: viram UM aviso-resumo quando
 * o silêncio acaba -- ver `liberarAcumuladas`. Um aviso por falha às 07:00 em
 * ponto seria o mesmo paredão que o silêncio existe para evitar.
 */
let acumuladas = [];

/** Estado da permissão, em palavras, para a tela de Configurações. */
const ESTADOS = {
  indisponivel: "Indisponível: o navegador só permite notificações em endereço HTTPS ou em localhost.",
  concedida: "Permitidas neste navegador.",
  negada: "Bloqueadas neste navegador. Para liberar, clique no cadeado ao lado do endereço e permita as notificações deste site.",
  nao_pedida: "Ainda não pedidas: o navegador pergunta quando você ligar o aviso abaixo.",
};

export const notificacoes = {
  /** O navegador oferece a API? (Contexto inseguro/HTTP simples não oferece.) */
  suportado() {
    return typeof Notification !== "undefined";
  },

  ligadas() {
    return this.suportado() && settings.get(CHAVE, false) === true && Notification.permission === "granted";
  },

  /**
   * O que o navegador diz AGORA sobre a permissão -- não o que a preferência
   * lembra. Bloquear pelo cadeado do navegador não passa pelo Gestor, e sem
   * isto a tela continuaria dizendo "ligado" para um aviso que nunca chega.
   * @returns {{estado: keyof typeof ESTADOS, texto: string}}
   */
  estadoPermissao() {
    if (!this.suportado()) return { estado: "indisponivel", texto: ESTADOS.indisponivel };
    const mapa = { granted: "concedida", denied: "negada", default: "nao_pedida" };
    const estado = /** @type {keyof typeof ESTADOS} */ (mapa[Notification.permission] || "nao_pedida");
    return { estado, texto: ESTADOS[estado] };
  },

  /**
   * Avisa quando a permissão muda por fora (cadeado do navegador). Nem todo
   * navegador oferece `permissions.query` para notificações; sem ela, a tela
   * relê o estado a cada vez que a seção aparece.
   * @param {() => void} fn
   * @returns {() => void} desliga
   */
  aoMudarPermissao(fn) {
    let status = null;
    let ativo = true;
    navigator.permissions?.query({ name: "notifications" }).then((s) => {
      if (!ativo) return;
      status = s;
      status.addEventListener("change", fn);
    }).catch(() => {});
    return () => {
      ativo = false;
      status?.removeEventListener("change", fn);
    };
  },

  /** Estamos no horário silencioso agora? */
  emSilencio(agora = new Date()) {
    return emSilencio(agora, aparencia.silencio());
  },

  /**
   * Toque curto de dois tons, gerado na hora (sem arquivo de áudio para
   * baixar nem para a CSP liberar). Só com "Som" ligado e fora do silêncio.
   * O navegador só deixa tocar depois de a pessoa ter interagido com a
   * página; antes disso a chamada simplesmente não soa.
   */
  tocarSom() {
    if (!aparencia.somAvisos() || this.emSilencio()) return;
    try {
      const Contexto = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      if (!Contexto) return;
      const ctx = new Contexto();
      const agora = ctx.currentTime;
      for (const [i, freq] of [880, 1320].entries()) {
        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();
        osc.frequency.value = freq;
        ganho.gain.setValueAtTime(0.0001, agora + i * 0.12);
        ganho.gain.exponentialRampToValueAtTime(0.12, agora + i * 0.12 + 0.02);
        ganho.gain.exponentialRampToValueAtTime(0.0001, agora + i * 0.12 + 0.11);
        osc.connect(ganho).connect(ctx.destination);
        osc.start(agora + i * 0.12);
        osc.stop(agora + i * 0.12 + 0.12);
      }
      setTimeout(() => ctx.close().catch(() => {}), 600);
    } catch {
      // Sem áudio (política do navegador, sem saída de som): segue sem tocar.
    }
  },

  /**
   * Fim do silêncio: as falhas acumuladas viram um aviso só. Chamado a cada
   * ciclo do sino (App._carregarNotificacoes) e a cada leitura de falhas.
   */
  liberarAcumuladas() {
    if (acumuladas.length === 0 || this.emSilencio()) return;
    const lista = acumuladas;
    acumuladas = [];
    if (!this.ligadas()) return;
    if (lista.length === 1) {
      this._mostrar(lista[0]);
    } else {
      const quem = [...new Set(lista.map((f) => f.empresa || f.cnpj).filter(Boolean))].slice(0, 3).join(", ");
      this._notificar(`${lista.length} falhas durante o horário silencioso`, quem || "Veja em Distribuição.", "falhas-silencio");
    }
    this.tocarSom();
  },

  /**
   * Liga ou desliga. Ligar pode exigir a permissão do navegador -- e se a
   * pessoa recusar, a preferência NÃO fica marcada: um interruptor ligado que
   * não produz nenhum aviso é pior que um desligado.
   * @returns {Promise<boolean>} como ficou de verdade
   */
  async definir(ligar) {
    if (!ligar) {
      settings.set(CHAVE, false);
      return false;
    }
    if (!this.suportado()) return false;

    let permissao = Notification.permission;
    if (permissao === "default") permissao = await Notification.requestPermission();
    const ok = permissao === "granted";
    settings.set(CHAVE, ok);
    return ok;
  },

  /**
   * Recebe a lista de retornos que o painel acabou de buscar e avisa sobre as
   * falhas ainda não anunciadas.
   *
   * A primeira chamada só MEMORIZA, sem avisar. Sem isso, abrir a aba
   * Distribuição despejaria uma notificação para cada falha das últimas
   * semanas de uma vez -- histórico não é novidade.
   *
   * @param {Array<{id: any, status: string, empresa?: string, cnpj?: string, sistema?: string, detalhes?: string}>} logs
   */
  sincronizar(logs) {
    const falhas = (logs || []).filter((log) => ["ERRO", "FALHA"].includes(String(log.status).toUpperCase()));

    if (primeiraLeitura) {
      primeiraLeitura = false;
      for (const falha of falhas) anunciados.add(chaveDe(falha));
      return;
    }

    const silencio = this.emSilencio();
    const { criticos } = aparencia.silencio();
    let novas = 0;
    for (const falha of falhas) {
      const chave = chaveDe(falha);
      if (anunciados.has(chave)) continue;
      anunciados.add(chave);
      if (!this.ligadas()) continue;
      // No silêncio, falha de agente é o evento crítico: passa se a pessoa
      // quis (sem som -- `tocarSom` já respeita o silêncio), senão espera.
      if (silencio && !criticos) acumuladas.push(falha);
      else {
        this._mostrar(falha, silencio);
        novas += 1;
      }
    }
    if (novas > 0) this.tocarSom();
    this.liberarAcumuladas();
  },

  _mostrar(falha, silenciosa = false) {
    const quem = falha.empresa || falha.cnpj || "Cliente sem identificação";
    const corpo = [falha.sistema, falha.detalhes].filter(Boolean).join(" — ") || "Sem detalhes.";
    // Uma falha por cliente na tela ao mesmo tempo: se o mesmo cliente
    // falhar de novo, o aviso é SUBSTITUÍDO em vez de empilhar.
    this._notificar(`Falha na atualização: ${quem}`, corpo, `falha-${falha.cnpj || quem}`, silenciosa);
  },

  _notificar(titulo, corpo, tag, silenciosa = false) {
    try {
      // `silent`: o aviso do sistema não toca o som do Windows -- o som, quando
      // existe, é o do Gestor (e ele respeita o horário silencioso).
      const n = new Notification(titulo, {
        body: corpo,
        icon: "/assets/favicon.png",
        tag,
        silent: silenciosa || aparencia.somAvisos(),
      });
      // Clicar no aviso traz a janela do Gestor para a frente, já na aba de
      // Distribuição -- o aviso sem o caminho de volta obrigaria a procurar a
      // janela na barra de tarefas.
      n.onclick = () => {
        window.focus();
        location.hash = "#/distribuicao";
        n.close();
      };
    } catch {
      // Notificação bloqueada, sem suporte ou fora de contexto seguro: seguir
      // sem avisar é sempre melhor que quebrar o painel por causa disso.
    }
  },
};

function chaveDe(log) {
  return String(log.id ?? `${log.cnpj}|${log.criadoEm}|${log.detalhes}`);
}
