@echo off
title Orey Acores 9 - Iniciar Aplicacao
cd /d "D:\Acores"

:: Verificar se o .next/standalone existe
if not exist ".next\standalone" (
    echo ERRO: Pasta .next\standalone nao encontrada!
    echo Execute primeiro o REBUILD_USB.bat para construir a aplicacao.
    pause
    exit /b 1
)

:: Verificar se o banco de dados existe
if not exist "prisma\local.db" (
    echo AVISO: Banco de dados local.db nao encontrado.
    echo A base de dados sera sincronizada do Google Drive.
)

:: Iniciar o servidor Next.js standalone
echo.
echo ========================================
echo   A iniciar Ory Acores Technica...
echo ========================================
echo.

:: Carregar variaveis de ambiente e iniciar
node launcher.js

:: Aguardar e abrir browser
timeout /t 3 /nobreak >nul
start "" http://localhost:3000