const { SistemaRepository } = require("./SistemaRepository");
const { normalizarSistemas } = require("../shared/normalizacao");
const { SISTEMA_SUPORTE_BREDAS } = require("../config/constants");

/**
 * Migrações numeradas do esquema. O número da última aplicada fica no
 * próprio arquivo do banco (`PRAGMA user_version`), então cada uma roda uma
 * vez só, em ordem, numa transação: ou entra inteira, ou o banco fica como
 * estava.
 *
 * Até a versão 0 o esquema crescia só com `ALTER TABLE ADD COLUMN` em
 * try/catch, repetido a cada boot (ver Database._esquemaLegado). Isso serve
 * para acrescentar coluna, mas não para MOVER dados de uma coluna para uma
 * tabela e apagar a coluna -- que é o que a migração 1 faz. Mudança nova de
 * esquema entra aqui, como a próxima versão, nunca de volta no legado.
 *
 * Ver docs/adr/0007-esquema-normalizado-e-migracoes-versionadas.md.
 */
const MIGRACOES = [
  {
    versao: 1,
    descricao: "sistemas e clientes em tabelas de ligação, cliente_id nas atualizações e agendamentos",
    aplicar: migracao1,
  },
  {
    versao: 2,
    descricao: "sistemas marcados como fixos (sem controle de versão)",
    aplicar: migracao2,
  },
  {
    versao: 3,
    descricao: "autoria e data das referências oficiais dos sistemas",
    aplicar: migracao3,
  },
];

/**
 * Antes: `atualizacoes.sistema` e `clientes.sistemas` eram listas em texto
 * ("B_Vendas, B_NFe"), `atualizacoes.versoes_sistemas` um JSON por cima da
 * lista, e o cliente de uma atualização/agendamento era ligado pelo NOME.
 *
 * Depois: `atualizacao_sistemas` (um sistema por linha, com a versão que o
 * cliente recebeu), `cliente_sistemas`, e `cliente_id` de verdade.
 */
