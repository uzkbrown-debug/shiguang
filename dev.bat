@echo off
REM 开发模式一键启动：后端 (8000) + 前端 next dev (3000)
REM 生产模式请用 start.bat（会先 next build 再 next start）
setlocal
cd /d "%~dp0"

echo ==========================================
echo    Shiguang dev  -  backend + next dev
echo ==========================================
echo.

echo [1/2] 后端   http://127.0.0.1:8000   （API 文档 /docs）
start "Shiguang Backend (dev)" /D "%~dp0backend" cmd /k start-backend.bat
timeout /t 3 >nul

echo [2/2] 前端   http://localhost:3000
start "Shiguang Frontend (dev)" /D "%~dp0" cmd /k "npm run dev"

echo.
echo 两个窗口都起来后，浏览器打开 http://localhost:3000
echo 关闭对应窗口即可停止该服务。
echo.
pause
