@echo off
setlocal enabledelayedexpansion
title T2AutoTron 2.1 - Installer
color 0A

REM Prevent immediate close on any error
if "%1"=="" (
    echo Starting installer... Press any key to continue or close window to cancel.
    pause >nul
)

REM Wrap everything in a try-catch style approach
call :MainInstall
echo.
echo  DEBUG: MainInstall returned, pausing...
pause
exit /b 0

:MainInstall
echo.
echo  ===============================================
echo     T2AutoTron 2.1 - One-Click Installer
echo  ===============================================
echo.
echo  Script location: %~dp0
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
echo  DEBUG: SCRIPT_DIR=%SCRIPT_DIR%
cd /d "%SCRIPT_DIR%"
echo  DEBUG: Changed to directory, now in %CD%

REM ===================================================
REM Step 1: Check/Install Node.js
REM ===================================================
echo [1/5] Checking for Node.js...
where node
if errorlevel 1 (
    echo    Node.js not found. Installing automatically...
    call :InstallNodeJS
    if errorlevel 1 (
        color 0C
        echo.
        echo  ERROR: Failed to install Node.js automatically.
        echo  Please install Node.js 20 LTS manually from:
        echo  https://nodejs.org/
        echo.
        pause
        exit /b 1
    )
    
    REM Refresh environment variables
    echo    Refreshing environment...
    call refreshenv >nul 2>&1
    
    REM Check again after adding to PATH
    set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"
    where node >nul 2>&1
    if errorlevel 1 (
        echo.
        echo  Node.js was installed but requires a system restart.
        echo  Please RESTART YOUR COMPUTER and run install.bat again.
        echo.
        pause
        exit /b 0
    )
)

REM Check Node version
for /f "tokens=*" %%a in ('node -v') do set NODE_VER=%%a
echo    Found Node.js %NODE_VER%

REM Extract major version number
set NODE_MAJOR=%NODE_VER:~1,2%
if "%NODE_MAJOR:~1,1%"=="." set NODE_MAJOR=%NODE_MAJOR:~0,1%

if %NODE_MAJOR% LSS 18 (
    color 0E
    echo.
    echo  WARNING: Node.js %NODE_VER% detected. Version 18+ is required.
    echo  The installer will attempt to upgrade Node.js...
    echo.
    call :InstallNodeJS
)

REM ===================================================
REM Step 2: Check for npm
REM ===================================================
echo.
echo [2/5] Checking for npm...
where npm >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  ERROR: npm not found! This should come with Node.js.
    echo  Please reinstall Node.js from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('npm -v') do set NPM_VER=%%a
echo    Found npm %NPM_VER%

REM ===================================================
REM Step 3: Install backend dependencies
REM ===================================================
echo.
echo [3/5] Installing backend dependencies...
cd "%SCRIPT_DIR%v3_migration\backend"
if not exist "package.json" (
    color 0C
    echo  ERROR: package.json not found in backend folder!
    echo  Make sure you extracted the full T2AutoTron package.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo    Running npm install (this may take a few minutes)...
    call npm install --loglevel=error
    if errorlevel 1 (
        color 0C
        echo  ERROR: Backend npm install failed!
        echo  Check your internet connection and try again.
        pause
        exit /b 1
    )
    echo    Backend dependencies installed successfully!
) else (
    echo    Already installed, verifying...
    call npm install --loglevel=error >nul 2>&1
)

REM ===================================================
REM Step 4: Install frontend dependencies
REM ===================================================
echo.
echo [4/5] Installing frontend dependencies...
cd "%SCRIPT_DIR%v3_migration\frontend"
if not exist "package.json" (
    color 0C
    echo  ERROR: package.json not found in frontend folder!
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo    Running npm install (this may take a few minutes)...
    call npm install --loglevel=error
    if errorlevel 1 (
        color 0C
        echo  ERROR: Frontend npm install failed!
        pause
        exit /b 1
    )
    echo    Frontend dependencies installed successfully!
) else (
    echo    Already installed, verifying...
    call npm install --loglevel=error >nul 2>&1
)

