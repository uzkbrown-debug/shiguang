@echo off
setlocal
cd /d "%~dp0"
title Shiguang Backend (close this window to stop)

echo ==========================================
echo    Shiguang Backend  (FastAPI + MySQL)
echo ==========================================
echo.

if not exist ".env" (
  echo [ERROR] backend\.env not found.
  echo Please copy .env.example to .env and fill in MYSQL_PASSWORD.
  echo.
  pause
  exit /b 1
)

python --version >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python not found. Please install Python 3.10+
  pause
  exit /b 1
)

python -c "import fastapi, sqlalchemy, pymysql" >nul 2>nul
if errorlevel 1 (
  echo Installing python dependencies...
  python -m pip install -r requirements.txt
)

echo Starting backend at http://127.0.0.1:8000
echo API docs: http://127.0.0.1:8000/docs
echo.
echo Close this window to stop the backend.
echo.

python -m uvicorn main:app --host 127.0.0.1 --port 8000

echo.
echo Backend stopped.
pause
