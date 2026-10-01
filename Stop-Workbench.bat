@echo off
rem ============================================================
rem Personal Asset Workbench - Stop Server (Stop-Workbench.bat)
rem Gracefully stops the background Node.js server on Port 8080
rem ============================================================

powershell -NoProfile -ExecutionPolicy Bypass -Command "$conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue; if ($conn) { Stop-Process -Id $conn.OwningProcess -Force; Write-Host 'Personal Asset Workbench server (Port 8080) has been stopped.' -ForegroundColor Green } else { Write-Host 'Port 8080 is not currently active.' -ForegroundColor Yellow }"

timeout /t 3