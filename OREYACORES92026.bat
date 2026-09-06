@echo off
title Orey Acores - Iniciar na Pen USB
color 0B

:: Obter a letra da unidade onde este script esta a correr (ex: E:, F:, G:)
set "USB_DRIVE=%~dp0"
cd /d "%USB_DRIVE%"

echo ========================================
echo   GESTOR NAVAL OREY TECNICA - PORTATIL
echo ========================================
echo Diretorio atual: %CD%
echo.

:: O pacote e autocontido: usar apenas o Node distribuido na pasta bin.
set "NODE_EXE=%~dp0bin\node.exe"
if not exist "%~dp0bin\node.exe" (
    echo [ERRO] Node.js portatil nao encontrado em "%~dp0bin\node.exe".
    echo Recrie o pacote com PREPARAR_PACOTE_PORTATIL.ps1.
    pause
    exit /b 1
)
echo [INFO] A usar Node.js embutido na pen: %NODE_EXE%

:: Verificar se a pasta .next existe
if not exist ".next" (
    echo [ERRO] Pasta .next nao encontrada!
    echo Execute REBUILD_USB.bat neste computador primeiro.
    pause
    exit /b 1
)

:: Garantir base de dados local
if not exist "prisma\local.db" (
    if exist "prisma\schema.sqlite.prisma" (
        echo [INFO] A inicializar base de dados local...
        "%NODE_EXE%" node_modules\@prisma\client\runtime\index.js >nul 2>&1
    )
)

echo.
echo [INFO] A iniciar aplicacao...
echo [INFO] Mantenha esta janela aberta enquanto utiliza o sistema.
echo.

:: Iniciar launcher.js
start "" "%NODE_EXE%" launcher.js

exit
