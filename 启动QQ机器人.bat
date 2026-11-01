@echo off
rem Keep this file ASCII-only for cmd compatibility.
setlocal
rem Change this to move the web console to another port.
set "PORT=3210"
set "QQ_AGENT_PORT=%PORT%"
set "ROOT=%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install it from https://nodejs.org/ first.
  pause
  exit /b 1
)
if not exist "%ROOT%node_modules\ws\" (
  echo Installing dependencies, please wait...
  pushd "%ROOT%"
  call npm install --omit=dev
  popd
)
if not exist "%ROOT%node_modules\ws\" (
  echo npm install failed. Run "npm install" manually inside the project folder.
  pause
  exit /b 1
)
chcp 65001 >nul
echo ==============================================
echo  Ni·QQagent starting...
echo  Open in your browser: http://127.0.0.1:%PORT%
echo  (Port is configurable at the top of this file.)
echo ==============================================
pushd "%ROOT%"
node src\server.js
popd
pause
exit /b 0
