// การเชื่อมต่อ Aiven for PostgreSQL (ฐานข้อมูลฎีกา) ร่วมกันของ api/precedents.js และ api/precedent.js — ใช้บทบาท lawcraft_reader (SELECT อย่างเดียว)
// ตั้งค่า (Vercel → Environment Variables): AIVEN_READER_URL (จำเป็น) · AIVEN_CA (PEM ของ Aiven; ไม่ตั้ง = ใช้ตัวที่ฝังใน api/_aiven-ca.js)
// ไฟล์ขึ้นต้นด้วย _ ใน api/ ไม่ถูกนับเป็นฟังก์ชัน
import pg from 'pg';
import CA from './_aiven-ca.js';

let pool;
export function getPool() {
  if (pool) return pool;
  const raw = process.env.AIVEN_READER_URL;
  if (!raw) return null;
  const u = new URL(raw); u.searchParams.delete('sslmode');
  pool = new pg.Pool({ connectionString: u.toString(), ssl: { ca: process.env.AIVEN_CA || CA, rejectUnauthorized: true }, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 6000, statement_timeout: 8000 });
  pool.on('error', () => { pool = null; }); // ตัดการเชื่อมต่อ (เช่น Aiven บำรุงรักษา) → สร้างใหม่ครั้งหน้า
  return pool;
}

export const NOTICE = 'ข้อมูลเป็นคำพิพากษาย่อ (ย่อสั้น/ย่อยาว) ตามที่ศาลเผยแพร่ ไม่ใช่ข้อความคำพิพากษาฉบับเต็ม — ตรวจกับต้นฉบับจากแหล่งทางการของศาลฎีกาก่อนอ้างอิง';

/** URL เฉพาะของแต่ละฎีกา: /precedents/<เลขฎีกา>-<ปี>-<docId ของศาล>/ — ระบบหาจาก docId ท้ายสุดเท่านั้น (ส่วนหน้าเปลี่ยนได้โดยเด้งมา URL หลัก) */
export function precedentSlug(caseNo, year, docId) {
  const no = String(caseNo ?? '').replace(/[^0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  return `${no}-${Number(year) || 0}-${String(docId).replace(/[^0-9a-z]/gi, '')}`;
}
export const precedentPath = (caseNo, year, docId) => `/precedents/${precedentSlug(caseNo, year, docId)}/`;
/** แยก docId จาก slug (ส่วนท้ายหลังขีดสุดท้าย) หรือ null */
export const docIdFromSlug = (slug) => { const m = /-([0-9a-z]{1,20})$/i.exec(String(slug || '')); return m ? m[1] : null; };
