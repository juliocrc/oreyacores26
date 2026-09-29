@echo off
setlocal
cd /d "%~dp0"
title OREYACORESDELUXE 2026 - porta 3003

REM ============================================================
REM  OREYACORESDELUXE 2026
REM  Clicar neste atalho inicia a aplicacao em http://localhost:3003
REM  A estacao de servico e sempre a dos ACORES.
REM ============================================================

set "PORT=3003"
set "NODE_EXE=%~dp0bin\node.exe"

if not exist "%NODE_EXE%" (
  echo [ERRO] bin\node.exe nao encontrado nesta pasta.
  echo Copie a pasta bin\ da maquina de origem.
  pause
  exit /b 1
)

if not exist "%~dp0.next\standalone\server.js" (
  if not exist "%~dp0server.js" (
    echo [ERRO] Build standalone nao encontrado.
    echo A aplicacao ainda nao foi compilada. Execute:
    echo     npm install
    echo     npm run build
    pause
    exit /b 1
  )
)

if not exist "%~dp0terminal_logs" mkdir "%~dp0terminal_logs"
set "NODE_OPTIONS=--max-old-space-size=2048"

"%NODE_EXE%" "%~dp0launcher.js" %*

endlocal
