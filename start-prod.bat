@echo off
setlocal
cd /d "%~dp0"
title Shiguang Server - Production (close this window to stop the site)

echo ==========================================
echo    Shiguang - Production mode
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install it from https://nodejs.org
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1',3000); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo Server is already running. Opening the browser...
  start http://localhost:3000
  timeout /t 3 /nobreak >nul
  exit /b 0
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo Building production bundle (this may take a while)...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed. See the messages above.
  pause
  exit /b 1
)

echo.
echo Starting production server, browser will open soon...
echo URL: http://localhost:3000
echo.

start "" cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:3000"

node node_modules\next\dist\bin\next start --port 3000

echo.
echo Server stopped.
pause