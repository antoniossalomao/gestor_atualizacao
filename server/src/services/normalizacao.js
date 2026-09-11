/**
 * Normalização de nomes de sistema e de responsável.
 *
 * O campo "Sistema" das atualizações sempre foi texto livre, e o histórico
 * pagou o preço: 144 grafias diferentes para 14 sistemas ("B_NFE", "B_vendas",
 * "B_areadocontador e B_importaXML"...). Isso não era só feio -- o relatório
 * da aba Sistemas compara string exata, então 60 clientes apareciam como
 * "Nunca atualizado" em B_NFe só porque alguém digitou "B_NFE".
 *
 * Aqui ficam as duas peças que resolvem isso, usadas TANTO pela migração de
 * uma vez (scripts/normalizar-historico.js) QUANTO por toda gravação nova
 * (AtualizacaoService), para o problema não voltar a crescer:
 *
 *  - `normalizarSistemas`: quebra o texto nos separadores que as pessoas
 *    usaram de verdade (vírgula, ponto, " e ", " - "), casa cada pedaço com o
 *    catálogo ignorando caixa, acento e pontuação, e consulta `APELIDOS` para
 *    o que não casa por semelhança.
 *  - `normalizarResponsavel`: casa com os nomes já usados ignorando caixa e
 *    acento, e devolve a grafia que já existe. Não há lista fixa de pessoas:
 *    quem entrar na equipe amanhã é canonizado pela primeira grafia que
 *    alguém gravar, sem ninguém precisar cadastrar nada.
 */

