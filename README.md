# ระบบเอกสารยื่นศาล (เว็บบริการกฎหมาย + หลังบ้านร่างคำฟ้อง)

- `/` เว็บไซต์หลัก (สไตล์มินิมอล): ค้นหาประมวลกฎหมาย, ตรวจเขตอำนาจศาล (จังหวัด → อำเภอ/เขต → ตำบล/แขวง), ขั้นตอนฟ้องคดี
- `/admin/` หลังบ้าน: กรอกข้อมูลคดีครั้งเดียว → ออกคำฟ้อง คำขอท้ายฟ้อง คำร้องส่งหมาย/ปิดหมาย บัญชีพยาน หมายนัดไต่สวนมูลฟ้อง (แยกต่อจำเลย) เอกสารแนบท้ายคำฟ้อง ใบแต่งทนายความ ใบมอบฉันทะ คำให้การ สัญญาประนีประนอม เป็น Word (.docx) หรือพิมพ์ PDF

## เริ่มใช้งาน
```
cd app
npm install
npm start          # http://localhost:3000     (หรือดับเบิลคลิก start.bat)
```
ล็อกอินหลังบ้านเมื่อรันบนเซิร์ฟเวอร์: ตั้ง `ADMIN_PASSWORD` (และ `ADMIN_USER`, ค่าเริ่มต้น `admin`) ก่อนรัน เซิร์ฟเวอร์ผูกกับ `127.0.0.1` ถ้าจะเปิดสาธารณะให้ตั้ง `HOST=0.0.0.0` พร้อม `ADMIN_PASSWORD` และวางหลัง HTTPS

## โหมดเก็บข้อมูล
- **ไฟล์ในเครื่อง** (ค่าเริ่มต้น): คดีอยู่ที่ `cases/`, สมุดรายชื่ออยู่ที่ `cases/_people.json`
- **Supabase**: ใส่ `url` + `anonKey` ใน `public/js/config.js` (anonKey เป็นคีย์สาธารณะ ห้ามใส่ service_role) — คดี/สมุดรายชื่ออยู่ในฐานข้อมูล (RLS: เฉพาะอีเมลในตาราง `admins`), ข้อมูลกฎหมายอยู่ในตาราง `law_data` (อ่านสาธารณะ), ออกไฟล์ Word ผ่าน Edge Function `docx`
  - สร้างตาราง: `supabase/migrations/*.sql`
  - อัปโหลดข้อมูลกฎหมาย: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node server/seed-supabase.js`
  - deploy ฟังก์ชัน: `node server/build-edge.js` แล้ว `SUPABASE_ACCESS_TOKEN=… npx supabase functions deploy docx --project-ref <ref> --use-api`
  - ห้ามเก็บ token/service_role ในไฟล์โปรเจกต์

## โครงสร้าง
| ส่วน | ที่อยู่ |
|---|---|
| ข้อมูลกฎหมาย (JSON) | `data/` — โครงสร้างดู `data/SCHEMA.md` |
| เขตอำนาจศาลรายอำเภอ (ทางการ) | `data/jurisdiction.json` อัปเดตด้วย `node server/fetch-coj-jurisdiction.js` (ข้อมูล ณ 1 ส.ค. 2561 ตามระบบของสำนักงานศาลยุติธรรม) |
| ตัวสร้างเอกสาร (ใช้ร่วมเว็บ+เซิร์ฟเวอร์) | `shared/docs.js`, `model.js`, `thai.js`, `formtext.js` (ข้อความมาตรฐานแก้ได้), `layout.js` (ตำแหน่ง/ตราครุฑ) |
| พรีวิว/PDF | `public/js/render-html.js`, `public/css/doc.css` (ฟอนต์ TH Sarabun IT๙, ตราครุฑ `public/garuda.svg|png`) |
| ไฟล์ Word | `server/render-docx.js` |
| แบบพิมพ์ศาลต้นฉบับ | `templates/word`, `templates/pdf` (ดัชนี `node server/build-template-index.js`) |
| การตั้งค่าที่แก้จากหลังบ้าน | `data/form-text.json` (ข้อความในแบบฟอร์ม), `data/layout.json` (การจัดหน้า/ขนาดโลโก้) |
| แจ้งเตือน/popup | `public/js/notify.js`, `public/css/notify.css`, `public/js/modal.js` |

## ข้อควรระวัง
เครื่องมือช่วยร่างเอกสาร ไม่ใช่คำปรึกษาทางกฎหมาย ข้อมูลกฎหมาย/ฎีกาตรวจจากเว็บรอง (รายการที่ยังไม่ยืนยันติดป้ายเตือน) ผู้ใช้ต้องตรวจตัวบทฉบับปัจจุบันก่อนยื่นศาลทุกครั้ง
ทดสอบเบื้องต้น: `npm test` · ตัวช่วยทดสอบหน้าเว็บด้วย Edge: `node test/cdp.mjs <url> <script.js> <out.png>`
