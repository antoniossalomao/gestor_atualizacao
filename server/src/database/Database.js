const fs = require("fs");
const path = require("path");
const Sqlite3 = require("better-sqlite3");

const { SISTEMAS_CONHECIDOS, BACKUP_KEEP } = require("../config/constants");
const { BaseRepository } = require("./BaseRepository");
const { AtualizacaoRepository } = require("./AtualizacaoRepository");
const { ClienteRepository } = require("./ClienteRepository");
const { AgendamentoRepository } = require("./AgendamentoRepository");
const { SistemaRepository } = require("./SistemaRepository");
const { UsuarioRepository } = require("./UsuarioRepository");
const { HistoricoRepository } = require("./HistoricoRepository");
const { VersaoRepository } = require("./VersaoRepository");

/**
 * Abre a conexao SQLite, garante o schema (criando/migrando tabelas) e
 * expoe um repositorio por tabela. Equivalente de "Database" em
 * gestor/database.py -- unico lugar do programa que abre a conexao de
 * verdade; todo o resto fala com o banco atraves dos repositorios.
 */
class Database {
  /** @param {string} dbPath caminho do arquivo gestao.db */
  constructor(dbPath) {
    this.path = path.resolve(dbPath);
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    const jaExistia = fs.existsSync(this.path);

    this._open();

    // Backup do estado com que o servidor subiu, para existir sempre uma
    // copia de antes de cada vez que ele e ligado -- so faz sentido se ja
    // havia um banco de antes (nao ha o que copiar na primeirissima vez).
    // Precisa vir DEPOIS de _open(): em banco WAL, escritas recentes podem
    // estar só no arquivo "-wal" (ainda não gravadas no .db principal) --
    // _backup() faz um checkpoint pela conexão já aberta antes de copiar,
    // senão uma cópia "crua" do arquivo poderia sair incompleta.
    if (jaExistia) this._backup();
  }

  /**
   * Abre a conexao, ativa os pragmas, roda a migracao e (re)cria os
   * repositorios. Separado do constructor porque restoreFrom() precisa
   * repetir exatamente estes passos depois de trocar o arquivo do banco.
   */
  _open() {
    this.conn = new Sqlite3(this.path);
    // WAL ("Write-Ahead Logging") permite varias leituras acontecendo ao
    // mesmo tempo que uma escrita, em vez de travar o banco inteiro a cada
    // consulta -- importante agora que o app e usado por varias pessoas ao
    // mesmo tempo (no Python original, uso individual, isso nao era
    // necessario).
    this.conn.pragma("journal_mode = WAL");
    this.conn.pragma("foreign_keys = ON");

    this._migrate();

    // Um repositorio por tabela -- o resto do programa nunca escreve SQL
    // diretamente, so chama metodos tipo "db.clientes.list()".
    this.atualizacoes = new AtualizacaoRepository(this.conn);
    this.clientes = new ClienteRepository(this.conn);
    this.agendamentos = new AgendamentoRepository(this.conn);
    this.sistemas = new SistemaRepository(this.conn);
    this.usuarios = new UsuarioRepository(this.conn);
    this.historico = new HistoricoRepository(this.conn);
    this.versoes = new VersaoRepository(this.conn);
  }

