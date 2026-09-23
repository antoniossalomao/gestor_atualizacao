const fs = require("fs");
const path = require("path");
const Sqlite3 = require("better-sqlite3");

const { SISTEMAS_CONHECIDOS, SISTEMA_SUPORTE_BREDAS, OBS_SUPORTE_BREDAS } = require("../config/constants");
const { lerRegra } = require("../config/regrasEquipe");
const { BaseRepository } = require("./BaseRepository");
const { AtualizacaoRepository } = require("./AtualizacaoRepository");
const { ClienteRepository } = require("./ClienteRepository");
const { ClienteAcessoRepository } = require("./ClienteAcessoRepository");
const { AgendamentoRepository } = require("./AgendamentoRepository");
const { SistemaRepository } = require("./SistemaRepository");
const { UsuarioRepository } = require("./UsuarioRepository");
const { HistoricoRepository } = require("./HistoricoRepository");
const { VersaoRepository } = require("./VersaoRepository");
const { ConfiguracaoSistemaRepository } = require("./ConfiguracaoSistemaRepository");

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
    this.clienteAcessos = new ClienteAcessoRepository(this.conn);
    this.agendamentos = new AgendamentoRepository(this.conn);
    this.sistemas = new SistemaRepository(this.conn);
    this.usuarios = new UsuarioRepository(this.conn);
    this.historico = new HistoricoRepository(this.conn);
    this.versoes = new VersaoRepository(this.conn);
    this.configuracoesSistema = new ConfiguracaoSistemaRepository(this.conn);
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

    // Tabela nova (nao existia no app Python): acessos remotos (AnyDesk /
    // Suporte Bredas) de cada maquina de um cliente -- aba Clientes, botao
    // "Acessos". "ON DELETE CASCADE" (com "foreign_keys = ON" ligado acima)
    // apaga os acessos junto quando o cliente e excluido, sem precisar de
    // um passo manual em ClienteRepository.
    conn.exec(`
      CREATE TABLE IF NOT EXISTS cliente_acessos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
        maquina TEXT NOT NULL,
        anydesk TEXT,
        suporte_bredas TEXT,
        observacoes TEXT
      )
    `);
    conn.exec(`CREATE INDEX IF NOT EXISTS idx_cliente_acessos_cliente ON cliente_acessos (cliente_id)`);

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
    // "Suporte Bredas" foi adicionado ao catalogo depois que bancos ja
    // existentes tinham sido semeados (o bloco acima so roda na tabela
    // vazia) -- garante ele aqui tambem, fora do "semSistemas", pra
    // aparecer como checkbox na aba Clientes mesmo em instalacoes antigas.
    conn.prepare("INSERT OR IGNORE INTO sistemas (nome) VALUES (?)").run(SISTEMA_SUPORTE_BREDAS);

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
    // "ultimo_login" -- mesmo padrao de ALTER TABLE idempotente. Sem isso, a
    // tela de Usuarios so dizia quem TEM conta, nunca quem de fato a usa;
    // fica nulo para quem nunca entrou desde que a coluna passou a existir.
    try {
      conn.exec(`ALTER TABLE usuarios ADD COLUMN ultimo_login TEXT`);
    } catch (e) {
      if (!String(e.message).includes("duplicate column")) throw e;
    }
    // Migração de papéis: contas legadas com papel 'user' viram 'operador';
    // quaisquer outros papéis desconhecidos também viram 'operador'.
    // (Antes havia aqui uma linha que promovia um usuário específico pelo nome
    // de login -- removida: a promoção já rodou em todos os bancos existentes
    // e manter o nome no código-fonte expõe informação desnecessária.)
    try {
      conn.exec("UPDATE usuarios SET role = 'operador' WHERE role = 'user'");
      conn.exec("UPDATE usuarios SET role = 'operador' WHERE role NOT IN ('admin', 'operador', 'consulta')");
    } catch {
      /* tabela pode ainda estar sendo criada */
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
    // Preferencias de apresentacao (tema, cor, densidade, linhas por pagina...)
    // POR CONTA, e nao por navegador.
    //
    // Elas viviam so no localStorage, o que na pratica significava: trocar de
    // maquina, usar o Edge em vez do Chrome ou limpar os dados do site
    // devolvia o app aos padroes. Pior, num computador compartilhado as
    // escolhas de uma pessoa apareciam para a seguinte, porque o localStorage
    // nao sabe quem esta logado.
    //
    // Um JSON inteiro numa coluna, e nao uma linha por chave: o conjunto e
    // sempre lido e gravado de uma vez so (a tela aplica tudo junto), nunca
    // ha consulta por chave individual, e assim acrescentar uma preferencia
    // nova nao pede migracao nenhuma.
    conn.exec(`
      CREATE TABLE IF NOT EXISTS usuario_preferencias (
        usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
        prefs_json TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
      )
    `);

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
      ["versoes_atualizador", "alcance", "TEXT NOT NULL DEFAULT 'geral'"],
      ["versoes_atualizador", "codigos_clientes_json", "TEXT NOT NULL DEFAULT '[]'"],
      // O agente passou a informar contexto junto do status: sem isso o
      // painel so sabia "deu erro", nunca "deu erro subindo a 2026.08.10 do
      // B_VENDAS, saindo da 2026.07.02, depois de 4 minutos".
      ["atualizador_logs", "sistema", "TEXT"],
      ["atualizador_logs", "versao", "TEXT"],
      ["atualizador_logs", "versao_anterior", "TEXT"],
      ["atualizador_logs", "duracao_ms", "INTEGER"],
      ["atualizador_logs", "maquina", "TEXT"],
      // "fase": em qual etapa da Fase 3 (shutdown/backup_pre/scripts/copia_arquivos/
      // injecao_binarios/online/backup_pos/concluido) o agente estava. Sem isso, um
      // ERRO so dizia a mensagem crua da excecao, nunca ONDE no processo aconteceu.
      ["atualizador_logs", "fase", "TEXT"],
      // "grupo": agrupa clientes com varias unidades sob uma rede/franquia
      // (ex.: sete lojas da mesma rede) -- so um rotulo de texto livre, nao
      // uma tabela propria, para nao exigir migrar cadastros existentes.
      ["clientes", "grupo", "TEXT"],
      // criado_em/concluido_em: sem isso nao havia como medir quanto tempo
      // uma tarefa fica aberta. criado_em so passa a ser preenchido a
      // partir de agora (INSERT novo) -- tarefas antigas ficam com
      // criado_em nulo e sao ignoradas no calculo de tempo medio, em vez de
      // inventar uma data que nao aconteceu de verdade.
      ["agendamentos", "criado_em", "TEXT"],
      ["agendamentos", "concluido_em", "TEXT"],
      // "horario": opcional -- nem toda tarefa tem uma hora marcada, so a
      // data. Texto "HH:MM" (24h), mesmo padrao "guardar como texto e
      // converter so na hora de ordenar" ja usado por "data".
      ["agendamentos", "horario", "TEXT"],
      // "arquivado_em": tarefa concluida ha bastante tempo sai da lista do
      // dia a dia sozinha (ver AgendamentoService.arquivarAntigas). Uma
      // coluna, e nao um DELETE, porque a tarefa arquivada continua contando
      // no tempo medio de resolucao por responsavel do Resumo -- apagar a
      // linha limparia a tela e estragaria a metrica no mesmo gesto.
      ["agendamentos", "arquivado_em", "TEXT"],
      ["agendamentos", "revisao", "INTEGER NOT NULL DEFAULT 1"],
      ["agendamentos", "atualizado_em", "TEXT"],
      ["agendamentos", "atualizado_por", "TEXT"],
      ["atualizacoes", "revisao", "INTEGER NOT NULL DEFAULT 1"],
      ["atualizacoes", "atualizado_em", "TEXT"],
      ["atualizacoes", "atualizado_por", "TEXT"],
      ["clientes", "revisao", "INTEGER NOT NULL DEFAULT 1"],
      ["clientes", "atualizado_em", "TEXT"],
      ["clientes", "atualizado_por", "TEXT"],
      ["historico", "detalhes_json", "TEXT"],
    ]) {
      try {
        conn.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
      } catch (e) {
        if (!String(e.message).includes("duplicate column")) throw e;
      }
    }

    // Migração compatível com a implementação inicial do piloto, que chamava
    // CODIGO_CLIENTE de CNPJ. Bancos novos nunca recebem a coluna antiga.
    const colunasVersao = conn.prepare("PRAGMA table_info(versoes_atualizador)").all().map((coluna) => coluna.name);
    if (colunasVersao.includes("cnpjs_json")) {
      conn.exec(`UPDATE versoes_atualizador
        SET codigos_clientes_json = cnpjs_json
        WHERE codigos_clientes_json = '[]' AND cnpjs_json IS NOT NULL AND cnpjs_json != '[]'`);
    }

    conn.exec(`CREATE INDEX IF NOT EXISTS idx_versoes_status ON versoes_atualizador (status, id DESC)`);
    // A consulta mais quente do agente e "ultima publicada DESTE sistema".
    conn.exec(`CREATE INDEX IF NOT EXISTS idx_versoes_sistema ON versoes_atualizador (sistema, status, id DESC)`);
    conn.exec(`CREATE INDEX IF NOT EXISTS idx_atualizador_logs_criado_em ON atualizador_logs (criado_em DESC)`);
    conn.exec(`CREATE INDEX IF NOT EXISTS idx_atualizador_logs_cnpj ON atualizador_logs (cnpj, id DESC)`);

    // Guarda so os agentes que estao EM ALERTA agora (offline/erro) -- uma
    // linha aqui significa "ja avisamos o Discord disso, nao avisar de novo
    // todo ciclo". Sai da tabela assim que o agente normaliza (ver
    // AlertaAgenteService), entao ela fica pequena de proposito.
    conn.exec(`
      CREATE TABLE IF NOT EXISTS agente_alertas (
        cnpj TEXT PRIMARY KEY,
        situacao TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
      )
    `);

    // Pausa remota de um agente (aba Distribuicao, botao "Pausar"). Uma
    // linha aqui significa "o Worker C# desse CNPJ nao deve verificar nem
    // aplicar atualizacao nenhuma ate ser retomado" -- consultado tanto por
    // VersaoService.check() (rede de seguranca para agentes antigos que
    // ainda nao tem o pre-check dedicado) quanto pelo endpoint
    // /update/status/:cnpj (o que o Worker consulta a cada ciclo saudavel).
    // Ao contrario de agente_alertas, NAO sai sozinha: so quando um humano
    // manda retomar.
    conn.exec(`
      CREATE TABLE IF NOT EXISTS agente_pausas (
        cnpj TEXT PRIMARY KEY,
        motivo TEXT,
        pausado_em TEXT NOT NULL,
        pausado_por INTEGER
      )
    `);

    // Chave-valor para configurações do sistema como um todo (não da conta
    // de quem está logado) -- ver ConfiguracaoSistemaRepository. Hoje só
    // guarda "atualizador_habilitado", que liga/desliga as telas de
    // Distribuição/Versões e o alerta de agente offline sem precisar
    // reiniciar o servidor nem editar o .env.
    conn.exec(`
      CREATE TABLE IF NOT EXISTS configuracoes_sistema (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
      )
    `);

    this._backfillSistemaDasVersoes();
    this._backfillSuporteBredas();
  }

  /**
   * Marca "Suporte Bredas" em todo cliente que ja tem uma atualizacao com
   * essa observacao registrada no historico, mas que ainda nao tinha o
   * sistema marcado -- cobre os registros lancados ANTES desta migracao
   * existir (ver AtualizacaoService._marcarSuporteBredasSeNecessario, que
   * cobre os registros DAQUI PRA FRENTE). Roda toda vez que o servidor
   * sobe, mas so grava quando falta marcar algo -- depois da primeira vez
   * que cada cliente for coberto, vira no-op pra ele (ver
   * ClienteRepository.adicionarSistema).
   */
  _backfillSuporteBredas() {
    const conn = this.conn;
    const clientes = conn
      .prepare(`SELECT DISTINCT cliente FROM atualizacoes WHERE lower(obs) LIKE '%' || ? || '%'`)
      .all(OBS_SUPORTE_BREDAS)
      .map((r) => r.cliente);
    if (clientes.length === 0) return;

    const buscar = conn.prepare("SELECT id, sistemas FROM clientes WHERE nome = ?");
    const atualizar = conn.prepare("UPDATE clientes SET sistemas = ? WHERE id = ?");
    let afetados = 0;
    for (const cliente of clientes) {
      const row = buscar.get(cliente);
      if (!row) continue;
      const sistemas = (row.sistemas || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (sistemas.includes(SISTEMA_SUPORTE_BREDAS)) continue;
      sistemas.push(SISTEMA_SUPORTE_BREDAS);
      atualizar.run(sistemas.join(", "), row.id);
      afetados += 1;
    }
    if (afetados > 0) {
      console.log(`Migracao: "${SISTEMA_SUPORTE_BREDAS}" marcado automaticamente para ${afetados} cliente(s) com essa observacao no historico.`);
    }
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
      const { name, ext } = path.parse(this.path);
      // O carimbo tem resolucao de SEGUNDOS, entao duas copias no mesmo segundo
      // gerariam o mesmo nome -- e `copyFileSync` sobrescreve sem avisar. Na
      // pratica isso acontece no caminho mais delicado que existe aqui:
      // `restoreFrom` faz uma copia de seguranca do estado atual logo antes de
      // restaurar, e essa copia pode cair no mesmo segundo de um backup que ja
      // existia, apagando-o. Perder um backup em silencio e' exatamente o tipo
      // de falha que so se descobre no dia em que ele faz falta.
      //
      // Subir o carimbo para milissegundos mudaria o formato do nome de todos
      // os backups ja existentes; acrescentar um sufixo so no caso de colisao
      // mantem o nome de sempre no caso normal. `formatStamp` nao reconhece o
      // sufixo e devolve null, e `listBackups` ja cai no proprio nome do
      // arquivo como rotulo nesse caso -- degrada sozinho, sem quebrar a tela.
      const arquivoBackup = nomeLivre(dir, name, timestamp(), ext);
      const destino = path.join(dir, arquivoBackup);
      fs.copyFileSync(this.path, destino);

      // Confere se a cópia recém-feita abre e passa no integrity_check do
      // próprio SQLite -- ver _verificarIntegridadeBackup. Different do
      // resto deste método: uma cópia corrompida NÃO fica silenciosa,
      // porque ela anula o propósito de existir um backup (a corrupção só
      // seria descoberta no pior momento possível -- tentando restaurar de
      // verdade, talvez meses depois).
      const integro = this._verificarIntegridadeBackup(destino);
      if (!integro) {
        console.error(
          `ATENCAO: o backup "${arquivoBackup}" falhou na verificacao de integridade (PRAGMA integrity_check) -- pode estar corrompido.`
        );
      }
      const verificacoes = this._lerVerificacoesBackup(dir);
      verificacoes[arquivoBackup] = integro;

      // Mantem so os N mais recentes -- N e regra da equipe (Administracao),
      // lida direto do repositorio porque o Database esta abaixo dos
      // servicos e nao pode depender de ConfiguracaoSistemaService.
      const existentes = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith(`${name}_`) && f.endsWith(ext))
        .sort();
      const antigos = existentes.slice(0, Math.max(0, existentes.length - lerRegra(this.configuracoesSistema, "backupsManter")));
      for (const arquivo of antigos) {
        fs.rmSync(path.join(dir, arquivo), { force: true });
        delete verificacoes[arquivo];
      }
      this._salvarVerificacoesBackup(dir, verificacoes);
    } catch {
      // silencioso de proposito -- ver comentario acima (a checagem de
      // integridade em si NAO e silenciosa, so este envelope de fora, que
      // cobre falha de disco/permissao ao copiar o arquivo)
    }
  }

  /**
   * Abre o arquivo de backup numa conexao PROPRIA, so de leitura (nunca a
   * `this.conn` principal, que o resto do programa esta usando), e roda o
   * `PRAGMA integrity_check` nativo do SQLite -- confere a estrutura interna
   * do arquivo inteiro (paginas, indices, etc.), nao so "o arquivo existe e
   * abre sem erro imediato".
   * @returns {boolean} true se o backup passou na verificacao
   */
  _verificarIntegridadeBackup(caminho) {
    let conexaoTeste;
    try {
      conexaoTeste = new Sqlite3(caminho, { readonly: true });
      const resultado = conexaoTeste.pragma("integrity_check");
      return resultado.length === 1 && resultado[0].integrity_check === "ok";
    } catch {
      return false;
    } finally {
      conexaoTeste?.close();
      // O arquivo copiado carrega no proprio cabecalho a flag "journal_mode
      // = WAL" (e' parte do formato do arquivo, nao da conexao) -- so' de
      // ABRIR essa copia, mesmo so' de leitura, o SQLite cria os arquivos
      // "-shm"/"-wal" ao lado dela. Sem limpar isso aqui, cada verificacao
      // sujaria a pasta de backups com dois arquivos extras por backup,
      // quebrando a premissa de "um arquivo so, completo" que o
      // wal_checkpoint(TRUNCATE) la em cima existe pra garantir.
      fs.rmSync(`${caminho}-shm`, { force: true });
      fs.rmSync(`${caminho}-wal`, { force: true });
    }
  }

  /** Mapa { nome-do-arquivo: true|false }, lido de backups/verificacoes.json (ver listBackups). */
  _lerVerificacoesBackup(dir) {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, "verificacoes.json"), "utf8"));
    } catch {
      return {};
    }
  }

  /** Falha ao salvar (disco cheio, permissao) nao pode impedir o backup em si -- so a marcação de status se perde. */
  _salvarVerificacoesBackup(dir, mapa) {
    try {
      fs.writeFileSync(path.join(dir, "verificacoes.json"), JSON.stringify(mapa, null, 2));
    } catch {
      /* nao critico -- ver comentario acima */
    }
  }

  /**
   * Backups disponiveis, mais recente primeiro: lista de { arquivo, label,
   * integro }. Usado pela tela de Backups para o usuario escolher um ponto
   * no tempo. `integro` e `null` para backups feitos antes desta
   * verificacao existir (nunca foram checados, nao e o mesmo que "checado e
   * corrompido").
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
    const verificacoes = this._lerVerificacoesBackup(dir);
    return arquivos.map((arquivo) => {
      const stamp = arquivo.slice(name.length + 1, arquivo.length - ext.length);
      let tamanhoBytes = 0;
      try {
        tamanhoBytes = fs.statSync(path.join(dir, arquivo)).size;
      } catch {}
      return {
        arquivo,
        label: formatStamp(stamp) || arquivo,
        integro: verificacoes[arquivo] ?? null,
        tamanhoBytes,
      };
    });
  }

  /**
   * Caminho completo de um backup validado, evitando brechas de traversal.
   * @param {string} arquivo
   */
  getBackupPath(arquivo) {
    const valido = this.listBackups().some((b) => b.arquivo === arquivo);
    if (!valido) throw new Error("Backup não encontrado.");
    const dir = path.join(path.dirname(this.path), "backups");
    return path.join(dir, arquivo);
  }

  /** Caminho do banco principal ativo no momento. */
  getCurrentDbPath() {
    return this.path;
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
  // O "_N" final e' opcional: aparece so quando duas copias cairam no mesmo
  // segundo (ver nomeLivre). Sem reconhece-lo aqui, essas entradas apareceriam
  // na tela com o nome cru do arquivo no lugar da data.
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?:_(\d+))?$/.exec(stamp);
  if (!m) return null;
  const [, ano, mes, dia, h, min, s, n] = m;
  return `${dia}/${mes}/${ano} ${h}:${min}:${s}${n ? ` (${n})` : ""}`;
}

/**
 * Nome de arquivo de backup ainda nao usado nesta pasta. Devolve
 * "gestao_20260918_143012.db" no caso normal e, so se ele ja existir,
 * "gestao_20260918_143012_2.db", "_3" e assim por diante -- ver o comentario
 * em _backup() para o porque.
 */
function nomeLivre(dir, name, stamp, ext) {
  const candidato = (sufixo) => `${name}_${stamp}${sufixo}${ext}`;
  if (!fs.existsSync(path.join(dir, candidato("")))) return candidato("");
  // O teto existe so para nao virar laco infinito se algo muito estranho
  // acontecer com o sistema de arquivos; 99 copias no mesmo segundo nao e' um
  // cenario real.
  for (let n = 2; n <= 99; n += 1) {
    if (!fs.existsSync(path.join(dir, candidato(`_${n}`)))) return candidato(`_${n}`);
  }
  return candidato(`_${Date.now()}`);
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
