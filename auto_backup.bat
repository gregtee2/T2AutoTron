@echo off
REM Auto-backup script - commits all changes with timestamp
REM Run via Task Scheduler every 4-6 hours

cd /d "c:\X_T2_AutoTron2.1"

REM Check if there are any changes
git status --porcelain > nul 2>&1
if %errorlevel% neq 0 (
    echo No git repo found
    exit /b 1
)

REM Get current timestamp
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "timestamp=%dt:~0,4%-%dt:~4,2%-%dt:~6,2% %dt:~8,2%:%dt:~10,2%"

REM Stage all changes
git add -A

REM Check if there's anything to commit
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo [%timestamp%] No changes to backup
    exit /b 0
)

REM Commit with auto-backup message
git commit -m "auto-backup: %timestamp%"
echo [%timestamp%] Auto-backup committed successfully

REM Push to GitHub for offsite backup
git push origin main
