import { settings } from "./prefs.js";

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

export const notificacoes = {
  /** O navegador oferece a API? (Contexto inseguro/HTTP simples não oferece.) */
  suportado() {
    return typeof Notification !== "undefined";
  },

  ligadas() {
    return this.suportado() && settings.get(CHAVE, false) === true && Notification.permission === "granted";
  },

  /** Preferência salva, independente da permissão já ter sido concedida. */
  desejadas() {
    return settings.get(CHAVE, false) === true;
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

    for (const falha of falhas) {
      const chave = chaveDe(falha);
      if (anunciados.has(chave)) continue;
      anunciados.add(chave);
      if (this.ligadas()) this._mostrar(falha);
    }
  },

  _mostrar(falha) {
    const quem = falha.empresa || falha.cnpj || "Cliente sem identificação";
    const corpo = [falha.sistema, falha.detalhes].filter(Boolean).join(" — ") || "Sem detalhes.";
    try {
      const n = new Notification(`Falha na atualização: ${quem}`, {
        body: corpo,
        icon: "/assets/favicon.png",
        // Uma falha por cliente na tela ao mesmo tempo: se o mesmo cliente
        // falhar de novo, o aviso é SUBSTITUÍDO em vez de empilhar.
        tag: `falha-${falha.cnpj || quem}`,
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
