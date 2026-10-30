@echo off
setlocal
rem Use the installed Electron runtime; no extra Node installation is required.
set "ELECTRON_RUN_AS_NODE=1"
if exist "%~dp0..\..\..\QQ Agent.exe" goto installed
if exist "%~dp0..\node_modules\electron\dist\electron.exe" goto source
node "%~dp0extension-dev.mjs" %*
exit /b %errorlevel%
:installed
"%~dp0..\..\..\QQ Agent.exe" "%~dp0extension-dev.mjs" %*
exit /b %errorlevel%
:source
"%~dp0..\node_modules\electron\dist\electron.exe" "%~dp0extension-dev.mjs" %*
exit /b %errorlevel%
