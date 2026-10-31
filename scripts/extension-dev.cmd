@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required to run the extension CLI.
  exit /b 1
)
node "%~dp0extension-dev.mjs" %*
exit /b %errorlevel%
