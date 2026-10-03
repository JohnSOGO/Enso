' Launcher for the LAN relay (SPEC §9.2), run at logon via a shortcut in the user's
' Startup folder — same pattern as HomeAssistant\ha-watchdog-task.vbs: hidden window,
' duplicate guard, restart loop. The relay writes its own relay.log; a crash's stderr
' lands in relay-crash.log (both gitignored).
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
Set procs = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE Name='node.exe' AND CommandLine LIKE '%relay.ts%'")
If procs.Count > 0 Then WScript.Quit

Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\Public\git\Enso"
Do
  sh.Run "cmd /c node_modules\.bin\tsx.cmd relay\relay.ts 2>> relay\relay-crash.log", 0, True
  WScript.Sleep 30000
Loop
