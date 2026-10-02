# Atualiza o painel em produção: faz backup do banco e reconstrói o Docker.
# Uso (na pasta web):  .\deploy.ps1      ou dê dois cliques em deploy.bat
#
# Se o backup falhar, NADA é reconstruído: subir o container novo sem cópia
# do banco é o único passo deste processo que não tem volta.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$container = 'gestor-de-atualizacoes'
$pastaBackup = Join-Path $PSScriptRoot '..\backups-deploy'
$arquivo = Join-Path $pastaBackup ("gestao-antes-deploy-{0}.db" -f (Get-Date -Format 'yyyyMMdd-HHmm'))

New-Item -ItemType Directory -Force $pastaBackup | Out-Null

# 1. Backup (só se o container já existe; na primeira subida não há o que copiar)
$existe = docker ps -a --filter "name=^$container$" --format '{{.Names}}'
if ($existe) {
    Write-Host "Copiando o banco para $arquivo ..."
    docker cp "${container}:/app/server/data/gestao.db" $arquivo
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $arquivo) -or (Get-Item $arquivo).Length -eq 0) {
        throw 'Backup falhou. Nada foi reconstruído.'
    }
    # O modo WAL guarda escritas recentes no -wal; se ele tiver conteúdo, a
    # cópia só do .db ficaria de fora delas, então leva junto.
    # O deploy.bat usa o Windows PowerShell 5.1, onde qualquer texto em stderr de
    # um comando nativo vira erro terminante sob 'Stop' (mesmo com 2>$null). Quando
    # não existe -wal, o docker cp reclama em stderr e derrubava o deploy inteiro:
    # por isso este passo roda com 'Continue'.
    $ErrorActionPreference = 'Continue'
    docker cp "${container}:/app/server/data/gestao.db-wal" "$arquivo-wal" 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
    if ((Test-Path "$arquivo-wal") -and (Get-Item "$arquivo-wal").Length -eq 0) {
        Remove-Item "$arquivo-wal"
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
