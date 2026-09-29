@echo off
title Backup Externo USB
cd /d "%~dp0"

set DATA=%DATE:~-4,4%%DATE:~-10,2%%DATE:~-7,2%

echo ========================================
echo   Backup Externo para USB
echo ========================================
echo.

REM Detetar unidades USB com espaco
for %%d in (E F G H I J K L M N O P Q R S T U V W X Y Z) do (
    if exist "%%d:\" (
        dir "%%d:\" >nul 2>&1
        if not errorlevel 1 (
            echo Unidade %%d: disponivel
        )
    )
)

set /p USB="Digite a letra da unidade USB (ex: E): "
if "%USB%"=="" exit /b

if not exist "%USB%:\" (
    echo ERRO: Unidade %USB%: nao encontrada
    pause
    exit /b
)

set DESTINO="%USB%:\BACKUP_ACORES_%DATA%"
echo A copiar para %DESTINO%...
mkdir %DESTINO% 2>nul

REM Copiar BD
copy "prisma\local.db" %DESTINO%\ >nul
echo [OK] Base de dados

REM Copiar backups recentes (ultimos 5)
set COUNT=0
for /f "skip=0 delims=" %%f in ('dir "backups\*.db" /b /o-d 2^>nul') do (
    if !COUNT! lss 5 (
        copy "backups\%%f" %DESTINO%\ >nul
        set /a COUNT+=1
    )
)
echo [OK] Backups recentes

REM Copiar config
copy ".env" %DESTINO%\ >nul 2>&1
echo [OK] Config

echo.
echo Backup concluido em %DESTINO%
echo Ficheiros:
dir %DESTINO% /b
pause
