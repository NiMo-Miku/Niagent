@echo off
rem Keep this file ASCII-only for cmd compatibility.
setlocal
set "ROOT=%~dp0"
set "ELECTRON=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON%" (
  echo Electron runtime not found: "%ELECTRON%"
  echo Run npm install before starting QQ Agent.
  pause
  exit /b 1
)
rem WorkBuddy/Electron hosts may leak this flag and force Electron into Node mode.
set "ELECTRON_RUN_AS_NODE="
pushd "%~dp0"
rem Use \., not a quoted path ending in a backslash: cmd otherwise passes a trailing quote to Electron.
start "" /b "%ELECTRON%" "%~dp0."
popd
exit /b 0
