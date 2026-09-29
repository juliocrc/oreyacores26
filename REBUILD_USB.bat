@echo off
title Rebuild Orey Acores
color 0B
cd /d "%~dp0"

echo ========================================
echo   REBUILD - Orey Tecnica Acores
echo ========================================
echo.

REM --- Detetar Node.js ---
set "NODE_CMD="
if exist "%~dp0bin\node.exe" (
    set "NODE_CMD=%~dp0bin\node.exe"
) else (
    where node >nul 2>&1
    if %errorlevel%==0 (
        set "NODE_CMD=node"
    ) else (
        echo [ERRO] Node.js nao encontrado!
        echo   Copie a pasta bin/ ou instale Node.js.
        pause
        exit /b 1
    )
)

echo Node.js: %NODE_CMD%
echo.

if not exist "node_modules\next\dist\bin\next" (
    if not exist "node_modules\next\dist\next" (
        echo [ERRO] node_modules incompleto!
        echo Execute npm install primeiro.
        pause
        exit /b 1
    )
)

echo [INFO] A eliminar build anterior...
if exist ".next" (
    rmdir /s /q ".next" 2>nul
    echo [OK] Build anterior eliminado
)

echo.
echo [INFO] A fazer rebuild completo...
echo [INFO] Isto demora 3-5 minutos. Nao feche a janela!
echo.

set "NODE_OPTIONS=--max-old-space-size=4096"
"%NODE_CMD%" "node_modules\next\dist\bin\next" build --webpack
set "NODE_OPTIONS="

if errorlevel 1 (
    echo.
    echo [ERRO] Build falhou!
    echo Verifique se tem espaco em disco e se node_modules esta completo.
    pause
    exit /b 1
)

echo.
echo [OK] Build concluido com sucesso!
echo.

echo [INFO] A preparar standalone...
if exist ".next\standalone" (
    if not exist ".next\standalone\.next\static" (
        xcopy /s /e /i /y ".next\static" ".next\standalone\.next\static" >nul 2>&1
        echo [OK] .next\static copiado
    )
    if not exist ".next\standalone\public" (
        if exist "public" (
            xcopy /s /e /i /y "public" ".next\standalone\public" >nul 2>&1
            echo [OK] public copiado
        )
    )
    if not exist ".next\standalone\prisma" (
        if exist "prisma" (
            xcopy /s /e /i /y "prisma" ".next\standalone\prisma" >nul 2>&1
            echo [OK] prisma copiado
        )
    )
    if not exist ".next\standalone\templates" (
        if exist "templates" (
            xcopy /s /e /i /y "templates" ".next\standalone\templates" >nul 2>&1
            echo [OK] templates copiado
        )
    )
    if not exist ".next\standalone\bin" (
        if exist "bin" (
            xcopy /s /e /i /y "bin" ".next\standalone\bin" >nul 2>&1
            echo [OK] bin copiado
        )
    )

    REM Copiar server.js para raiz para compatibilidade com launcher.js
    if not exist "server.js" (
        copy /Y ".next\standalone\server.js" "server.js" >nul 2>&1
        echo [OK] server.js copiado para raiz
    )
)

echo.
echo ========================================
echo   Build e standalone preparados!
echo   Execute INICIAR.bat para iniciar.
echo ========================================
echo.
pause
