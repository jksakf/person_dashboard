@echo off
rem ============================================================
rem Personal Asset Workbench - Quick Launch (Start-Workbench.bat)
rem Auto start background Node.js server and open browser
rem ============================================================

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$tcp = New-Object System.Net.Sockets.TcpClient; try { $tcp.Connect('127.0.0.1', 8080); $tcp.Close(); exit 0 } catch { Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden; exit 0 }"

start http://localhost:8080/workbench.html
exit