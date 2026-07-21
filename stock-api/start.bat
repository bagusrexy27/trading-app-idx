@echo off
title IDX Stock Analyzer
echo.
echo  ========================================
echo   IDX Stock Analyzer - Production Mode
echo  ========================================
echo.
echo  Membuka: http://localhost:1111
echo  Tekan Ctrl+C untuk stop.
echo.

cd /d "%~dp0"
timeout /t 1 /nobreak >nul
start "" "http://localhost:1111"
stock-api.exe