function migracao1(conn) {
  conn.exec(`
    ALTER TABLE sistemas ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;

    CREATE TABLE cliente_sistemas (
      cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
      sistema_id INTEGER NOT NULL REFERENCES sistemas(id),
      ordem INTEGER NOT NULL,
      PRIMARY KEY (cliente_id, sistema_id)
    ) WITHOUT ROWID;
    CREATE INDEX idx_cliente_sistemas_sistema ON cliente_sistemas (sistema_id);

    -- "ordem" guarda a sequência em que os sistemas foram informados: a grade
    -- de Atualizações mostra a versão do PRIMEIRO. "versao" é a que o cliente
    -- recebeu naquele sistema, naquele atendimento; nula quando não se sabe.
    CREATE TABLE atualizacao_sistemas (
      atualizacao_id INTEGER NOT NULL REFERENCES atualizacoes(id) ON DELETE CASCADE,
      sistema_id INTEGER NOT NULL REFERENCES sistemas(id),
      ordem INTEGER NOT NULL,
      versao TEXT,
      PRIMARY KEY (atualizacao_id, sistema_id)
    ) WITHOUT ROWID;
    CREATE INDEX idx_atualizacao_sistemas_sistema ON atualizacao_sistemas (sistema_id);

    -- "cliente" (o nome) continua na tabela: é o que se mostra quando o
    -- cliente foi excluído, ou quando o atendimento foi lançado para um nome
    -- sem cadastro. Enquanto há vínculo, ele acompanha o cadastro (ver
    -- ClienteRepository.update).
    ALTER TABLE atualizacoes ADD COLUMN cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL;
    ALTER TABLE agendamentos ADD COLUMN cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL;
    CREATE INDEX idx_atualizacoes_cliente ON atualizacoes (cliente_id);
    CREATE INDEX idx_agendamentos_cliente ON agendamentos (cliente_id);

    -- 1 = as versões de atualizacao_sistemas foram capturadas sistema a
    -- sistema (atendimentos criados depois da versão oficial existir).
    -- 0 = registro legado: a verdade é o texto livre de "versao", e ela só
    -- vale por sistema quando o atendimento tinha um sistema só.
    ALTER TABLE atualizacoes ADD COLUMN versoes_por_sistema INTEGER NOT NULL DEFAULT 0;
  `);

  const sistemas = new SistemaRepository(conn);
  const catalogo = sistemas.todos().map((s) => s.nome);
  const nomesDe = (texto) => normalizarSistemas(texto, catalogo).split(", ").filter(Boolean);
  const clientes = conn.prepare("SELECT id, sistemas FROM clientes").all();
  const atualizacoes = conn.prepare("SELECT id, sistema, versao, versoes_sistemas FROM atualizacoes").all();

  // Nomes do histórico fora do catálogo (CTe, B_Rat, B_NFCe...) viram
  // sistemas INATIVOS. Cadastrados antes de tudo, do mais usado para o
  // menos usado, para que entre grafias do mesmo sistema ("DFE" e "B_DFe")
  // o nome escolhido seja o mais frequente -- os demais caem nele pela
  // equivalência de SistemaRepository.resolver.
  const usos = new Map();
  for (const texto of [...clientes.map((c) => c.sistemas), ...atualizacoes.map((a) => a.sistema)]) {
    for (const nome of nomesDe(texto)) {
      if (!sistemas.resolver(nome)) usos.set(nome, (usos.get(nome) || 0) + 1);
    }
  }
  const porUso = [...usos].sort((a, b) => b[1] - a[1] || Number(b[0].startsWith("B_")) - Number(a[0].startsWith("B_")));
  sistemas.resolverOuCriar(porUso.map(([nome]) => nome));

  const ligarCliente = conn.prepare("INSERT INTO cliente_sistemas (cliente_id, sistema_id, ordem) VALUES (?, ?, ?)");
  for (const cliente of clientes) {
    sistemas.resolverOuCriar(nomesDe(cliente.sistemas)).forEach((s, i) => ligarCliente.run(cliente.id, s.id, i));
  }

  const ligarAtualizacao = conn.prepare("INSERT INTO atualizacao_sistemas (atualizacao_id, sistema_id, ordem, versao) VALUES (?, ?, ?, ?)");
  const marcarCapturada = conn.prepare("UPDATE atualizacoes SET versoes_por_sistema = 1 WHERE id = ?");
  for (const a of atualizacoes) {
    const lista = sistemas.resolverOuCriar(nomesDe(a.sistema));
    const mapa = lerMapa(a.versoes_sistemas);
    lista.forEach((s, i) => {
      let versao = null;
      if (mapa) {
        const chaveDoMapa = Object.keys(mapa).find((nome) => sistemas.resolver(nome)?.id === s.id);
        versao = chaveDoMapa ? mapa[chaveDoMapa] || null : null;
      } else if (lista.length === 1) {
        // Legado: a versão só é inequívoca quando o atendimento tinha um
        // sistema só. Com vários, "22/09/2026" não diz de qual deles era.
        versao = a.versao || null;
      }
      ligarAtualizacao.run(a.id, s.id, i, versao);
    });
    if (mapa) marcarCapturada.run(a.id);
  }

  // Vínculo pelo nome exato; se não houver, ignorando caixa e espaços nas
  // pontas. O que não casar fica sem cliente_id, com o nome como estava --
  // são atendimentos de clientes que já foram excluídos.
  for (const tabela of ["atualizacoes", "agendamentos"]) {
    conn.exec(`
      UPDATE ${tabela} SET cliente_id = COALESCE(
        (SELECT c.id FROM clientes c WHERE c.nome = ${tabela}.cliente),
        (SELECT c.id FROM clientes c WHERE lower(trim(c.nome)) = lower(trim(${tabela}.cliente)) ORDER BY c.id LIMIT 1)
      )
      WHERE coalesce(cliente, '') != '';
      UPDATE ${tabela} SET cliente = (SELECT c.nome FROM clientes c WHERE c.id = ${tabela}.cliente_id) WHERE cliente_id IS NOT NULL;
    `);
  }

  conn.exec(`
    ALTER TABLE atualizacoes DROP COLUMN sistema;
    ALTER TABLE atualizacoes DROP COLUMN versoes_sistemas;
    ALTER TABLE clientes DROP COLUMN sistemas;
  `);
}

