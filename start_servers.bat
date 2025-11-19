@echo off
REM Batch file to sequentially start the T2AutoTron2.0 backend and Electron frontend
REM Project directory: C:\X_T2_AutoTron2.0
REM Backend port: 3000
REM Log file: C:\X_T2_AutoTron2.0\start_autotron.log

REM Initialize logging
set "LOGFILE=C:\X_T2_AutoTron2.0\start_autotron.log"
echo Starting batch file at %DATE% %TIME% > "%LOGFILE%"

REM Navigate to the project directory
echo Navigating to project directory... >> "%LOGFILE%"
cd /d C:\X_T2_AutoTron2.0
if errorlevel 1 (
    echo ERROR: Failed to navigate to C:\X_T2_AutoTron2.0 >> "%LOGFILE%"
    echo ERROR: Failed to navigate to C:\X_T2_AutoTron2.0
    pause
    exit /b 1
)
echo Successfully navigated to C:\X_T2_AutoTron2.0 >> "%LOGFILE%"

REM Initialize variables
set "BACKEND_PORT=3000"
set "MAX_ATTEMPTS=5"
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

REM Check and clear port 3000 (backend)
echo Checking and clearing port %BACKEND_PORT%... >> "%LOGFILE%"
call :check_and_clear_port %BACKEND_PORT%
if %errorlevel% equ 1 (
    echo Port %BACKEND_PORT% still in use. Switching to 3001... >> "%LOGFILE%"
    set "BACKEND_PORT=3001"
    call :check_and_clear_port %BACKEND_PORT%
    if %errorlevel% equ 1 (
        echo ERROR: Failed to clear port %BACKEND_PORT%. >> "%LOGFILE%"
        echo ERROR: Failed to clear port %BACKEND_PORT%.
        pause
        exit /b 1
    )
)

REM Clear Electron cache (skip npm cache to avoid permissions issues)
echo Clearing Electron cache... >> "%LOGFILE%"
if exist electron-cache (
    rmdir /s /q electron-cache >> "%LOGFILE%" 2>&1
    if errorlevel 1 (
        echo WARNING: Failed to clear Electron cache. >> "%LOGFILE%"
    ) else (
        echo Electron cache cleared. >> "%LOGFILE%"
    )
) else (
    echo No Electron cache found. >> "%LOGFILE%"
)

REM Start the backend server
echo Starting backend on port %BACKEND_PORT%... >> "%LOGFILE%"
start "Backend - Port %BACKEND_PORT%" cmd /k "set PORT=%BACKEND_PORT% && call npm run start:backend"
if errorlevel 1 (
    echo ERROR: Failed to start backend. >> "%LOGFILE%"
    echo ERROR: Failed to start backend.
    pause
    exit /b 1
)

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

REM Start the Electron frontend
echo Starting Electron frontend... >> "%LOGFILE%"
start "Frontend" cmd /k "call npm run start:electron"
if errorlevel 1 (
    echo ERROR: Failed to start Electron frontend. >> "%LOGFILE%"
    echo ERROR: Failed to start Electron frontend.
    pause
    exit /b 1
)

echo Backend started on port %BACKEND_PORT%, Electron frontend launched. >> "%LOGFILE%"
echo Backend started on port %BACKEND_PORT%, Electron frontend launched.
pause
exit /b 0

REM Subroutine to check and clear a port
:check_and_clear_port
set "PORT=%1"
set "ATTEMPTS=0"
set "PID_FOUND="

:retry_port
echo Checking port %PORT%... >> "%LOGFILE%"
for /f "tokens=1-5" %%A in ('netstat -ano ^| findstr ":%PORT%"') do (
    if "%%D"=="LISTENING" (
        set "PID_FOUND=%%E"
        if "!PID_FOUND!"=="0" (
            echo WARNING: Port %PORT% reported as in use by PID 0, which is unusual. >> "%LOGFILE%"
        ) else (
            echo Port %PORT% is in use by PID !PID_FOUND!. Attempting to terminate... >> "%LOGFILE%"
            taskkill /PID !PID_FOUND! /F >> "%LOGFILE%" 2>&1
            if errorlevel 1 (
                echo WARNING: Failed to terminate process PID !PID_FOUND! on port %PORT%. >> "%LOGFILE%"
            ) else (
                echo Terminated process PID !PID_FOUND! on port %PORT%. >> "%LOGFILE%"
            )
        )
    )
)

timeout /t 2 /nobreak >nul
netstat -ano | findstr ":%PORT%" | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    set /a ATTEMPTS+=1
    if !ATTEMPTS! lss %MAX_ATTEMPTS% (
        echo Port %PORT% still in use after attempt !ATTEMPTS!. Retrying... >> "%LOGFILE%"
        goto retry_port
    ) else (
        echo ERROR: Port %PORT% still in use after %MAX_ATTEMPTS% attempts. >> "%LOGFILE%"
        exit /b 1
    )
) else (
    echo Port %PORT% is clear. >> "%LOGFILE%"
    exit /b 0
)