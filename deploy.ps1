# Atualiza o painel em produção: faz backup do banco e reconstrói o Docker.
# Uso (na pasta web):  .\deploy.ps1      ou dê dois cliques em deploy.bat
#
# Se o backup falhar, nada é reconstruído: a cópia preserva o estado do
# banco antes de eventuais migrações executadas pelo container novo.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$container = 'gestor-de-atualizacoes'
$pastaBackup = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\backups-deploy'))
$identificador = [guid]::NewGuid().ToString('N')
$arquivo = Join-Path $pastaBackup ("gestao-antes-deploy-{0}-{1}.db" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $identificador.Substring(0, 8))

New-Item -ItemType Directory -Force $pastaBackup | Out-Null

# 1. Backup (só se o container já existe; na primeira subida não há o que copiar)
$existe = docker ps -a --filter "name=^$container$" --format '{{.Names}}'
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível consultar o Docker. Nada foi reconstruído.' }
if ($existe) {
    # Copiar .db e -wal em comandos separados com o painel ativo misturava
    # dois instantes. A API de backup do SQLite gera um snapshot único.
    # A pasta local é montada no auxiliar: `docker cp` falha neste container
    # porque o bind mount de server/.env como arquivo causa conflito no daemon.
    # O auxiliar usa a imagem e os volumes do container existente: funciona
    # também com ele parado e não precisa da imagem nova para fazer o backup.
    $imagem = docker inspect --format '{{.Image}}' $container
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível localizar a imagem atual.' }
    $snapshot = "/deploy-backup/.backup-deploy-$identificador.tmp.db"
    $destino = "/deploy-backup/$([System.IO.Path]::GetFileName($arquivo))"
    $arquivoTemporario = Join-Path $pastaBackup ".backup-deploy-$identificador.tmp.db"
    $codigoBackup = @'
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const Sqlite = require('better-sqlite3');
const temporario = process.argv[1];
const destino = process.argv[2];
const db = new Sqlite(path.resolve(process.env.DB_PATH || './data/gestao.db'), { readonly: true, fileMustExist: true });
db.backup(temporario).then(() => {
  const copia = new Sqlite(temporario, { readonly: true });
  try {
    if (copia.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Cópia sem integridade.');
  } finally { copia.close(); }
  fs.renameSync(temporario, destino);
}).catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => {
    db.close();
    for (const sufixo of ['-wal', '-shm']) {
      fs.rmSync(temporario + sufixo, { force: true });
      fs.rmSync(destino + sufixo, { force: true });
    }
  });
'@
    Write-Host "Gerando cópia íntegra para $arquivo ..."
    try {
        $montagemBackup = "type=bind,source=$pastaBackup,target=/deploy-backup"
        docker run --rm --network none --volumes-from $container --mount $montagemBackup --entrypoint /nodejs/bin/node $imagem -e $codigoBackup $snapshot $destino
        if ($LASTEXITCODE -ne 0) { throw 'Backup falhou. Nada foi reconstruído.' }
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $arquivo) -or (Get-Item -LiteralPath $arquivo).Length -eq 0) {
            throw 'Não foi possível salvar o backup local. Nada foi reconstruído.'
        }
    } finally {
        # A cópia temporária fica na pasta local montada; o banco ativo não é alterado.
        foreach ($sufixo in @('', '-wal', '-shm')) {
            Remove-Item -LiteralPath "$arquivoTemporario$sufixo" -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host ("Backup ok ({0:N0} KB)." -f ((Get-Item $arquivo).Length / 1KB))
} else {
    Write-Host 'Container ainda não existe; pulando o backup.'
}

# 2. Reconstrução
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw 'docker compose falhou.' }

# 3. Espera ficar saudável (até 2 minutos)
Write-Host 'Aguardando o painel ficar saudável ...'
for ($i = 0; $i -lt 40; $i++) {
    $estado = docker inspect --format '{{.State.Health.Status}}' $container
    if ($estado -eq 'healthy') {
        Write-Host 'Pronto: painel no ar (healthy).' -ForegroundColor Green
        exit 0
    }
    Start-Sleep -Seconds 3
}
Write-Host "O painel não ficou saudável. Veja: docker compose logs $container" -ForegroundColor Red
exit 1
