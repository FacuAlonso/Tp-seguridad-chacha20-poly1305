@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js no esta disponible. Instala Node.js y vuelve a ejecutar.
  pause
  exit /b 1
)
echo Iniciando servidor local del laboratorio...
start "Laboratorio - servidor" cmd /k "cd /d ""%~dp0"" && node servidor.js"
echo Esperando a que el servidor responda...
powershell -NoProfile -Command "$ok=$false; for($i=0; $i -lt 30; $i++){try{$r=Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/info' -UseBasicParsing -TimeoutSec 1; if($r.StatusCode -eq 200){$ok=$true;break}}catch{};Start-Sleep -Milliseconds 350};if(-not $ok){exit 1}"
if errorlevel 1 (
  echo ERROR: No se pudo iniciar el servidor. Revisa la ventana 'Laboratorio - servidor'.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:3000"
exit /b 0
