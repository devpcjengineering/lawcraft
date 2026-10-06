@echo off
rem Parallel crawl: แบ่งช่วงปีละ 5 ปี รันหลาย worker พร้อมกัน (แต่ละตัวมี Edge แยก profile/port)
rem Usage:  start-crawl-parallel.bat                    (2463-2569, 4 workers)
rem         start-crawl-parallel.bat 2463 2536 3        (ช่วงปี + จำนวน worker)
rem ห้ามรัน start-crawl.bat ตัวเดิมพร้อมกัน ไม่งั้นปีเดียวกันจะถูกดึงสองตัว
set FROM=%1
set TO=%2
set WORKERS=%3
if "%FROM%"=="" set FROM=2463
if "%TO%"=="" set TO=2569
if "%WORKERS%"=="" set WORKERS=4

cd /d E:\boi\app\scripts\deka
node run-parallel.mjs --from %FROM% --to %TO% --chunk 5 --workers %WORKERS% --base-port 9341 -- --delay-min 3000 --delay-max 4500
echo.
echo Finished or stopped. Logs: %LOCALAPPDATA%\lawcraft-deka-data\parallel.log และ worker-N.log
pause
