<#
.SYNOPSIS
Atualiza somente o codigo do Gestor de Atualizacoes direto da pasta do servidor Windows (NSSM).

.DESCRIPTION
Feito para ficar dentro da propria pasta do servidor (ex.: C:\gestor\scripts\deploy-windows.ps1)
e rodar sem nenhum parametro. Detecta automaticamente a pasta da instalacao, baixa a versao mais
nova do GitHub (ou usa -Origem para pasta local/.zip), fecha o servico GestorApp, troca APENAS os
arquivos de codigo (sem jamais tocar em server\.env, proxy\Caddyfile/GestorProxy nem server\data\),
confere hashes SHA-256 de .env/Caddy/banco, atualiza npm ci se package-lock.json mudou e abre o
servico novamente validando http://127.0.0.1:<PORT>/api/auth/status.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows.ps1

.EXAMPLE
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows.ps1 -Simular

.EXAMPLE
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows.ps1 -Origem "C:\temp\gestor-novo.zip"
#>
[CmdletBinding()]
param(
  [string]$Destino = "",
  [string]$Origem = "",
  [string]$Servico = "GestorApp",
  [string]$RepoUrl = "https://github.com/antoniossalomao/gestor_atualizacao.git",
  [string]$Branch = "main",
  [switch]$SemServico,
  [switch]$BackupBanco,
  [switch]$PularDependencias,
  [switch]$ForcarDependencias,
  [switch]$Simular
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Etapa {
  param([string]$Mensagem)
  Write-Host "`n==> $Mensagem" -ForegroundColor Cyan
}

function Get-Sha256OuNulo {
  param([string]$Caminho)
  if (-not (Test-Path -LiteralPath $Caminho -PathType Leaf)) { return $null }
  return (Get-FileHash -LiteralPath $Caminho -Algorithm SHA256).Hash
}

function Get-EstadoArquivo {
  param([string]$Caminho)
  $existe = Test-Path -LiteralPath $Caminho -PathType Leaf
  return @{
    Caminho = $Caminho
    Existe = $existe
    Hash = if ($existe) { (Get-FileHash -LiteralPath $Caminho -Algorithm SHA256).Hash } else { $null }
  }
}

function Assert-Imutavel {
  param(
    [string]$Rotulo,
    [hashtable]$EstadoInicial
  )
  $atual = Get-EstadoArquivo -Caminho $EstadoInicial.Caminho
  if ($atual.Existe -ne $EstadoInicial.Existe -or $atual.Hash -ne $EstadoInicial.Hash) {
    throw "Violacao de integridade em '$Rotulo' ($($EstadoInicial.Caminho)): arquivo foi alterado ou removido durante o deploy!"
  }
}

function Get-VersaoPackageJson {
  param([string]$Raiz)
  foreach ($rel in @("server\package.json", "package.json")) {
    $arq = Join-Path $Raiz $rel
    if (Test-Path -LiteralPath $arq -PathType Leaf) {
      try {
        $json = Get-Content -LiteralPath $arq -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($json.PSObject.Properties["version"] -and $json.version) {
          return [string]$json.version
        }
      } catch {
        return $null
      }
    }
  }
  return $null
}

function Read-ConfigEnv {
  param([string]$ArquivoEnv, [string]$PastaServer)
  $cfg = @{
    PORT = "3000"
    DB_PATH = [System.IO.Path]::GetFullPath((Join-Path $PastaServer "data\gestao.db"))
    EnvEncontrado = $false
  }
  if (-not (Test-Path -LiteralPath $ArquivoEnv -PathType Leaf)) {
    return $cfg
  }
  $cfg.EnvEncontrado = $true

  $linhas = Get-Content -LiteralPath $ArquivoEnv -Encoding UTF8
  foreach ($linha in $linhas) {
    $limpa = $linha.Trim()
    if (-not $limpa -or $limpa.StartsWith("#")) { continue }
    if ($limpa -notmatch '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { continue }

    $chave = $matches[1]
    $valor = $matches[2].Trim()
    if (($valor.StartsWith('"') -and $valor.EndsWith('"') -and $valor.Length -ge 2) -or
        ($valor.StartsWith("'") -and $valor.EndsWith("'") -and $valor.Length -ge 2)) {
      $valor = $valor.Substring(1, $valor.Length - 2)
    } else {
      $idxHash = $valor.IndexOf(" #")
      if ($idxHash -ge 0) { $valor = $valor.Substring(0, $idxHash).Trim() }
    }

    if ($chave -eq "PORT" -and $valor) {
      $cfg.PORT = $valor
    } elseif ($chave -eq "DB_PATH" -and $valor) {
      if ([System.IO.Path]::IsPathRooted($valor)) {
        $cfg.DB_PATH = [System.IO.Path]::GetFullPath($valor)
      } else {
        $cfg.DB_PATH = [System.IO.Path]::GetFullPath((Join-Path $PastaServer $valor))
      }
    }
  }
  return $cfg
}

function Resolve-RaizZip {
  param([string]$PastaExtraida)
  $temServer = Test-Path -LiteralPath (Join-Path $PastaExtraida "server\server.js") -PathType Leaf
  $temClient = Test-Path -LiteralPath (Join-Path $PastaExtraida "client\index.html") -PathType Leaf
  if ($temServer -and $temClient) { return $PastaExtraida }

  $filhos = @(Get-ChildItem -LiteralPath $PastaExtraida -Directory)
  if ($filhos.Count -eq 1) {
    $sub = $filhos[0].FullName
    if ((Test-Path -LiteralPath (Join-Path $sub "server\server.js") -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $sub "client\index.html") -PathType Leaf)) {
      return $sub
    }
  }

  throw "O arquivo ZIP nao contem server\server.js e client\index.html na raiz nem em uma subpasta unica."
}

function Invoke-RobocopyMirror {
  param(
    [string]$Fonte,
    [string]$Alvo,
    [string[]]$ExcluirPastas = @()
  )
  if (-not (Test-Path -LiteralPath $Fonte -PathType Container)) { return }

  $roboArgs = @($Fonte, $Alvo, "/MIR", "/R:2", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP")
  $listaExclusoes = @($ExcluirPastas)
  if ($listaExclusoes.Count -gt 0) {
    $roboArgs += "/XD"
    $roboArgs += $listaExclusoes
  }

  & robocopy @roboArgs | Out-Host
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy falhou ao espelhar '$Fonte' -> '$Alvo' (codigo $LASTEXITCODE)."
  }
}

function Test-EhAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $princ = New-Object Security.Principal.WindowsPrincipal($id)
  return $princ.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$pastasEspelho = @(
  @{ Rel = "client"; Excluir = @("node_modules", ".git"); Obrigatoria = $true },
  @{ Rel = "server\src"; Excluir = @(); Obrigatoria = $true },
  @{ Rel = "server\ferramentas"; Excluir = @(); Obrigatoria = $true },
  @{ Rel = "server\tests"; Excluir = @(); Obrigatoria = $true },
  @{ Rel = "docs"; Excluir = @(); Obrigatoria = $false },
  @{ Rel = "scripts"; Excluir = @(); Obrigatoria = $false }
)

$arquivosRaiz = @(
  "package.json",
  "package-lock.json",
  "README.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "LICENSE",
  ".editorconfig",
  ".gitattributes",
  ".gitignore"
)

$arquivosServer = @(
  "server.js",
  "resetar-senha.js",
  "package.json",
  "package-lock.json",
  ".env.example",
  "tsconfig.json"
)

$tempStageDir = $null
$backupFeito = $null
$servicoFoiParado = $false

try {
  Write-Etapa "Validando ambiente e obtendo codigo novo"

  $destinoResolvido = if ([string]::IsNullOrWhiteSpace($Destino)) {
    Split-Path -Parent $PSScriptRoot
  } else {
    $Destino
  }

  if (-not (Test-Path -LiteralPath $destinoResolvido -PathType Container)) {
    throw "Pasta de destino nao encontrada: $destinoResolvido"
  }
  $normDestino = [System.IO.Path]::GetFullPath($destinoResolvido).TrimEnd('\', '/')
  $destinoServer = Join-Path $normDestino "server"
  if (-not (Test-Path -LiteralPath $destinoServer -PathType Container)) {
    throw "Pasta server nao encontrada em '$normDestino'. Execute este script de dentro da pasta 'scripts\' da instalacao ou informe -Destino <pasta>."
  }

  $nssmCmd = Get-Command nssm -ErrorAction SilentlyContinue
  $svcObj = $null
  if (-not $Simular -and -not $SemServico) {
    if (-not (Test-EhAdmin)) {
      throw "Execute o PowerShell como Administrador para parar/iniciar o servico '$Servico' (ou use -Simular / -SemServico)."
    }
    $svcObj = Get-Service -Name $Servico -ErrorAction SilentlyContinue
    if ($null -eq $svcObj) {
      throw "Servico Windows '$Servico' nao encontrado. Confira com Get-Service ou use -Servico <nome>."
    }
  } elseif ($Simular -and -not $SemServico) {
    $svcObj = Get-Service -Name $Servico -ErrorAction SilentlyContinue
  }

  $envPath = Join-Path $destinoServer ".env"
  $caddyPath = Join-Path $normDestino "proxy\Caddyfile"
  $cfgEnv = Read-ConfigEnv -ArquivoEnv $envPath -PastaServer $destinoServer
  if (-not $cfgEnv.EnvEncontrado) {
    Write-Warning "Arquivo $envPath nao encontrado. Usando padroes (PORT=3000, DB_PATH=server\data\gestao.db)."
  }

  $raizOrigem = $null
  $modoOrigem = ""
  if ([string]::IsNullOrWhiteSpace($Origem)) {
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if ($null -ne $gitCmd) {
      $modoOrigem = "GitHub (git clone $Branch)"
      $tempStageDir = Join-Path $env:TEMP ("gestor-deploy-git-" + (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
      Write-Host "Baixando codigo novo da branch '$Branch' via git..."
      & $gitCmd.Source clone --depth 1 --branch $Branch $RepoUrl $tempStageDir
      if ($LASTEXITCODE -ne 0) {
        throw "git clone de '$RepoUrl' (branch '$Branch') falhou com codigo $LASTEXITCODE. Confira rede/credenciais ou passe -Origem <pasta-ou-zip>."
      }
      $raizOrigem = $tempStageDir
    } else {
      $modoOrigem = "GitHub (ZIP $Branch)"
      $baseRepo = ($RepoUrl.TrimEnd('/')) -replace '\.git$', ''
      if (-not $baseRepo.StartsWith("http", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "git nao encontrado no PATH e RepoUrl nao e HTTP(S) para download ZIP: $RepoUrl"
      }
      $zipUrl = "$baseRepo/archive/refs/heads/$Branch.zip"
      $tempStageDir = Join-Path $env:TEMP ("gestor-deploy-zip-" + (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
      $zipBaixado = Join-Path $tempStageDir "repo.zip"
      $extraidoDir = Join-Path $tempStageDir "extraido"
      New-Item -ItemType Directory -Path $extraidoDir -Force | Out-Null

      try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
      } catch { }

      Write-Host "git nao encontrado no PATH; baixando ZIP de $zipUrl..."
      Invoke-WebRequest -Uri $zipUrl -OutFile $zipBaixado -UseBasicParsing
      Expand-Archive -LiteralPath $zipBaixado -DestinationPath $extraidoDir -Force
      $raizOrigem = Resolve-RaizZip -PastaExtraida $extraidoDir
    }
  } else {
    $modoOrigem = "Origem local"
    if (-not (Test-Path -LiteralPath $Origem)) {
      throw "Origem nao encontrada: $Origem"
    }

    $itemOrigem = Get-Item -LiteralPath $Origem
    if ($itemOrigem -is [System.IO.FileInfo]) {
      if (-not $itemOrigem.Extension.Equals(".zip", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "O caminho de origem e um arquivo, mas nao tem extensao .zip: $($itemOrigem.FullName)"
      }
      $tempStageDir = Join-Path $env:TEMP ("gestor-deploy-zip-" + (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
      New-Item -ItemType Directory -Path $tempStageDir -Force | Out-Null
      Write-Host "Extraindo ZIP para pasta temporaria isolada..."
      Expand-Archive -LiteralPath $itemOrigem.FullName -DestinationPath $tempStageDir -Force
      $raizOrigem = Resolve-RaizZip -PastaExtraida $tempStageDir
    } else {
      $raizOrigem = $itemOrigem.FullName
    }
  }

  $raizOrigem = [System.IO.Path]::GetFullPath($raizOrigem).TrimEnd('\', '/')
  foreach ($obrig in @("server\server.js", "server\package.json", "client\index.html")) {
    if (-not (Test-Path -LiteralPath (Join-Path $raizOrigem $obrig) -PathType Leaf)) {
      throw "Origem invalida ('$raizOrigem'): arquivo obrigatorio ausente: $obrig"
    }
  }

  if ($raizOrigem.Equals($normDestino, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Origem e Destino apontam para a mesma pasta ('$normDestino')."
  }

  $versaoAtual = Get-VersaoPackageJson -Raiz $normDestino
  $versaoNova = Get-VersaoPackageJson -Raiz $raizOrigem
  $lockDestino = Join-Path $destinoServer "package-lock.json"
  $lockOrigem = Join-Path $raizOrigem "server\package-lock.json"
  $hashLockAntes = Get-Sha256OuNulo -Caminho $lockDestino
  $hashLockNovo = Get-Sha256OuNulo -Caminho $lockOrigem
  $nodeModulesExiste = Test-Path -LiteralPath (Join-Path $destinoServer "node_modules") -PathType Container
  $precisaDeps = (-not $PularDependencias) -and (
    $ForcarDependencias -or (-not $nodeModulesExiste) -or ($hashLockAntes -ne $hashLockNovo)
  )

  Write-Host "Modo:             $modoOrigem -> $normDestino"
  Write-Host "Origem codigo:    $raizOrigem"
  Write-Host "Destino:          $normDestino"
  Write-Host ("Versao atual:     " + $(if ($versaoAtual) { $versaoAtual } else { "desconhecida" }))
  Write-Host ("Versao nova:      " + $(if ($versaoNova) { $versaoNova } else { "desconhecida" }))
  Write-Host "Banco (intocado): $($cfgEnv.DB_PATH)"
  Write-Host ".env (intocado):  $envPath"
  Write-Host "Caddy (intocado): $caddyPath"
  Write-Host "Porta Node:       $($cfgEnv.PORT)"
  Write-Host ("Servico:          " + $(if ($SemServico) { "(ignorado via -SemServico)" } elseif ($null -ne $svcObj) { "$Servico ($($svcObj.Status))" } else { "$Servico (nao encontrado neste host)" }))

  if ($Simular) {
    Write-Etapa "SIMULACAO (-Simular): nenhuma alteracao sera feita"
    Write-Host "Pastas de codigo espelhadas (/MIR):"
    foreach ($p in $pastasEspelho) {
      $existe = Test-Path -LiteralPath (Join-Path $raizOrigem $p.Rel) -PathType Container
      if ($existe -or $p.Obrigatoria) {
        Write-Host "  - $($p.Rel)"
      }
    }
    Write-Host "Arquivos na raiz:"
    foreach ($f in $arquivosRaiz) {
      if (Test-Path -LiteralPath (Join-Path $raizOrigem $f) -PathType Leaf) {
        Write-Host "  - $f"
      }
    }
    Write-Host "Arquivos em server\:"
    foreach ($f in $arquivosServer) {
      if (Test-Path -LiteralPath (Join-Path $raizOrigem "server\$f") -PathType Leaf) {
        Write-Host "  - server\$f"
      }
    }
    Write-Host "Itens NUNCA tocados: server\data\ (banco), server\.env, .env, proxy\ (Caddyfile e GestorProxy), *.log, *.crt"
    if ($BackupBanco) {
      $pastaBackupSim = Join-Path (Split-Path -Parent $normDestino) "gestor-backups-deploy"
      Write-Host "Backup opcional (-BackupBanco): gravaria copia fora do destino em $pastaBackupSim"
    }
    if ($PularDependencias) {
      Write-Host "Dependencias:     puladas (-PularDependencias)"
    } else {
      Write-Host ("Dependencias:     " + $(if ($precisaDeps) { "executaria npm ci --omit=dev em server\" } else { "sem alteracao no lockfile (nao executaria npm ci)" }))
    }
    exit 0
  }

  if (-not $SemServico) {
    Write-Etapa "Fechando servico $Servico (GestorProxy/Caddy nao e tocado)"
    if ($svcObj.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Stopped) {
      if ($null -ne $nssmCmd) {
        & $nssmCmd.Source stop $Servico | Out-Host
      } else {
        Stop-Service -Name $Servico -Force
      }
    }

    $limite = (Get-Date).AddSeconds(30)
    do {
      Start-Sleep -Milliseconds 500
      $svcObj = Get-Service -Name $Servico
    } while ($svcObj.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Stopped -and (Get-Date) -lt $limite)

    if ($svcObj.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Stopped) {
      throw "Servico '$Servico' nao parou em 30 segundos (estado: $($svcObj.Status))."
    }
    $servicoFoiParado = $true
    Start-Sleep -Seconds 1
    Write-Host "Servico parado."
  }

  # Snapshot de hashes SOMENTE LEITURA antes de mexer em qualquer arquivo.
  $estadoEnv = Get-EstadoArquivo -Caminho $envPath
  $estadoCaddy = Get-EstadoArquivo -Caminho $caddyPath
  $estadoDb = Get-EstadoArquivo -Caminho $cfgEnv.DB_PATH
  $estadoWal = Get-EstadoArquivo -Caminho ($cfgEnv.DB_PATH + "-wal")
  $estadoShm = Get-EstadoArquivo -Caminho ($cfgEnv.DB_PATH + "-shm")

  if ($BackupBanco) {
    Write-Etapa "Copiando backup preventivo do banco FORA de server\data\"
    if (Test-Path -LiteralPath $cfgEnv.DB_PATH -PathType Leaf) {
      $pastaBackup = Join-Path (Split-Path -Parent $normDestino) "gestor-backups-deploy"
      New-Item -ItemType Directory -Path $pastaBackup -Force | Out-Null
      $carimbo = Get-Date -Format "yyyyMMdd-HHmmss"
      $nomeBase = [System.IO.Path]::GetFileNameWithoutExtension($cfgEnv.DB_PATH)
      $ext = [System.IO.Path]::GetExtension($cfgEnv.DB_PATH)
      $backupFeito = Join-Path $pastaBackup "$nomeBase-$carimbo$ext"
      Copy-Item -LiteralPath $cfgEnv.DB_PATH -Destination $backupFeito -Force
      foreach ($sufixo in @("-wal", "-shm")) {
        $aux = $cfgEnv.DB_PATH + $sufixo
        if (Test-Path -LiteralPath $aux -PathType Leaf) {
          Copy-Item -LiteralPath $aux -Destination ($backupFeito + $sufixo) -Force
        }
      }
      Write-Host "Backup externo salvo em: $backupFeito"
    } else {
      Write-Host "Banco ainda nao existe em '$($cfgEnv.DB_PATH)'; nenhum arquivo para copiar."
    }
  }

  Write-Etapa "Atualizando somente arquivos de codigo"
  foreach ($p in $pastasEspelho) {
    $src = Join-Path $raizOrigem $p.Rel
    if (-not (Test-Path -LiteralPath $src -PathType Container)) { continue }
    $dst = Join-Path $normDestino $p.Rel
    Write-Host "Espelhando $($p.Rel)..."
    Invoke-RobocopyMirror -Fonte $src -Alvo $dst -ExcluirPastas $p.Excluir
  }

  foreach ($f in $arquivosRaiz) {
    $src = Join-Path $raizOrigem $f
    if (Test-Path -LiteralPath $src -PathType Leaf) {
      Copy-Item -LiteralPath $src -Destination (Join-Path $normDestino $f) -Force
    }
  }

  foreach ($f in $arquivosServer) {
    $src = Join-Path $raizOrigem "server\$f"
    if (Test-Path -LiteralPath $src -PathType Leaf) {
      Copy-Item -LiteralPath $src -Destination (Join-Path $destinoServer $f) -Force
    }
  }
  Write-Host "Arquivos de codigo atualizados."

  if ($precisaDeps) {
    Write-Etapa "Atualizando dependencias de producao em server\"
    $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($null -eq $npmCmd) { $npmCmd = Get-Command npm -ErrorAction Stop }
    $temLock = Test-Path -LiteralPath (Join-Path $destinoServer "package-lock.json") -PathType Leaf
    $npmAcao = if ($temLock) { "ci" } else { "install" }

    Push-Location $destinoServer
    try {
      & $npmCmd.Source $npmAcao --omit=dev | Out-Host
      if ($LASTEXITCODE -ne 0) {
        throw "npm $npmAcao --omit=dev falhou com codigo $LASTEXITCODE."
      }
    } finally {
      Pop-Location
    }
  } elseif (-not $PularDependencias) {
    Write-Host "`nDependencias inalteradas (package-lock.json igual); npm ci ignorado."
  }

  Write-Etapa "Confirmando imutabilidade de .env, Caddyfile e banco SQLite"
  Assert-Imutavel -Rotulo "server\.env" -EstadoInicial $estadoEnv
  Assert-Imutavel -Rotulo "proxy\Caddyfile" -EstadoInicial $estadoCaddy
  Assert-Imutavel -Rotulo "Banco SQLite" -EstadoInicial $estadoDb
  Assert-Imutavel -Rotulo "SQLite WAL" -EstadoInicial $estadoWal
  Assert-Imutavel -Rotulo "SQLite SHM" -EstadoInicial $estadoShm
  Write-Host "Hashes SHA-256 identicos antes e depois: server\.env, proxy\Caddyfile e banco SQLite intactos."

  if (-not $SemServico) {
    Write-Etapa "Abrindo servico $Servico e conferindo saude"
    if ($null -ne $nssmCmd) {
      & $nssmCmd.Source start $Servico | Out-Host
    } else {
      Start-Service -Name $Servico
    }

    $limiteSvc = (Get-Date).AddSeconds(15)
    do {
      Start-Sleep -Milliseconds 500
      $svcObj = Get-Service -Name $Servico
    } while ($svcObj.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Running -and (Get-Date) -lt $limiteSvc)

    if ($svcObj.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Running) {
      throw "Servico '$Servico' nao ficou Running em 15 segundos (estado: $($svcObj.Status))."
    }
    $servicoFoiParado = $false

    if ($cfgEnv.PORT.StartsWith("\\.\pipe\")) {
      Write-Host "Servico Running (PORT usa named pipe $($cfgEnv.PORT); pulando check HTTP local)."
    } else {
      $urlSaude = "http://127.0.0.1:$($cfgEnv.PORT)/api/auth/status"
      $ok = $false
      $ultimoErro = $null
      $limiteHttp = (Get-Date).AddSeconds(15)
      while ((Get-Date) -lt $limiteHttp) {
        try {
          $resp = Invoke-WebRequest -Uri $urlSaude -UseBasicParsing -TimeoutSec 2
          if ($resp.StatusCode -eq 200) {
            $ok = $true
            break
          }
        } catch {
          $ultimoErro = $_.Exception.Message
          Start-Sleep -Milliseconds 500
        }
      }

      if (-not $ok) {
        throw "Servico subiu, mas '$urlSaude' nao respondeu HTTP 200 em 15s. Confira logs do NSSM / AppStderr. Ultimo erro: $ultimoErro"
      }
      Write-Host "Saude confirmada em $urlSaude (HTTP 200)."
    }
  }

  $versaoFinal = Get-VersaoPackageJson -Raiz $normDestino
  Write-Etapa "Atualizacao concluida com sucesso"
  Write-Host ("Versao ativa em ${normDestino}: " + $(if ($versaoFinal) { $versaoFinal } else { "concluida" })) -ForegroundColor Green
  if ($backupFeito) { Write-Host "Backup externo salvo em: $backupFeito" }
} catch {
  Write-Host "`nERRO no deploy: $($_.Exception.Message)" -ForegroundColor Red
  if ($backupFeito) {
    Write-Host "Backup externo mantido em: $backupFeito" -ForegroundColor Yellow
  }
  if ($servicoFoiParado) {
    Write-Host "ATENCAO: o servico '$Servico' foi fechado antes da falha e ainda esta parado. Verifique o erro e os logs do NSSM antes de iniciar." -ForegroundColor Yellow
  }
  throw
} finally {
  if ($tempStageDir -and (Test-Path -LiteralPath $tempStageDir)) {
    Remove-Item -LiteralPath $tempStageDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
