#Requires -RunAsAdministrator
<#
  Instala o Gestor de Atualizações como serviço do Windows (via NSSM), para
  ele subir sozinho com o Windows e reiniciar sozinho se cair -- sem
  depender de alguém manter a janela do "Iniciar Gestor.bat" aberta.

  Precisa ser rodado como Administrador (clique direito no arquivo >
  "Executar com o PowerShell" abre sem elevar; use em vez disso um
  PowerShell aberto como Administrador e rode ".\instalar-servico.ps1",
  ou clique direito > "Executar com PowerShell como Administrador" se essa
  opção existir no seu Windows). #Requires acima já barra a execução sem
  elevação, com uma mensagem clara em vez de falhar pela metade.
#>

$ErrorActionPreference = "Stop"

$ServerDir = Join-Path $PSScriptRoot "server"
$LogsDir = Join-Path $ServerDir "logs"
$ServiceName = "GestorAtualizacoes"
$EnvFile = Join-Path $ServerDir ".env"

if (-not (Test-Path $EnvFile)) {
  Write-Host "Nao encontrei $EnvFile -- copie server\.env.example para server\.env e preencha antes de instalar o servico." -ForegroundColor Red
  exit 1
}

$Porta = "3000"
$linhaPorta = Select-String -Path $EnvFile -Pattern '^PORT=' | Select-Object -First 1
if ($linhaPorta) { $Porta = ($linhaPorta.Line -split "=", 2)[1].Trim() }

# node.exe pelo caminho absoluto -- um servico do Windows nao herda o PATH
# da sessao interativa de forma confiavel, entao "node" sozinho podia nao
# resolver dependendo de como o servico e iniciado.
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
  Write-Host "Node.js nao encontrado no PATH. Instale o Node.js antes de rodar este script." -ForegroundColor Red
  exit 1
}
$NodePath = $NodeCmd.Source

# Localiza (ou instala) o nssm.exe. Resolvido pelo caminho direto do pacote
# do winget em vez de confiar em "nssm" no PATH: o PATH de usuario que o
# winget atualizou pode nao estar carregado ainda nesta sessao elevada.
$Nssm = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\NSSM.NSSM_*\nssm-*\win64\nssm.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $Nssm) {
  Write-Host "NSSM nao encontrado -- instalando via winget..." -ForegroundColor Yellow
  winget install --id NSSM.NSSM -e --accept-package-agreements --accept-source-agreements --silent
  $Nssm = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\NSSM.NSSM_*\nssm-*\win64\nssm.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Nssm) {
  Write-Host "Nao consegui localizar nem instalar o NSSM. Baixe manualmente em https://nssm.cc e rode este script de novo." -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

# Se o servidor estiver rodando na mao (ex.: pelo "Iniciar Gestor.bat" ou
# "npm start" direto), para ele antes -- senao o servico novo no mesmo
# aparato de porta falha ao iniciar (EADDRINUSE).
$ProcessoNaPorta = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
if ($ProcessoNaPorta) {
  Write-Host "Parando instancia manual que ja esta rodando na porta $Porta (PID $ProcessoNaPorta)..." -ForegroundColor Yellow
  Stop-Process -Id $ProcessoNaPorta -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}

# Remove uma instalacao anterior do servico, se existir, para o "install"
# abaixo nao falhar por "servico ja existe" numa segunda execucao deste
# script (idempotente).
$existente = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existente) {
  Write-Host "Servico '$ServiceName' ja existia -- removendo para reinstalar do zero..." -ForegroundColor Yellow
  & $Nssm stop $ServiceName | Out-Null
  & $Nssm remove $ServiceName confirm | Out-Null
}

Write-Host "Instalando o servico '$ServiceName'..." -ForegroundColor Cyan
& $Nssm install $ServiceName $NodePath "server.js"
& $Nssm set $ServiceName AppDirectory $ServerDir
& $Nssm set $ServiceName DisplayName "Gestor de Atualizacoes"
& $Nssm set $ServiceName Description "Painel web de gestao de atualizacoes de clientes (Express + SQLite). Reinicia sozinho se cair."
& $Nssm set $ServiceName Start SERVICE_AUTO_START
& $Nssm set $ServiceName AppStdout (Join-Path $LogsDir "service-out.log")
& $Nssm set $ServiceName AppStderr (Join-Path $LogsDir "service-err.log")
& $Nssm set $ServiceName AppRotateFiles 1
& $Nssm set $ServiceName AppRotateOnline 1
& $Nssm set $ServiceName AppRotateBytes 10485760
& $Nssm set $ServiceName AppRestartDelay 3000

Write-Host "Iniciando o servico..." -ForegroundColor Cyan
& $Nssm start $ServiceName

Start-Sleep -Seconds 2
try {
  $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://localhost:$Porta/api/auth/status"
  Write-Host "OK -- servidor respondeu HTTP $($resp.StatusCode) em http://localhost:$Porta" -ForegroundColor Green
} catch {
  Write-Host "O servico foi criado, mas o servidor nao respondeu ainda. Veja o log:" -ForegroundColor Yellow
  Write-Host "  $(Join-Path $LogsDir 'service-err.log')"
}

Write-Host ""
Write-Host "Pronto. O servico '$ServiceName' agora sobe sozinho com o Windows e reinicia" -ForegroundColor Green
Write-Host "sozinho se cair. Comandos uteis (em PowerShell/services.msc):" -ForegroundColor Green
Write-Host "  Get-Service $ServiceName          # ver status"
Write-Host "  Restart-Service $ServiceName       # reiniciar"
Write-Host "  Stop-Service $ServiceName          # parar"
Write-Host "  Get-Content '$LogsDir\service-out.log' -Tail 50 -Wait   # acompanhar log"
Write-Host "Para desinstalar o servico, rode desinstalar-servico.ps1 (tambem como Administrador)."
