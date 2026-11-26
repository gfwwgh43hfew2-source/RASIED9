@echo off
chcp 65001 >nul
set "TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\hikvision_bridge_start.bat"
> "%TARGET%" echo @echo off
>> "%TARGET%" echo start "" /min cmd /c "%~dp0start_bridge.bat"
echo تم: الجسر سيعمل تلقائياً عند تشغيل الكمبيوتر وتسجيل الدخول.
pause
