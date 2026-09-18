/*
 * Guarda o grafo de modulos do front-end.
 *
 * O client nao tem etapa de build: o navegador le os arquivos de js/ como
 * modulos ES nativos. Isso e' uma vantagem (o que esta no disco e' o que roda),
 * mas tira a rede de seguranca que um bundler daria de graca -- renomear um
 * arquivo, mover uma pasta ou tirar um `export` nao quebra nada na hora, so
 * quando alguem abre a tela que usava aquele import.
 *
 * Este teste fecha esse buraco sem instalar nada: `vm.SourceTextModule` +
 * `link()` fazem o proprio V8 parsear cada modulo alcancavel a partir dos
 * pontos de entrada reais e casar cada import com um export que existe de
 * verdade. Pega, de uma vez: erro de sintaxe, caminho quebrado e nome
 * importado inexistente. Nada e' AVALIADO -- por isso funciona no Node, sem
 * DOM nenhum.
 *
 * Precisa da flag --experimental-vm-modules (ja configurada no script de
 * teste do package.json).
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(AQUI, "..");

/** Os arquivos que o index.html carrega -- tudo o mais entra pelo grafo. */
const PONTOS_DE_ENTRADA = ["js/main.js", "js/theme-init.js"];

function listarModulos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const completo = path.join(dir, e.name);
    if (e.isDirectory()) return listarModulos(completo);
    return e.name.endsWith(".js") ? [completo] : [];
  });
}

test("front-end - grafo de modulos", async (t) => {
  const cache = new Map();
  const contexto = vm.createContext({});

  const carregar = (abs) => {
    if (!cache.has(abs)) {
      const fonte = fs.readFileSync(abs, "utf8");
      cache.set(abs, new vm.SourceTextModule(fonte, { identifier: pathToFileURL(abs).href, context: contexto }));
    }
    return cache.get(abs);
  };

  const resolver = async (especificador, referencia) =>
    carregar(path.resolve(path.dirname(fileURLToPath(referencia.identifier)), especificador));

  await t.test("todo import a partir do index.html resolve e casa com um export real", async () => {
    for (const entrada of PONTOS_DE_ENTRADA) {
      const abs = path.join(CLIENT, entrada);
      assert.ok(fs.existsSync(abs), `ponto de entrada ausente: ${entrada}`);
      await carregar(abs).link(resolver);
    }
    // Numero baixo aqui significaria que o grafo parou de ser percorrido (um
    // ponto de entrada renomeado, por exemplo) e o teste passou sem testar.
    assert.ok(cache.size > 40, `so ${cache.size} modulos no grafo -- esperado o app inteiro`);
  });

  await t.test("nenhum modulo de js/ ficou orfao fora do grafo", () => {
    // Um arquivo que ninguem importa e' codigo morto: ou foi esquecido numa
    // mudanca, ou o import que deveria alcanca-lo esta quebrado. Melhor
    // aparecer aqui do que virar peso permanente na pasta.
    const noGrafo = new Set([...cache.keys()].map((p) => path.resolve(p)));
    const orfaos = listarModulos(path.join(CLIENT, "js"))
      .filter((abs) => !noGrafo.has(path.resolve(abs)))
      .map((abs) => path.relative(CLIENT, abs).split(path.sep).join("/"));

    assert.deepEqual(orfaos, [], `modulos que ninguem importa:\n  ${orfaos.join("\n  ")}`);
  });
});
