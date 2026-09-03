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

:: Verificar se o Node.js esta instalado no PC ou na pen (bin/node.exe)
set "NODE_EXE=node"
if exist "%~dp0bin\node.exe" (
    set "NODE_EXE=%~dp0bin\node.exe"
    echo [INFO] A usar Node.js embutido na pen (%~dp0bin\node.exe)
) else if exist "bin\node.exe" (
    set "NODE_EXE=%CD%\bin\node.exe"
    echo [INFO] A usar Node.js embutido na pen (bin\node.exe)
) else (
    where node >nul 2>&1
    if errorlevel 1 (
        echo [ERRO] Node.js nao encontrado neste computador nem na pasta bin\!
        echo Instale o Node.js v20+ ou coloque o node.exe na pasta bin\ da pen.
        pause
        exit /b 1
    ) else (
        echo [INFO] A usar Node.js instalado no sistema.
    )
)

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

:: Aguardar 3 segundos e abrir o navegador
timeout /t 3 /nobreak >nul
start "" http://localhost:3000

exit
