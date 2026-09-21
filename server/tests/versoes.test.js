/*
 * Testes do VersaoService -- o contrato com os agentes C# instalados nos
 * clientes. E' a superficie de maior consequencia do sistema: o que sai daqui
 * vira download e execucao automatica no servidor de um cliente, sem ninguem
 * olhando.
 *
 * Quatro comportamentos concentram o risco:
 *
 *  - **comparacao de versao.** Se errar para MENOS, o cliente nunca atualiza
 *    (silencioso). Se errar para MAIS, o agente baixa e aplica um pacote que
 *    nao deveria -- com o banco dele em shutdown no meio do caminho.
 *  - **travessia de caminho no download.** O nome do arquivo vem da URL. Um
 *    "../.." ali serviria arquivo de fora da pasta de pacotes.
 *  - **a pausa.** E' a chave geral para segurar todos os agentes de um cliente
 *    sem desinstalar nada. Se vazar, o agente continua atualizando.
 *  - **validacao do pacote.** Um pacote sem SHA-256 tira do agente a unica
 *    defesa contra download truncado.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Database } = require("../src/database/Database");
const { HistoricoService } = require("../src/services/HistoricoService");
const { VersaoService } = require("../src/services/VersaoService");

const ADMIN = { id: 1, nome: "Admin", role: "admin" };

function ambiente() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gestor-ver-"));
  const db = new Database(path.join(tmpDir, "gestao.db"));
  const service = new VersaoService(db, new HistoricoService(db));
  const cleanup = () => {
    try {
      db.conn.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, service, tmpDir, cleanup };
}

const PACOTE = [{ file: "app.zip", url: "http://x/app.zip", sha256: "a".repeat(64) }];

/**
 * Cadastra e publica uma versão, devolvendo o id.
 *
 * O arquivo do pacote é criado em disco de propósito: `publish()` se recusa a
 * publicar uma versão cujo pacote não existe no servidor -- proteção legítima,
 * porque publicar assim entregaria aos agentes um link de download quebrado, e
 * o erro só apareceria no cliente.
 */
function publicar(env, sistema, versao) {
  fs.mkdirSync(env.service.packagesDir, { recursive: true });
  fs.writeFileSync(path.join(env.service.packagesDir, PACOTE[0].file), "conteudo de teste");
  const inserida = env.db.versoes.insert(cadastro(env, sistema, versao));
  env.service.publish(inserida.id, ADMIN);
  return inserida.id;
}

/**
 * Dados prontos para `versoes.insert`. `criadoEm`/`criadoPor` são preenchidos
 * por `VersaoService.create()` no fluxo real (que também cuida do upload do
 * arquivo); aqui os testes inserem direto, então precisam fornecê-los.
 */
function cadastro(env, sistema, versao) {
  return {
    ...env.service._validate({ sistema, versao, pacotes: PACOTE }),
    criadoEm: new Date().toISOString(),
    criadoPor: ADMIN.nome,
  };
}

test("VersaoService - validação da versão publicada", async (t) => {
  const env = ambiente();
  try {
    await t.test("sistema é obrigatório", () => {
      assert.throws(() => env.service._validate({ versao: "1.0", pacotes: PACOTE }), /Escolha a qual sistema/);
    });

    await t.test("aceita os formatos de versão usados de verdade", () => {
      for (const v of ["1.0", "1.0.0", "2026.08.10", "1.2.3.4", "1.0.0-beta.1"]) {
        assert.doesNotThrow(() => env.service._validate({ sistema: "B_Vendas", versao: v, pacotes: PACOTE }), `"${v}"`);
      }
    });

    await t.test("recusa o que não é versão", () => {
      for (const v of ["", "versao-nova", "1", "v1.0", "1.0.", "...."]) {
        assert.throws(
          () => env.service._validate({ sistema: "B_Vendas", versao: v, pacotes: PACOTE }),
          /versão válida/,
          `"${v}" não deveria passar`
        );
      }
    });

    await t.test("exige pelo menos um pacote", () => {
      assert.throws(() => env.service._validate({ sistema: "B_Vendas", versao: "1.0", pacotes: [] }), /pelo menos um pacote/);
    });

    await t.test("grupo piloto exige códigos de clientes cadastrados", () => {
      env.db.clientes.insert("CLI-001", "Cliente piloto", "Recife", "B_Vendas", null);
      assert.throws(() => env.service._validate({ sistema: "B_Vendas", versao: "1.0.0", pacotes: PACOTE, alcance: "piloto" }), /ao menos um cliente/);
      assert.throws(() => env.service._validate({ sistema: "B_Vendas", versao: "1.0.0", pacotes: PACOTE, alcance: "piloto", codigosPiloto: '["INEXISTENTE"]' }), /não cadastrado/);
      assert.deepEqual(JSON.parse(env.service._validate({ sistema: "B_Vendas", versao: "1.0.0", pacotes: PACOTE, alcance: "piloto", codigosPiloto: '["cli-001", "CLI-001"]' }).codigosClientesJson), ["CLI-001"]);
    });

    await t.test("exige arquivo, URL e SHA-256 em CADA pacote", () => {
      // O SHA-256 é a única defesa do agente contra um download truncado: em
      // HTTP, um pacote pela metade chega "com sucesso" e só quebraria lá na
      // frente, no meio da Fase 3, com o banco do cliente já em shutdown.
      const incompletos = [
        [{ url: "u", sha256: "h" }],
        [{ file: "f", sha256: "h" }],
        [{ file: "f", url: "u" }],
      ];
      for (const pacotes of incompletos) {
        assert.throws(() => env.service._validate({ sistema: "B_Vendas", versao: "1.0", pacotes }), /arquivo, URL e SHA-256/);
      }
    });

    await t.test("JSON malformado nos pacotes vira erro explicado", () => {
      assert.throws(
        () => env.service._validate({ sistema: "B_Vendas", versao: "1.0", pacotes: "{isso não é json" }),
        /JSON válido/
      );
    });
  } finally {
    env.cleanup();
  }
});

