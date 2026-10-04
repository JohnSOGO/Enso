@echo off
rem SPEC 7E.2c - the SogoAI captions helper, started by Task Scheduler at startup. Lives in C:\Enso\ beside
rem captions-helper.mjs (npm run build:home) and captions-helper.env (ENSO_URL, CAPTIONS_TOKEN; never in the repo).
node --env-file=%~dp0captions-helper.env %~dp0captions-helper.mjs >> %~dp0captions-helper.log 2>&1
