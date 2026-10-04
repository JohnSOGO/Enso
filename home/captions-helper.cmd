@echo off
rem SPEC 7E.2c - the SogoAI captions helper, started by Task Scheduler at startup: a server on 127.0.0.1:8790,
rem reached only through the sogoai Cloudflare Tunnel (cloudflared, a Windows service). Lives in C:\Enso\ beside
rem captions-helper.mjs (npm run build:home) and captions-helper.env (CAPTIONS_TOKEN only; never in the repo).
node --env-file=%~dp0captions-helper.env %~dp0captions-helper.mjs >> %~dp0captions-helper.log 2>&1