test("VersaoService - piloto, promoção e rollback", async (t) => {
  const env = ambiente();
  try {
    env.db.clientes.insert("CLI-001", "Cliente piloto", "Recife", "B_Vendas", null);
    const producaoId = publicar(env, "B_Vendas", "1.0.0");
    const piloto = env.db.versoes.insert({ ...cadastro(env, "B_Vendas", "2.0.0"), alcance: "piloto", codigosClientesJson: JSON.stringify(["CLI-001"]) });
    env.service.publish(piloto.id, ADMIN);

    assert.equal(env.service.check("cli001", "1.0.0", "B_Vendas").version, "2.0.0");
    assert.equal(env.service.check("OUTRO-CLIENTE", "0.9.0", "B_Vendas").version, "1.0.0");
    assert.equal(env.db.versoes.find(producaoId).status, "publicada", "piloto não substitui produção");

    env.service.promover(piloto.id, ADMIN);
    assert.equal(env.db.versoes.find(producaoId).status, "substituida");
    assert.equal(env.db.versoes.find(piloto.id).status, "publicada");

    const resultado = env.service.rollback(piloto.id, ADMIN);
    assert.equal(resultado.versao.versao, "1.0.0");
    assert.equal(env.db.versoes.find(producaoId).status, "publicada");
    assert.equal(env.db.versoes.find(piloto.id).status, "substituida");
  } finally { env.cleanup(); }
});

test("VersaoService - check(): o que o agente recebe", async (t) => {
  const env = ambiente();
  try {
    publicar(env, "B_Vendas", "2.0.0");

    await t.test("sistema é obrigatório no parâmetro", () => {
      assert.throws(() => env.service.check("C001", "1.0.0", ""), /Informe o sistema/);
    });

    await t.test("versão mais nova disponível → update_available", () => {
      const r = env.service.check("C001", "1.0.0", "B_Vendas");
      assert.equal(r.update_available, true);
      assert.equal(r.version, "2.0.0");
      assert.deepEqual(r.packages, PACOTE, "o agente precisa dos pacotes com hash");
    });

    await t.test("já na versão mais nova → nada a fazer", () => {
      assert.equal(env.service.check("C001", "2.0.0", "B_Vendas").update_available, false);
    });

    await t.test("cliente à FRENTE da publicada não recebe downgrade", () => {
      // Errar aqui para mais faria o agente "atualizar" para uma versão
      // anterior -- aplicando scripts já aplicados, com o banco em shutdown.
      assert.equal(env.service.check("C001", "3.0.0", "B_Vendas").update_available, false);
    });

    await t.test("compara número a número, não texto a texto", () => {
      // "10" < "9" em ordem alfabética. Se a comparação fosse de string, um
      // cliente na 1.9.0 nunca receberia a 1.10.0 -- e ninguém perceberia,
      // porque "não atualizou" não gera erro nenhum.
      const env2 = ambiente();
      try {
        publicar(env2, "B_Teste", "1.10.0");
        assert.equal(env2.service.check("C001", "1.9.0", "B_Teste").update_available, true);
        assert.equal(env2.service.check("C001", "1.10.0", "B_Teste").update_available, false);
      } finally {
        env2.cleanup();
      }
    });

    await t.test("agente sem versão informada recebe a atualização", () => {
      // Instalação nova: sem versão anterior, tudo é mais novo que "0.0.0".
      assert.equal(env.service.check("C001", "", "B_Vendas").update_available, true);
      assert.equal(env.service.check("C001", undefined, "B_Vendas").update_available, true);
    });

    await t.test("sistema sem versão publicada → nada a fazer", () => {
      assert.equal(env.service.check("C001", "1.0.0", "Sistema_Inexistente").update_available, false);
    });

    await t.test("versão só cadastrada (não publicada) não é oferecida", () => {
      env.db.versoes.insert(cadastro(env, "B_Rascunho", "9.9.9")); // sem publish()
      assert.equal(env.service.check("C001", "1.0.0", "B_Rascunho").update_available, false);
    });
  } finally {
    env.cleanup();
  }
});