REM ===================================================
REM Step 5: Create configuration
REM ===================================================
echo.
echo [5/5] Preparing configuration...
cd "%SCRIPT_DIR%v3_migration\backend"
if not exist ".env" (
    (
        echo # T2AutoTron Environment Configuration
        echo # You can configure these via Settings UI in the app
        echo.
        echo PORT=3000
        echo.
        echo # Home Assistant - configure in Settings UI
        echo # HA_URL=http://homeassistant.local:8123
        echo # HA_TOKEN=your_long_lived_access_token
        echo.
        echo # Debug logging - set to true for verbose output
        echo VERBOSE_LOGGING=false
    ) > .env
    echo    Created default .env configuration
) else (
    echo    Configuration file already exists
)

REM ===================================================
REM Installation Complete!
REM ===================================================
echo.
color 0A
echo  ===============================================
echo     Installation Complete!
echo  ===============================================
echo.
echo  To start T2AutoTron:
echo.
echo     1. Double-click  start.bat
echo        -or-
echo     2. Run from command line: start.bat
echo.
echo  The app will open in your default browser at:
echo     http://localhost:5173
echo.
echo  First time? Click "Settings" gear icon to configure
echo  your Home Assistant, Hue, or other integrations.
echo.
echo  ===============================================
echo.
goto :eof


REM ===================================================
REM Function: Install Node.js automatically
REM ===================================================
:InstallNodeJS
echo.
echo  -----------------------------------------------
echo    Installing Node.js 20 LTS...
echo  -----------------------------------------------
echo.

REM Check if winget is available (Windows 10 1709+ / Windows 11)
where winget >nul 2>&1
if not errorlevel 1 (
    echo    Using Windows Package Manager (winget)...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements -h
    if not errorlevel 1 (
        echo    Node.js installed successfully via winget!
        goto :RefreshPath
    )
)

REM Check if chocolatey is available
where choco >nul 2>&1
if not errorlevel 1 (
    echo    Using Chocolatey package manager...
    choco install nodejs-lts -y
    if not errorlevel 1 (
        echo    Node.js installed successfully via Chocolatey!
        goto :RefreshPath
    )
)

REM Fallback: Download and run MSI installer
echo    Downloading Node.js installer...
set "NODE_MSI=%TEMP%\node-v20.10.0-x64.msi"
set "NODE_URL=https://nodejs.org/dist/v20.10.0/node-v20.10.0-x64.msi"

REM Try PowerShell download
echo    Downloading from nodejs.org...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_MSI%'" 2>nul
if not exist "%NODE_MSI%" (
    REM Try curl as fallback
    echo    Trying alternative download method...
    curl -L -o "%NODE_MSI%" "%NODE_URL%" 2>nul
)

if not exist "%NODE_MSI%" (
    echo.
    echo    ERROR: Failed to download Node.js installer.
    echo    Please download and install manually from:
    echo    https://nodejs.org/
    echo.
    exit /b 1
)

echo    Running Node.js installer...
echo    (You may see a UAC prompt - please click Yes)
msiexec /i "%NODE_MSI%" /passive /norestart
set INSTALL_RESULT=%errorlevel%

del "%NODE_MSI%" >nul 2>&1

if %INSTALL_RESULT% NEQ 0 (
    if %INSTALL_RESULT% NEQ 3010 (
        echo    WARNING: Installer returned code %INSTALL_RESULT%
    )
)

:RefreshPath
REM Add Node.js to PATH for this session
set "PATH=%PATH%;C:\Program Files\nodejs"
set "PATH=%PATH%;%APPDATA%\npm"

REM Verify installation worked
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo    Node.js was installed but PATH update requires restart.
    exit /b 1
)

echo    Node.js installation complete!
exit /b 0
