@echo off
setlocal
cd /d "%~dp0"

echo Starting OLO dev environment...
echo.

REM Optional: start Redis in a new window if redis-server is on PATH
where redis-server >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo Starting Redis...
  start "OLO Redis" cmd /k "redis-server"
  timeout /t 2 /nobreak >nul
) else (
  echo Redis not found in PATH. Start Redis manually or run: docker run -d -p 6379:6379 redis:7-alpine
  echo.
)

echo Starting backend (Spring Boot)...
start "OLO Backend" cmd /k "cd /d "%~dp0backend" && mvn spring-boot:run"

echo Waiting for backend to open...
timeout /t 5 /nobreak >nul

echo Starting frontend (Vite)...
start "OLO Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Dev environment started.
echo - Backend:  http://localhost:8082
echo - Frontend: http://localhost:5173
echo - Close the OLO Backend / OLO Frontend windows to stop, or run stop.bat
echo.
endlocal
