@echo off
rem Daily forward-test run (docs/rapor-indikator-plan.md, Fase 6 #1).
rem Scheduled Mon-Fri 17:00 by Windows Task Scheduler ("IDX Rapor uji maju").
rem 1) make sure the backend is up and has the day's final candles (update-all),
rem 2) run both report cards; each appends research\forward\[sehat\]<date>.json.
rem Days missed while the PC was off are caught up on the next run.
rem Output: research\out\forward_daily.log (gitignored). Logs still need a git commit.
setlocal
cd /d "%~dp0.."
set LOG=research\out\forward_daily.log
if not exist research\out mkdir research\out
echo ===== %date% %time% >> %LOG%

curl -s -m 5 http://localhost:1111/api/ihsg >nul 2>&1
if errorlevel 1 (
  echo backend down, starting it >> %LOG%
  start "IDX Backend :1111" /d "%cd%" cmd /k air
  curl -s -m 5 --retry 45 --retry-connrefused --retry-delay 2 --retry-all-errors http://localhost:1111/api/ihsg >nul 2>&1
)
curl -s -m 900 -X POST http://localhost:1111/api/stocks/update-all >nul 2>&1 || echo update-all failed >> %LOG%

go run ./research/rapor >> %LOG% 2>&1
go run ./research/rapor -universe sehat >> %LOG% 2>&1
echo done %time% >> %LOG%
