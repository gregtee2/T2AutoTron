@echo off
REM === KEEP WINDOW OPEN WRAPPER ===
if not defined UPDATE_WRAPPER (
    set "UPDATE_WRAPPER=1"
    cmd /k "%~f0" %*
    exit /b
)

setlocal EnableDelayedExpansion
title T2AutoTron 2.1 - Updater
color 0E

echo.
echo  ===============================================
echo     T2AutoTron 2.1 - Update Tool
echo  ===============================================
echo.

REM Get script directory
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Check for git
where git >nul 2>&1
if errorlevel 1 (
    color 0E
    echo  Git is not installed - attempting to install...
    echo.
    call :InstallGit
    where git >nul 2>&1
    if errorlevel 1 (
        echo.
        echo  ERROR: Could not install Git automatically.
        echo.
        echo  Please install Git manually from: https://git-scm.com/
        echo  Then run this update script again.
        echo.
        pause
        exit /b 1
    )
    echo  Git installed successfully!
    echo.
)

REM Check if this is a git repo - if not, convert it
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo  This folder is not yet connected to Git.
    echo  Converting to Git-enabled install...
    echo.
    call :ConvertToGit
    if errorlevel 1 (
        color 0C
        echo.
        echo  ERROR: Could not convert to Git repository.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo  Successfully connected to Git!
    echo.
)

REM Make sure we have the remote
git remote -v | findstr "origin" >nul 2>&1
if errorlevel 1 (
    echo  Adding remote origin...
    git remote add origin https://github.com/gregtee2/T2AutoTron.git
)

echo  [1/4] Checking for updates...
git fetch origin stable 2>nul
if errorlevel 1 (
    echo  Fetching all branches...
    git fetch origin
)

REM Count commits behind
for /f %%i in ('git rev-list HEAD..origin/stable --count 2^>nul') do set "BEHIND=%%i"
if "!BEHIND!"=="" set "BEHIND=0"

if "!BEHIND!"=="0" (
    color 0A
    echo.
    echo  ===============================================
    echo     Already up to date!
    echo  ===============================================
    echo.
    pause
    exit /b 0
)

echo  Found !BEHIND! new commit(s)!
echo.
echo  Recent changes:
echo  -----------------------------------------------
git log HEAD..origin/stable --oneline --no-decorate -10
echo  -----------------------------------------------
echo.

REM Check for local changes
git diff --quiet 2>nul
if errorlevel 1 (
    echo  Stashing local changes...
    git stash push -m "Auto-stash before update"
    set "STASHED=1"
)

REM Pull updates - use reset for clean update
echo  [2/4] Downloading updates...
git checkout stable 2>nul || git checkout -b stable origin/stable 2>nul
git reset --hard origin/stable
if errorlevel 1 (
    color 0C
    echo  ERROR: Update failed!
    echo.
    pause
    exit /b 1
)

REM Update dependencies
echo.
echo  [3/4] Updating backend dependencies...
cd /d "%SCRIPT_DIR%v3_migration\backend"
call npm install --silent 2>nul
if errorlevel 1 (
    echo    Running full install...
    call npm install
)

echo.
echo  [4/4] Updating frontend dependencies...
cd /d "%SCRIPT_DIR%v3_migration\frontend"
call npm install --silent 2>nul
if errorlevel 1 (
    echo    Running full install...
    call npm install
)

cd /d "%SCRIPT_DIR%"

REM Restore stashed changes if any
if defined STASHED (
    echo.
    echo  Restoring your local changes...
    git stash pop 2>nul
)

REM Done!
echo.
color 0A
echo  ===============================================
echo     Update Complete!
echo  ===============================================
echo.
echo  Updated !BEHIND! commit(s).
echo.
echo  To start T2AutoTron, double-click:
echo     start_servers.bat
echo.
echo  ===============================================
echo.
pause
exit /b 0


REM ===================================================
REM Function: Install Git
REM ===================================================
:InstallGit
echo  -----------------------------------------------
echo    Installing Git...
echo  -----------------------------------------------

REM Try winget first
where winget >nul 2>&1
if not errorlevel 1 (
    echo    Using Windows Package Manager...
    winget install Git.Git --accept-package-agreements --accept-source-agreements -h
    
    REM Refresh PATH
    set "PATH=%PATH%;C:\Program Files\Git\cmd"
    
    where git >nul 2>&1
    if not errorlevel 1 (
        exit /b 0
    )
)

REM Try Chocolatey
where choco >nul 2>&1
if not errorlevel 1 (
    echo    Using Chocolatey...
    choco install git -y
    set "PATH=%PATH%;C:\Program Files\Git\cmd"
    where git >nul 2>&1
    if not errorlevel 1 (
        exit /b 0
    )
)

echo.
echo  Could not install Git automatically.
echo  Please install from: https://git-scm.com/download/win
exit /b 1


REM ===================================================
REM Function: Convert ZIP install to Git
REM ===================================================
:ConvertToGit
echo  -----------------------------------------------
echo    Connecting to T2AutoTron repository...
echo  -----------------------------------------------
echo.

REM Initialize git repo
git init
if errorlevel 1 (
    echo  ERROR: git init failed
    exit /b 1
)

REM Add remote
git remote add origin https://github.com/gregtee2/T2AutoTron.git
if errorlevel 1 (
    echo  ERROR: Could not add remote
    exit /b 1
)

REM Fetch the stable branch
echo  Fetching latest version...
git fetch origin stable
if errorlevel 1 (
    echo  ERROR: Could not fetch from repository
    exit /b 1
)

REM Reset to stable branch (keeps local files, marks them as modified if different)
git reset origin/stable
if errorlevel 1 (
    echo  ERROR: Could not reset to stable
    exit /b 1
)

REM Checkout stable branch
git checkout -b stable
if errorlevel 1 (
    echo  ERROR: Could not checkout stable branch
    exit /b 1
)

echo  Connected to T2AutoTron repository!
exit /b 0
