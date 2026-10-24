@echo off
echo Stopping mhr-cfw proxy and clearing Windows system proxy...

REM Disable system proxy (Internet Settings)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyServer /t REG_SZ /d "" /f >nul 2>&1

REM Reset WinHTTP proxy
netsh winhttp reset proxy >nul 2>&1

REM Kill listeners on 8085 and 1080
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8085" ^| findstr "LISTENING"') do (
  echo Killing PID %%P on 8085
  taskkill /PID %%P /F /T >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":1080" ^| findstr "LISTENING"') do (
  echo Killing PID %%P on 1080
  taskkill /PID %%P /F /T >nul 2>&1
)

echo Done. System proxy should be OFF now.
pause
