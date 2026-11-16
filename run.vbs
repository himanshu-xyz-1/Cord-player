Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\projects\Cord-player"
cmd = Chr(34) & "C:\Program Files\Python312\pythonw.exe" & Chr(34) & " " & Chr(34) & "C:\projects\Cord-player\main.py" & Chr(34)
WshShell.Run cmd, 0, False
