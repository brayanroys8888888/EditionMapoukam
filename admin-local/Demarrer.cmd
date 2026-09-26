@echo off
chcp 65001 >nul
rem Administration locale Mapoukam - demarrage (voir LISEZMOI.md)
title Administration Mapoukam
cd /d "%~dp0.."
node admin-local\lanceur.mjs
if errorlevel 1 pause
