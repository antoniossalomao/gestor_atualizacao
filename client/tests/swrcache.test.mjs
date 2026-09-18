/*
 * Testes do SwrCache -- o "mostra o que tem, revalida por trás" que faz cada
 * troca de aba parecer instantânea.
 *
 * Ele é puro (só `Map` e `Date.now()`), então dá para testar aqui fora do
 * navegador mesmo morando em `app/`.
 *
 * O que merece teste é a **comparação por serialização estável**, e o motivo é
 * que ela erra dos dois lados em silêncio:
 *
 *  - comparando de menos ("mudou" sempre) → a tabela é reconstruída a cada
 *    revalidação e pisca na cara de quem está lendo;
 *  - comparando de mais ("nunca mudou") → a tela congela num dado velho e
 *    ninguém descobre, porque não há erro nenhum.
 *
 * O caso concreto: o SQLite não garante a ordem das colunas entre consultas,
 * então `JSON.stringify` puro trataria a MESMA linha como diferente só porque
 * as chaves vieram em outra ordem.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { SwrCache } from "../js/app/SwrCache.js";

test("SwrCache - guardar e ler", async (t) => {
  await t.test("chave que nunca foi gravada devolve undefined", () => {
    const c = new SwrCache();
    assert.equal(c.peek("nada"), undefined);
    assert.equal(c.buscadoEm("nada"), null);
  });

  await t.test("devolve o que foi guardado", () => {
    const c = new SwrCache();
    c.set("clientes", [{ id: 1, nome: "A" }]);
    assert.deepEqual(c.peek("clientes"), [{ id: 1, nome: "A" }]);
    assert.equal(typeof c.buscadoEm("clientes"), "number");
  });

  await t.test("valor vencido é descartado, não devolvido velho", () => {
    // Dados de meia hora atrás não servem nem como aproximação: é melhor
    // mostrar o esqueleto do que mostrar número errado com cara de certo.
    //
    // A entrada é envelhecida à mão em vez de usar `maxAgeMs: 0`: com prazo
    // zero, `set` e `peek` no mesmo milissegundo dão diferença 0, que não é
    // "> 0" -- o teste passaria ou falharia conforme o relógio, e testaria a
    // borda em vez do comportamento.
    const c = new SwrCache({ maxAgeMs: 1000 });
    c.set("x", 1);
    c.entradas.get("x").em -= 5000;
    assert.equal(c.peek("x"), undefined);
  });

  await t.test("ler um valor vencido também o remove do cache", () => {
    const c = new SwrCache({ maxAgeMs: 1000 });
    c.set("x", 1);
    c.entradas.get("x").em -= 5000;
    c.peek("x");
    assert.equal(c.entradas.has("x"), false, "não pode ficar ocupando espaço para sempre");
  });

  await t.test("valor dentro do prazo é devolvido", () => {
    const c = new SwrCache({ maxAgeMs: 60_000 });
    c.set("x", 1);
    assert.equal(c.peek("x"), 1);
  });

  await t.test("guardar de novo substitui", () => {
    const c = new SwrCache();
    c.set("x", 1);
    c.set("x", 2);
    assert.equal(c.peek("x"), 2);
  });
});

test("SwrCache - mudou()", async (t) => {
  await t.test("sem nada guardado, tudo é novidade", () => {
    const c = new SwrCache();
    assert.equal(c.mudou("x", [1, 2, 3]), true);
  });

  await t.test("valor idêntico não mudou", () => {
    const c = new SwrCache();
    c.set("x", [{ id: 1, nome: "A" }]);
    assert.equal(c.mudou("x", [{ id: 1, nome: "A" }]), false);
  });

  await t.test("ORDEM DAS CHAVES não conta como mudança", () => {
    // Este é o ponto central. O SQLite não garante a ordem das colunas entre
    // consultas, então a mesma linha pode voltar como {id, nome} ou
    // {nome, id}. Com `JSON.stringify` puro, toda revalidação pareceria uma
    // mudança, e a tabela seria reconstruída sem nada ter mudado.
    const c = new SwrCache();
    c.set("x", [{ id: 1, nome: "A", cidade: "Uberaba" }]);
    assert.equal(c.mudou("x", [{ cidade: "Uberaba", nome: "A", id: 1 }]), false);
  });

  await t.test("ordem dos ITENS conta como mudança", () => {
    // Array não é objeto: a ordem das linhas de uma tabela é informação
    // (ordenação escolhida por quem está olhando), não ruído.
    const c = new SwrCache();
    c.set("x", [{ id: 1 }, { id: 2 }]);
    assert.equal(c.mudou("x", [{ id: 2 }, { id: 1 }]), true);
  });

  await t.test("mudança real é detectada, inclusive aninhada", () => {
    const c = new SwrCache();
    c.set("x", [{ id: 1, nome: "A" }]);
    assert.equal(c.mudou("x", [{ id: 1, nome: "B" }]), true);

    c.set("y", { total: 1, itens: [{ a: { b: 1 } }] });
    assert.equal(c.mudou("y", { total: 1, itens: [{ a: { b: 2 } }] }), true);
    assert.equal(c.mudou("y", { itens: [{ a: { b: 1 } }], total: 1 }), false, "só a ordem mudou");
  });

  await t.test("distingue tipos que parecem iguais", () => {
    const c = new SwrCache();
    c.set("x", 1);
    assert.equal(c.mudou("x", "1"), true, "número e texto não são a mesma coisa");
    c.set("y", null);
    assert.equal(c.mudou("y", undefined), true);
  });
});

test("SwrCache - invalidar()", async (t) => {
  function cheio() {
    const c = new SwrCache();
    c.set("clientes:lista", [1]);
    c.set("clientes:1", { id: 1 });
    c.set("atualizacoes:lista", [2]);
    return c;
  }

  await t.test("sem argumento, limpa tudo", () => {
    const c = cheio();
    c.invalidar();
    assert.equal(c.peek("clientes:lista"), undefined);
    assert.equal(c.peek("atualizacoes:lista"), undefined);
  });

  await t.test("com prefixo, limpa só o ramo — inclusive de outras abas", () => {
    // É assim que "Adicionar cliente" invalida TODAS as listagens de clientes
    // de uma vez, sem cada tela precisar saber das outras.
    const c = cheio();
    c.invalidar("clientes:");
    assert.equal(c.peek("clientes:lista"), undefined);
    assert.equal(c.peek("clientes:1"), undefined);
    assert.deepEqual(c.peek("atualizacoes:lista"), [2], "o resto continua");
  });

  await t.test("prefixo que não casa com nada não apaga nada", () => {
    const c = cheio();
    c.invalidar("versoes:");
    assert.deepEqual(c.peek("clientes:lista"), [1]);
  });

  await t.test("null e undefined limpam tudo (não são prefixo vazio)", () => {
    // `invalidar(prefixo)` chamado sem valor tem que significar "tudo", e não
    // "o prefixo undefined", que não casaria com chave nenhuma.
    for (const arg of [null, undefined]) {
      const c = cheio();
      c.invalidar(arg);
      assert.equal(c.peek("clientes:lista"), undefined, `invalidar(${arg})`);
    }
  });
});
