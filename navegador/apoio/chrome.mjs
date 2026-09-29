/**
 * Chrome sem janela, controlado pelo protocolo de depuração (CDP) -- sem
 * Playwright nem Puppeteer (P04 de docs/MELHORIAS.md; decisão no ADR-0012).
 *
 * Por que na mão: o repositório não tem dependência de front-end nem etapa de
 * build (ADR-0001), e um Playwright traria centenas de megabytes de
 * navegadores baixados a cada instalação para fazer o que ~200 linhas fazem
 * com o Chrome que já está na máquina (e no runner ubuntu-latest do GitHub).
 * O Node 22 já tem WebSocket embutido, que é todo o transporte que o CDP pede.
 *
 * O preço: só Chromium (Chrome/Edge). Firefox e Safari não são testados.
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CANDIDATOS = {
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
  linux: ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"],
};

/** Caminho do Chrome/Edge, ou null. CHROME_PATH tem prioridade. */
export function acharChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const candidato of CANDIDATOS[process.platform] || []) {
    if (path.isAbsolute(candidato)) {
      if (fs.existsSync(candidato)) return candidato;
      continue;
    }
    try {
      return execFileSync("which", [candidato], { encoding: "utf8" }).trim() || null;
    } catch {
      /* não está no PATH */
    }
  }
  return null;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Uma conexão CDP (WebSocket) com o navegador inteiro, com sessões por aba. */
class ConexaoCdp {
  /** @param {WebSocket} ws */
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    /** @type {Map<number, {ok: Function, erro: Function, metodo: string}>} */
    this.pendentes = new Map();
    /** @type {Map<string, Set<Function>>} "sessao|Evento" -> ouvintes */
    this.ouvintes = new Map();
    ws.addEventListener("message", (e) => this._receber(JSON.parse(String(e.data))));
  }

  _receber(msg) {
    if (msg.id != null) {
      const p = this.pendentes.get(msg.id);
      if (!p) return;
      this.pendentes.delete(msg.id);
      if (msg.error) p.erro(new Error(`${p.metodo}: ${msg.error.message}`));
      else p.ok(msg.result);
      return;
    }
    for (const fn of this.ouvintes.get(`${msg.sessionId || ""}|${msg.method}`) || []) fn(msg.params);
  }

  /** @param {string} metodo @param {object} [params] @param {string} [sessionId] */
  enviar(metodo, params = {}, sessionId) {
    const id = ++this.seq;
    return new Promise((ok, erro) => {
      this.pendentes.set(id, { ok, erro, metodo });
      this.ws.send(JSON.stringify({ id, method: metodo, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  /** @param {string} sessionId @param {string} evento @param {Function} fn */
  ouvir(sessionId, evento, fn) {
    const chave = `${sessionId}|${evento}`;
    if (!this.ouvintes.has(chave)) this.ouvintes.set(chave, new Set());
    this.ouvintes.get(chave).add(fn);
    return () => this.ouvintes.get(chave)?.delete(fn);
  }
}

/**
 * Sobe um Chrome sem janela num perfil temporário (sem extensão, sem
 * histórico, sem nada da máquina de quem roda) e devolve a conexão.
 */
export async function abrirChrome() {
  const executavel = acharChrome();
  if (!executavel) throw new Error("Chrome/Edge não encontrado. Instale o Chrome ou defina CHROME_PATH.");
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-navegador-"));
  const argumentos = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${perfil}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--mute-audio",
    "--window-size=1280,900",
    // O runner Linux do GitHub (Ubuntu 24.04) bloqueia o sandbox do Chrome
    // para usuário comum. Só lá: na máquina de quem desenvolve, fica ligado.
    ...(process.platform === "linux" && process.env.CI ? ["--no-sandbox"] : []),
    "about:blank",
  ];
  const processo = spawn(executavel, argumentos, { stdio: "ignore" });

  // Com a porta 0, o Chrome escolhe uma livre e a escreve neste arquivo --
  // é o que deixa rodar dois arquivos de teste em paralelo sem colisão.
  const arquivoPorta = path.join(perfil, "DevToolsActivePort");
  let wsUrl = null;
  for (let i = 0; i < 150 && !wsUrl; i++) {
    if (fs.existsSync(arquivoPorta)) {
      const [porta, caminho] = fs.readFileSync(arquivoPorta, "utf8").split("\n");
      if (porta && caminho) wsUrl = `ws://127.0.0.1:${porta.trim()}${caminho.trim()}`;
    }
    if (!wsUrl) await espera(100);
  }
  if (!wsUrl) {
    processo.kill();
    throw new Error("O Chrome não abriu a porta de depuração a tempo.");
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, erro) => {
    ws.addEventListener("open", ok, { once: true });
    ws.addEventListener("error", () => erro(new Error("Não foi possível conectar ao Chrome.")), { once: true });
  });
  const cdp = new ConexaoCdp(ws);

  const fechar = async () => {
    try {
      await Promise.race([cdp.enviar("Browser.close"), espera(2000)]);
    } catch {
      /* já fechou */
    }
    ws.close();
    processo.kill();
    // O Windows segura os arquivos do perfil por alguns instantes depois de o
    // processo sair; sem as tentativas, a pasta temporária ficava para trás.
    for (let i = 0; i < 10; i++) {
      try {
        fs.rmSync(perfil, { recursive: true, force: true });
        break;
      } catch {
        await espera(200);
      }
    }
  };
  return { cdp, fechar };
}
