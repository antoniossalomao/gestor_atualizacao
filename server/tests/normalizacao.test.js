/*
 * Testes de src/shared/normalizacao.js -- a peca que impede o campo "Sistema"
 * de voltar a ter 144 grafias para 14 sistemas.
 *
 * Vale testar porque o modo de falha e' silencioso: nada da erro quando a
 * normalizacao para de funcionar. O sintoma aparece semanas depois, na aba
 * Sistemas, como "60 clientes nunca atualizaram B_NFe" -- que e' mentira, eles
 * atualizaram como "B_NFE".
 *
 * Os casos abaixo sao os documentados no proprio arquivo como vindos do
 * historico REAL, nao exemplos inventados.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  chave,
  normalizarSistemas,
  normalizarResponsavel,
  canonizarResponsaveis,
} = require("../src/shared/normalizacao");

/** O catálogo oficial, como viria da tabela `sistemas`. */
const CATALOGO = [
  "B_Vendas",
  "B_NFe",
  "B_Importa",
  "B_AreaContador",
  "B_Integração",
  "B_Ordem",
  "B_Pre Pedido",
  "B_NFCe",
  "B_Sped",
  "B_Vendas Simples",
];

test("normalizacao - chave()", async (t) => {
  await t.test("ignora caixa, acento e pontuação", () => {
    assert.equal(chave("B_Integração"), chave("b integracao"));
    assert.equal(chave("Pré-Pedido"), chave("PRE PEDIDO"));
    assert.equal(chave("B_NFe"), "BNFE");
  });

  await t.test("lida com nulo e vazio sem explodir", () => {
    assert.equal(chave(null), "");
    assert.equal(chave(undefined), "");
    assert.equal(chave(""), "");
  });
});

test("normalizacao - normalizarSistemas()", async (t) => {
  const norm = (texto) => normalizarSistemas(texto, CATALOGO);

  await t.test("casa com o catálogo ignorando caixa e acento", () => {
    // O caso que originou tudo: "B_NFE" e "B_NFe" eram sistemas diferentes
    // para o relatório, porque a comparação era de string exata.
    assert.equal(norm("B_NFE"), "B_NFe");
    assert.equal(norm("b_nfe"), "B_NFe");
    assert.equal(norm("B_vendas"), "B_Vendas");
    assert.equal(norm("b_integracao"), "B_Integração");
  });

  await t.test("resolve apelidos que a semelhança não alcança", () => {
    assert.equal(norm("B_importaXML"), "B_Importa");
    assert.equal(norm("NFE"), "B_NFe");
    assert.equal(norm("Pré-Pedido"), "B_Pre Pedido");
    assert.equal(norm("sped fiscal"), "B_Sped");
  });

  await t.test("quebra nos separadores que as pessoas usaram de verdade", () => {
    assert.equal(norm("B_Vendas, B_NFe"), "B_Vendas, B_NFe");
    assert.equal(norm("B_Vendas e B_NFe"), "B_Vendas, B_NFe");
    assert.equal(norm("B_Vendas; B_NFe"), "B_Vendas, B_NFe");
    assert.equal(norm("B_Vendas / B_NFe"), "B_Vendas, B_NFe");
    assert.equal(norm("B_Vendas - B_NFe"), "B_Vendas, B_NFe");
  });

  await t.test("NÃO quebra por espaço: há nomes com espaço dentro", () => {
    // "B_Pre Pedido" e "B_Vendas Simples" seriam despedaçados se o espaço
    // fosse separador. É por isso que os pares colados são uma lista à parte.
    assert.equal(norm("B_Pre Pedido"), "B_Pre Pedido");
    assert.equal(norm("B_Vendas Simples"), "B_Vendas Simples");
  });

  await t.test("o 'e' solto não gruda no sistema seguinte", () => {
    // ", e B_importaXML": a vírgula quebra primeiro (o split é da esquerda
    // para a direita) e o "e" ficaria colado no pedaço seguinte.
    assert.equal(norm("B_Vendas, e B_importaXML"), "B_Vendas, B_Importa");
  });

  await t.test("desfaz par colado sem separador nenhum", () => {
    assert.equal(norm("B_NFe B_Importa"), "B_NFe, B_Importa");
    // E também quando o par só aparece depois da primeira quebra.
    assert.equal(norm("B_Vendas Simples, B_NFe B_Importa"), "B_Vendas Simples, B_NFe, B_Importa");
  });

  await t.test("texto que não é sistema nenhum vira B_Vendas", () => {
    // Decisão consciente: chutar o sistema que quase todo cliente tem, em vez
    // de esvaziar o campo e perder o registro do atendimento.
    assert.equal(norm("ATUALIZADO"), "B_Vendas");
    assert.equal(norm("feito acesso regina"), "B_Vendas");
    assert.equal(norm("apenas verificar as versões"), "B_Vendas");
  });

  await t.test("não repete sistema, e preserva a ordem de aparição", () => {
    assert.equal(norm("B_NFe, B_NFE, b_nfe"), "B_NFe");
    assert.equal(norm("B_NFe, B_Vendas, B_NFe"), "B_NFe, B_Vendas");
  });

  await t.test("mantém intacto o que não casa com nada", () => {
    // Regra deliberada: inventar destino para o desconhecido é pior que
    // deixá-lo visível para alguém decidir depois. "CTe" e "B_Vet" aparecem no
    // histórico e ficaram de fora do catálogo de propósito.
    assert.equal(norm("CTe"), "CTe");
    assert.equal(norm("B_Vet"), "B_Vet");
    assert.equal(norm("Sistema Que Nao Existe"), "Sistema Que Nao Existe");
  });

  await t.test("vazio e nulo devolvem string vazia", () => {
    assert.equal(norm(""), "");
    assert.equal(norm("   "), "");
    assert.equal(norm(null), "");
    assert.equal(norm(undefined), "");
  });

  await t.test("sem catálogo, os apelidos ainda funcionam", () => {
    // A migração roda antes de o catálogo estar completo; não pode depender dele.
    assert.equal(normalizarSistemas("NFE"), "B_NFe");
    assert.equal(normalizarSistemas("B_importaXML"), "B_Importa");
  });
});

