@echo off
echo Starting IP Camera Discovery...
node "C:\Users\Me\ip-camera-discovery\discoverIPcameras.js"
if %ERRORLEVEL% NEQ 0 (
    echo Error: Failed to run the script. Check Node.js installation or file path.
    pause
) else (
    echo Script completed.
    pause
)