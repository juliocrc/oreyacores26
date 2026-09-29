@echo off
title Agendar Backup Automatico - Executar como Administrador
cd /d "%~dp0"

echo ========================================
echo   Agendar Backup Automatico
echo ========================================
echo.
echo Este script precisa de ser executado como ADMINISTRADOR.
echo.
echo Clique com o botao direito e escolha "Executar como administrador"
echo.
pause

REM Diario as 17:30
schtasks /Create /SC DAILY /TN "OreyAcoresBackup" /TR "\"%~dp0BACKUP_AUTOMATICO.bat\"" /ST 17:30 /RL HIGHEST /F

REM Ao iniciar o Windows
schtasks /Create /SC ONSTART /TN "OreyAcoresBackupStartup" /TR "\"%~dp0BACKUP_AUTOMATICO.bat\"" /RL HIGHEST /F

echo.
echo Tarefas criadas:
schtasks /Query /TN "OreyAcoresBackup" /FO LIST /V
schtasks /Query /TN "OreyAcoresBackupStartup" /FO LIST /V

pause