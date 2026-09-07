@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=%~dp0bin\node.exe"
if not exist "%NODE_EXE%" exit /b 1

if not exist "%~dp0terminal_logs" mkdir "%~dp0terminal_logs"
set "NODE_OPTIONS=--max-old-space-size=2048"

"%NODE_EXE%" "%~dp0launcher.js"