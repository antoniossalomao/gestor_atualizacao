/*
 * Acessibilidade e layout de todas as telas: nome acessível em tudo que se
 * aciona, navegação do menu pelo teclado, e nenhuma rolagem horizontal da
 * página nas larguras de uso real (celular, tablet, notebook, monitor), nos
 * dois temas e com zoom de 200%.
 *
 * A checagem de nome acessível é de APOIO (ver Pagina.semNomeAcessivel): pega
 * o botão de ícone sem rótulo e o campo sem <label>, não julga se o texto faz
 * sentido. Contraste de cor não é medido aqui -- continua sendo revisão de
 * gente, com as ferramentas do navegador.
 *
 * Rolagem horizontal DENTRO de uma tabela é permitida (o contêiner dela rola
 * sozinho); a da PÁGINA não: ela esconde a barra lateral e o cabeçalho junto.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { prepararAmbiente, motivoParaPular, passo } from "./apoio/ambiente.mjs";

const pular = motivoParaPular();

/** As abas do menu na ordem dos atalhos Alt+1 … Alt+0 (App.js). */
const ABAS = ["resumo", "atualizacoes", "agendamentos", "clientes", "consulta", "distribuicao", "versoes", "sistemas", "campanhas", "administracao"];

test("Acessibilidade e layout no navegador", { skip: pular }, async (t) => {
  const amb = await prepararAmbiente();
  t.after(() => amb.encerrar());
  const { pagina: p, api, admin } = amb;

  // Um pouco de dado em cada tela: tabela vazia esconde coluna larga demais.
  await api.post(admin, "/clientes", { nome: "Supermercado Com Um Nome Bem Comprido Ltda", codigo: "C001", cidade: "Uberaba", sistemas: ["B_Vendas"] });
  await api.post(admin, "/atualizacoes", { cliente: "Supermercado Com Um Nome Bem Comprido Ltda", sistema: "B_Vendas", data: "10/09/2026", responsavel: "Bia", motivo: "Rotina de fim de mês com observação longa" });
  await api.post(admin, "/agendamentos", { tarefa: "Conferir backup", cliente: "Supermercado Com Um Nome Bem Comprido Ltda", data: "30/09/2026" });

  /** Vai para a aba pelo atalho (funciona até com o menu recolhido no celular). */
  const irPara = async (aba) => {
    const indice = ABAS.indexOf(aba);
    await p.tecla(String((indice + 1) % 10), { alt: true });
    await p.esperar((a) => document.querySelector(`.tab-button[data-tab="${a}"]`)?.getAttribute("aria-selected") === "true", {
      args: [aba],
      descricao: `aba ${aba} ativa`,
    });
    // Espera a tela terminar de buscar e desenhar.
    // (Só o que está na tela: as abas nunca abertas guardam o esqueleto.)
    await p.esperar(() => ![...document.querySelectorAll(".is-revalidating, .skeleton")].some((el) => /** @type {HTMLElement} */ (el).offsetParent !== null), {
      descricao: "tela carregada",
      tempo: 8000,
    });
  };

  await passo(t, p, "o documento declara o idioma", async () => {
    assert.equal(await p.avaliar(() => document.documentElement.lang), "pt-BR");
  });

  await passo(t, p, "menu lateral: setas trocam de aba e levam o foco junto; Home e End vão às pontas", async () => {
    await p.clicar('.tab-button[data-tab="resumo"]');
    await p.tecla("ArrowDown");
    let foco = await p.foco();
    assert.equal(foco?.id, "aba-atualizacoes", JSON.stringify(foco));
    await p.tecla("End");
    foco = await p.foco();
    assert.equal(foco?.id, `aba-${ABAS.at(-1)}`, JSON.stringify(foco));
    await p.tecla("Home");
    foco = await p.foco();
    assert.equal(foco?.id, "aba-resumo", JSON.stringify(foco));
  });

  await passo(t, p, "nenhum id repetido no documento (todas as telas ficam montadas juntas)", async () => {
    for (const aba of ABAS) await irPara(aba);
    // Com id repetido, <label for> e aria-labelledby apontam para o PRIMEIRO
    // elemento: o segundo campo fica sem nome, em silêncio. Foi o caso dos
    // filtros de Status/Prioridade de Agendamentos contra os do formulário.
    const repetidos = await p.avaliar(() => {
      const contagem = new Map();
      for (const el of document.querySelectorAll("[id]")) contagem.set(el.id, (contagem.get(el.id) || 0) + 1);
      return [...contagem].filter(([, n]) => n > 1).map(([id, n]) => `${id} (${n}x)`);
    });
    assert.deepEqual(repetidos, []);
  });

  await passo(t, p, "toda tela: tudo que se aciona tem nome acessível", async () => {
    const problemas = [];
    for (const aba of ABAS) {
      await irPara(aba);
      for (const item of await p.semNomeAcessivel()) problemas.push(`${aba} → ${item}`);
    }
    assert.deepEqual(problemas, []);
  });

  await passo(t, p, "formulários (gavetas e modais): todo campo tem rótulo", async () => {
    const problemas = [];
    const abrirEConferir = async (aba, seletor, nome) => {
      await irPara(aba);
      await p.clicar(seletor);
      await p.esperar(() => document.querySelector('.drawer-backdrop.is-open, .modal-overlay'), { descricao: `${nome} aberto` });
      await new Promise((r) => setTimeout(r, 250));
      for (const item of await p.semNomeAcessivel()) problemas.push(`${nome} → ${item}`);
      await p.tecla("Escape");
      await p.esperarSumir(".drawer-backdrop.is-open .drawer-panel, .modal-box");
    };
    await abrirEConferir("atualizacoes", '[data-action="nova-atualizacao"]', "Nova atualização");
    await abrirEConferir("agendamentos", '[data-action="novo-agendamento"]', "Novo agendamento");
    await abrirEConferir("clientes", '[data-action="toggle-form"]', "Novo cliente");
    await abrirEConferir("campanhas", '[data-action="nova"]', "Nova campanha");
    assert.deepEqual(problemas, []);
  });

  const LARGURAS = [390, 768, 1280, 1440];
  for (const tema of ["escuro", "claro"]) {
    await passo(t, p, `sem rolagem horizontal da página: ${LARGURAS.join(", ")} px, tema ${tema}`, async () => {
      await p.tema(tema);
      const problemas = [];
      for (const largura of LARGURAS) {
        await p.tamanho(largura, 900);
        for (const aba of ABAS) {
          await irPara(aba);
          const excesso = await p.excessoHorizontal();
          if (excesso > 1) {
            await p.foto(`rolagem-${tema}-${largura}-${aba}`);
            problemas.push(`${largura}px ${aba}: passa ${excesso}px da largura`);
          }
        }
      }
      await p.tamanho(1280, 900);
      assert.deepEqual(problemas, []);
    });
  }

  await passo(t, p, "zoom de 200% num notebook (1280 px) não cria rolagem horizontal", async () => {
    await p.tamanho(640, 450, { escala: 2 });
    const problemas = [];
    for (const aba of ABAS) {
      await irPara(aba);
      const excesso = await p.excessoHorizontal();
      if (excesso > 1) {
        await p.foto(`rolagem-zoom200-${aba}`);
        problemas.push(`${aba}: passa ${excesso}px`);
      }
    }
    await p.tamanho(1280, 900);
    assert.deepEqual(problemas, []);
  });

  await passo(t, p, "nenhum erro no console", async () => {
    assert.deepEqual(p.erros, []);
  });
});
