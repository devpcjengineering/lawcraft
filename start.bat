@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo กำลังติดตั้งแพ็กเกจครั้งแรก...
  call npm install
)
echo.
echo ระบบจะเปิดที่ http://localhost:3000   (หลังบ้าน: http://localhost:3000/workspace/)
echo ปิดหน้าต่างนี้เพื่อหยุดเซิร์ฟเวอร์
start "" "http://localhost:3000"
node server/index.js
pause
