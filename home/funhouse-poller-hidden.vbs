' SPEC 9.4a - starts funhouse-poller.cmd with no window (style 0) and waits for it, so Task Scheduler sees it
' running (MultipleInstances IgnoreNew keeps one copy). Activity: home\funhouse-poller.log.
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WScript.Quit sh.Run("cmd /c """ & dir & "\funhouse-poller.cmd""", 0, True)
