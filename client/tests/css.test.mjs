/*
 * Integridade das folhas de estilo.
 *
 * Existe por causa de um defeito real, introduzido numa edição de COMENTÁRIO:
 * o texto `client/js/**​/*.js` foi escrito dentro do comentário de cabeçalho de
 * `components.css` -- e `**​/` contém `*​/`, que **fecha o comentário ali**.
 *
 * O resultado: da quinta linha em diante, o texto do comentário virava CSS
 * inválido, e o navegador descartava o começo da folha. A página carregava
 * inteira, sem estilo nenhum.
 *
 * O que torna isso perigoso é como ele PASSA em quase toda verificação:
 *
 *  - o arquivo continua sendo CSS válido o bastante para o servidor entregar;
 *  - a resposta HTTP é 200, com `Content-Type: text/css` e o tamanho certo;
 *  - nenhum erro aparece no console do navegador -- CSS falha em silêncio, por
 *    desenho: o parser descarta o que não entende e segue.
 *
 * Um teste de fumaça que só confere status e MIME (era o caso aqui) não pega.
 * Só olhar o conteúdo pega.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CSS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "css");
const ARQUIVOS = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith(".css"));

/**
 * Percorre o texto como um parser de CSS faria, alternando entre "dentro" e
 * "fora" de comentário. Devolve a posição onde um comentário ficou aberto, ou
 * null se todos fecharam.
 */
function comentarioAberto(texto) {
  let i = 0;
  let dentro = false;
  let linhaAbertura = 0;
  let linha = 1;
  while (i < texto.length - 1) {
    if (texto[i] === "\n") linha += 1;
    if (!dentro && texto[i] === "/" && texto[i + 1] === "*") {
      dentro = true;
      linhaAbertura = linha;
      i += 2;
      continue;
    }
    if (dentro && texto[i] === "*" && texto[i + 1] === "/") {
      dentro = false;
      i += 2;
      continue;
    }
    i += 1;
  }
  return dentro ? linhaAbertura : null;
}

/** O texto sem comentário nenhum -- o que o navegador realmente interpreta. */
const semComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, "");

test("CSS - integridade das folhas de estilo", async (t) => {
  await t.test("há folhas de estilo para conferir", () => {
    assert.ok(ARQUIVOS.length >= 2, "esperado ao menos theme.css e components.css");
  });

  for (const arquivo of ARQUIVOS) {
    const texto = fs.readFileSync(path.join(CSS_DIR, arquivo), "utf8");

    await t.test(`${arquivo}: nenhum comentário fica aberto até o fim`, () => {
      const linha = comentarioAberto(texto);
      assert.equal(linha, null, `comentário aberto na linha ${linha} nunca fecha`);
    });

    await t.test(`${arquivo}: as chaves estão balanceadas`, () => {
      // Feito sobre o texto SEM comentários: chave dentro de comentário é só
      // texto. Desbalanceamento aqui significa regra truncada -- e, na prática,
      // todo o resto do arquivo caindo dentro de um bloco que nunca fecha.
      const util = semComentarios(texto);
      const abre = (util.match(/{/g) || []).length;
      const fecha = (util.match(/}/g) || []).length;
      assert.equal(abre, fecha, `${abre} "{" para ${fecha} "}"`);
    });

    await t.test(`${arquivo}: começa com uma regra de verdade`, () => {
      // Este é o teste que teria pego o defeito original. Com o comentário
      // fechando cedo, o primeiro "CSS" do arquivo passava a ser o resto da
      // frase em português -- que não é seletor de nada.
      const util = semComentarios(texto).trim();
      const primeiraRegra = util.slice(0, util.indexOf("{"));
      assert.ok(primeiraRegra.length > 0, "arquivo sem nenhuma regra");
      assert.ok(
        /^[@a-zA-Z.#:[*][^;]*$/.test(primeiraRegra.trim()),
        `o arquivo começa com algo que não é seletor nem at-rule: ${JSON.stringify(primeiraRegra.trim().slice(0, 80))}`
      );
    });

    await t.test(`${arquivo}: não sobrou texto em português fora de comentário`, () => {
      // Rede mais larga para o mesmo tipo de acidente: um comentário que fecha
      // cedo deixa prosa solta no meio do CSS. Palavras com acento não têm por
      // que existir fora de comentário e de string.
      const util = semComentarios(texto).replace(/"[^"]*"|'[^']*'/g, '""');
      const acentos = util.match(/[çãõáéíóúâêôàÇÃÕÁÉÍÓÚÂÊÔÀ]/g) || [];
      assert.equal(
        acentos.length,
        0,
        `${acentos.length} caractere(s) acentuado(s) fora de comentário -- provável comentário fechado cedo`
      );
    });
  }
});
