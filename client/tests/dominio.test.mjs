/*
 * Testes de js/domain/ -- o vocabulário do negócio, que por regra não toca no
 * DOM (ver ADR-0005). É justamente por não tocar que dá para testar aqui.
 *
 * `relatorio.js` merece teste com carinho: o texto que ele monta é colado num
 * chamado e vai para o cliente. Um campo vazio virando "Obs: undefined", ou a
 * versão anterior aparecendo quando não devia, é erro que chega na frente de
 * quem paga -- e nenhum teste de tela pegaria, porque a tela está certa.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { relatorioDeAtualizacao, relatorioDoCliente } from "../js/domain/relatorio.js";
import { iniciais, rotuloPapel } from "../js/domain/pessoa.js";

/** Data dd/mm/aaaa de `dias` atrás -- para exercitar o "há quanto tempo". */
function diasAtras(dias) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dias);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

test("domain/relatorio - relatorioDeAtualizacao", async (t) => {
  const completo = {
    id: 42,
    data: "09/09/2026",
    cliente: "Mercado Central",
    sistema: "B_Vendas, B_NFe",
    versao: "3.2.1",
    maquinas: 4,
    responsavel: "Camila",
    obs: "Reiniciado o servidor após aplicar.",
  };

  await t.test("monta o relatório completo na ordem esperada", () => {
    const texto = relatorioDeAtualizacao(completo);
    assert.equal(
      texto,
      [
        "ATUALIZAÇÃO #42 — 09/09/2026",
        "",
        "Cliente: Mercado Central",
        "Sistemas: B_Vendas, B_NFe",
        "Versão: 3.2.1",
        "Máquinas: 4",
        "Por: Camila",
        "Obs: Reiniciado o servidor após aplicar.",
      ].join("\n")
    );
  });

  await t.test("campo vazio não vira linha -- nem linha com travessão", () => {
    // Quase metade do histórico não tem responsável preenchido. Um relatório
    // com "Por: —" em toda linha é pior que um relatório mais curto.
    const texto = relatorioDeAtualizacao({ id: 7, cliente: "Padaria do Zé" });
    assert.equal(texto, ["ATUALIZAÇÃO #7", "", "Cliente: Padaria do Zé"].join("\n"));
    assert.doesNotMatch(texto, /undefined|null|—/);
  });

  await t.test("campo só com espaços conta como vazio", () => {
    const texto = relatorioDeAtualizacao({ id: 1, cliente: "X", obs: "   ", responsavel: "" });
    assert.doesNotMatch(texto, /Obs:|Por:/);
  });

  await t.test("sem data, o título não fica com travessão solto", () => {
    const texto = relatorioDeAtualizacao({ id: 9, cliente: "X" });
    assert.match(texto, /^ATUALIZAÇÃO #9\n/);
    assert.doesNotMatch(texto.split("\n")[0], /—/);
  });

  await t.test("mostra a versão anterior quando ela existe e é diferente", () => {
    const texto = relatorioDeAtualizacao(completo, { anterior: { versao: "3.1.0" } });
    assert.match(texto, /^Versão: 3\.2\.1 \(anterior: 3\.1\.0\)$/m);
  });

  await t.test("não mostra 'anterior' quando é a mesma versão -- seria ruído", () => {
    const texto = relatorioDeAtualizacao(completo, { anterior: { versao: "3.2.1" } });
    assert.match(texto, /^Versão: 3\.2\.1$/m);
    assert.doesNotMatch(texto, /anterior/);
  });

  await t.test("anterior sem versão preenchida é ignorado", () => {
    const texto = relatorioDeAtualizacao(completo, { anterior: { versao: "" } });
    assert.match(texto, /^Versão: 3\.2\.1$/m);
  });

  await t.test("sem versão no registro, a linha some inteira", () => {
    const texto = relatorioDeAtualizacao({ id: 3, cliente: "X" }, { anterior: { versao: "1.0" } });
    assert.doesNotMatch(texto, /Versão/);
  });
});

test("domain/relatorio - relatorioDoCliente", async (t) => {
  const historico = [
    { data: diasAtras(3), sistema: "B_NFe", versao: "2.0", responsavel: "Camila", maquinas: 2 },
    { data: "01/01/2026", sistema: "B_Vendas", versao: "1.9", motivo: "Erro na emissão", obs: "Ok" },
  ];

  await t.test("cabeçalho traz cidade, contagem e a última atualização", () => {
    const texto = relatorioDoCliente("Mercado Central", historico, {
      cidade: "Uberaba",
      sistemas: "B_Vendas, B_NFe",
    });
    const linhas = texto.split("\n");
    assert.equal(linhas[0], "HISTÓRICO DE ATUALIZAÇÕES — Mercado Central");
    assert.match(linhas[1], /^Uberaba · 2 atualizações · última em /);
    assert.match(linhas[1], /há 3 dias/);
    assert.equal(linhas[2], "Sistemas do cliente: B_Vendas, B_NFe");
  });

  await t.test("plural irregular de 'atualização' está certo", () => {
    const um = relatorioDoCliente("X", [{ data: "01/01/2026", sistema: "B_Vendas" }]);
    assert.match(um, /1 atualização(?!ões)/);
    const dois = relatorioDoCliente("X", historico);
    assert.match(dois, /2 atualizações/);
  });

  await t.test("cliente sem cadastro não quebra o cabeçalho", () => {
    const texto = relatorioDoCliente("Não Cadastrado", historico, null);
    assert.match(texto, /^HISTÓRICO DE ATUALIZAÇÕES — Não Cadastrado$/m);
    assert.doesNotMatch(texto, /undefined|null/);
    assert.doesNotMatch(texto, /Sistemas do cliente/);
  });

  await t.test("histórico vazio diz isso explicitamente", () => {
    const texto = relatorioDoCliente("Novo Cliente", []);
    assert.match(texto, /0 atualizações/);
    assert.match(texto, /Nenhuma atualização registrada para este cliente\.$/);
  });

  await t.test("histórico ausente ou inválido é tratado como vazio", () => {
    for (const entrada of [null, undefined, "não é lista", 42]) {
      const texto = relatorioDoCliente("X", entrada);
      assert.match(texto, /Nenhuma atualização registrada/);
    }
  });

  await t.test("junta responsável, motivo e máquinas numa linha só", () => {
    const texto = relatorioDoCliente("X", [
      { data: "01/01/2026", sistema: "B_Vendas", responsavel: "Camila", motivo: "Erro", maquinas: 3 },
    ]);
    assert.match(texto, /^Por: Camila · Motivo: Erro · 3 máquinas$/m);
  });

  await t.test("1 máquina fica no singular", () => {
    const texto = relatorioDoCliente("X", [{ data: "01/01/2026", sistema: "B_Vendas", maquinas: 1 }]);
    assert.match(texto, /^1 máquina$/m);
  });

  await t.test("máquinas zero ou vazio não vira linha", () => {
    const texto = relatorioDoCliente("X", [{ data: "01/01/2026", sistema: "B_Vendas", maquinas: 0 }]);
    assert.doesNotMatch(texto, /máquina/);
  });

  await t.test("máquinas em texto livre é preservado como veio", () => {
    // O histórico importado de planilha tem coisas como "todas" nesse campo.
    const texto = relatorioDoCliente("X", [{ data: "01/01/2026", sistema: "B_Vendas", maquinas: "todas" }]);
    assert.match(texto, /Máquinas: todas/);
  });

  await t.test("registro sem data ou sem sistema tem texto de reserva", () => {
    const texto = relatorioDoCliente("X", [{ versao: "1.0" }]);
    assert.match(texto, /^Sem data — Sistema não informado \(v1\.0\)$/m);
  });

  await t.test("data malformada no histórico não gera 'há NaN dias'", () => {
    // O histórico importado tem datas quebradas; a parte relativa some.
    const texto = relatorioDoCliente("X", [{ data: "32/13/2026", sistema: "B_Vendas" }]);
    assert.doesNotMatch(texto, /NaN|Invalid/);
  });

  await t.test("data no futuro não vira 'há -3 dias'", () => {
    const texto = relatorioDoCliente("X", [{ data: diasAtras(-5), sistema: "B_Vendas" }]);
    assert.doesNotMatch(texto, /há -/);
  });

  await t.test("atualização de hoje e de ontem têm palavra própria", () => {
    assert.match(relatorioDoCliente("X", [{ data: diasAtras(0), sistema: "B" }]), /\(hoje\)/);
    assert.match(relatorioDoCliente("X", [{ data: diasAtras(1), sistema: "B" }]), /\(ontem\)/);
  });
});

test("domain/pessoa - iniciais", async (t) => {
  await t.test("usa a primeira e a última palavra", () => {
    assert.equal(iniciais("Antonio Salomão"), "AS");
    assert.equal(iniciais("Maria da Silva Santos"), "MS");
  });

  await t.test("nome de uma palavra só devolve uma letra", () => {
    assert.equal(iniciais("Camila"), "C");
  });

  await t.test("sempre em maiúsculas", () => {
    assert.equal(iniciais("antonio salomão"), "AS");
  });

  await t.test("espaço extra não vira inicial em branco", () => {
    assert.equal(iniciais("  Antonio   Salomão  "), "AS");
  });

  await t.test("vazio, nulo e indefinido caem no '?' do avatar", () => {
    assert.equal(iniciais(""), "?");
    assert.equal(iniciais(null), "?");
    assert.equal(iniciais(undefined), "?");
  });
});

test("domain/pessoa - rotuloPapel", async (t) => {
  await t.test("traduz os papéis conhecidos", () => {
    assert.equal(rotuloPapel("admin"), "Administrador");
    assert.equal(rotuloPapel("consulta"), "Consulta");
    assert.equal(rotuloPapel("operador"), "Operador");
  });

  await t.test("papel desconhecido cai em Operador, o de menor privilégio útil", () => {
    // Inclui a conta legada "user", que existe no banco desde antes dos papéis
    // atuais e precisa continuar aparecendo com algum rótulo.
    assert.equal(rotuloPapel("user"), "Operador");
    assert.equal(rotuloPapel(""), "Operador");
    assert.equal(rotuloPapel(undefined), "Operador");
  });
});
