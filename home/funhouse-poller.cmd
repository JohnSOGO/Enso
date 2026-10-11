@echo off
rem SPEC 9.4a - the FunHouse poller on the dev PC, started by Task Scheduler at logon: asks Enso for Claude's pings
rem and hands each to the FunHouse bridge (127.0.0.1:8765). Built by npm run build:home into dist\. Reads the token
rem from %USERPROFILE%\.enso\ops-notify-token (never in the repo).
node %~dp0dist\funhouse-poller.mjs >> %~dp0funhouse-poller.log 2>&1
