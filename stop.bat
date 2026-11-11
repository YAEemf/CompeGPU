@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\server-control.ps1" -Action Stop
if errorlevel 1 (
    echo.
    pause
    exit /b 1
)
exit /b 0