/**
 * Sistemas fixos: componentes que o cliente tem instalados, mas que não têm
 * "versão atrasada" -- B_Atualizador (o agente) e Suporte Bredas (acesso
 * remoto). Continuam no cadastro do cliente e no histórico; o que muda é
 * que ficam fora da situação de versão, senão todo cliente com Suporte
 * Bredas ficaria para sempre "pendente" de uma versão que não existe.
 *
 * A marca é uma coluna do catálogo, e não uma lista no código, para haver
 * um lugar só que responde "este sistema controla versão?" -- os dois nomes
 * abaixo só dão o valor inicial. Resolvidos pelo catálogo (mesma regra de
 * grafia do resto), então "ATUALIZADOR" digitado lá atrás também casa.
 */
function migracao2(conn) {
  conn.exec("ALTER TABLE sistemas ADD COLUMN controla_versao INTEGER NOT NULL DEFAULT 1");
  const sistemas = new SistemaRepository(conn);
  const marcar = conn.prepare("UPDATE sistemas SET controla_versao = 0 WHERE id = ?");
  for (const nome of ["B_Atualizador", SISTEMA_SUPORTE_BREDAS]) {
    const sistema = sistemas.resolver(nome);
    if (sistema) marcar.run(sistema.id);
  }
}

function migracao3(conn) {
  conn.exec("ALTER TABLE sistemas ADD COLUMN ultima_versao_autor TEXT");
  conn.exec("ALTER TABLE sistemas ADD COLUMN ultima_versao_em TEXT");
}

function lerMapa(texto) {
  if (texto == null) return null;
  try {
    const mapa = JSON.parse(texto);
    return mapa && typeof mapa === "object" && !Array.isArray(mapa) ? mapa : null;
  } catch {
    return null;
  }
}

/**
 * Visões de leitura, recriadas a cada boot (são só consultas salvas, não
 * guardam dado). Devolvem as tabelas com as listas de sistemas montadas de
 * volta em texto, no mesmo formato que a API sempre entregou -- é por isso
 * que o front-end não precisou mudar.
 */
function criarVisoes(conn) {
  conn.exec(`
    DROP VIEW IF EXISTS atualizacoes_v;
    CREATE VIEW atualizacoes_v AS
    SELECT a.*,
      coalesce((SELECT group_concat(s.nome, ', ' ORDER BY x.ordem)
                  FROM atualizacao_sistemas x JOIN sistemas s ON s.id = x.sistema_id
                 WHERE x.atualizacao_id = a.id), '') AS sistema,
      CASE WHEN a.versoes_por_sistema = 1 THEN
        (SELECT json_group_object(s.nome, x.versao ORDER BY x.ordem)
           FROM atualizacao_sistemas x JOIN sistemas s ON s.id = x.sistema_id
          WHERE x.atualizacao_id = a.id)
      END AS versoes_sistemas
    FROM atualizacoes a;

    DROP VIEW IF EXISTS clientes_v;
    CREATE VIEW clientes_v AS
    SELECT c.*,
      coalesce((SELECT group_concat(s.nome, ', ' ORDER BY x.ordem)
                  FROM cliente_sistemas x JOIN sistemas s ON s.id = x.sistema_id
                 WHERE x.cliente_id = c.id), '') AS sistemas
    FROM clientes c;
  `);
}

module.exports = { MIGRACOES, criarVisoes };
