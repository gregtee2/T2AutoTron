@echo off
title T2 Local Agent
color 0B

echo.
echo  ===============================================
echo     T2AutoTron Local Agent
echo  ===============================================
echo.
echo  This agent allows the T2 web UI (even when running
echo  on a remote device like a Pi) to control Chatterbox
echo  on this computer.
echo.

REM Try to find Python from Chatterbox venv first
if exist "C:\Chatterbox\venv\Scripts\python.exe" (
    echo  Using Chatterbox Python environment...
    "C:\Chatterbox\venv\Scripts\python.exe" "%~dp0t2_agent.py" %*
) else (
    echo  Using system Python...
    python "%~dp0t2_agent.py" %*
)

pause
