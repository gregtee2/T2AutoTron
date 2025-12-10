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
    color 0C
    echo  ERROR: Git is not installed!
    echo.
    echo  Please install Git from: https://git-scm.com/
    echo  Or download the latest ZIP from GitHub:
    echo  https://github.com/gregtee2/T2AutoTron/archive/refs/heads/main.zip
    echo.
    pause
    exit /b 1
)

REM Check if this is a git repo
if not exist ".git" (
    color 0C
    echo  ERROR: This folder is not a Git repository!
    echo.
    echo  If you downloaded as ZIP, you cannot use this updater.
    echo  Instead, download a fresh ZIP from:
    echo  https://github.com/gregtee2/T2AutoTron/archive/refs/heads/main.zip
    echo.
    pause
    exit /b 1
)

REM Show current version
echo  Current branch:
git branch --show-current
echo.

REM Check for uncommitted changes
git diff --quiet 2>nul
if errorlevel 1 (
    color 0E
    echo  WARNING: You have uncommitted local changes!
    echo.
    echo  These files have been modified:
    git diff --name-only
    echo.
    echo  Options:
    echo    1. Press Y to stash changes and continue
    echo    2. Press N to cancel update
    echo.
    set /p "STASH=Stash changes and continue? (Y/N): "
    if /i "!STASH!"=="Y" (
        echo  Stashing local changes...
        git stash push -m "Auto-stash before update %DATE% %TIME%"
        echo  Your changes are saved. Use 'git stash pop' to restore them.
        echo.
    ) else (
        echo  Update cancelled.
        pause
        exit /b 0
    )
)

REM Fetch and show what's new
echo  [1/3] Checking for updates...
git fetch origin stable

REM Count commits behind
for /f %%i in ('git rev-list HEAD..origin/stable --count 2^>nul') do set "BEHIND=%%i"
if "%BEHIND%"=="" set "BEHIND=0"

if "%BEHIND%"=="0" (
    color 0A
    echo.
    echo  ===============================================
    echo     Already up to date!
    echo  ===============================================
    echo.
    pause
    exit /b 0
)

echo  Found %BEHIND% new commit(s)!
echo.
echo  Recent changes:
echo  -----------------------------------------------
git log HEAD..origin/stable --oneline --no-decorate -10
echo  -----------------------------------------------
echo.

REM Pull updates
echo  [2/3] Downloading updates...
git pull origin stable
if errorlevel 1 (
    color 0C
    echo  ERROR: Git pull failed!
    echo  There may be merge conflicts.
    echo.
    pause
    exit /b 1
)

REM Update dependencies
echo.
echo  [3/3] Updating dependencies...

echo    Backend...
cd /d "%SCRIPT_DIR%v3_migration\backend"
call npm install --silent
if errorlevel 1 (
    echo    Warning: Backend npm install had issues
)

echo    Frontend...
cd /d "%SCRIPT_DIR%v3_migration\frontend"
call npm install --silent
if errorlevel 1 (
    echo    Warning: Frontend npm install had issues
)

cd /d "%SCRIPT_DIR%"

REM Done!
echo.
color 0A
echo  ===============================================
echo     Update Complete!
echo  ===============================================
echo.
echo  Updated %BEHIND% commit(s).
echo.
echo  To start T2AutoTron, run:
echo    start.bat
echo.
echo  ===============================================
echo.
pause
exit /b 0
