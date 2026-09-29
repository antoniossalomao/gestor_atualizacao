/*
 * Entrada no painel: primeira configuração, senha errada, sair e sessão
 * expirada no meio do uso.
 *
 * O que erra em silêncio se quebrar: a sessão expirada virar "erro
 * inesperado" em vez de levar ao login, a senha errada apagar o que foi
 * digitado, o foco sumir depois do erro (quem usa teclado não sabe onde está).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { prepararAmbiente, motivoParaPular, passo, SENHA } from "./apoio/ambiente.mjs";

const pular = motivoParaPular();

test("Login e sessão no navegador", { skip: pular }, async (t) => {
  const amb = await prepararAmbiente({ logado: false });
  t.after(() => amb.encerrar());
  const { pagina: p, base, api, admin } = amb;
  await api.post(admin, "/usuarios", { nome: "Operador Teste", usuario: "operador", senha: SENHA, role: "operador" });

  await passo(t, p, "a tela de login abre com o foco no usuário e sem nada inacessível", async () => {
    await p.ir(`${base}/`);
    await p.esperarVisivel('input[name="usuario"]');
    await p.esperar(() => document.activeElement?.getAttribute("name") === "usuario", { descricao: "foco no usuário" });
    assert.deepEqual(await p.semNomeAcessivel(), []);
  });

  await passo(t, p, "senha errada: mensagem clara, usuário mantido e a senha selecionada para redigitar", async () => {
    await p.digitar('input[name="usuario"]', "operador");
    await p.digitar('input[name="senha"]', "senha-errada");
    await p.tecla("Enter");
    await p.esperar(() => document.querySelector(".is-visible")?.textContent?.trim(), { descricao: "mensagem de erro" });
    const erro = await p.avaliar(() => document.querySelector(".is-visible")?.textContent?.trim());
    assert.match(erro, /senha|usuário/i);
    assert.equal(await p.avaliar(() => /** @type {HTMLInputElement} */ (document.querySelector('input[name="usuario"]')).value), "operador");
    const foco = await p.foco();
    assert.equal(foco?.name, "senha", `foco em ${JSON.stringify(foco)}`);
  });

  await passo(t, p, "com a senha certa, entra no painel com o nome da pessoa", async () => {
    await p.digitar('input[name="senha"]', SENHA);
    await p.tecla("Enter");
    await p.esperarVisivel(".tab-button");
    assert.match(await p.avaliar(() => document.body.innerText), /Operador Teste/);
  });

  await passo(t, p, "sessão expirada no meio do uso: a próxima ação leva ao login com aviso", async () => {
    await amb.expirarSessoes();
    await p.clicar('.tab-button[data-tab="clientes"]');
    await p.esperarVisivel('input[name="usuario"]');
    await p.esperarVisivel(".toast", { texto: "sessão expirou" });
  });

  await passo(t, p, "entrar de novo volta a funcionar, inclusive para gravar (token CSRF renovado)", async () => {
    await p.digitar('input[name="usuario"]', "operador");
    await p.digitar('input[name="senha"]', SENHA);
    await p.tecla("Enter");
    await p.esperarVisivel(".tab-button");
    await p.clicar('.tab-button[data-tab="clientes"]');
    await p.clicar('[data-action="toggle-form"]');
    await p.digitar("#cli-nome", "Cliente Depois do Relogin");
    await p.clicar('[data-action="add"]', { texto: "Adicionar Cliente" });
    await p.esperarVisivel(".toast", { texto: "adicionado" });
    // A sessão de apoio do teste também expirou junto; entra de novo.
    const conferir = await api.entrarComo("/auth/login", { usuario: "admin", senha: SENHA });
    const nomes = (await api.get(conferir, "/clientes/names")) || [];
    assert.ok(nomes.includes("Cliente Depois do Relogin"), nomes.join(", "));
  });

  await passo(t, p, "sair pelo menu da conta só com o teclado", async () => {
    await p.clicar('[data-role="conta"] [data-role="gatilho"]');
    await p.esperarVisivel("#menu-conta");
    // Setas percorrem os itens (padrão de menu); para no "Sair da conta".
    for (let i = 0; i < 8; i++) {
      await p.tecla("ArrowDown");
      if ((await p.foco())?.texto.includes("Sair")) break;
    }
    assert.match((await p.foco())?.texto || "", /Sair da conta/);
    await p.tecla("Enter");
    // A confirmação de saída é ligada por padrão (Configurações > Navegação).
    await p.esperarVisivel(".modal-box", { texto: "encerrar sua sessão" });
    await p.clicar(".modal-box button", { texto: "Sair" });
    await p.esperarVisivel('input[name="usuario"]');
  });

  await passo(t, p, "nenhum erro no console", async () => {
    assert.deepEqual(p.erros, []);
  });
});
