@echo off
setlocal EnableDelayedExpansion
title T2AutoTron
color 0B

echo.
echo  ===============================================
echo     T2AutoTron 2.1 - Starting...
echo  ===============================================
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"

REM Check if installed
if not exist "!SCRIPT_DIR!v3_migration\backend\node_modules" (
    color 0C
    echo  ERROR: Not installed yet!
    echo.
    echo  Please run install.bat first.
    echo.
    pause
    exit /b 1
)

echo  Starting backend server...
start "T2AutoTron Backend" cmd /k "cd /d !SCRIPT_DIR!v3_migration\backend && npm start"

REM Wait for backend to initialize
timeout /t 3 /nobreak >nul

echo  Starting frontend dev server...
start "T2AutoTron Frontend" cmd /k "cd /d !SCRIPT_DIR!v3_migration\frontend && npm run dev"

REM Wait for frontend to initialize
timeout /t 5 /nobreak >nul

echo.
echo  ===============================================
echo     T2AutoTron is running!
echo  ===============================================
echo.
echo  Opening browser to http://localhost:5173
echo.
echo  Two terminal windows are now running:
echo    - Backend port 3000
echo    - Frontend port 5173
echo.
echo  Close both terminal windows to stop T2AutoTron.
echo.

REM Open browser
start http://localhost:5173

echo  Press any key to close this window...
pause >nul
