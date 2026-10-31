@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Shiguang (close this window to stop the site)
set LOG=tools\startup-log.ps1
set PS=powershell -NoProfile -ExecutionPolicy Bypass -File
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

where python >nul 2>nul
if errorlevel 1 (
  echo [WARN] Python not found - the memory service will not start,
  echo        the site will run without photos/guides from the database.
  echo.
)

echo [0/3] cleanup ........... freeing ports 3000 / 8000
%PS% "tools\prepare-ports.ps1"

REM ????????????????????????????
%PS% "%LOG%" -Reset >nul 2>nul

REM ---------- 1. build check (must happen before the site can start) ----------
call :elapsed
set /a BUILD_AT=!ELAPSED!
%PS% "%LOG%" -Stage build -State running >nul 2>nul
echo [1/3] build .............. checking
if not exist ".next\BUILD_ID" goto :dobuild
%PS% "tools\needs-build.ps1"
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
%PS% "%LOG%" -Stage build -State done -Seconds !BUILD_SEC! >nul 2>nul

REM ---------- 2. site + browser + backend ----------
echo [2/3] site ............... opening the page first
echo.
echo   Address : http://localhost:3000
echo   Login   : demo / demo123456   (or register a new account)
echo   The browser opens as soon as the port answers;
echo   the memory service starts right after, while the intro animation plays.
echo   This window stays open while the site runs - closing it stops the site.
echo.
echo ==========================================
echo.

REM ??????????????????????????? ps1 ????? cmd ????
start "" /b %PS% "tools\open-when-ready.ps1"

%PS% "%LOG%" -Stage site -State running >nul 2>nul

node node_modules\next\dist\bin\next start --port 3000

call :elapsed
%PS% "tools\stop-backend.ps1"
%PS% "%LOG%" -Stage site -State done -Seconds !ELAPSED! >nul 2>nul
echo.
echo Site stopped  (total !ELAPSED!s)
pause
exit /b 0

:buildfail
%PS% "%LOG%" -Stage build -State done >nul 2>nul
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
