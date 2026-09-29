@echo off
title Preparar Pacote Standalone Acores
cd /d "%~dp0"

set DATA=%DATE:~-4,4%%DATE:~-10,2%%DATE:~-7,2%
set ZIP_NAME=Orey_Acores_Standalone_%DATA%.zip
set WORK_DIR=%TEMP%\orey_standalone

echo ========================================
echo   Preparar Pacote Standalone Acores
echo ========================================
echo.
echo A criar pacote para distribuicao...

if exist "%WORK_DIR%" rmdir /s /q "%WORK_DIR%"
mkdir "%WORK_DIR%"

REM Copiar todos os ficheios exceto node_modules e .next
xcopy /E /I /Q /Y "%~dp0*" "%WORK_DIR%" >nul 2>&1

REM Remover pastas grandes e desnecessarias do pacote
for %%d in (node_modules .next .git .vercel backups terminal_logs) do (
    if exist "%WORK_DIR%\%%d" rmdir /s /q "%WORK_DIR%\%%d"
)

REM Manter apenas ficheiros essenciais para producao
echo.
echo Ficheiros incluidos no pacote:
dir "%WORK_DIR%" /b

echo.
echo A compactar...
powershell -Command "Add-Type -Assembly 'System.IO.Compression.FileSystem'; [System.IO.Compression.ZipFile]::CreateFromDirectory('%WORK_DIR%', '.\%ZIP_NAME%')"

if exist "%WORK_DIR%" rmdir /s /q "%WORK_DIR%"

echo.
echo Pacote criado: %ZIP_NAME%
echo.
echo Instrucoes:
echo 1. Extrair o ZIP no PC de destino
echo 2. Instalar Node.js v20+ se nao estiver instalado
echo 3. Executar INICIAR_ACORES.bat
echo.
pause
