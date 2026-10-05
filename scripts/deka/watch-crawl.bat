@echo off
rem Show progress: data files, checkpoint, and the live log (Ctrl+C to exit)
echo === data files ===
dir "%LOCALAPPDATA%\lawcraft-deka-data\*.jsonl" 2>nul
echo.
echo === checkpoint ===
type "%LOCALAPPDATA%\lawcraft-deka-data\checkpoint.json" 2>nul
echo.
echo === log (Ctrl+C to exit) ===
powershell -NoProfile -Command "Get-Content -Path (Join-Path $env:LOCALAPPDATA 'lawcraft-deka-data\crawl.log') -Wait -Tail 20 -Encoding utf8"
