@echo off
rem Safe stop: the crawler finishes the current page and exits. start-crawl.bat removes the STOP file on next run.
if not exist "%LOCALAPPDATA%\lawcraft-deka-data" mkdir "%LOCALAPPDATA%\lawcraft-deka-data"
type nul > "%LOCALAPPDATA%\lawcraft-deka-data\STOP"
echo STOP file created. The crawler will stop after the current page.
pause
