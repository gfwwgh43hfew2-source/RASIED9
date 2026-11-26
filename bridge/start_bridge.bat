@echo off
chcp 65001 >nul
cd /d "%~dp0"
title جسر بصمة Hikvision
python -c "import requests" 2>nul
if errorlevel 1 (
  echo جاري تثبيت مكتبة requests ...
  pip install requests
)
:loop
echo [%date% %time%] تشغيل الجسر ...
python hikvision_bridge.py
echo الجسر توقف — إعادة التشغيل بعد 10 ثواني ...
timeout /t 10 /nobreak >nul
goto loop
