/*
 * Preferências pessoais (app/appearance.js) e a busca da tela Configurações.
 *
 * `appearance.js` fala com o localStorage e com o <html>. Aqui os dois são
 * trocados por versões mínimas ANTES de importar o módulo -- o que se testa é
 * a regra (que valor é aceito, o que o perfil muda, o que sai no arquivo), e
 * não o navegador.
 *
 * As regras que mais erram em silêncio, e por isso têm teste:
 *  - uma preferência nova que o perfil ou a importação não aceitam: o perfil
 *    "funciona", só que deixa uma opção para trás;
 *  - uma preferência sem controle na tela, ou um controle apontando para uma
 *    chave que não existe: o selo "alterado" nunca acende, e ninguém nota.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const guardado = new Map();
globalThis.localStorage = {
  getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
  setItem: (k, v) => guardado.set(k, String(v)),
  removeItem: (k) => guardado.delete(k),
};
const atributos = new Map();
globalThis.document = {
  documentElement: {
    setAttribute: (n, v) => atributos.set(n, v),
    removeAttribute: (n) => atributos.delete(n),
  },
  dispatchEvent: () => true,
};
globalThis.CustomEvent ??= class CustomEvent {
  constructor(tipo, init) {
    this.type = tipo;
    this.detail = init?.detail;
  }
};

const { aparencia, PERFIS } = await import("../js/app/appearance.js");
const { normalizarBusca, casaBusca, filtrarPorBusca } = await import("../js/utils/busca.js");

const NOVAS = ["fonte", "largura", "foco", "dicasAtalho", "periodoAtualizacoes", "confirmarSaida", "duracaoAvisos", "contadorNoTitulo"];

function zerar() {
  guardado.clear();
  atributos.clear();
}

test("Preferências - valores e padrões", async (t) => {
  zerar();

  await t.test("as novas nascem no padrão de fábrica", () => {
    assert.equal(aparencia.fonte(), "inter");
    assert.equal(aparencia.largura(), "limitada");
    assert.equal(aparencia.foco(), "normal");
    assert.equal(aparencia.dicasAtalho(), true);
    assert.equal(aparencia.periodoAtualizacoes(), "");
    assert.equal(aparencia.confirmarSaida(), true);
    assert.equal(aparencia.duracaoAvisos(), "normal");
    assert.equal(aparencia.contadorNoTitulo(), true);
    assert.equal(aparencia.diferencas().size, 0);
  });

  await t.test("aplicar grava o valor da lista e ignora o que não está nela", () => {
    aparencia.aplicar({ fonte: "sistema", periodoAtualizacoes: "mes" });
    assert.equal(aparencia.fonte(), "sistema");
    assert.equal(aparencia.periodoAtualizacoes(), "mes");
    aparencia.aplicar({ fonte: "comic-sans", periodoAtualizacoes: "ano-passado" });
    assert.equal(aparencia.fonte(), "sistema", "valor inventado não substitui o que valia");
    assert.equal(aparencia.periodoAtualizacoes(), "mes");
    aparencia.aplicar({ periodoAtualizacoes: "" });
    assert.equal(aparencia.periodoAtualizacoes(), "", "vazio é uma escolha válida: abrir sem filtro");
  });

  await t.test("desligar um booleano conta como alteração, e restaurar devolve", () => {
    aparencia.aplicar({ confirmarSaida: false });
    assert.equal(aparencia.confirmarSaida(), false);
    assert.ok(aparencia.diferencas().has("confirmarSaida"));
    aparencia.restaurarPadroes(["confirmarSaida"]);
    assert.equal(aparencia.confirmarSaida(), true);
    assert.ok(!aparencia.diferencas().has("confirmarSaida"));
  });

  await t.test("o tempo dos avisos vira um multiplicador; lixo no armazenamento vale 1", () => {
    aparencia.aplicar({ duracaoAvisos: "longa" });
    assert.equal(aparencia.fatorDuracaoAvisos(), 2);
    aparencia.aplicar({ duracaoAvisos: "curta" });
    assert.ok(aparencia.fatorDuracaoAvisos() < 1);
    localStorage.setItem("gestor:duracaoAvisos", JSON.stringify("eterna"));
    assert.equal(aparencia.fatorDuracaoAvisos(), 1);
  });

  await t.test("só o que foge do padrão vira atributo no <html>", () => {
    zerar();
    aparencia.aplicar({ largura: "total", dicasAtalho: false, foco: "reforcado" });
    assert.equal(atributos.get("data-largura"), "total");
    assert.equal(atributos.get("data-dicas"), "nao");
    assert.equal(atributos.get("data-foco"), "reforcado");
    aparencia.restaurarPadroes();
    aparencia.aplicar({});
    assert.ok(!atributos.has("data-largura") && !atributos.has("data-dicas") && !atributos.has("data-foco"));
  });
});

test("Preferências - perfis, exportação e importação", async (t) => {
  zerar();

  await t.test("todo perfil usa só valores que a importação aceitaria", () => {
    // Se um perfil usar um valor que a validação recusa, aplicar o perfil
    // "funciona" -- mas exportar e importar de volta perde aquele ajuste.
    for (const perfil of PERFIS) {
      const r = aparencia.importar({ preferencias: perfil.valores });
      assert.equal(r.ignoradas, 0, `perfil ${perfil.valor}`);
    }
  });

  await t.test("aplicar um perfil e conferir que ele fica marcado como o ativo", () => {
    for (const perfil of PERFIS) {
      aparencia.aplicarPerfil(perfil.valor);
      assert.equal(aparencia.perfilAtivo(), perfil.valor);
    }
  });

  await t.test("mexer num ajuste depois do perfil tira a marca dele", () => {
    aparencia.aplicarPerfil("operacao");
    aparencia.aplicar({ contadorNoTitulo: false });
    assert.equal(aparencia.perfilAtivo(), null);
  });

  await t.test("o arquivo exportado leva as preferências novas", () => {
    const { preferencias } = aparencia.exportar();
    for (const chave of NOVAS) assert.ok(chave in preferencias, chave);
  });

  await t.test("a importação recusa valor fora da lista e conta quantos ficaram de fora", () => {
    zerar();
    const r = aparencia.importar({ preferencias: { fonte: "sistema", largura: "gigante", confirmarSaida: "sim" } });
    assert.equal(r.aplicadas, 1);
    assert.equal(r.ignoradas, 2);
    assert.equal(aparencia.fonte(), "sistema");
    assert.equal(aparencia.largura(), "limitada");
  });
});

test("Preferências - toda preferência tem um controle na tela", () => {
  // Leitura do código-fonte, e não import: ajustes.js depende do Toast, que
  // precisa de um documento de verdade. O que se confere é a lista de
  // `chaves: [...]` contra o mapa de padrões.
  const fonte = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "js", "views", "configuracoes", "ajustes.js"),
    "utf8"
  );
  const naTela = new Set([...fonte.matchAll(/chaves: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])));
  const existentes = Object.keys(aparencia.padrao());
  for (const chave of existentes) assert.ok(naTela.has(chave), `"${chave}" não tem controle em Configurações`);
  for (const chave of naTela) assert.ok(existentes.includes(chave), `ajustes.js aponta para "${chave}", que não existe em appearance.js`);
});

test("Busca de ajustes", async (t) => {
  await t.test("sem acento e sem maiúscula dos dois lados", () => {
    assert.equal(normalizarBusca("Aparência"), "aparencia");
    assert.ok(casaBusca("Aparência", "APARENCIA"));
  });

  await t.test("palavras em qualquer ordem, todas precisam aparecer", () => {
    assert.ok(casaBusca("Densidade das linhas", "linha dens"));
    assert.ok(!casaBusca("Densidade das linhas", "linha cor"));
  });

  await t.test("termo vazio não casa nada", () => {
    assert.ok(!casaBusca("Tema", "   "));
  });

  await t.test("quem casa pelo título vem antes de quem casa só pela ajuda", () => {
    const itens = [
      { titulo: "Contraste", resto: "sem trocar o tema que você escolheu" },
      { titulo: "Tema", resto: "claro escuro" },
      { titulo: "Fonte", resto: "letra" },
    ];
    const achados = filtrarPorBusca(itens, "tema", (i) => i);
    assert.deepEqual(achados.map((i) => i.titulo), ["Tema", "Contraste"]);
  });
});
