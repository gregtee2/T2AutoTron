@echo off
setlocal enabledelayedexpansion
title T2AutoTron Installer
color 0A

echo.
echo  ===============================================
echo     T2AutoTron 2.1 - One-Click Installer
echo  ===============================================
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Check for Node.js
echo [1/4] Checking for Node.js...
where node >nul 2>&1
if errorlevel 1 (
    color 0C
    echo.
    echo  ERROR: Node.js is not installed!
    echo.
    echo  Please install Node.js 18+ from:
    echo  https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Check Node version
for /f "tokens=1 delims=v" %%a in ('node -v') do set NODE_VER=%%a
for /f "tokens=1 delims=." %%a in ('node -v') do set NODE_MAJOR=%%a
set NODE_MAJOR=%NODE_MAJOR:v=%
echo    Found Node.js %NODE_VER%

if %NODE_MAJOR% LSS 18 (
    color 0E
    echo.
    echo  WARNING: Node.js %NODE_VER% detected. Version 18+ recommended.
    echo.
    timeout /t 3 >nul
)

REM Install backend dependencies
echo.
echo [2/4] Installing backend dependencies...
cd "%SCRIPT_DIR%v3_migration\backend"
if not exist "node_modules" (
    call npm install
    if errorlevel 1 (
        color 0C
        echo  ERROR: Backend npm install failed!
        pause
        exit /b 1
    )
) else (
    echo    Already installed, skipping...
)

REM Install frontend dependencies  
echo.
echo [3/4] Installing frontend dependencies...
cd "%SCRIPT_DIR%v3_migration\frontend"
if not exist "node_modules" (
    call npm install
    if errorlevel 1 (
        color 0C
        echo  ERROR: Frontend npm install failed!
        pause
        exit /b 1
    )
) else (
    echo    Already installed, skipping...
)

REM Create empty .env if it doesn't exist
echo.
echo [4/4] Preparing configuration...
cd "%SCRIPT_DIR%v3_migration\backend"
if not exist ".env" (
    echo # T2AutoTron Environment Configuration> .env
    echo # Configure via Settings UI in the app>> .env
    echo.>> .env
    echo PORT=3000>> .env
    echo    Created default .env file
) else (
    echo    Configuration file exists
)

REM Done!
echo.
color 0A
echo  ===============================================
echo     Installation Complete!
echo  ===============================================
echo.
echo  To start T2AutoTron, run:
echo.
echo     start.bat
echo.
echo  Or manually:
echo     Terminal 1: cd v3_migration\backend ^&^& npm start
echo     Terminal 2: cd v3_migration\frontend ^&^& npm run dev
echo.
echo  Then open: http://localhost:5173
echo.
echo  First time? Click "Settings ^& API Keys" to configure
echo  your Home Assistant, Hue, or other integrations.
echo.
pause
