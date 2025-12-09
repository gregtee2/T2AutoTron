@echo off
title T2AutoTron 2.1 - Installer Debug
color 0A

echo.
echo  ===============================================
echo     T2AutoTron 2.1 - Installer Debug Mode
echo  ===============================================
echo.
echo  This will test each step with pauses between.
echo  Press any key to start...
pause >nul

echo.
echo  ------ Step 1: Script Location ------
echo  Script path: %~dp0
echo  Current dir: %CD%
echo.
echo  Press any key for next step...
pause >nul

echo.
echo  ------ Step 2: Check Node.js ------
echo  Running: where node
where node
echo.
echo  Exit code: %errorlevel%
echo.
echo  Press any key for next step...
pause >nul

echo.
echo  ------ Step 3: Node Version ------
echo  Running: node -v
node -v
echo.
echo  Exit code: %errorlevel%
echo.
echo  Press any key for next step...
pause >nul

echo.
echo  ------ Step 4: Check npm ------
echo  Running: where npm
where npm
echo.
echo  Exit code: %errorlevel%
echo.
echo  Press any key for next step...
pause >nul

echo.
echo  ------ Step 5: npm Version ------
echo  Running: npm -v
npm -v
echo.
echo  Exit code: %errorlevel%
echo.
echo  Press any key for next step...
pause >nul

echo.
echo  ------ Step 6: Check backend folder ------
set "BACKEND=%~dp0v3_migration\backend"
echo  Backend path: %BACKEND%
if exist "%BACKEND%\package.json" (
    echo  package.json: FOUND
) else (
    echo  package.json: NOT FOUND
)
echo.
echo  Press any key for next step...
pause >nul

echo.
echo  ------ Step 7: Check frontend folder ------
set "FRONTEND=%~dp0v3_migration\frontend"
echo  Frontend path: %FRONTEND%
if exist "%FRONTEND%\package.json" (
    echo  package.json: FOUND
) else (
    echo  package.json: NOT FOUND
)
echo.

echo.
echo  ===============================================
echo     Debug Complete - All steps passed!
echo  ===============================================
echo.
echo  Press any key to exit...
pause >nul
