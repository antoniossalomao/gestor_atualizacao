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
import { montarNotificacoes, totalDe } from "../js/domain/notificacoes.js";

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

test("domain/notificacoes - montarNotificacoes", async (t) => {
  /** dd/mm/aaaa de `dias` atrás (negativo = futuro). */
  const dataDe = (dias) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - dias);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  const achar = (lista, chave) => lista.find((n) => n.chave === chave);

  await t.test("sem nada pendente, a lista é vazia -- e não um monte de zeros", () => {
    // Linha "0 agentes com falha" é exatamente o ruído que treina todo mundo a
    // ignorar o sino.
    assert.deepEqual(montarNotificacoes({ lembretes: [], painel: { agentes: [] } }), []);
    assert.deepEqual(montarNotificacoes({}), []);
    assert.deepEqual(montarNotificacoes(), []);
  });

  await t.test("separa agendamento atrasado de agendamento de hoje", () => {
    // O motivo deste teste existir: a versão anterior disto lia
    // `lembretes.atrasados` de um endpoint que devolve um ARRAY. O card de
    // atrasados nunca apareceu na tela, sem erro nenhum no console -- só um
    // aviso que não avisava.
    const lista = montarNotificacoes({
      lembretes: [
        { cliente: "Mercado Central", data: dataDe(3) },
        { cliente: "Padaria do Zé", data: dataDe(1) },
        { cliente: "Auto Peças Silva", data: dataDe(0) },
      ],
    });
    assert.equal(achar(lista, "agendamentos-atrasados").quantidade, 2);
    assert.equal(achar(lista, "agendamentos-hoje").quantidade, 1);
    assert.equal(achar(lista, "agendamentos-hoje").detalhe, "Auto Peças Silva");
  });

  await t.test("data ilegível não vira atraso -- ela não prova nada", () => {
    const lista = montarNotificacoes({
      lembretes: [{ cliente: "Sem Data", data: "" }, { cliente: "Torta", data: "31/31/2026" }],
    });
    assert.equal(achar(lista, "agendamentos-atrasados"), undefined);
    assert.equal(achar(lista, "agendamentos-hoje").quantidade, 2);
  });

  await t.test("cada situação de agente vira uma linha com o filtro que a abre", () => {
    const lista = montarNotificacoes({
      painel: {
        agentes: [
          { empresa: "Alfa", situacao: "erro" },
          { empresa: "Beta", situacao: "offline" },
          { empresa: "Gama", situacao: "offline" },
          { empresa: "Delta", situacao: "pendencias" },
          { empresa: "Épsilon", situacao: "aguardando_autorizacao_demorada" },
          { empresa: "Zeta", situacao: "ok" },
          { empresa: "Eta", situacao: "desatualizado" },
        ],
      },
    });
    assert.equal(achar(lista, "agentes-erro").quantidade, 1);
    assert.equal(achar(lista, "agentes-offline").quantidade, 2);
    assert.deepEqual(achar(lista, "agentes-offline").params, { situacao: "offline" });
    // "Em dia" e "desatualizado" não são notícia: um está certo, o outro é o
    // estado normal de quem ainda não recebeu a versão nova.
    assert.equal(achar(lista, "agentes-ok"), undefined);
    assert.equal(achar(lista, "agentes-desatualizado"), undefined);
  });

  await t.test("autorização demorada não é somada às pendências", () => {
    // São coisas diferentes (uma espera humano, a outra espera revisão) e o
    // seletor de Distribuição as separa -- juntá-las mandaria a pessoa para um
    // filtro que não mostra metade do que ela clicou.
    const lista = montarNotificacoes({
      painel: {
        agentes: [
          { empresa: "Alfa", situacao: "pendencias" },
          { empresa: "Beta", situacao: "aguardando_autorizacao_demorada" },
        ],
      },
    });
    assert.deepEqual(achar(lista, "agentes-pendencias").params, { situacao: "pendencias" });
    assert.deepEqual(achar(lista, "agentes-aguardando_autorizacao_demorada").params, {
      situacao: "aguardando_autorizacao_demorada",
    });
  });

  await t.test("o singular não sai com 's'", () => {
    const [aviso] = montarNotificacoes({ painel: { agentes: [{ empresa: "Alfa", situacao: "erro" }] } });
    assert.equal(aviso.titulo, "1 agente com falha");
    const lista = montarNotificacoes({ lembretes: [{ cliente: "X", data: dataDe(5) }] });
    assert.equal(lista[0].titulo, "1 agendamento atrasado");
  });

  await t.test("mostra dois nomes e conta o resto", () => {
    const lista = montarNotificacoes({
      painel: {
        agentes: ["Alfa", "Beta", "Gama", "Delta"].map((empresa) => ({ empresa, situacao: "offline" })),
      },
    });
    assert.equal(achar(lista, "agentes-offline").detalhe, "Alfa, Beta e mais 2");
  });

  await t.test("agente sem nome cai no CNPJ, e sem nenhum dos dois não vira nome vazio", () => {
    const lista = montarNotificacoes({
      painel: {
        agentes: [
          { cnpj: "12.345.678/0001-90", situacao: "erro" },
          { situacao: "erro" },
        ],
      },
    });
    assert.equal(achar(lista, "agentes-erro").quantidade, 2);
    assert.equal(achar(lista, "agentes-erro").detalhe, "12.345.678/0001-90");
  });

  await t.test("resposta ausente ou malformada não derruba o sino", () => {
    // `/versoes/painel` responde 403 com o Atualizador desativado, e o App
    // transforma isso em `null`. Um sino que quebra aí levaria junto o
    // contador do título da aba.
    assert.deepEqual(montarNotificacoes({ lembretes: null, painel: null }), []);
    assert.deepEqual(montarNotificacoes({ lembretes: { atrasados: [] }, painel: {} }), []);
  });

  await t.test("a pior notícia vem primeiro", () => {
    const lista = montarNotificacoes({
      lembretes: [{ cliente: "X", data: dataDe(2) }, { cliente: "Y", data: dataDe(0) }],
      painel: { agentes: [{ empresa: "Alfa", situacao: "erro" }] },
    });
    assert.deepEqual(
      lista.map((n) => n.chave),
      ["agendamentos-atrasados", "agentes-erro", "agendamentos-hoje"]
    );
  });
});

test("domain/notificacoes - totalDe", async (t) => {
  await t.test("soma as quantidades, que é o que o contador mostra", () => {
    const lista = montarNotificacoes({
      lembretes: [{ cliente: "X", data: "01/01/2020" }],
      painel: { agentes: [{ empresa: "Alfa", situacao: "erro" }, { empresa: "Beta", situacao: "offline" }] },
    });
    // Três avisos em três linhas: o contador conta ITENS, não linhas.
    assert.equal(lista.length, 3);
    assert.equal(totalDe(lista), 3);
  });

  await t.test("lista vazia, nula ou indefinida vale zero", () => {
    assert.equal(totalDe([]), 0);
    assert.equal(totalDe(null), 0);
    assert.equal(totalDe(undefined), 0);
  });
});
