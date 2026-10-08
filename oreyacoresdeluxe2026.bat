@echo off
setlocal
cd /d "%~dp0"

REM ============================================================
REM  OREYACORESDELUXE 2026
REM  Clicar no atalho inicia a aplicacao em http://localhost:3003
REM  A estacao de servico e sempre a dos ACORES.
REM
REM  PORTABILIDADE: este script nao tem um unico caminho absoluto.
REM  Corre tanto no disco do computador como numa pendrive, em
REM  qualquer unidade e em qualquer pasta, porque usa apenas "%~dp0".
REM
REM  SEM JANELAS DE COMANDOS: na 1a execucao o script relanca-se a
REM  ele proprio de forma oculta e termina de imediato. O utilizador
REM  ve apenas o servidor a arrancar e o navegador a abrir.
REM  Como deixa de haver consola no ecra, os erros sao registados
REM  em terminal_logs\start.log e mostrados numa caixa de dialogo,
REM  em vez de ficarem a espera de um "pause" invisivel.
REM ============================================================

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not defined OREY_HIDDEN if exist "%PS%" (
  set "OREY_HIDDEN=1"
  set "OREY_SELF=%~f0"
  set "OREY_DIR=%~dp0"
  start "" /b "%PS%" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath $env:OREY_SELF -WorkingDirectory $env:OREY_DIR -WindowStyle Hidden"
  exit /b 0
)

title OREYACORESDELUXE 2026 - porta 3003

set "PORT=3003"
set "NODE_EXE=%~dp0bin\node.exe"

if not exist "%~dp0terminal_logs" mkdir "%~dp0terminal_logs"
set "LOG=%~dp0terminal_logs\start.log"

call :erro "" "bin\node.exe nao encontrado em %~dp0bin\." "Copie a pasta bin\ inteira da maquina de origem para junto deste atalho."
if not exist "%NODE_EXE%" exit /b 1

if not exist "%~dp0.next\standalone\server.js" (
  if not exist "%~dp0server.js" (
    call :erro "" "Build da aplicacao nao encontrado." "A aplicacao ainda nao foi compilada. Execute npm install e npm run build."
    exit /b 1
  )
)

set "NODE_OPTIONS=--max-old-space-size=2048"

>>"%LOG%" echo [%DATE% %TIME%] A iniciar a aplicacao na porta %PORT% a partir de %~dp0

"%NODE_EXE%" "%~dp0launcher.js" %*

>>"%LOG%" echo [%DATE% %TIME%] O servidor terminou com codigo %ERRORLEVEL%.

endlocal
exit /b 0


REM ------------------------------------------------------------
REM  :erro <titulo> <mensagem> <detalhe>
REM  Regista o erro e mostra-o sem abrir uma janela de comandos.
REM ------------------------------------------------------------
:erro
set "OREY_TIT=%~1"
set "OREY_MSG=%~2 %~3"
>>"%LOG%" echo [%DATE% %TIME%] ERRO: %OREY_TIT% %~2 %~3
if exist "%PS%" (
  "%PS%" -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($env:OREY_MSG, $env:OREY_TIT)" >nul 2>&1
)
exit /b 0
