@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Shiguang (close this window to stop the site)
set LOG=tools\startup-log.ps1
set STARTED=%TIME%

echo ==========================================
echo    Shiguang  -  starting up
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install it from https://nodejs.org
  echo.
  pause
  exit /b 1
)

set HAS_PYTHON=1
where python >nul 2>nul
if errorlevel 1 (
  set HAS_PYTHON=0
  echo [WARN] Python not found - the backend part will not start.
  echo.
)

REM ---------- 1. build check (must happen before the site can start) ----------
set /a BUILD_AT=0
powershell -NoProfile -ExecutionPolicy Bypass -File "%LOG%" -Stage build -State running >nul 2>nul
echo [1/3] build .............. checking
if not exist ".next\BUILD_ID" goto :dobuild
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\needs-build.ps1"
if errorlevel 1 goto :dobuild

echo       build .............. up to date, skipped
goto :builddone

:dobuild
echo       build .............. building, about a minute
echo.
call node node_modules\next\dist\bin\next build
if errorlevel 1 goto :buildfail
echo.

:builddone
call :elapsed
set /a BUILD_SEC=!ELAPSED!-!BUILD_AT!
if !BUILD_SEC! LSS 0 set /a BUILD_SEC=0
powershell -NoProfile -ExecutionPolicy Bypass -File "%LOG%" -Stage build -State done -Seconds !BUILD_SEC! >nul 2>nul

REM ---------- 2. site + browser + backend ----------
echo [2/3] site ............... opening the page first
echo.
echo   Address : http://localhost:3000
echo   The browser opens as soon as the port answers;
echo   the memory service starts right after, while the intro animation plays.
echo   This window stays open while the site runs - closing it stops the site.
echo.
echo ==========================================
echo.

REM 后台等端口通了就开浏览器；这段逻辑放在独立的 ps1 里，别塞进 cmd 的引号里
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -File "tools\open-when-ready.ps1"

powershell -NoProfile -ExecutionPolicy Bypass -File "%LOG%" -Stage site -State running >nul 2>nul

node node_modules\next\dist\bin\next start --port 3000

call :elapsed
powershell -NoProfile -ExecutionPolicy Bypass -File "%LOG%" -Stage site -State done -Seconds !ELAPSED! >nul 2>nul
echo.
echo Site stopped  (total !ELAPSED!s)
pause
exit /b 0

:buildfail
powershell -NoProfile -ExecutionPolicy Bypass -File "%LOG%" -Stage build -State done >nul 2>nul
echo.
echo [ERROR] the site could not be built or started. See the messages above.
pause
exit /b 1

REM ---------- helpers ----------
:elapsed
for /f "tokens=1-4 delims=:.," %%a in ("%STARTED%") do set /a _s1=(%%a*3600)+(%%b*60)+%%c
for /f "tokens=1-4 delims=:.," %%a in ("%TIME%") do set /a _s2=(%%a*3600)+(%%b*60)+%%c
set /a _d=_s2-_s1
if !_d! LSS 0 set /a _d+=86400
set ELAPSED=!_d!
exit /b 0
