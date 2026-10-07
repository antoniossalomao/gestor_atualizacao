# Atualiza o painel em produção: faz backup do banco e reconstrói o Docker.
# Uso (na pasta web):  .\deploy.ps1      ou dê dois cliques em deploy.bat
#
# Se o backup falhar, nada é reconstruído: a cópia preserva o estado do
# banco antes de eventuais migrações executadas pelo container novo.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$container = 'gestor-de-atualizacoes'
$pastaBackup = Join-Path $PSScriptRoot '..\backups-deploy'
$identificador = [guid]::NewGuid().ToString('N')
$arquivo = Join-Path $pastaBackup ("gestao-antes-deploy-{0}-{1}.db" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $identificador.Substring(0, 8))

New-Item -ItemType Directory -Force $pastaBackup | Out-Null

# 1. Backup (só se o container já existe; na primeira subida não há o que copiar)
$existe = docker ps -a --filter "name=^$container$" --format '{{.Names}}'
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível consultar o Docker. Nada foi reconstruído.' }
if ($existe) {
    # Copiar .db e -wal em comandos separados com o painel ativo misturava
    # dois instantes. A API de backup do SQLite gera um snapshot único.
    # O auxiliar usa a imagem e os volumes do container existente: funciona
    # também com ele parado e não precisa da imagem nova para fazer o backup.
    $imagem = docker inspect --format '{{.Image}}' $container
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível localizar a imagem atual.' }
    $snapshot = "/app/server/data/backup-deploy-$identificador.db"
    $codigoBackup = @'
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const Sqlite = require('better-sqlite3');
const destino = process.argv[1];
const db = new Sqlite(path.resolve(process.env.DB_PATH || './data/gestao.db'), { readonly: true, fileMustExist: true });
db.backup(destino).then(() => {
  const copia = new Sqlite(destino, { readonly: true });
  try {
    if (copia.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Cópia sem integridade.');
  } finally { copia.close(); }
}).catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => {
    db.close();
    for (const sufixo of ['-wal', '-shm']) fs.rmSync(destino + sufixo, { force: true });
  });
'@
    Write-Host "Gerando cópia íntegra para $arquivo ..."
    try {
        docker run --rm --network none --volumes-from $container --entrypoint node $imagem -e $codigoBackup $snapshot
        if ($LASTEXITCODE -ne 0) { throw 'Backup falhou. Nada foi reconstruído.' }
        docker cp "${container}:$snapshot" $arquivo
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $arquivo) -or (Get-Item -LiteralPath $arquivo).Length -eq 0) {
            throw 'Não foi possível salvar o backup local. Nada foi reconstruído.'
        }
    } finally {
        # Só o snapshot temporário: o banco ativo e os backups ficam no volume.
        $codigoLimpar = "require('fs').rmSync(process.argv[1], { force: true })"
        docker run --rm --network none --volumes-from $container --entrypoint node $imagem -e $codigoLimpar $snapshot
        if ($LASTEXITCODE -ne 0) { Write-Warning 'A cópia temporária ficou no volume; o banco ativo não foi alterado.' }
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