/** Chave de comparação: sem acento, sem pontuação, sem espaço, tudo maiúsculo. */
function chave(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * O que a comparação por semelhança não alcança, mapeado na mão a partir do
 * histórico real. A chave é o resultado de `chave()`, então uma entrada só
 * cobre todas as variações de caixa, acento e pontuação daquele nome de uma
 * vez ("Pré-Pedido", "pre-pedido", "PRE-PEDIDO" e "Pre Pedido" são a mesma).
 */
const APELIDOS = new Map([
  // -- nomes que descrevem o mesmo sistema por outro caminho --
  ["BIMPORTAXML", "B_Importa"],
  ["IMPORTAXML", "B_Importa"],
  ["BAREADOCONTADOR", "B_AreaContador"],
  ["NFE", "B_NFe"],
  ["NFCE", "B_NFCe"],
  ["BNCFE", "B_NFCe"],
  ["NFSE", "B_NFSe"],
  ["BNFS", "B_NFSe"],
  ["PREPEDIDO", "B_Pre Pedido"],
  ["BINTEGRA", "B_Integração"],
  ["INTEGRACAO", "B_Integração"],
  ["BINTEG", "B_Integração"],
  ["BINTEGRACA", "B_Integração"],
  ["BORDEMDESERVICO", "B_Ordem"],
  ["BORDEMSERVICO", "B_Ordem"],
  ["BORDE", "B_Ordem"],
  ["ATUALIZADOR", "B_Atualizador"],
  // -- Sped: escrito de seis jeitos, nenhum deles no catálogo antigo --
  ["SPED", "B_Sped"],
  ["BSPED", "B_Sped"],
  ["BSEPD", "B_Sped"],
  ["SPEDFISCAL", "B_Sped"],
  ["SPEDFISCA", "B_Sped"],
  ["SP", "B_Sped"],
  // -- B_Vendas Simples: seis grafias, nenhuma igual à outra --
  ["BVENDASSIMPLES", "B_Vendas Simples"],
  ["BVENDASIMPLES", "B_Vendas Simples"],
]);

/**
 * Texto que foi parar no campo Sistema sem ser nome de sistema nenhum
 * ("ATUALIZADO", "feito acesso regina", "apenas verificar as versões"). Vira
 * B_Vendas, que é o sistema que praticamente todo cliente tem -- decisão
 * consciente de chutar o mais provável em vez de esvaziar o campo.
 */
const LIXO = new Set([
  "ATUALIZACAOSEFAZ",
  "FEITOACESSOREGINA",
  "ATUALIZADO",
  "ATUALIZADOPORVINICIUS",
  "ATUALIZADOPORCAMILA",
  "ATUALIZADOPORGESSICA",
  "ATUALIZADOPARACORRECAODEERROSBVENDAS",
  "REATUALIZACAO",
  "APENASVERIFICARASVERSOES",
  "B",
]);

const DESTINO_DO_LIXO = "B_Vendas";

/**
 * Separadores que as pessoas usaram de verdade para listar mais de um
 * sistema. O espaço NÃO entra: "B_Pre Pedido", "Suporte Bredas" e "B_Ordem de
 * serviço" têm espaço no próprio nome, e quebrar por espaço os despedaçaria.
 */
const SEPARADORES = /\s*(?:,|;|\.|\/|\s+e\s+|\s+-\s+)\s*/i;

/**
 * Pedaços que são dois sistemas colados sem separador nenhum ("B_NFe
 * B_Importa"). Não dá para resolver quebrando por espaço -- "B_Pre Pedido" e
 * "Suporte Bredas" têm espaço no próprio nome -- então cada caso desses é
 * listado aqui e trocado pelo par já separado por vírgula.
 */
const COLADOS = new Map([["BNFEBIMPORTA", "B_NFe, B_Importa"]]);

/**
 * Devolve o texto de sistemas na forma canônica: "B_Vendas, B_NFe".
 *
 * @param {string} texto o que foi digitado
 * @param {string[]} catalogo nomes oficiais (tabela `sistemas`)
 * @returns {string} nomes canônicos separados por ", ", sem repetição e na
 *   ordem em que apareceram. Um pedaço que não casa com nada é mantido como
 *   está -- inventar um destino para o desconhecido seria pior que deixá-lo
 *   visível para alguém decidir depois.
 */
function normalizarSistemas(texto, catalogo = []) {
  const bruto = String(texto ?? "").trim();
  if (!bruto) return "";

  const oficial = new Map(catalogo.map((nome) => [chave(nome), nome]));
  const resolver = (pedacoBruto) => {
    // ", e B_importaXML": a vírgula ganha do " e " (o split é da esquerda
    // para a direita), e o "e" solto fica grudado no pedaço seguinte.
    const pedaco = String(pedacoBruto).trim().replace(/^e\s+/i, "");
    const k = chave(pedaco);
    if (!k) return null;
    if (LIXO.has(k)) return DESTINO_DO_LIXO;
    return oficial.get(k) || APELIDOS.get(k) || pedaco.trim();
  };

  // Duas passadas: a primeira quebra pelos separadores, a segunda desfaz os
  // pares colados que só aparecem DEPOIS da quebra ("B_Vendas Simples,
  // B_NFe B_Importa" só revela o par no segundo pedaço).
  const partes = bruto
    .split(SEPARADORES)
    .flatMap((parte) => (COLADOS.get(chave(parte)) || parte).split(SEPARADORES));

  const vistos = new Set();
  const saida = [];
  for (const parte of partes) {
    const nome = resolver(parte);
    if (!nome || vistos.has(nome)) continue;
    vistos.add(nome);
    saida.push(nome);
  }
  return saida.join(", ");
}

/**
 * Duas pessoas num campo só. "Marcos/Lennon" (10 registros) não é uma grafia
 * diferente de nada -- é uma dupla, e o filtro "Responsável" não sabe lidar
 * com isso. Fica com o Marcos, por decisão de quem conhece os atendimentos.
 */
const APELIDOS_RESPONSAVEL = new Map([["MARCOSLENNON", "Marcos"]]);

/**
 * Devolve o responsável na grafia já usada pela equipe.
 *
 * @param {string} nome o que foi digitado
 * @param {string[]} conhecidos responsáveis já gravados (os do banco)
 * @returns {string} a grafia canônica, ou o próprio nome se for gente nova
 */
function normalizarResponsavel(nome, conhecidos = []) {
  const bruto = String(nome ?? "").trim();
  if (!bruto) return "";
  const k = chave(bruto);
  if (APELIDOS_RESPONSAVEL.has(k)) return APELIDOS_RESPONSAVEL.get(k);
  for (const conhecido of conhecidos) {
    if (chave(conhecido) === k) return conhecido;
  }
  return bruto;
}

/**
 * Grafia canônica de cada responsável, escolhida entre as que já existem: a
 * mais usada ganha. "CAMILA"(8), "cAMILA"(1) e "camila"(4) perdem para
 * "Camila"(21) sem ninguém precisar dizer qual é a certa.
 */
function canonizarResponsaveis(ocorrencias) {
  const grupos = new Map();
  for (const { responsavel, total } of ocorrencias) {
    const k = chave(responsavel);
    if (!k) continue;
    const atual = grupos.get(k);
    if (!atual || total > atual.total) grupos.set(k, { responsavel, total });
  }
  return new Map([...grupos].map(([k, { responsavel }]) => [k, responsavel]));
}

module.exports = {
  chave,
  normalizarSistemas,
  normalizarResponsavel,
  canonizarResponsaveis,
  APELIDOS,
  LIXO,
  // Nomes que aparecem em atualizações de verdade e nunca existiram no
  // catálogo. Entram como sistema para deixarem de furar o relatório da aba
  // Sistemas.
  //
  // "CTe", "DFE", "B_Rat", "B_Vet" e "B_SYNC" também aparecem no histórico e
  // ficaram DE FORA por decisão de quem conhece os atendimentos: não são
  // sistemas. Não entram no catálogo e também não são reescritos -- a regra
  // geral de `normalizarSistemas` vale para eles, que é manter intacto o
  // pedaço que não casa com nada.
  SISTEMAS_NOVOS: ["B_NFCe", "B_Sped", "B_Vendas Simples", "B_Marques", "B_Marivet"],
};
