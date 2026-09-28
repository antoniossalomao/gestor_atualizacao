/*
 * Botões só de ícone (`btn--icon`): nome acessível E dica, sempre.
 *
 * Seção 6 do planejamento ("manter nome acessível e dica para ícones sem
 * texto"). O leitor de tela lê o `aria-label`; quem usa mouse só tem a dica
 * (`title`) para descobrir o que um desenho de 14 px faz. Faltar um dos dois
 * não quebra nada visível -- por isso a trava.
 *
 * Verificação textual, nos dois jeitos em que esses botões nascem aqui:
 * marcação (`<button class="... btn--icon ...">`) e DOM montado na mão
 * (`botao.className = "btn btn--icon..."` seguido dos atributos).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "js");

function listar(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listar(p) : e.name.endsWith(".js") ? [p] : [];
  });
}

test("todo botão só de ícone tem aria-label e title", async (t) => {
  for (const abs of listar(JS)) {
    const rel = path.relative(JS, abs).split(path.sep).join("/");
    const fonte = fs.readFileSync(abs, "utf8");
    const marcacoes = fonte.match(/<button[^>]*\bbtn--icon\b[^>]*>/g) || [];
    const montados = [...fonte.matchAll(/className\s*=\s*"[^"]*\bbtn--icon\b[^"]*"/g)];
    if (!marcacoes.length && !montados.length) continue;
    await t.test(rel, () => {
      for (const tag of marcacoes) {
        assert.match(tag, /aria-label="/, `${rel}: ${tag} sem aria-label`);
        assert.match(tag, /title="/, `${rel}: ${tag} sem title`);
      }
      for (const m of montados) {
        const depois = fonte.slice(m.index, m.index + 400);
        assert.match(depois, /\.title\s*=/, `${rel}: botão montado sem title`);
        assert.match(depois, /aria-label/, `${rel}: botão montado sem aria-label`);
      }
    });
  }
});
