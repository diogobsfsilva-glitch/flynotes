@echo off
rem FlyNotes - arranque no Windows (duplo clique). Requer o Node.js 22 ou superior: https://nodejs.org
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js nao esta instalado. Instale a versao LTS em https://nodejs.org e volte a abrir este ficheiro.
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo  A instalar a FlyNotes pela primeira vez. Pode demorar alguns minutos...
  call npm install
  if errorlevel 1 ( echo  A instalacao falhou. & pause & exit /b 1 )
)
start "" /b cmd /c "timeout /t 12 /nobreak >nul & start http://localhost:5173"
call npm start
pause
