' ============================================================
' Personal Asset Workbench - Silent Launcher (Start-Workbench.vbs)
' Zero black console window, background Node.js server, auto open browser.
' ============================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Ensure working directory is set to script root
WshShell.CurrentDirectory = scriptDir

' Check Port 8080 and launch background Node.js if not yet running (completely silent)
psCmd = "powershell -NoProfile -ExecutionPolicy Bypass -Command """ & _
        "$tcp = New-Object System.Net.Sockets.TcpClient; " & _
        "try { $tcp.Connect('127.0.0.1', 8080); $tcp.Close(); exit 0 } catch { " & _
        "Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory '" & scriptDir & "' -WindowStyle Hidden; exit 0 }"""

WshShell.Run psCmd, 0, True

' Wait 0.5s for Node.js server to be fully ready before opening browser
WScript.Sleep 500

' Open workbench in default browser
WshShell.Run "http://localhost:8080/workbench.html", 1, False