  /** Cria as tabelas se nao existirem; adiciona colunas/tabelas novas de forma idempotente. */
  _migrate() {
    const conn = this.conn;

    conn.exec(`
      CREATE TABLE IF NOT EXISTS atualizacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente TEXT NOT NULL,
        sistema TEXT,
        versao TEXT,
        responsavel TEXT,
        data TEXT,
        motivo TEXT
      )
    `);
    // "maquinas" e "obs" foram adicionadas depois que o app original ja
    // estava em uso -- ALTER TABLE falha (silenciosamente ignorado aqui)
    // se a coluna ja existir, o que deixa essa migracao segura de rodar
    // toda vez que o servidor sobe.
    for (const coluna of ["maquinas", "obs"]) {
      try {
        conn.exec(`ALTER TABLE atualizacoes ADD COLUMN ${coluna} TEXT`);
      } catch (e) {
        if (!String(e.message).includes("duplicate column")) throw e;
      }
    }

    conn.exec(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT NOT NULL,
        cidade TEXT,
        sistemas TEXT
      )
    `);

    conn.exec(`
      CREATE TABLE IF NOT EXISTS agendamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tarefa TEXT NOT NULL,
        cliente TEXT,
        responsavel TEXT,
        data TEXT,
        status TEXT
      )
    `);

    conn.exec(`
      CREATE TABLE IF NOT EXISTS sistemas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL UNIQUE
      )
    `);
    const semSistemas = conn.prepare("SELECT COUNT(*) AS total FROM sistemas").get().total === 0;
    if (semSistemas) {
      const insert = conn.prepare("INSERT OR IGNORE INTO sistemas (nome) VALUES (?)");
      const insertMany = conn.transaction((nomes) => nomes.forEach((n) => insert.run(n)));
      insertMany(SISTEMAS_CONHECIDOS);
    }

    // Tabela nova (nao existia no app Python): contas de login.
    conn.exec(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        usuario TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL,
        criado_em TEXT NOT NULL
      )
    `);
    // "role" foi adicionada depois que o app ja estava em uso (ate entao
    // todo login tinha acesso total) -- mesmo padrao de ALTER TABLE
    // idempotente usado acima para "maquinas"/"obs".
    try {
      conn.exec(`ALTER TABLE usuarios ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
    } catch (e) {
      if (!String(e.message).includes("duplicate column")) throw e;
    }
    // Se nenhuma conta tem o papel de admin ainda (banco recem-migrado),
    // promove automaticamente a conta mais antiga -- garante que sempre
    // exista pelo menos um admin, sem exigir passo manual.
    const semAdmin = conn.prepare("SELECT COUNT(*) AS total FROM usuarios WHERE role = 'admin'").get().total === 0;
    if (semAdmin) {
      conn.exec("UPDATE usuarios SET role = 'admin' WHERE id = (SELECT MIN(id) FROM usuarios)");
    }

    // Tabela nova: histórico de ações (quem criou/editou/excluiu o quê).
    // "usuario_id" pode ficar nulo se a conta que fez a ação for apagada
    // depois -- por isso "usuario_nome" também é guardado como texto,
    // congelado no momento da ação, para o histórico continuar legível
    // mesmo que a conta não exista mais.
    conn.exec(`
      CREATE TABLE IF NOT EXISTS historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        usuario_nome TEXT NOT NULL,
        acao TEXT NOT NULL,
        entidade TEXT NOT NULL,
        descricao TEXT NOT NULL,
        criado_em TEXT NOT NULL
      )
    `);
    conn.exec(`CREATE INDEX IF NOT EXISTS idx_historico_criado_em ON historico (criado_em DESC)`);

    conn.exec(`
      CREATE TABLE IF NOT EXISTS versoes_atualizador (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        versao TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'rascunho',
        script_url TEXT,
        pacotes_json TEXT NOT NULL,
        observacoes TEXT,
        criado_em TEXT NOT NULL,
        criado_por INTEGER,
        publicado_em TEXT
      )
    `);
    conn.exec(`
      CREATE TABLE IF NOT EXISTS atualizador_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cnpj TEXT NOT NULL,
        hwid TEXT,
        status TEXT NOT NULL,
        detalhes TEXT,
        criado_em TEXT NOT NULL
      )
    `);
    // Colunas acrescentadas depois que a distribuicao ja estava em uso.
    // Mesmo padrao de ALTER TABLE idempotente usado em "atualizacoes":
    //
    //  - sistema: antes uma versao nao dizia A QUE sistema pertencia, entao
    //    o agente do B_VENDAS e o do B_NFE recebiam a mesma "ultima versao
    //    publicada", qualquer que fosse ela. Cada sistema tem agora a sua
    //    linha do tempo propria.
    //  - substituido_em / substituido_por: quando uma versao nova do MESMO
    //    sistema e publicada, a anterior sai de circulacao automaticamente.
    //    Guardamos quando e por quem em vez de apagar a linha: o pacote some
    //    do ar na hora (que e o efeito pedido), mas o registro de que aquela
    //    versao existiu continua no historico.
    //  - tamanho_bytes: mostrado no painel, para dar nocao do peso que os
    //    clientes vao baixar.
    for (const [tabela, coluna, tipo] of [
      ["versoes_atualizador", "sistema", "TEXT NOT NULL DEFAULT ''"],
      ["versoes_atualizador", "substituido_em", "TEXT"],
      ["versoes_atualizador", "substituido_por", "INTEGER"],
      ["versoes_atualizador", "tamanho_bytes", "INTEGER"],
      // O agente passou a informar contexto junto do status: sem isso o
      // painel so sabia "deu erro", nunca "deu erro subindo a 2026.08.10 do
      // B_VENDAS, saindo da 2026.07.02, depois de 4 minutos".
      ["atualizador_logs", "sistema", "TEXT"],
      ["atualizador_logs", "versao", "TEXT"],
      ["atualizador_logs", "versao_anterior", "TEXT"],
      ["atualizador_logs", "duracao_ms", "INTEGER"],
      ["atualizador_logs", "maquina", "TEXT"],
    ]) {
      try {
        conn.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
      } catch (e) {
        if (!String(e.message).includes("duplicate column")) throw e;
      }
    }

    conn.exec(`CREATE INDEX IF NOT EXISTS idx_versoes_status ON versoes_atualizador (status, id DESC)`);
    // A consulta mais quente do agente e "ultima publicada DESTE sistema".
    conn.exec(`CREATE INDEX IF NOT EXISTS idx_versoes_sistema ON versoes_atualizador (sistema, status, id DESC)`);
    conn.exec(`CREATE INDEX IF NOT EXISTS idx_atualizador_logs_criado_em ON atualizador_logs (criado_em DESC)`);
    conn.exec(`CREATE INDEX IF NOT EXISTS idx_atualizador_logs_cnpj ON atualizador_logs (cnpj, id DESC)`);

    this._backfillSistemaDasVersoes();
  }

  /**
   * Preenche `sistema` nas versoes cadastradas ANTES de a coluna existir, e
   * deixa no maximo uma publicada por sistema.
   *
   * Sem isto, as versoes antigas ficariam com sistema vazio: elas continuariam
   * marcadas como "publicada", mas `latestPublished(sistema)` nunca as
   * encontraria, e todo agente passaria a receber "nao ha atualizacao" sem
   * nenhum erro aparente -- o pior tipo de falha, a silenciosa.
   *
   * O sistema e deduzido do nome do pacote enviado (ex.:
   * "...-B_VENDAS-production-...exe" -> "B_Vendas"), comparando com os
   * sistemas cadastrados sem acentuacao, maiusculas nem separadores. Escolhe
   * o nome cadastrado MAIS LONGO que aparece no arquivo, para "B_Ordem" nao
   * ganhar de "B_Ordem_Servico" por acaso.
   *
   * Roda toda vez que o servidor sobe, mas so toca em linhas com sistema
   * vazio -- depois da primeira vez, nao faz nada.
   */
  _backfillSistemaDasVersoes() {
    const conn = this.conn;
    const pendentes = conn
      .prepare(`SELECT id, pacotes_json FROM versoes_atualizador WHERE sistema IS NULL OR sistema = ''`)
      .all();
    if (pendentes.length === 0) return;

    const normalizar = (texto) =>
      String(texto || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "") // tira acentuacao
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    const sistemas = conn
      .prepare(`SELECT nome FROM sistemas ORDER BY length(nome) DESC`)
      .all()
      .map((r) => ({ nome: r.nome, chave: normalizar(r.nome) }))
      .filter((s) => s.chave.length >= 4);

    const atualizar = conn.prepare(`UPDATE versoes_atualizador SET sistema = ? WHERE id = ?`);
    const resolvidos = [];
    for (const versao of pendentes) {
      let arquivos = "";
      try {
        arquivos = JSON.parse(versao.pacotes_json || "[]")
          .map((p) => p.file || "")
          .join(" ");
      } catch {
        continue;
      }
      const alvo = normalizar(arquivos);
      const achado = sistemas.find((s) => alvo.includes(s.chave));
      if (!achado) continue;
      atualizar.run(achado.nome, versao.id);
      resolvidos.push({ id: versao.id, sistema: achado.nome });
    }

    // Com o sistema preenchido, pode haver varias "publicada" do mesmo
    // sistema (antes isso nao era contradicao, porque sistema nao existia).
    // A regra nova e uma so por sistema: a mais recente fica, as outras viram
    // "substituida" -- exatamente o que teria acontecido se elas tivessem
    // sido publicadas na ordem, uma apos a outra.
    const agora = new Date().toISOString();
    conn.exec(`
      UPDATE versoes_atualizador
         SET status = 'substituida', substituido_em = '${agora}'
       WHERE status = 'publicada'
         AND sistema <> ''
         AND id NOT IN (
           SELECT MAX(id) FROM versoes_atualizador WHERE status = 'publicada' AND sistema <> '' GROUP BY sistema
         )
    `);

    if (resolvidos.length > 0) {
      console.log(
        `Migracao: sistema preenchido em ${resolvidos.length} versao(oes) do atualizador ` +
          `(${resolvidos.map((r) => `#${r.id}=${r.sistema}`).join(", ")}).`
      );
    }
    const semSistema = pendentes.length - resolvidos.length;
    if (semSistema > 0) {
      console.log(
        `Migracao: ${semSistema} versao(oes) sem sistema identificavel pelo nome do pacote. ` +
          `Elas aparecem no painel como "Sistema nao informado" e nao serao distribuidas ate serem corrigidas.`
      );
    }
  }

  close() {
    this.conn.close();
  }

  /**
   * Copia gestao.db para a pasta "backups" (ao lado dele). Qualquer falha
   * aqui (disco cheio, sem permissao) e ignorada silenciosamente: um
   * backup que falha nao pode impedir o servidor de subir nem uma
   * restauracao de continuar.
   */
  _backup() {
    if (!fs.existsSync(this.path)) return;
    try {
      // Em modo WAL, o SQLite pode manter escritas recentes só no arquivo
      // "-wal" (ao lado do .db principal), só "mesclando" tudo de volta no
      // arquivo principal de tempos em tempos. Um `fs.copyFileSync` direto
      // no .db, sem isso, arriscava copiar um backup faltando os registros
      // mais recentes. "TRUNCATE" força esse merge agora e esvazia o -wal,
      // deixando o .db principal sozinho já com tudo -- um arquivo só,
      // completo, do jeito que os backups do app original (SQLite sem WAL)
      // sempre foram.
      this.conn.pragma("wal_checkpoint(TRUNCATE)");

      const dir = path.join(path.dirname(this.path), "backups");
      fs.mkdirSync(dir, { recursive: true });
      const stamp = timestamp();
      const { name, ext } = path.parse(this.path);
      const destino = path.join(dir, `${name}_${stamp}${ext}`);
      fs.copyFileSync(this.path, destino);

      // Mantem so os BACKUP_KEEP mais recentes.
      const existentes = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith(`${name}_`) && f.endsWith(ext))
        .sort();
      const antigos = existentes.slice(0, Math.max(0, existentes.length - BACKUP_KEEP));
      for (const arquivo of antigos) fs.rmSync(path.join(dir, arquivo), { force: true });
    } catch {
      // silencioso de proposito -- ver comentario acima
    }
  }

  /**
   * Backups disponiveis, mais recente primeiro: lista de { arquivo, label }.
   * Usado pela tela de Backups para o usuario escolher um ponto no tempo.
   */
  listBackups() {
    const dir = path.join(path.dirname(this.path), "backups");
    if (!fs.existsSync(dir)) return [];
    const { name, ext } = path.parse(this.path);
    const arquivos = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${name}_`) && f.endsWith(ext))
      .sort()
      .reverse();
    return arquivos.map((arquivo) => {
      const stamp = arquivo.slice(name.length + 1, arquivo.length - ext.length);
      return { arquivo, label: formatStamp(stamp) || arquivo };
    });
  }

  /**
   * Restaura o banco a partir de um dos arquivos de backups/. `arquivo`
   * precisa ser exatamente um nome devolvido por listBackups() -- nunca um
   * caminho vindo direto do cliente HTTP, para nao abrir brecha de "path
   * traversal" (ex.: alguem mandando "../../windows/system32/algo").
   * Faz um backup do estado atual antes de sobrescrever, por seguranca.
   */
  restoreFrom(arquivo) {
    const valido = this.listBackups().some((b) => b.arquivo === arquivo);
    if (!valido) throw new Error("Backup não encontrado.");
    const dir = path.join(path.dirname(this.path), "backups");
    const origem = path.join(dir, arquivo);

    // Backup de seguranca do estado atual, ANTES de sobrescrever --
    // restaurar e uma acao que a tela nao deixa desfazer, entao vale a
    // pena poder voltar atras manualmente se algo der errado. Precisa
    // acontecer com a conexao AINDA aberta (_backup faz um checkpoint do
    // WAL por ela) -- por isso vem antes do close() logo abaixo.
    this._backup();
    this.conn.close();

    // Restos de uma sessao WAL anterior deste MESMO arquivo (this.path)
    // ficariam "presos" a ele por posição/tamanho -- copiar um banco
    // diferente por cima sem limpar esses restos arriscaria o SQLite
    // tentar aplicar um WAL que não corresponde mais ao conteúdo novo.
    fs.rmSync(`${this.path}-wal`, { force: true });
    fs.rmSync(`${this.path}-shm`, { force: true });
    fs.copyFileSync(origem, this.path);

    this._open();
  }
}

/** "20260817_143000" -> "17/08/2026 14:30:00" (ou null se o formato nao bater). */
function formatStamp(stamp) {
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (!m) return null;
  const [, ano, mes, dia, h, min, s] = m;
  return `${dia}/${mes}/${ano} ${h}:${min}:${s}`;
}

/** Data/hora atual no formato usado no nome dos arquivos de backup. */
function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

module.exports = { Database, BaseRepository };
