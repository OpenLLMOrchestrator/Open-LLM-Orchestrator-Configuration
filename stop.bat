@echo off
setlocal
cd /d "%~dp0"

echo Stopping OLO dev environment...
echo.

REM Only stop processes we started (by command-line match). Do NOT kill by port -
REM that can terminate Docker or other apps using 8082/5173 and cause Docker API errors.

REM Stop Spring Boot backend (Java process running our app)
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -match 'OloConfigApplication|olo-config-backend' } | ForEach-Object { Write-Host 'Stopping backend PID' $_.ProcessId; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

REM Stop Vite frontend (Node process running vite in this project's frontend folder)
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -match 'vite' -and $_.CommandLine -match 'frontend' } | ForEach-Object { Write-Host 'Stopping frontend PID' $_.ProcessId; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo.
echo OLO dev processes stopped. Redis and Docker were not touched.
endlocal
