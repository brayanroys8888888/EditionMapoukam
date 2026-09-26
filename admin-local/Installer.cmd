@echo off
chcp 65001 >nul
rem Administration locale Mapoukam - installation (voir LISEZMOI.md)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer.ps1"
echo.
pause
