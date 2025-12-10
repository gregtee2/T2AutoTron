@echo off
REM === KEEP WINDOW OPEN WRAPPER ===
REM If we're not already in a wrapper, restart ourselves in one
if not defined INSTALL_WRAPPER (
    set "INSTALL_WRAPPER=1"
    cmd /k "%~f0" %*
    exit /b
)

setlocal EnableDelayedExpansion
title T2AutoTron 2.1 - Installer
color 0A

echo.
echo  ===============================================
echo     T2AutoTron 2.1 - One-Click Installer
echo  ===============================================
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM ===================================================
REM Step 1: Check for Node.js
REM ===================================================
echo [1/5] Checking for Node.js...

where node >nul 2>&1
if errorlevel 1 (
    echo    Node.js not found. Installing automatically...
    echo.
    call :InstallNodeJS
    if errorlevel 1 (
        goto :NodeInstallFailed
    )
    
    REM Add Node.js to PATH for this session
    set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"
    
    REM Verify it worked
    where node >nul 2>&1
    if errorlevel 1 (
        echo.
        echo  Node.js was installed but PATH needs a restart.
        echo  Please CLOSE this window, RESTART your computer,
        echo  then run install.bat again.
        echo.
        pause
        exit /b 0
    )
    echo    Node.js installed successfully!
) else (
    for /f "tokens=*" %%a in ('node -v') do echo    Found Node.js %%a
)

REM ===================================================
REM Step 2: Check for npm
REM ===================================================
echo.
echo [2/5] Checking for npm...

where npm >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  ERROR: npm not found!
    echo  npm should be included with Node.js.
    echo  Please reinstall Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('npm -v') do echo    Found npm %%a

REM ===================================================
REM Step 3: Install backend dependencies
REM ===================================================
echo.
echo [3/5] Installing backend dependencies...

set "BACKEND=%SCRIPT_DIR%v3_migration\backend"
if not exist "!BACKEND!\package.json" (
    color 0C
    echo  ERROR: Backend package.json not found!
    echo  Expected: !BACKEND!\package.json
    echo  Make sure you extracted the complete T2AutoTron package.
    echo.
    pause
    exit /b 1
)

cd /d "!BACKEND!"
if not exist "node_modules" (
    echo    Running npm install - this may take 1-2 minutes...
    cmd /c npm install
    if not exist "node_modules" (
        color 0C
        echo  ERROR: Backend npm install failed!
        echo  Check your internet connection and try again.
        echo.
        pause
        exit /b 1
    )
    echo    Backend dependencies installed!
) else (
    echo    Dependencies already installed, verifying...
    cmd /c npm install --silent
    echo    Backend OK!
)

REM ===================================================
REM Step 4: Install frontend dependencies
REM ===================================================
echo.
echo [4/5] Installing frontend dependencies...

set "FRONTEND=%SCRIPT_DIR%v3_migration\frontend"
if not exist "!FRONTEND!\package.json" (
    color 0C
    echo  ERROR: Frontend package.json not found!
    echo  Expected: !FRONTEND!\package.json
    echo.
    pause
    exit /b 1
)

cd /d "!FRONTEND!"
if not exist "node_modules" (
    echo    Running npm install - this may take 1-2 minutes...
    cmd /c npm install
    if not exist "node_modules" (
        color 0C
        echo  ERROR: Frontend npm install failed!
        echo.
        pause
        exit /b 1
    )
    echo    Frontend dependencies installed!
) else (
    echo    Dependencies already installed, verifying...
    cmd /c npm install --silent
    echo    Frontend OK!
)

REM ===================================================
REM Step 5: Create default configuration
REM ===================================================
echo.
echo [5/5] Setting up configuration...

cd /d "!BACKEND!"
if not exist ".env" (
    echo # T2AutoTron Environment Configuration> .env
    echo # Configure these via the Settings UI in the app>> .env
    echo.>> .env
    echo PORT=3000>> .env
    echo.>> .env
    echo # Skip MongoDB connection - set to true if you dont have MongoDB>> .env
    echo SKIP_MONGODB=true>> .env
    echo.>> .env
    echo # Home Assistant - set via Settings UI>> .env
    echo # HA_URL=http://homeassistant.local:8123>> .env
    echo # HA_TOKEN=your_long_lived_access_token>> .env
    echo.>> .env
    echo # Debug logging>> .env
    echo VERBOSE_LOGGING=false>> .env
    echo    Created default .env file
) else (
    echo    Configuration already exists
)

REM ===================================================
REM Done!
REM ===================================================
echo.
color 0A
echo  ===============================================
echo     Installation Complete!
echo  ===============================================
echo.
echo  To start T2AutoTron:
echo.
echo     Double-click:  start_servers.bat
echo.
echo  The app will open in Electron (desktop window).
echo.
echo  First time? Click the Settings (gear) icon to
echo  configure Home Assistant, Hue, etc.
echo.
echo  ===============================================
echo.
pause
exit /b 0


REM ===================================================
REM Function: Install Node.js
REM ===================================================
:InstallNodeJS
echo  -----------------------------------------------
echo    Installing Node.js 20 LTS...
echo  -----------------------------------------------
echo.

REM Try winget first - Windows 10/11
where winget >nul 2>&1
if not errorlevel 1 (
    echo    Using Windows Package Manager winget...
    cmd /c winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements -h
    where node >nul 2>&1
    if not errorlevel 1 (
        echo    Installed via winget!
        exit /b 0
    )
    echo    winget install failed, trying alternative...
)

REM Try Chocolatey if available
where choco >nul 2>&1
if not errorlevel 1 (
    echo    Using Chocolatey...
    cmd /c choco install nodejs-lts -y
    where node >nul 2>&1
    if not errorlevel 1 (
        echo    Installed via Chocolatey!
        exit /b 0
    )
    echo    Chocolatey install failed, trying direct download...
)

REM Direct download as last resort
echo    Downloading Node.js installer from nodejs.org...
set "NODE_MSI=%TEMP%\node-install.msi"

powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile '%NODE_MSI%' -UseBasicParsing"

if not exist "%NODE_MSI%" (
    echo    ERROR: Failed to download Node.js installer.
    echo    Please download manually from https://nodejs.org/
    exit /b 1
)

echo    Running Node.js installer...
echo    You may see a UAC prompt - click Yes
msiexec /i "%NODE_MSI%" /passive /norestart

REM Clean up
del "%NODE_MSI%" 2>nul

REM Check if it worked
set "PATH=%PATH%;C:\Program Files\nodejs"
where node >nul 2>&1
if errorlevel 1 (
    echo    Installation may require a restart.
    exit /b 1
)

echo    Node.js installed successfully!
exit /b 0


:NodeInstallFailed
color 0C
echo.
echo  ===============================================
echo    Could not install Node.js automatically
echo  ===============================================
echo.
echo  Please install Node.js manually:
echo.
echo    1. Go to: https://nodejs.org/
echo    2. Download the LTS version (recommended)
echo    3. Run the installer
echo    4. Run this install.bat again
echo.
pause
exit /b 1
