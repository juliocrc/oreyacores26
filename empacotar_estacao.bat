@echo off
setlocal enabledelayedexpansion

set ESTACAO=%1
if "%ESTACAO%"=="" (
    echo Uso: empacotar_estacao.bat NOME_ESTACAO
    echo Exemplo: empacotar_estacao.bat ACORES
    exit /b 1
)

echo.
echo === A empacotar %ESTACAO% ===

if "%ESTACAO%"=="ACORES" (
    set "ORIGEM=%~dp0"
    if "!ORIGEM:~-1!"=="\" set "ORIGEM=!ORIGEM:~0,-1!"
) else (
    set "ORIGEM=D:\%ESTACAO%"
)

if not exist "%ORIGEM%" (
    echo ERRO: %ORIGEM% nao encontrada
    exit /b 1
)

set DATA=%DATE:~-4,4%%DATE:~-10,2%%DATE:~-7,2%
set ZIP_NAME=Orey_%ESTACAO%_%DATA%.zip
set WORK_DIR=%TEMP%\orey_zip_%ESTACAO%

echo Origem: %ORIGEM%
echo ZIP: %ZIP_NAME%

REM Criar diretorio de trabalho
if exist "%WORK_DIR%" rmdir /s /q "%WORK_DIR%"
mkdir "%WORK_DIR%"

REM Copiar ficheiros excluindo pastas grandes
robocopy "%ORIGEM%" "%WORK_DIR%" /E /NJH /NJS /NP /NDL /XD node_modules .next >nul

REM Copiar .next e node_modules
if exist "%ORIGEM%\.next" (
    echo A copiar .next...
    robocopy "%ORIGEM%\.next" "%WORK_DIR%\.next" /E /NJH /NJS /NP >nul
)
if exist "%ORIGEM%\node_modules" (
    echo A copiar node_modules...
    robocopy "%ORIGEM%\node_modules" "%WORK_DIR%\node_modules" /E /NJH /NJS /NP >nul
)

REM Criar ZIP
echo A criar %ZIP_NAME%...
powershell -Command "Add-Type -Assembly 'System.IO.Compression.FileSystem'; [System.IO.Compression.ZipFile]::CreateFromDirectory('%WORK_DIR%', '%CD%\%ZIP_NAME%')"

echo ZIP criado: %CD%\%ZIP_NAME%
endlocal
