/*
 * Testes de js/utils/ -- as utilidades genéricas, que não conhecem o negócio.
 *
 * Só entram aqui as funções que NÃO tocam no DOM: `el` e `copyToClipboard`
 * usam `document`, que não existe no Node, e ficam de fora por construção.
 * (`escapeHtml` também usava, e por isso não era testada -- deixou de usar
 * justamente para poder ser, ver utils/html.js.) Essa é
 * exatamente a linha que a divisão de pastas desenhou (ver ADR-0005) -- o que
 * é testável fora do navegador fica separado do que não é.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  todayBR,
  isValidDateBR,
  formatarDataHora,
  tempoRelativo,
  formatarBytes,
  formatarDuracao,
  mascaraDataBR,
} from "../js/utils/date.js";
import { escapeAttr, escapeHtml, html, confiavel, HtmlSeguro, plural } from "../js/utils/html.js";
import { icon, iconHtml } from "../js/utils/icons.js";
import { blendHex } from "../js/utils/color.js";

test("utils/date - todayBR", async (t) => {
  await t.test("devolve dd/mm/aaaa com zero à esquerda", () => {
    const hoje = todayBR();
    assert.match(hoje, /^\d{2}\/\d{2}\/\d{4}$/);
    // E o que ela devolve tem que ser aceito pela própria validação.
    assert.equal(isValidDateBR(hoje), true);
  });
});

test("utils/date - mascaraDataBR", () => {
  assert.equal(mascaraDataBR("21092026"), "21/09/2026");
  assert.equal(mascaraDataBR("21/09/2026"), "21/09/2026");
  assert.equal(mascaraDataBR("2109"), "21/09");
});

test("utils/date - isValidDateBR", async (t) => {
  await t.test("espelha a regra do backend", () => {
    // Esta função existe só para dar retorno instantâneo no formulário; a
    // validação que decide se salva é a do servidor
    // (server/src/shared/validation.js). Se as duas divergirem, o usuário vê
    // "ok" na tela e toma erro ao salvar -- por isso os casos aqui são os
    // mesmos de tests/shared.test.js do servidor.
    assert.equal(isValidDateBR(""), true, "vazio é permitido");
    assert.equal(isValidDateBR("29/02/2024"), true, "2024 é bissexto");
    assert.equal(isValidDateBR("29/02/2026"), false, "2026 não é");
    assert.equal(isValidDateBR("31/02/2026"), false, "o Date 'consertaria' para 03/03");
    assert.equal(isValidDateBR("31/04/2026"), false, "abril tem 30 dias");
    assert.equal(isValidDateBR("2026-01-01"), false, "formato ISO não passa");
    assert.equal(isValidDateBR("1/1/2026"), false, "sem zero à esquerda não passa");
  });
});

test("utils/date - formatarDataHora", async (t) => {
  await t.test("formata ISO no padrão pt-BR", () => {
    const saida = formatarDataHora("2026-08-19T11:56:00Z");
    // Sem fixar o valor exato: depende do fuso de quem roda. O que importa é
    // a FORMA -- dd/mm/aaaa hh:mm -- que é o contrato com quem lê a tela.
    assert.match(saida, /^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/);
  });

  await t.test("entrada inválida ou vazia vira travessão, não 'Invalid Date'", () => {
    assert.equal(formatarDataHora(null), "—");
    assert.equal(formatarDataHora(""), "—");
    assert.equal(formatarDataHora("nem data é"), "—");
  });
});

test("utils/date - tempoRelativo", async (t) => {
  const atras = (ms) => new Date(Date.now() - ms).toISOString();
  const SEG = 1000;
  const MIN = 60 * SEG;
  const HORA = 60 * MIN;
  const DIA = 24 * HORA;

  await t.test("cobre cada faixa da escala", () => {
    assert.equal(tempoRelativo(atras(10 * SEG)), "agora");
    assert.equal(tempoRelativo(atras(60 * SEG)), "há 1 min");
    assert.equal(tempoRelativo(atras(5 * MIN)), "há 5 min");
    assert.equal(tempoRelativo(atras(3 * HORA)), "há 3 h");
    assert.equal(tempoRelativo(atras(1 * DIA)), "ontem");
    assert.equal(tempoRelativo(atras(3 * DIA)), "há 3 dias");
    assert.equal(tempoRelativo(atras(60 * DIA)), "há 2 meses");
    assert.equal(tempoRelativo(atras(400 * DIA)), "há 1 ano");
  });

  await t.test("singular e plural corretos nas viradas", () => {
    assert.equal(tempoRelativo(atras(31 * DIA)), "há 1 mês");
    assert.equal(tempoRelativo(atras(800 * DIA)), "há 2 anos");
  });

  await t.test("sem data é 'nunca' -- é um agente que jamais se comunicou", () => {
    assert.equal(tempoRelativo(null), "nunca");
    assert.equal(tempoRelativo(""), "nunca");
    assert.equal(tempoRelativo("lixo"), "nunca");
  });
});

test("utils/date - formatarBytes", async (t) => {
  await t.test("sobe de unidade e usa vírgula decimal", () => {
    assert.equal(formatarBytes(512), "512 B");
    assert.equal(formatarBytes(1024), "1,0 KB");
    assert.equal(formatarBytes(1024 * 1024), "1,0 MB");
    assert.equal(formatarBytes(1024 * 1024 * 1024), "1,0 GB");
  });

  await t.test("não passa de GB, mesmo com valor absurdo", () => {
    assert.match(formatarBytes(5 * 1024 ** 4), /GB$/);
  });

  await t.test("zero, nulo e lixo viram travessão", () => {
    assert.equal(formatarBytes(0), "—");
    assert.equal(formatarBytes(null), "—");
    assert.equal(formatarBytes("abc"), "—");
  });
});

test("utils/date - formatarDuracao", async (t) => {
  await t.test("escolhe a unidade pela ordem de grandeza", () => {
    assert.equal(formatarDuracao(820), "820 ms");
    assert.equal(formatarDuracao(5000), "5 s");
    assert.equal(formatarDuracao(72000), "1 min 12 s");
    assert.equal(formatarDuracao(120000), "2 min 0 s");
  });

  await t.test("zero e lixo viram travessão", () => {
    assert.equal(formatarDuracao(0), "—");
    assert.equal(formatarDuracao(null), "—");
    assert.equal(formatarDuracao("abc"), "—");
  });
});

test("utils/html - escapeAttr", async (t) => {
  await t.test("neutraliza o que fecharia o atributo ou a tag", () => {
    // O ponto: um nome de cliente com aspas dentro de um `title="..."` fecha o
    // atributo e o resto do texto vira HTML. É a porta de XSS armazenado mais
    // fácil de esquecer, porque o campo parece inofensivo.
    assert.equal(escapeAttr('aspas " aqui'), "aspas &quot; aqui");
    assert.equal(escapeAttr("<script>"), "&lt;script&gt;");
    assert.equal(escapeAttr("a & b"), "a &amp; b");
  });

  await t.test("escapa o & primeiro, senão as entidades saem corrompidas", () => {
    // Se "&" fosse substituído por último, o "&" de "&quot;" seria escapado de
    // novo e o resultado sairia "&amp;quot;", que aparece literalmente na tela.
    assert.equal(escapeAttr('&"'), "&amp;&quot;");
  });

  await t.test("nulo e indefinido viram string vazia", () => {
    assert.equal(escapeAttr(null), "");
    assert.equal(escapeAttr(undefined), "");
  });
});

test("utils/html - escapeHtml", async (t) => {
  await t.test("serve também DENTRO de atributo: escapa aspas duplas e simples", () => {
    // A versão antiga (textContent -> innerHTML do navegador) não escapava
    // aspas. O cartão do kanban a usava em `aria-label="Tarefa ${...}"`, e uma
    // tarefa com `"` no título fechava o atributo antes da hora.
    assert.equal(escapeHtml('diz "oi"'), "diz &quot;oi&quot;");
    assert.equal(escapeHtml("d'água"), "d&#39;água");
  });

  await t.test("escapa o que abriria uma tag, e o & primeiro", () => {
    assert.equal(escapeHtml("<img src=x onerror=alert(1)>"), "&lt;img src=x onerror=alert(1)&gt;");
    assert.equal(escapeHtml('&"'), "&amp;&quot;");
    assert.equal(escapeHtml("&amp;"), "&amp;amp;", "texto que PARECE entidade continua sendo texto");
  });

  await t.test("nulo e indefinido viram vazio; número vira texto", () => {
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
    assert.equal(escapeHtml(0), "0");
  });
});

test("utils/html - tag html", async (t) => {
  const texto = (v) => String(v);

  await t.test("escapa todo valor interpolado, em conteúdo e em atributo", () => {
    const nome = '"><script>alert(1)</script>';
    assert.equal(
      texto(html`<p title="${nome}">${nome}</p>`),
      '<p title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;</p>'
    );
  });

  await t.test("a parte fixa do template NÃO é escapada", () => {
    assert.equal(texto(html`<b class="x">fixo</b>`), '<b class="x">fixo</b>');
  });

  await t.test("devolve HtmlSeguro, que funciona direto num innerHTML", () => {
    const r = html`<i>${"a"}</i>`;
    assert.ok(r instanceof HtmlSeguro);
    // innerHTML converte o valor com ToString -- é o que isto simula.
    assert.equal(`${r}`, "<i>a</i>");
  });

  await t.test("html dentro de html entra como está (não escapa duas vezes)", () => {
    const item = html`<li>${"<b>"}</li>`;
    assert.equal(texto(html`<ul>${item}</ul>`), "<ul><li>&lt;b&gt;</li></ul>");
  });

  await t.test("array: cada item segue as mesmas regras, sem separador", () => {
    const itens = ["a", "<b>", null, html`<br>`];
    assert.equal(texto(html`${itens}`), "a&lt;b&gt;<br>");
    assert.equal(texto(html`${[]}`), "", "lista vazia não vira vírgula nem 'undefined'");
  });

  await t.test("null, undefined e false viram nada -- permite `${cond && html`...`}`", () => {
    assert.equal(texto(html`[${null}][${undefined}][${false}]`), "[][][]");
    assert.equal(texto(html`[${false && html`<b>nunca</b>`}]`), "[]");
  });

  await t.test("0 e true NÃO somem: são valores, não ausência", () => {
    // Um contador zerado que sumisse da tela seria pior que um "0".
    assert.equal(texto(html`${0}|${true}`), "0|true");
  });

  await t.test("confiavel() é a única forma de pular o escape", () => {
    assert.equal(texto(html`${confiavel("<b>ok</b>")}`), "<b>ok</b>");
    assert.equal(texto(confiavel(null)), "");
  });

  await t.test("iconHtml entra como SVG, icon() puro seria escapado", () => {
    assert.equal(texto(html`${iconHtml("seta")}`), icon("seta"));
    assert.match(texto(html`${icon("seta")}`), /^&lt;svg/, "é esse escape que o iconHtml evita");
  });
});

test("utils/html - plural", async (t) => {
  await t.test("só 1 usa o singular", () => {
    assert.equal(plural(1, "cliente"), "1 cliente");
    assert.equal(plural(0, "cliente"), "0 clientes");
    assert.equal(plural(2, "cliente"), "2 clientes");
  });

  await t.test("aceita plural irregular explícito", () => {
    assert.equal(plural(1, "atualização", "atualizações"), "1 atualização");
    assert.equal(plural(3, "atualização", "atualizações"), "3 atualizações");
  });
});

test("utils/color - blendHex", async (t) => {
  await t.test("t=0 e t=1 devolvem os extremos", () => {
    assert.equal(blendHex("#000000", "#ffffff", 0), "rgb(0, 0, 0)");
    assert.equal(blendHex("#000000", "#ffffff", 1), "rgb(255, 255, 255)");
  });

  await t.test("t=0.5 fica no meio", () => {
    assert.equal(blendHex("#000000", "#ffffff", 0.5), "rgb(128, 128, 128)");
  });

  await t.test("mistura cada canal separadamente", () => {
    assert.equal(blendHex("#ff0000", "#0000ff", 0.5), "rgb(128, 0, 128)");
  });
});
