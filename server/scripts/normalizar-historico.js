/**
 * Normaliza de uma vez o histórico que já está gravado: nomes de sistema nas
 * atualizações e nomes de responsável em atualizações e agendamentos.
 *
 * Existe porque o campo "Sistema" foi texto livre desde sempre e acumulou 144
 * grafias para 14 sistemas -- "B_NFE", "B_vendas", "B_areadocontador e
 * B_importaXML". O estrago não era estético: o relatório da aba Sistemas
 * compara string exata, então 60 clientes apareciam como "Nunca atualizado"
 * em B_NFe só porque alguém tinha digitado "B_NFE".
 *
 * A regra usada aqui é a MESMA de toda gravação nova (services/normalizacao.js,
 * ligado no AtualizacaoService), então isto é um acerto de contas com o
 * passado, não uma regra paralela que vai divergir com o tempo.
 *
 *   node scripts/normalizar-historico.js            # simulação, não grava nada
 *   node scripts/normalizar-historico.js --aplicar  # grava, numa transação só
 *
 * Rode um backup antes (aba Backups, ou copie data/gestao.db). O --aplicar é
 * uma transação única: ou tudo entra, ou nada entra.
 */
const path = require("path");
const Database = require("better-sqlite3");
const {
  normalizarSistemas,
  normalizarResponsavel,
  canonizarResponsaveis,
  chave,
  SISTEMAS_NOVOS,
} = require("../src/services/normalizacao");

const APLICAR = process.argv.includes("--aplicar");
const CAMINHO = path.join(__dirname, "..", "data", "gestao.db");

function main() {
  const db = new Database(CAMINHO);
  db.pragma("foreign_keys = ON");

  const catalogo = db.prepare("SELECT nome FROM sistemas").all().map((r) => r.nome);
  const faltando = SISTEMAS_NOVOS.filter((s) => !catalogo.includes(s));
  const completo = [...catalogo, ...faltando];

  // -- sistemas --
  const atualizacoes = db.prepare("SELECT id, sistema FROM atualizacoes WHERE sistema <> ''").all();
  const sistemasMudados = [];
  for (const { id, sistema } of atualizacoes) {
    const novo = normalizarSistemas(sistema, completo);
    if (novo !== sistema) sistemasMudados.push({ id, de: sistema, para: novo });
  }

  // -- responsáveis --
  // A grafia canônica sai das que JÁ existem, a mais usada ganha: "Camila"(21)
  // vence "CAMILA"(8) sem ninguém precisar dizer qual é a certa. "Marcos/Lennon"
  // fica de fora da lista de canônicos (é uma dupla, não uma grafia) -- quem
  // resolve esse é o mapa de apelidos dentro de normalizarResponsavel.
  const ocorrencias = db
    .prepare("SELECT responsavel, COUNT(*) total FROM atualizacoes WHERE responsavel <> '' GROUP BY responsavel")
    .all();
  const conhecidos = [...canonizarResponsaveis(ocorrencias).values()].filter((n) => chave(n) !== "MARCOSLENNON");

  const responsaveisMudados = { atualizacoes: [], agendamentos: [] };
  for (const tabela of ["atualizacoes", "agendamentos"]) {
    const linhas = db.prepare(`SELECT id, responsavel FROM ${tabela} WHERE responsavel <> ''`).all();
    for (const { id, responsavel } of linhas) {
      const novo = normalizarResponsavel(responsavel, conhecidos);
      if (novo !== responsavel) responsaveisMudados[tabela].push({ id, de: responsavel, para: novo });
    }
  }

  relatar({ faltando, sistemasMudados, responsaveisMudados, conhecidos });

  if (!APLICAR) {
    console.log("\nSIMULAÇÃO -- nada foi gravado. Rode de novo com --aplicar para valer.");
    db.close();
    return;
  }

  const gravar = db.transaction(() => {
    const novoSistema = db.prepare("INSERT OR IGNORE INTO sistemas (nome) VALUES (?)");
    for (const nome of faltando) novoSistema.run(nome);

    const setSistema = db.prepare("UPDATE atualizacoes SET sistema = ? WHERE id = ?");
    for (const { id, para } of sistemasMudados) setSistema.run(para, id);

    for (const tabela of ["atualizacoes", "agendamentos"]) {
      const setResp = db.prepare(`UPDATE ${tabela} SET responsavel = ? WHERE id = ?`);
      for (const { id, para } of responsaveisMudados[tabela]) setResp.run(para, id);
    }
  });
  gravar();

  console.log("\nAPLICADO.");
  db.close();
}

function relatar({ faltando, sistemasMudados, responsaveisMudados, conhecidos }) {
  console.log(`Sistemas novos no catálogo: ${faltando.length ? faltando.join(", ") : "nenhum"}`);
  console.log(`Atualizações com sistema reescrito: ${sistemasMudados.length}`);
  console.log(`Responsável reescrito: ${responsaveisMudados.atualizacoes.length} atualizações, ` +
    `${responsaveisMudados.agendamentos.length} agendamentos`);
  console.log(`Responsáveis canônicos: ${conhecidos.sort().join(" · ")}`);
}

main();
