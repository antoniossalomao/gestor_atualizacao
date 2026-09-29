/*
 * Atendimentos (aba Atualizações) no navegador de verdade: registrar, editar,
 * filtrar, relatório, excluir -- e os erros que mais custam quando passam
 * despercebidos: conflito de revisão, falha da API no meio do envio e
 * exclusão em lote sem confirmação.
 *
 * O que a suíte do Node não alcança e isto alcança: o drawer abrir com o foco
 * no campo certo, o Enter enviar, o botão não estar coberto por outro
 * elemento, a mensagem de erro aparecer sem apagar o que foi digitado.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { prepararAmbiente, motivoParaPular, passo } from "./apoio/ambiente.mjs";

const pular = motivoParaPular();

test("Atualizações no navegador", { skip: pular }, async (t) => {
  const amb = await prepararAmbiente();
  t.after(() => amb.encerrar());
  const { pagina: p, api, admin } = amb;

  await api.post(admin, "/clientes", { nome: "Mercado Central", codigo: "C001", cidade: "Uberaba", sistemas: ["B_Vendas"] });
  await api.post(admin, "/clientes", { nome: "Padaria Sol", codigo: "C002", cidade: "Araxá", sistemas: ["B_Vendas"] });
  await api.post(admin, "/atualizacoes", { cliente: "Padaria Sol", sistema: "B_Vendas", data: "10/09/2026", responsavel: "Bia", motivo: "Rotina" });

  const linhas = () => p.avaliar(() => [...document.querySelectorAll('.view:not([style*="none"]) tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, " ")));

  await passo(t, p, "abrir a aba e o formulário: o foco vai para o primeiro campo", async () => {
    await p.clicar('.tab-button[data-tab="atualizacoes"]');
    await p.esperarVisivel('[data-action="nova-atualizacao"]');
    await p.esperar(() => document.querySelectorAll('.view:not([style*="none"]) tbody tr').length > 0, { descricao: "tabela carregada" });
    await p.clicar('[data-action="nova-atualizacao"]');
    await p.esperarVisivel("#atu-cliente");
    await p.esperar(() => document.activeElement?.id === "atu-cliente", { descricao: "foco no campo Cliente" });
  });

  await passo(t, p, "registrar um atendimento pelo teclado (Enter envia)", async () => {
    await p.digitar("#atu-cliente", "Mercado Central");
    await p.digitar("#atu-sistema", "B_Vendas");
    await p.digitar("#atu-data", "15/09/2026");
    await p.digitar("#atu-motivo", "Atualização mensal");
    await p.clicar("#atu-motivo");
    await p.tecla("Enter");
    await p.esperarVisivel(".toast", { texto: "Registro adicionado" });
    await p.esperarSumir('[role="dialog"] #atu-cliente');
    const tabela = await linhas();
    assert.ok(tabela.some((l) => l.includes("Mercado Central") && l.includes("Atualização mensal")), tabela.join("\n"));
  });

  await passo(t, p, "ao fechar o formulário, o foco volta para o botão que o abriu", async () => {
    await p.clicar('[data-action="nova-atualizacao"]');
    await p.esperar(() => document.activeElement?.id === "atu-cliente", { descricao: "foco no campo Cliente" });
    await p.tecla("Escape");
    await p.esperarSumir('[role="dialog"] #atu-cliente');
    const foco = await p.foco();
    assert.equal(foco?.action, "nova-atualizacao", `foco foi para ${JSON.stringify(foco)}`);
  });

  await passo(t, p, "Tab não escapa do formulário aberto para a tela de trás", async () => {
    await p.clicar('[data-action="nova-atualizacao"]');
    await p.esperar(() => document.activeElement?.id === "atu-cliente", { descricao: "foco no campo Cliente" });
    for (let i = 0; i < 25; i++) {
      await p.tecla("Tab");
      const dentro = await p.avaliar(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
      assert.ok(dentro, `Tab ${i + 1} levou o foco para fora: ${JSON.stringify(await p.foco())}`);
    }
    await p.tecla("Tab", { shift: true });
    assert.ok(await p.avaliar(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), "Shift+Tab também fica dentro");
    await p.tecla("Escape");
    await p.esperarSumir('[role="dialog"] #atu-cliente');
  });

  const idMercado = (await api.get(admin, "/atualizacoes?search=Mercado")).rows[0].id;
  const valorDe = (seletor) => p.avaliar((sel) => /** @type {HTMLInputElement} */ (document.querySelector(sel)).value, seletor);
  const editar = async () => {
    await p.clicar(`[data-row-action="editar"][data-id="${idMercado}"]`);
    await p.esperarVisivel('[data-action="update"]');
    await p.esperar(() => document.activeElement?.id === "atu-cliente", { descricao: "foco no campo Cliente ao editar" });
  };

  await passo(t, p, "editar pela ação da linha e salvar", async () => {
    await editar();
    assert.equal(await valorDe("#atu-motivo"), "Atualização mensal");
    await p.digitar("#atu-motivo", "Atualização revisada");
    await p.clicar('[data-action="update"]');
    await p.esperarVisivel(".toast", { texto: "Registro atualizado" });
    await p.esperar(() => document.querySelector('.view:not([style*="none"]) tbody')?.innerText.includes("Atualização revisada"), {
      descricao: "tabela com o motivo novo",
    });
  });

  await passo(t, p, "conflito de revisão: outra pessoa salvou antes; a tela avisa e não perde o que foi digitado", async () => {
    await editar();
    await p.digitar("#atu-motivo", "Minha versão");
    // Enquanto o formulário está aberto, "outra pessoa" altera o mesmo registro.
    const atual = (await api.get(admin, "/atualizacoes?search=Mercado")).rows[0];
    await api.put(admin, `/atualizacoes/${idMercado}`, { ...atual, obs: "mexido por outra pessoa", revisao: atual.revisao });
    await p.clicar('[data-action="update"]');
    await p.esperarVisivel(".modal-box", { texto: "foi alterada por" });
    await p.tecla("Escape");
    await p.esperarSumir(".modal-box");
    assert.equal(await valorDe("#atu-motivo"), "Minha versão", "o que foi digitado continua no formulário");
    const noBanco = (await api.get(admin, "/atualizacoes?search=Mercado")).rows[0];
    assert.equal(noBanco.motivo, "Atualização revisada", "a versão da outra pessoa não foi sobrescrita");
    assert.equal(noBanco.obs, "mexido por outra pessoa");
  });

  await passo(t, p, "descartar o formulário alterado pede confirmação", async () => {
    await p.tecla("Escape");
    await p.esperarVisivel(".modal-box", { texto: "Descartar alterações" });
    await p.clicar(".modal-box button", { texto: "Descartar" });
    await p.esperarSumir('[role="dialog"] #atu-cliente');
  });

  await passo(t, p, "falha da API no meio do envio: mensagem de erro e nada do que foi digitado se perde", async () => {
    await p.interceptar(({ url, method }) =>
      method === "POST" && url.endsWith("/api/atualizacoes") ? { status: 500, corpo: { error: "Erro interno do servidor." } } : null
    );
    try {
      await p.clicar('[data-action="nova-atualizacao"]');
      await p.esperar(() => document.activeElement?.id === "atu-cliente", { descricao: "foco no campo Cliente" });
      await p.digitar("#atu-cliente", "Padaria Sol");
      await p.digitar("#atu-data", "16/09/2026");
      await p.digitar("#atu-motivo", "Envio que vai falhar");
      await p.clicar('[data-action="add"]');
      await p.esperarVisivel(".modal-box", { texto: "Erro interno do servidor" });
      await p.tecla("Escape");
      await p.esperarSumir(".modal-box");
      assert.equal(await valorDe("#atu-motivo"), "Envio que vai falhar");
    } finally {
      await p.interceptar(null);
    }
    // Com a API de volta, o mesmo formulário é enviado sem redigitar nada.
    await p.clicar('[data-action="add"]');
    await p.esperarVisivel(".toast", { texto: "Registro adicionado" });
    assert.equal((await api.get(admin, "/atualizacoes?search=Envio")).total, 1, "gravou uma vez só");
  });

  await passo(t, p, "filtrar pela busca e limpar o filtro", async () => {
    await p.digitar('[data-role="search"]', "Padaria");
    await p.esperar(
      () => {
        const linhas = [...document.querySelectorAll('.view:not([style*="none"]) tbody tr')].map((tr) => tr.innerText);
        return linhas.length === 2 && linhas.every((l) => l.includes("Padaria Sol"));
      },
      { descricao: "só as linhas da Padaria" }
    );
    await p.clicar('[data-action="limpar-filtros"]');
    await p.esperar(() => document.querySelectorAll('.view:not([style*="none"]) tbody tr').length === 3, { descricao: "as três linhas de volta" });
  });

  await passo(t, p, "gerar o relatório do período e copiar o texto", async () => {
    await amb.cdp.enviar("Browser.grantPermissions", { origin: amb.base, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
    await p.clicar('[data-action="toggle-relatorios"]');
    await p.clicar('[data-action="relatorio-periodo"]');
    await p.esperarVisivel(".modal-box", { texto: "Relatório" });
    await p.esperar(() => document.querySelector('[data-role="previa"]')?.innerText.includes("Mercado Central"), { descricao: "prévia com o atendimento" });
    await p.clicar('.modal-box [data-action="copiar"]');
    await p.esperarVisivel(".toast", { texto: "copiad" });
    const copiado = await p.avaliar(() => navigator.clipboard.readText());
    assert.match(copiado, /Mercado Central/);
    assert.match(copiado, /Padaria Sol/);
    await p.clicar('.modal-box [data-action="fechar"]');
    await p.esperarSumir(".modal-box");
  });

  await passo(t, p, "excluir um registro e desfazer", async () => {
    const antes = (await api.get(admin, "/atualizacoes")).total;
    await p.clicar('.view:not([style*="none"]) tbody tr', { texto: "Envio que vai falhar" });
    await p.clicar('.view:not([style*="none"]) [data-action="delete"]');
    await p.esperarVisivel(".toast", { texto: "excluído" });
    assert.equal((await api.get(admin, "/atualizacoes")).total, antes - 1);
    await p.clicar(".toast .toast__action", { texto: "Desfazer" });
    await p.esperarVisivel(".toast", { texto: "Exclusão desfeita" });
    assert.equal((await api.get(admin, "/atualizacoes")).total, antes);
  });

  await passo(t, p, "exclusão em lote pede confirmação; cancelar não apaga nada", async () => {
    const total = (await api.get(admin, "/atualizacoes")).total;
    // "Rotina" é a última linha (a mais antiga); Shift+↑ marca ela e a de cima.
    await p.clicar('.view:not([style*="none"]) tbody tr', { texto: "Rotina" });
    await p.tecla("ArrowUp", { shift: true });
    await p.esperarVisivel('[data-role="bulk"]', { texto: "2 registros" });
    await p.clicar('[data-action="bulk-excluir"]');
    await p.esperarVisivel(".modal-box", { texto: "2 registros serão excluídos" });
    await p.clicar(".modal-box button", { texto: "Cancelar" });
    await p.esperarSumir(".modal-box");
    assert.equal((await api.get(admin, "/atualizacoes")).total, total, "cancelar não apagou");
    await p.clicar('[data-action="bulk-excluir"]');
    await p.clicar(".modal-box button", { texto: "Excluir" });
    await p.esperarVisivel(".toast", { texto: "2 registros excluídos" });
    assert.equal((await api.get(admin, "/atualizacoes")).total, total - 2);
  });

  await passo(t, p, "nenhum erro no console durante tudo isso", async () => {
    assert.deepEqual(p.erros, []);
  });
});
