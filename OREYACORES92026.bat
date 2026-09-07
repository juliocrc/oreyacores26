@echo off
title Orey Acores - Portatil
color 0B
setlocal
cd /d "%~dp0"

echo ========================================
echo   GESTOR NAVAL OREY TECNICA - PORTATIL
echo ========================================
echo Diretorio atual: %CD%
echo.

:: O pacote e autocontido: usar apenas o Node distribuido na pasta bin.
set "NODE_EXE=%~dp0bin\node.exe"
if not exist "%NODE_EXE%" (
    echo [ERRO] Node.js portatil nao encontrado em "%~dp0bin\node.exe".
    echo Recrie o pacote com PREPARAR_PACOTE_PORTATIL.ps1.
    pause
    exit /b 1
)

:: Verificar se a pasta .next existe
if not exist "%~dp0.next" (
    echo [ERRO] Pasta .next nao encontrada!
    echo Execute REBUILD_USB.bat neste computador primeiro.
    pause
    exit /b 1
)

if not exist "%~dp0terminal_logs" mkdir "%~dp0terminal_logs"

:: Limitar memoria para PCs fracos e evitar crashes por OOM.
set "NODE_OPTIONS=--max-old-space-size=2048"

echo [INFO] A iniciar aplicacao...
echo [INFO] Mantenha esta janela aberta enquanto utiliza o sistema.
echo [INFO] Registos e erros em: terminal_logs\launcher.log
echo.
echo ----------------------------------------------------------------------
echo  Se a aplicacao fechar, abra terminal_logs\launcher.log para ver o
echo  motivo. A aplicacao funciona sem ser administrador (dados caiem
echo  para a pasta do utilizador se a pen/ACL bloquear escrita).
echo ----------------------------------------------------------------------
echo.

"%NODE_EXE%" "%~dp0launcher.js"

echo.
echo [INFO] O servidor terminou (codigo %ERRORLEVEL%).
echo [INFO] Detalhes e erros em terminal_logs\launcher.log
echo.
pause