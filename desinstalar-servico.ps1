#Requires -RunAsAdministrator
<#
  Remove o servico do Windows criado por instalar-servico.ps1. Nao apaga
  nada do projeto (codigo, banco de dados, logs) -- so tira o Gestor de
  Atualizacoes da lista de servicos e ele para de subir sozinho com o
  Windows. Depois disso, volte a usar "Iniciar Gestor.bat" para rodar na
  mao, se quiser.
#>

$ErrorActionPreference = "Stop"
$ServiceName = "GestorAtualizacoes"

$Nssm = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\NSSM.NSSM_*\nssm-*\win64\nssm.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $Nssm) {
  Write-Host "NSSM nao encontrado -- tentando remover via sc.exe (nativo do Windows) em vez disso." -ForegroundColor Yellow
  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  sc.exe delete $ServiceName
  exit
}

$existente = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $existente) {
  Write-Host "Servico '$ServiceName' nao esta instalado. Nada para fazer." -ForegroundColor Yellow
  exit
}

& $Nssm stop $ServiceName | Out-Null
& $Nssm remove $ServiceName confirm
Write-Host "Servico '$ServiceName' removido. Use 'Iniciar Gestor.bat' para rodar na mao, se precisar." -ForegroundColor Green
