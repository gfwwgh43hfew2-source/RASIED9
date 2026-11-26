@echo off
set "TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\hikvision_bridge_start.bat"
> "%TARGET%" echo @echo off
>> "%TARGET%" echo start "" /min cmd /c "%~dp0start_bridge.bat"
echo Done. The bridge will start automatically when Windows starts.
pause
