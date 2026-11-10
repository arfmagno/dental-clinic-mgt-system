@echo off
REM Double-click to run the clinic app on THIS computer (no hosting needed).
REM Then open http://localhost:3001 in Chrome or Edge and use "Install app" to get a desktop icon.
REM Requires Node.js 20+. Set CLINIC_PASSWORD below before real use.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, one moment...
  call npm install || goto :fail
)
if not exist apps\web\dist\index.html (
  echo Building the app, one moment...
  call npm run build || goto :fail
)
if "%CLINIC_PASSWORD%"=="" set CLINIC_PASSWORD=change-me-please
if "%AUTH_SECRET%"=="" set AUTH_SECRET=change-this-to-a-long-random-string-1234567890
set NODE_ENV=production
set PORT=3001
set HOST=127.0.0.1
start "" http://localhost:3001
call npm start
goto :eof
:fail
echo Something went wrong. Please check the messages above.
pause
