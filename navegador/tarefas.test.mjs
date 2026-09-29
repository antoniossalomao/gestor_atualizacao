/*
 * Tarefas (Agendamentos), campanhas e importação de planilha no navegador.
 *
 * O que erra em silêncio se quebrar: o cartão do quadro não abrir pelo
 * teclado (ele é um role="button" feito à mão), a campanha aceitar título
 * vazio sem dizer onde está o erro, a prévia da importação gravar alguma
 * coisa antes de a pessoa confirmar.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { prepararAmbiente, motivoParaPular, passo } from "./apoio/ambiente.mjs";

const require = createRequire(import.meta.url);
const pular = motivoParaPular();

/** Planilha no formato da importação (o mesmo de server/tests/importacao.test.js). */
async function planilha(linhas) {
  const ExcelJS = require("../server/node_modules/exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Atualizações");
  ws.addRow(["Cliente", "Sistema", "Versão", "Quem Atualizou", "Data", "Motivo", "Máquinas", "Obs"]);
  for (const l of linhas) ws.addRow(l);
  const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gestor-planilha-")), "atualizacoes.xlsx");
  await wb.xlsx.writeFile(arquivo);
  return arquivo;
}

test("Tarefas, campanhas e importação no navegador", { skip: pular }, async (t) => {
  const amb = await prepararAmbiente();
  t.after(() => amb.encerrar());
  const { pagina: p, api, admin } = amb;

  await api.post(admin, "/clientes", { nome: "Mercado Central", codigo: "C001", cidade: "Uberaba", sistemas: ["B_Vendas"] });
  await api.put(admin, "/sistemas/B_Vendas/versao", { data: "01/09/2026", versaoEsperada: "" });

  await passo(t, p, "criar uma tarefa pelo formulário", async () => {
    await p.clicar('.tab-button[data-tab="agendamentos"]');
    await p.clicar('[data-action="novo-agendamento"]');
    await p.esperar(() => document.activeElement?.closest('[role="dialog"]'), { descricao: "foco dentro do formulário" });
    await p.digitar("#age-tarefa", "Ligar para o cliente");
    await p.digitar("#age-cliente", "Mercado Central");
    await p.digitar("#age-data", "30/09/2026");
    await p.clicar('[data-action="add"]', { texto: "Adicionar Tarefa" });
    await p.esperarSumir('[role="dialog"] #age-tarefa');
    await p.esperarVisivel(".kanban-card", { texto: "Ligar para o cliente" });
  });

  await passo(t, p, "abrir o cartão pelo teclado e concluir a tarefa", async () => {
    // Foca o cartão (é um role="button" com tabindex) e abre com Enter.
    await p.avaliar(() => /** @type {HTMLElement} */ ([...document.querySelectorAll(".kanban-card")].find((c) => c.innerText.includes("Ligar para o cliente"))).focus());
    await p.tecla("Enter");
    await p.esperar(() => document.activeElement?.closest('[role="dialog"]'), { descricao: "tarefa aberta, foco no formulário" });
    // Os botões ficam no fim da gaveta, abaixo da dobra em janela de 900 px;
    // o clicar rola até eles, como a pessoa faria.
    await p.clicar('[data-action="modal-done"]');
    await p.esperar(
      () => [...document.querySelectorAll('.kanban-column[data-status="Concluído"] .kanban-card')].some((c) => c.innerText.includes("Ligar para o cliente")),
      { descricao: "cartão na coluna Concluído" }
    );
    const tarefa = (await api.get(admin, "/agendamentos?pageSize=200")).rows.find((r) => r.tarefa === "Ligar para o cliente");
    assert.equal(tarefa.status, "Concluído");
  });

  await passo(t, p, "campanha: título vazio é recusado com o erro no campo certo", async () => {
    await p.clicar('.tab-button[data-tab="campanhas"]');
    await p.clicar('[data-action="nova"]', { texto: "Nova campanha" });
    await p.esperarVisivel(".modal-box #cmp-titulo");
    // <select> nativo: a lista suspensa do sistema não existe no Chrome sem
    // janela, então a escolha é feita como o teclado faria (valor + change).
    await p.avaliar(() => {
      const select = /** @type {HTMLSelectElement} */ (document.querySelector("#cmp-sistema"));
      select.value = "B_Vendas";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(await p.avaliar(() => /** @type {HTMLInputElement} */ (document.querySelector("#cmp-versao")).value), "01/09/2026", "sugere a versão oficial atual");
    await p.clicar('.modal-box [data-action="salvar"]');
    await p.esperar(() => document.querySelector('.modal-box [data-role="erro"]')?.textContent?.includes("título"), { descricao: "mensagem de título" });
    const foco = await p.foco();
    assert.equal(foco?.id, "cmp-titulo", `foco em ${JSON.stringify(foco)}`);
    assert.equal(await p.avaliar(() => document.querySelector("#cmp-titulo")?.getAttribute("aria-invalid")), "true");
  });

  await passo(t, p, "campanha criada aparece com o cliente pendente", async () => {
    await p.digitar("#cmp-titulo", "Versão de setembro");
    await p.tecla("Enter");
    await p.esperarVisivel(".toast", { texto: "Campanha criada" });
    await p.esperarSumir(".modal-box");
    await p.esperarVisivel('.view:not([style*="none"])', { texto: "Versão de setembro" });
    await p.esperarVisivel('.view:not([style*="none"]) tbody tr', { texto: "Mercado Central" });
  });

  await passo(t, p, "importação: a prévia não grava; importar grava as linhas válidas", async () => {
    const arquivo = await planilha([
      ["Mercado Central", "B_Vendas", "", "Bia", "10/08/2026", "Rotina", "", ""],
      ["Mercado Central", "B_Vendas", "", "Bia", "31/02/2026", "Data que não existe", "", ""],
    ]);
    const antes = (await api.get(admin, "/atualizacoes")).total;
    await p.clicar('.tab-button[data-tab="atualizacoes"]');
    await p.clicar('[data-action="toggle-mais-acoes"]');
    await p.clicar('[data-action="import"]');
    await p.esperarVisivel(".modal-box", { texto: "Importar planilha" });
    const entregue = p.escolherArquivoNaProxima(arquivo);
    await p.clicar('.modal-box [data-action="escolher"]');
    await entregue;
    await p.esperarVisivel('.modal-box [data-action="importar"]', { texto: "Importar 1 linha" });
    assert.equal((await api.get(admin, "/atualizacoes")).total, antes, "a prévia não gravou nada");
    await p.clicar('.modal-box [data-action="importar"]');
    await p.esperarVisivel(".modal-box", { texto: "1" });
    await p.esperar(() => !document.querySelector('.modal-box [data-action="importar"]'), { descricao: "tela de resultado" });
    assert.equal((await api.get(admin, "/atualizacoes")).total, antes + 1);
    await p.clicar('.modal-box [data-action="fechar"]');
    await p.esperarSumir(".modal-box");
    fs.rmSync(path.dirname(arquivo), { recursive: true, force: true });
  });

  await passo(t, p, "nenhum erro no console", async () => {
    assert.deepEqual(p.erros, []);
  });
});
