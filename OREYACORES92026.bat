@echo off
setlocal
cd /d "%~dp0"

REM ========================================
REM  GESTOR NAVAL OREY TECNICA - PORTATIL
REM ========================================
REM  PORTABILIDADE: sem caminhos absolutos, corre no disco ou numa
REM  pendrive, em qualquer unidade, porque usa apenas "%~dp0" e o
REM  Node incluido na pasta bin\.
REM
REM  SEM JANELAS DE COMANDOS: a 1a execucao relanca este script de
REM  forma oculta e termina, deixando visiveis apenas o servidor e o
REM  navegador. Os erros vao para terminal_logs\start.log e para uma
REM  caixa de dialogo, porque ja nao ha consola onde fazer "pause".
REM ========================================

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not defined OREY_HIDDEN if exist "%PS%" (
  set "OREY_HIDDEN=1"
  set "OREY_SELF=%~f0"
  set "OREY_DIR=%~dp0"
  start "" /b "%PS%" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath $env:OREY_SELF -WorkingDirectory $env:OREY_DIR -WindowStyle Hidden"
  exit /b 0
)

title Orey Acores - Portatil

:: O pacote e autocontido: usar apenas o Node distribuido na pasta bin.
set "NODE_EXE=%~dp0bin\node.exe"

if not exist "%~dp0terminal_logs" mkdir "%~dp0terminal_logs"
set "LOG=%~dp0terminal_logs\start.log"

if not exist "%NODE_EXE%" (
  call :erro "" "Node.js portatil nao encontrado em %~dp0bin\node.exe" "Recrie o pacote com PREPARAR_PACOTE_PORTATIL.ps1."
  exit /b 1
)

:: Verificar se a pasta .next existe
if not exist "%~dp0.next" (
  call :erro "" "Pasta .next nao encontrada em %~dp0" "Execute REBUILD_USB.bat neste computador primeiro."
  exit /b 1
)

:: Limitar memoria para PCs fracos e evitar crashes por OOM.
set "NODE_OPTIONS=--max-old-space-size=2048"

>>"%LOG%" echo [%DATE% %TIME%] A iniciar a aplicacao portatil a partir de %~dp0

"%NODE_EXE%" "%~dp0launcher.js"

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
