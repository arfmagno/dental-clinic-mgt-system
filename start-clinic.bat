@echo off
REM Double-click to run the clinic app on THIS computer (no hosting needed).
REM Then open http://localhost:3001 in Chrome or Edge and use "Install app" to get a desktop icon.
REM Requires Node.js 20+. Set CLINIC_PASSWORD below before real use.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, one moment...
  call npm install || goto :fail
)
if not exist services\web\dist\index.html (
  echo Building the app, one moment...
  call npm run build || goto :fail
)
if "%CLINIC_PASSWORD%"=="" set CLINIC_PASSWORD=change-me-please
REM A random signing secret, made once per computer and kept with the database (never in the repo).
if not exist services\api\data mkdir services\api\data
if "%AUTH_SECRET%"=="" if not exist services\api\data\auth-secret.txt powershell -NoProfile -Command "$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })" > services\api\data\auth-secret.txt
if "%AUTH_SECRET%"=="" set /p AUTH_SECRET=<services\api\data\auth-secret.txt
set NODE_ENV=production
set PORT=3001
set HOST=127.0.0.1
start "" http://localhost:3001
call npm start
goto :eof
:fail
echo Something went wrong. Please check the messages above.
pause
