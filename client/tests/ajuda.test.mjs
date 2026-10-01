/*
 * Aba Sobre e ajuda (A11): o que dá errado em silêncio numa ajuda é ela
 * esquecer uma tela nova, falar de uma que saiu ou explicar a situação com
 * um prazo diferente do que a equipe usa.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMO_USAR_TELAS, NOVIDADES, agruparNovidades, explicacaoSituacoes } from "../js/domain/ajuda.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Leitura do código-fonte, e não import: App.js puxa todas as views, que
// precisam de um documento de verdade.
function chavesDasTelas() {
  const fonte = fs.readFileSync(path.join(RAIZ, "js", "app", "App.js"), "utf8");
  const bloco = fonte.slice(fonte.indexOf("const TABS = ["), fonte.indexOf("];", fonte.indexOf("const TABS = [")));
  return [...bloco.matchAll(/\{ key: "([^"]+)"/g)].map((m) => m[1]);
}

test("Sobre e ajuda", async (t) => {
  await t.test("toda tela do App tem o seu \"como usar\", e nenhuma sobra", () => {
    const telas = chavesDasTelas();
    assert.ok(telas.length >= 10, `achou só ${telas.length} telas em App.js: o TABS mudou de forma?`);
    assert.deepEqual([...telas].sort(), Object.keys(COMO_USAR_TELAS).sort());
  });

  await t.test("a explicação usa o prazo da equipe, e 60 quando o servidor não mandou", () => {
    const texto = (prazo) => explicacaoSituacoes(prazo).map((i) => i.texto).join(" ");
    assert.match(texto(45), /45 dias/);
    assert.doesNotMatch(texto(45), /60 dias/);
    assert.match(texto(undefined), /60 dias/);
    assert.match(texto(null), /60 dias/);
    assert.match(texto(1), /1 dia\b/);
  });

  await t.test("com prazo 0 não existe \"aguardando\", e a ajuda diz isso", () => {
    const aguardando = explicacaoSituacoes(0).find((i) => i.titulo === "Aguardando atualização");
    assert.match(aguardando.texto, /Não acontece/);
  });

  await t.test("nunca atualizado aparece como desatualizado (ADR-0013)", () => {
    const desatualizado = explicacaoSituacoes(60).find((i) => i.titulo === "Desatualizado");
    assert.match(desatualizado.texto, /nunca foi atualizado/);
  });

  await t.test("as mesmas situações em qualquer prazo (os títulos não dependem dele)", () => {
    assert.deepEqual(explicacaoSituacoes(0).map((i) => i.titulo), explicacaoSituacoes(90).map((i) => i.titulo));
  });

  await t.test("novidades curtas, com data dd/mm/aaaa", () => {
    assert.ok(NOVIDADES.length > 0 && NOVIDADES.length <= 8, "a lista é um resumo: o histórico inteiro é o CHANGELOG");
    for (const n of NOVIDADES) assert.match(n.data, /^\d{2}\/\d{2}\/\d{4}$/, n.titulo);
  });

  await t.test("a legenda usa as cores do app: em dia boa, aguardando neutra, desatualizado alta", () => {
    const tom = Object.fromEntries(explicacaoSituacoes(60).map((i) => [i.titulo, i.tom]));
    assert.equal(tom["Em dia"], "boa");
    assert.equal(tom["Aguardando atualização"], "neutra");
    assert.equal(tom["Desatualizado"], "alta");
    assert.equal(tom["Sem versão oficial"], "fora");
    assert.equal(tom["Componente fixo"], "fora");
    // As regras de combinação não são uma situação: sem bolinha de cor.
    assert.equal(tom["Situação do cliente"], null);
  });

  await t.test("novidades agrupadas por data, sem perder ordem nem item", () => {
    const grupos = agruparNovidades([
      { data: "02/10/2026", titulo: "a", texto: "" },
      { data: "02/10/2026", titulo: "b", texto: "" },
      { data: "30/09/2026", titulo: "c", texto: "" },
      { data: "02/10/2026", titulo: "d", texto: "" },
    ]);
    assert.deepEqual(grupos.map((g) => g.data), ["02/10/2026", "30/09/2026", "02/10/2026"]);
    assert.deepEqual(grupos.flatMap((g) => g.itens.map((i) => `${i.titulo}${i.indice}`)), ["a0", "b1", "c2", "d3"]);
    assert.deepEqual(agruparNovidades([]), []);
  });
});
