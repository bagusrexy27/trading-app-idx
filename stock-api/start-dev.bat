@echo off
title IDX Stock Analyzer - Dev
echo.
echo  ========================================
echo   IDX Stock Analyzer - Development Mode
echo  ========================================
echo.
echo  Backend  : http://localhost:1111
echo  Frontend : http://localhost:5173  (hot reload)
echo.
echo  Dua jendela terminal akan terbuka.
echo  Tutup keduanya untuk stop semua.
echo.

cd /d "%~dp0"

:: Start backend in new window with Air (live-reload)
start "IDX Backend :1111 [air]" cmd /k "cd /d "%~dp0" && air"

:: Wait backend ready
timeout /t 2 /nobreak >nul

:: Start frontend in new window
start "IDX Frontend :5173" cmd /k "cd /d "%~dp0ui" && npm run dev"

:: Wait frontend ready then open browser
timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"
