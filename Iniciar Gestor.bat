@echo off
title Gestor de Atualizacoes
cd /d "%~dp0server"

rem Le a porta do .env (padrao 3000), para o atalho continuar certo
rem mesmo que a porta seja trocada la depois.
set PORTA=3000
for /f "tokens=2 delims==" %%a in ('findstr /b "PORT=" .env 2^>nul') do set PORTA=%%a

rem Ja esta rodando? Entao nao sobe outro (a porta daria erro) -- so abre a tela.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %PORTA% -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if %errorlevel% equ 0 (
  echo.
  echo  O sistema ja estava rodando. Abrindo no navegador...
  start "" http://localhost:%PORTA%
  rem "ping" em vez de "timeout": o timeout quebra quando a janela e' aberta
  rem com a entrada redirecionada (atalho, agendador, outro script).
  ping -n 3 127.0.0.1 >nul
  exit /b
)

if not exist "node_modules\" (
  echo.
  echo  Primeira execucao: instalando dependencias. Isso demora um pouco...
  echo.
  call npm install
)

echo.
echo  ===========================================
echo    GESTOR DE ATUALIZACOES
echo  ===========================================
echo.
echo    Endereco: http://localhost:%PORTA%
echo    O navegador abre sozinho em instantes.
echo.
echo    Para PARAR o sistema: aperte Ctrl+C
echo    ou feche esta janela.
echo.
echo  ===========================================
echo.

rem Abre o navegador em paralelo, depois de dar tempo do servidor subir.
start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & start "" http://localhost:%PORTA%"

call npm start

rem Se o npm caiu por erro, segura a janela aberta para a mensagem ser lida.
if %errorlevel% neq 0 (
  echo.
  echo  O servidor parou com erro. Leia a mensagem acima.
  pause
)
