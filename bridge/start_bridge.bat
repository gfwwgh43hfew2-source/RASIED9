@echo off
cd /d "%~dp0"
title Hikvision Bridge
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

python --version >nul 2>&1
if errorlevel 1 (
  echo Python was not found. Install Python and tick "Add python.exe to PATH".
  pause
  exit /b 1
)

python -c "import requests" >nul 2>&1
if errorlevel 1 (
  echo Installing requests library...
  python -m pip install requests
)

:loop
echo.
echo [%date% %time%] Starting bridge...
python hikvision_bridge.py
echo Bridge stopped. Restarting in 10 seconds... (close this window to stop)
timeout /t 10 /nobreak >nul
goto loop
