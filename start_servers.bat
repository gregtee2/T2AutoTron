@echo off
setlocal enabledelayedexpansion
REM Batch file to sequentially start the T2AutoTron2.1 backend, frontend (Vite), and Electron
REM Backend port: 3000
REM Frontend port: 5173

REM Get script directory
set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%v3_migration\backend"
set "FRONTEND_DIR=%SCRIPT_DIR%v3_migration\frontend"

REM Initialize variables
set "BACKEND_PORT=3000"
set "FRONTEND_PORT=5173"
set "MAX_ATTEMPTS=10"
set "CHECK_INTERVAL=2"

echo.
echo  ===============================================
echo     T2AutoTron 2.1 - Starting Services
echo  ===============================================
echo.
echo  Script directory: %SCRIPT_DIR%
echo  Backend directory: %BACKEND_DIR%
echo.

REM Check for Node.js and npm
echo Checking for Node.js and npm...
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install Node.js.
    pause
    exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm not found. Please install npm.
    pause
    exit /b 1
)
echo Node.js and npm are available.

REM Kill existing Node.js and Electron processes
echo Terminating existing Node.js processes...
taskkill /IM node.exe /F >nul 2>&1
echo Terminating existing Electron processes...
taskkill /IM electron.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul

REM Start the backend server
echo Starting backend...
start "Backend" /D "%BACKEND_DIR%" /MIN cmd /k npm start

REM Wait for backend to bind to port
echo Waiting for backend to start...
set "ATTEMPTS=0"
:wait_for_backend
timeout /t %CHECK_INTERVAL% /nobreak >nul
netstat -ano | findstr ":%BACKEND_PORT%" | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo Backend started successfully on port %BACKEND_PORT%.
) else (
    set /a ATTEMPTS+=1
    if !ATTEMPTS! lss %MAX_ATTEMPTS% (
        echo Backend not ready after !ATTEMPTS! attempts. Retrying...
        goto wait_for_backend
    ) else (
        echo ERROR: Backend failed to start after %MAX_ATTEMPTS% attempts.
        pause
        exit /b 1
    )
)

REM Start the Frontend (Vite)
echo Starting Frontend Vite...
start "Frontend" /D "%FRONTEND_DIR%" /MIN cmd /k npm run dev

REM Wait a bit for Vite to spin up
timeout /t 5 /nobreak >nul

REM Start Electron
echo Starting Electron...
start "Electron" /D "%BACKEND_DIR%" /MIN cmd /k npm run start:electron

echo.
echo  ===============================================
echo     All services started!
echo  ===============================================
echo.
echo  Open browser to: http://localhost:5173
echo.
pause
exit /b 0
