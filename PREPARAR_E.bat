@echo off
title Preparar Orey Acores para E:
cd /d "%~dp0"

echo ========================================
echo   Preparar Orey Acores para E:
echo ========================================
echo.
echo Este script prepara a aplicacao para
echo funcionar na unidade E: (USB/Pendrive).
echo.
echo Requer: ~6 GB livres em E:
echo.

if not exist "E:\" (
    echo ERRO: Unidade E: nao encontrada
    pause
    exit /b 1
)

echo A copiar ficheiros (pode demorar alguns minutos)...
echo.

REM Copiar tudo exceto pastas grandes
robocopy "%~dp0" "E:\Acores" /E /NJH /NJS /NP /NDL /XD .git .vercel backups terminal_logs server_prod.log node_modules .next > nul

REM Copiar node_modules (necessario para rebuild)
echo A copiar node_modules...
robocopy "%~dp0\node_modules" "E:\Acores\node_modules" /E /NJH /NJS /NP /NDL > nul

REM Copiar bin (node.exe)
robocopy "%~dp0\bin" "E:\Acores\bin" /E /NJH /NJS /NP /NDL > nul

REM Copiar .next (standalone ja built)
if exist "%~dp0\.next" (
    echo A copiar .next standalone...
    robocopy "%~dp0\.next" "E:\Acores\.next" /E /NJH /NJS /NP /NDL > nul
)

REM Ativar modo portatil (BD local + sincronizacao com a pen)
echo Este modo usa esta pen como base de dados portatil. Nao apagar. > "E:\Acores\PORTABLE.txt"

echo.
echo Ficheiros copiados!
echo.
echo ========================================
echo   A aplicacao esta pronta em E:\Acores
echo ========================================
echo.
echo Para usar:
echo   1. Abrir E:\Acores
echo   2. Executar CRIAR_ATALHO.bat (cria atalho com icone no Ambiente
echo      de Trabalho apontando para a pen)
echo   3. Clicar no atalho "GESTOR NAVAL"
echo   4. Abrir http://localhost:3000
echo.
echo A abrir E:\Acores no Explorador de Ficheiros...
explorer E:\Acores

pause
