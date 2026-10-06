@echo off
rem Crawl Thai Supreme Court judgment summaries (as published by the court) to local disk.
rem Newest -> oldest, resumable. Output: %LOCALAPPDATA%\lawcraft-deka-data  (outside the repo)
rem Usage:  start-crawl.bat              (all years 2463-2569)
rem         start-crawl.bat 2560 2569    (year range only)
set FROM=%1
set TO=%2
if "%FROM%"=="" set FROM=2463
if "%TO%"=="" set TO=2569

rem 1) open Edge with a separate profile + debug port 9333 (do NOT close that window while crawling)
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9333 --user-data-dir="%LOCALAPPDATA%\lawcraft-deka-profile" https://deka.supremecourt.or.th
echo Waiting 8 seconds for Edge to open...
timeout /t 8 /nobreak >nul

rem 2) remove an old STOP file, then start
if exist "%LOCALAPPDATA%\lawcraft-deka-data\STOP" del "%LOCALAPPDATA%\lawcraft-deka-data\STOP"
cd /d E:\boi\app\scripts\deka
echo Crawling years %FROM% to %TO% (0.5-1.5 s delay per page). Press Ctrl+C to stop; run again to resume.
node crawl.mjs --from %FROM% --to %TO% --delay-min 500 --delay-max 1500
echo.
echo Finished or stopped. See the end of: %LOCALAPPDATA%\lawcraft-deka-data\crawl.log
pause