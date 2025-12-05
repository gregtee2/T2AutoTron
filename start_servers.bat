@echo off
setlocal enabledelayedexpansion
REM Batch file to sequentially start the T2AutoTron2.1 backend, frontend (Vite), and Electron
REM Project directory: C:\X_T2_AutoTron2.1
REM Backend port: 3000
REM Frontend port: 5173
REM Log file: C:\X_T2_AutoTron2.1\start_autotron.log

REM Initialize logging
set "LOGFILE=C:\X_T2_AutoTron2.1\start_autotron.log"
echo Starting batch file at %DATE% %TIME% > "%LOGFILE%"

REM Navigate to the project directory
echo Navigating to project directory... >> "%LOGFILE%"
cd /d C:\X_T2_AutoTron2.1
if errorlevel 1 (
    echo ERROR: Failed to navigate to C:\X_T2_AutoTron2.1 >> "%LOGFILE%"
    echo ERROR: Failed to navigate to C:\X_T2_AutoTron2.1
    pause
    exit /b 1
)
echo Successfully navigated to C:\X_T2_AutoTron2.1 >> "%LOGFILE%"

REM Initialize variables
set "BACKEND_PORT=3000"
set "FRONTEND_PORT=5173"
set "MAX_ATTEMPTS=10"
set "CHECK_INTERVAL=2"

REM Check for Node.js and npm
echo Checking for Node.js and npm... >> "%LOGFILE%"
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install Node.js. >> "%LOGFILE%"
    echo ERROR: Node.js not found. Please install Node.js.
    pause
    exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm not found. Please install npm. >> "%LOGFILE%"
    echo ERROR: npm not found. Please install npm.
    pause
    exit /b 1
)
echo Node.js and npm are available. >> "%LOGFILE%"

REM Kill existing Node.js and Electron processes
echo Terminating existing Node.js processes... >> "%LOGFILE%"
taskkill /IM node.exe /F >nul 2>>"%LOGFILE%"
if errorlevel 1 (
    echo WARNING: Failed to terminate Node.js processes. >> "%LOGFILE%"
) else (
    echo Terminated Node.js processes. >> "%LOGFILE%"
)
echo Terminating existing Electron processes... >> "%LOGFILE%"
taskkill /IM electron.exe /F >nul 2>>"%LOGFILE%"
if errorlevel 1 (
    echo WARNING: Failed to terminate Electron processes. >> "%LOGFILE%"
) else (
    echo Terminated Electron processes. >> "%LOGFILE%"
)
timeout /t 2 /nobreak >nul

REM Start the backend server
echo Starting backend... >> "%LOGFILE%"
cd v3_migration\backend
start "Backend" /MIN cmd /k "npm start"
if errorlevel 1 (
    echo ERROR: Failed to start backend. >> "%LOGFILE%"
    echo ERROR: Failed to start backend.
    pause
    exit /b 1
)
cd ..\..

REM Wait for backend to bind to port
echo Waiting for backend to start... >> "%LOGFILE%"
set "ATTEMPTS=0"
:wait_for_backend
timeout /t %CHECK_INTERVAL% /nobreak >nul
netstat -ano | findstr ":%BACKEND_PORT%" | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo Backend started successfully on port %BACKEND_PORT%. >> "%LOGFILE%"
    echo Backend started successfully on port %BACKEND_PORT%.
) else (
    set /a ATTEMPTS+=1
    if !ATTEMPTS! lss %MAX_ATTEMPTS% (
        echo Backend not ready after !ATTEMPTS! attempts. Retrying... >> "%LOGFILE%"
        echo Backend not ready after !ATTEMPTS! attempts. Retrying...
        goto wait_for_backend
    ) else (
        echo ERROR: Backend failed to start after %MAX_ATTEMPTS% attempts. >> "%LOGFILE%"
        echo ERROR: Backend failed to start after %MAX_ATTEMPTS% attempts. Check the backend window for errors.
        pause
        exit /b 1
    )
)

REM Start the Frontend (Vite)
echo Starting Frontend (Vite)... >> "%LOGFILE%"
cd v3_migration\frontend
start "Frontend" /MIN cmd /k "npm run dev"
if errorlevel 1 (
    echo ERROR: Failed to start frontend. >> "%LOGFILE%"
    echo ERROR: Failed to start frontend.
    pause
    exit /b 1
)
cd ..\..

REM Wait a bit for Vite to spin up (it's usually fast but good to wait)
timeout /t 5 /nobreak >nul

REM Start Electron
echo Starting Electron... >> "%LOGFILE%"
cd v3_migration\backend
start "Electron" /MIN cmd /k "npm run start:electron"
if errorlevel 1 (
    echo ERROR: Failed to start Electron. >> "%LOGFILE%"
    echo ERROR: Failed to start Electron.
    pause
    exit /b 1
)

echo All services started. >> "%LOGFILE%"
echo All services started.
pause
exit /b 0
