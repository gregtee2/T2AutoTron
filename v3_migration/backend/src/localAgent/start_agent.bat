@echo off
title T2 Local Agent
color 0B

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ============================================
    echo     ERROR: Python is not installed!
    echo  ============================================
    echo.
    echo  The T2 Local Agent requires Python 3.8+
    echo.
    echo  Please install Python from:
    echo     https://www.python.org/downloads/
    echo.
    echo  Make sure to check "Add Python to PATH"
    echo  during installation!
    echo.
    pause
    exit /b 1
)

REM Run the agent (it has its own setup wizard)
python "%~dp0t2_agent.py" %*

REM If we get here, the agent stopped
echo.
echo  Agent stopped.
pause