test("VersaoService - pausa do agente", async (t) => {
  const env = ambiente();
  try {
    publicar(env, "B_Vendas", "2.0.0");
    // O agente precisa existir (ter se comunicado) para poder ser pausado.
    env.service.log({ cnpj: "C001", status: "OK", sistema: "B_Vendas", versao: "1.0.0" });

    await t.test("agente pausado não recebe atualização, mesmo pedindo", () => {
      // Rede de segurança: o Worker atual consulta /update/status antes e nem
      // chegaria aqui. Mas um agente rodando versão antiga -- que não sabe
      // perguntar sobre pausa -- não pode continuar recebendo pacotes só por
      // isso. A pausa tem que valer nos DOIS caminhos.
      env.service.pausarAgente("C001", ADMIN, "manutenção no cliente");

      const r = env.service.check("C001", "1.0.0", "B_Vendas");
      assert.equal(r.update_available, false);
      assert.equal(r.pausado, true, "e o agente fica sabendo por quê");
    });

    await t.test("retomar volta a oferecer", () => {
      env.service.retomarAgente("C001", ADMIN);
      assert.equal(env.service.check("C001", "1.0.0", "B_Vendas").update_available, true);
    });

    await t.test("a pausa é por cliente, não global", () => {
      env.service.log({ cnpj: "C002", status: "OK", sistema: "B_Vendas", versao: "1.0.0" });
      env.service.pausarAgente("C001", ADMIN, "só este");
      assert.equal(env.service.check("C001", "1.0.0", "B_Vendas").update_available, false);
      assert.equal(env.service.check("C002", "1.0.0", "B_Vendas").update_available, true);
    });
  } finally {
    env.cleanup();
  }
});

test("VersaoService - download não sai da pasta de pacotes", async (t) => {
  const env = ambiente();
  try {
    fs.mkdirSync(env.service.packagesDir, { recursive: true });
    fs.writeFileSync(path.join(env.service.packagesDir, "app.zip"), "conteudo");
    // Um arquivo sensível FORA da pasta de pacotes, ao lado do banco.
    fs.writeFileSync(path.join(env.tmpDir, "gestao.db-segredo"), "nao deveria sair daqui");

    await t.test("pacote existente é servido", () => {
      assert.equal(env.service.download("app.zip"), path.join(env.service.packagesDir, "app.zip"));
    });

    await t.test("travessia de caminho é barrada", () => {
      // O nome vem da URL (/api/update/packages/:filename), ou seja, de quem
      // chama. `path.basename` descarta qualquer parte de diretório antes de
      // montar o caminho final.
      for (const ataque of [
        "../gestao.db-segredo",
        "../../gestao.db-segredo",
        "..\\..\\gestao.db-segredo",
        "/etc/passwd",
        "C:\\Windows\\win.ini",
        "..",
        ".",
        "",
      ]) {
        assert.throws(() => env.service.download(ataque), /não encontrado/, `"${ataque}" não pode ser servido`);
      }
    });

    await t.test("pacote inexistente dá erro, não caminho inválido", () => {
      assert.throws(() => env.service.download("nao-existe.zip"), /não encontrado/);
    });
  } finally {
    env.cleanup();
  }
});

test("VersaoService - log vindo do agente", async (t) => {
  const env = ambiente();
  try {
    await t.test("CNPJ e status são obrigatórios", () => {
      assert.throws(() => env.service.log({ status: "OK" }), /obrigatórios/);
      assert.throws(() => env.service.log({ cnpj: "C001" }), /obrigatórios/);
    });

    await t.test("aceita os nomes de campo em português E em inglês", () => {
      // O agente C# manda em inglês em alguns campos (version, previous_version,
      // duration_ms, phase, details); a tela usa os nomes em português. Aceitar
      // os dois evita um mapeamento a mais no meio do caminho.
      env.service.log({
        cnpj: "C001",
        status: "ok",
        system: "B_Vendas",
        version: "2.0.0",
        previous_version: "1.0.0",
        duration_ms: 1234,
        phase: "fase4",
        details: "tudo certo",
      });
      const linha = env.db.conn.prepare("SELECT * FROM atualizador_logs ORDER BY id DESC LIMIT 1").get();
      assert.equal(linha.sistema, "B_Vendas");
      assert.equal(linha.versao, "2.0.0");
      assert.equal(linha.versao_anterior, "1.0.0");
      assert.equal(linha.duracao_ms, 1234);
      assert.equal(linha.fase, "fase4");
    });

    await t.test("status é normalizado para maiúsculas", () => {
      // A classificação do painel compara com "OK"/"ERRO" em caixa alta; um
      // agente mandando "ok" cairia em "desconhecido" na tela.
      const linha = env.db.conn.prepare("SELECT status FROM atualizador_logs ORDER BY id DESC LIMIT 1").get();
      assert.equal(linha.status, "OK");
    });

    await t.test("duração não numérica vira null, não NaN", () => {
      env.service.log({ cnpj: "C002", status: "ERRO", duracaoMs: "não é número" });
      const linha = env.db.conn.prepare("SELECT duracao_ms FROM atualizador_logs ORDER BY id DESC LIMIT 1").get();
      assert.equal(linha.duracao_ms, null);
    });
  } finally {
    env.cleanup();
  }
});