test("normalizacao - normalizarResponsavel()", async (t) => {
  const conhecidos = ["Camila", "Marcos", "Vinícius"];

  await t.test("devolve a grafia já usada pela equipe", () => {
    assert.equal(normalizarResponsavel("CAMILA", conhecidos), "Camila");
    assert.equal(normalizarResponsavel("camila", conhecidos), "Camila");
    assert.equal(normalizarResponsavel("cAMILA", conhecidos), "Camila");
  });

  await t.test("casa ignorando acento", () => {
    assert.equal(normalizarResponsavel("vinicius", conhecidos), "Vinícius");
    assert.equal(normalizarResponsavel("VINICIUS", conhecidos), "Vinícius");
  });

  await t.test("dupla num campo só fica com uma pessoa", () => {
    // "Marcos/Lennon" não é grafia diferente de nada -- é uma dupla, e o
    // filtro "Responsável" não sabe lidar com isso.
    assert.equal(normalizarResponsavel("Marcos/Lennon", conhecidos), "Marcos");
  });

  await t.test("gente nova passa como está: não há lista fixa de pessoas", () => {
    assert.equal(normalizarResponsavel("Fulano", conhecidos), "Fulano");
    assert.equal(normalizarResponsavel("  Fulano  ", conhecidos), "Fulano", "com as bordas aparadas");
  });

  await t.test("vazio e nulo devolvem string vazia", () => {
    assert.equal(normalizarResponsavel("", conhecidos), "");
    assert.equal(normalizarResponsavel(null, conhecidos), "");
  });
});

test("normalizacao - canonizarResponsaveis()", async (t) => {
  await t.test("a grafia mais usada ganha, sem ninguém decidir", () => {
    const mapa = canonizarResponsaveis([
      { responsavel: "CAMILA", total: 8 },
      { responsavel: "cAMILA", total: 1 },
      { responsavel: "camila", total: 4 },
      { responsavel: "Camila", total: 21 },
    ]);
    assert.equal(mapa.get(chave("camila")), "Camila");
    assert.equal(mapa.size, 1, "as quatro grafias são uma pessoa só");
  });

  await t.test("pessoas diferentes continuam separadas", () => {
    const mapa = canonizarResponsaveis([
      { responsavel: "Camila", total: 10 },
      { responsavel: "Marcos", total: 5 },
    ]);
    assert.equal(mapa.size, 2);
    assert.equal(mapa.get(chave("marcos")), "Marcos");
  });

  await t.test("responsável vazio é ignorado, não vira uma pessoa", () => {
    const mapa = canonizarResponsaveis([
      { responsavel: "", total: 99 },
      { responsavel: "   ", total: 50 },
      { responsavel: "Camila", total: 1 },
    ]);
    assert.equal(mapa.size, 1);
  });

  await t.test("lista vazia devolve mapa vazio", () => {
    assert.equal(canonizarResponsaveis([]).size, 0);
  });
});
