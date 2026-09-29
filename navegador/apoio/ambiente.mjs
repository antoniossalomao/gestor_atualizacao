/**
 * O que cada arquivo de teste de navegador precisa: um servidor de verdade
 * num banco DESCARTÁVEL (pasta temporária, apagada no fim), um Chrome sem
 * janela e uma aba já apontada para ele. Nada aqui encosta em instalação
 * real: a porta é escolhida pelo sistema e o banco nasce vazio.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { abrirChrome, acharChrome } from "./chrome.mjs";
import { Pagina } from "./pagina.mjs";

const require = createRequire(import.meta.url);
const { Server } = require("../../server/src/Server.js");

export const SENHA = "senha-de-teste-123";

/**
 * Sem Chrome na máquina, os testes de navegador são PULADOS com aviso, para
 * `npm run test:navegador` não quebrar em quem não tem Chrome. No CI,
 * EXIGIR_NAVEGADOR=1 transforma a ausência em falha: lá, pular em silêncio
 * seria deixar de testar sem ninguém perceber.
 */
export function motivoParaPular() {
  if (acharChrome()) return false;
  if (process.env.EXIGIR_NAVEGADOR) throw new Error("EXIGIR_NAVEGADOR=1, mas o Chrome/Edge não foi encontrado.");
  return "Chrome/Edge não encontrado (defina CHROME_PATH)";
}

async function subirServidor(dir, porta = 0) {
  const server = new Server({
    port: porta,
    host: "127.0.0.1",
    dbPath: path.join(dir, "gestao.db"),
    sessionSecret: "segredo-dos-testes-de-navegador",
    sessionSecure: false,
    agentApiToken: "token-de-teste",
  });
  await server.start();
  return server;
}

/**
 * Sobe servidor + Chrome, cria o administrador e devolve as ferramentas.
 * `logado: true` (padrão) já deixa a aba dentro do painel.
 */
export async function prepararAmbiente({ logado = true, largura, altura } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-navegador-dados-"));
  let server = await subirServidor(dir);
  const porta = server.httpServer.address().port;
  const base = `http://127.0.0.1:${porta}`;
  const { cdp, fechar } = await abrirChrome();
  const pagina = await Pagina.abrir(cdp, { largura, altura });

  const api = criarApi(base);
  const admin = await api.entrarComo("/auth/setup", { nome: "Admin Teste", usuario: "admin", senha: SENHA });

  const ambiente = {
    base,
    pagina,
    cdp,
    api,
    admin,
    get server() {
      return server;
    },
    /** Entra pela tela de login, como uma pessoa. */
    async entrar(usuario = "admin", senha = SENHA) {
      await pagina.ir(`${base}/`);
      await pagina.esperarVisivel('input[name="usuario"]');
      await pagina.digitar('input[name="usuario"]', usuario);
      await pagina.digitar('input[name="senha"]', senha);
      await pagina.tecla("Enter");
      await pagina.esperarVisivel(".tab-button");
    },
    /** Derruba o servidor (a porta fica fechada) -- para testar a tela sem ele. */
    async derrubar() {
      await server.stop();
      server.db.close();
    },
    /** Religa o servidor na MESMA porta e no mesmo banco. */
    async religar() {
      server = await subirServidor(dir, porta);
    },
    /** Encerra todas as sessões abertas, como se tivessem expirado. */
    expirarSessoes() {
      return new Promise((ok, erro) => server.sessionStore.clearAll((e) => (e ? erro(e) : ok())));
    },
    async encerrar() {
      await fechar();
      await server.stop().catch(() => {});
      try {
        server.db.close();
      } catch {
        /* já fechado */
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  if (logado) await ambiente.entrar();
  return ambiente;
}

/**
 * Um subteste que, se falhar, deixa uma captura da tela em navegador/.falhas/
 * -- sem ela, "tempo esgotado esperando o botão" não diz se o botão estava
 * coberto, fora da tela ou nunca apareceu.
 *
 * @param {import("node:test").TestContext} t
 * @param {Pagina} pagina
 * @param {string} nome
 * @param {() => Promise<void>} fn
 */
export function passo(t, pagina, nome, fn) {
  return t.test(nome, async () => {
    try {
      await fn();
    } catch (erro) {
      const foto = await pagina.foto(`${t.name}-${nome}`);
      if (foto) erro.message += `\n(captura: ${foto})`;
      throw erro;
    }
  });
}

/**
 * Cliente HTTP para preparar dados pela API (mais rápido e mais estável do
 * que clicar em tudo) -- o que se testa pela tela é o fluxo, não o cadastro
 * de apoio. Guarda cookie e token CSRF por sessão, como o navegador.
 */
function criarApi(base) {
  const pedir = async (sessao, metodo, caminho, corpo) => {
    const r = await fetch(`${base}/api${caminho}`, {
      method: metodo,
      headers: {
        ...(corpo !== undefined ? { "content-type": "application/json" } : {}),
        ...(sessao ? { cookie: sessao.cookie, "x-csrf-token": sessao.token } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    const token = r.headers.get("x-csrf-token");
    if (sessao && token) sessao.token = token;
    const texto = await r.text();
    const dados = texto ? JSON.parse(texto) : null;
    if (!r.ok) throw new Error(`${metodo} ${caminho}: ${r.status} ${dados?.error || ""}`);
    return { r, dados };
  };
  return {
    /** Faz login (ou o setup) e devolve a sessão {cookie, token}. */
    async entrarComo(caminho, corpo) {
      const { r } = await pedir(null, "POST", caminho, corpo);
      return {
        cookie: r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "),
        token: r.headers.get("x-csrf-token"),
      };
    },
    get: async (sessao, caminho) => (await pedir(sessao, "GET", caminho)).dados,
    post: async (sessao, caminho, corpo) => (await pedir(sessao, "POST", caminho, corpo)).dados,
    put: async (sessao, caminho, corpo) => (await pedir(sessao, "PUT", caminho, corpo)).dados,
    patch: async (sessao, caminho, corpo) => (await pedir(sessao, "PATCH", caminho, corpo)).dados,
    delete: async (sessao, caminho) => (await pedir(sessao, "DELETE", caminho)).dados,
  };
}
