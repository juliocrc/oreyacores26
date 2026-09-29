@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Gestor Naval Pro - Parar Servidor
cd /d "%~dp0"

echo ====================================================
echo   PARAR SERVIDOR - GESTOR NAVAL
echo ====================================================
echo.

set "KILLED=0"

REM --- 1) Parar pelo PID guardado pelo launcher (mais seguro) ---
if exist "%~dp0terminal_logs\server.pid" (
  set /p SPID=<"%~dp0terminal_logs\server.pid"
  if defined SPID (
    echo A parar PID guardado: !SPID!
    taskkill /F /PID !SPID! >nul 2>&1
    if !errorlevel! equ 0 (
      echo [OK] Processo !SPID! terminado.
      set "KILLED=1"
    ) else (
      echo [INFO] Processo !SPID! ja nao existia.
    )
  )
)

REM --- 2) Fallback: parar pela porta registada no ficheiro server.port ---
if "!KILLED!"=="0" (
  set "PORT="
  if exist "%~dp0terminal_logs\server.port" (
    set /p PORT=<"%~dp0terminal_logs\server.port"
  )
  if defined PORT (
    echo A procurar processos na porta !PORT!...
    for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":!PORT!" ^| findstr "LISTENING"') do (
      echo A parar processo na porta !PORT!, PID: %%a
      taskkill /F /PID %%a >nul 2>&1
      set "KILLED=1"
    )
  )
)

REM --- 3) Ultimo recurso: procurar node.exe que serviu esta app ---
if "!KILLED!"=="0" (
  echo A procurar processos node.exe associados a esta aplicacao...
  for /f "tokens=2" %%P in ('tasklist /fi "imagename eq node.exe" /v /fo csv 2^>nul ^| findstr /i "launcher.js"') do (
    set "TPID=%%~P"
    echo A terminar PID: !TPID!
    taskkill /F /PID !TPID! >nul 2>&1
    set "KILLED=1"
  )
)

REM --- Limpar ficheiro PID e porta ---
if exist "%~dp0terminal_logs\server.pid" del "%~dp0terminal_logs\server.pid"
if exist "%~dp0terminal_logs\server.port" del "%~dp0terminal_logs\server.port"

echo.
if "!KILLED!"=="1" (
  echo Servidor parado com sucesso.
) else (
  echo Nenhum servidor ativo encontrado.
)
echo.
timeout /t 2 >nul
exit /b 0
