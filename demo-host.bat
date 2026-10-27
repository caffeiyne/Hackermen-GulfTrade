@echo off
REM ============================================================
REM  GulfTrade Intelligence — Demo Host Launcher
REM  Run this on the laptop that will be the "server" for judges.
REM  Others just open http://YOUR-IP:3000 in their browser.
REM ============================================================

echo.
echo  ============================================
echo   GulfTrade Demo Host — Starting Services
echo  ============================================
echo.

REM --- Get this machine's LAN IP ---
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set LAN_IP=%%a
)
set LAN_IP=%LAN_IP: =%

echo  Your LAN IP: %LAN_IP%
echo.
echo  Judges/teammates can open:
echo    http://%LAN_IP%:3000
echo.
echo  Starting backend on port 8000...
echo.

REM --- Start backend ---
start "GulfTrade Backend" cmd /k "cd /d "%~dp0simulator" && uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo  Starting frontend on port 3000 (accepting external connections)...
echo.

REM --- Start frontend bound to all interfaces ---
start "GulfTrade Frontend" cmd /k "cd /d "%~dp0dashboard" && npx next dev -H 0.0.0.0 -p 3000"

echo  ============================================
echo   Both services are starting!
echo   
echo   Dashboard:  http://%LAN_IP%:3000
echo   API docs:    http://%LAN_IP%:8000/docs
echo   
echo   Share the dashboard URL with judges.
echo   They just open it in their browser - no install needed.
echo  ============================================
echo.
echo  Close this window when done. 
echo  To stop: close the two backend/frontend windows.
echo.
pause
