// การเชื่อมต่อ Aiven for PostgreSQL (ฐานข้อมูลฎีกา) ร่วมกันของ api/precedents.js และ api/precedent.js — ใช้บทบาท lawcraft_reader (SELECT อย่างเดียว)
// ตั้งค่า (Vercel → Environment Variables): AIVEN_READER_URL (จำเป็น) · AIVEN_CA (PEM ของ Aiven; ไม่ตั้ง = ใช้ตัวที่ฝังใน api/_aiven-ca.js)
// ไฟล์ขึ้นต้นด้วย _ ใน api/ ไม่ถูกนับเป็นฟังก์ชัน
import pg from 'pg';
import CA from './_aiven-ca.js';

let pool;
// 57P05 = idle_session_timeout (เซิร์ฟเวอร์ตัด session ว่าง — ตั้งไว้ที่บทบาท lawcraft_reader 20 วิ เพราะ instance ของ Vercel ถูกพักจึงไม่ปิด connection เอง)
const CONN_ERR = new Set(['57P01', '57P02', '57P03', '57P05', '08000', '08001', '08003', '08004', '08006', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE']);
const isConnErr = (e) => CONN_ERR.has(e?.code) || /terminat|Connection (terminated|ended)|timeout exceeded when trying to connect/i.test(e?.message || '');
const TOO_MANY = '53300'; // too_many_connections — โควตาของบทบาทเต็ม (instance อื่นถือ connection อยู่) → รอให้เซิร์ฟเวอร์ตัด session ว่างแล้วลองใหม่
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function raw() {
  if (pool) return pool;
  const url = process.env.AIVEN_READER_URL;
  if (!url) return null;
  const u = new URL(url); u.searchParams.delete('sslmode');
  // max 2 ต่อ instance (บทบาทมีโควตา 12 connection ร่วมกันทุก instance) · ว่าง 4 วิ ปล่อยคืน · allowExitOnIdle ไม่ค้าง event loop
  pool = new pg.Pool({ connectionString: u.toString(), ssl: { ca: process.env.AIVEN_CA || CA, rejectUnauthorized: true }, max: 2, idleTimeoutMillis: 4000, connectionTimeoutMillis: 6000, statement_timeout: 8000, allowExitOnIdle: true, application_name: 'law-craft-web' });
  pool.on('error', () => { /* client ว่างที่ถูกเซิร์ฟเวอร์ตัด — pg เอาออกจากพูลให้เอง พูลยังใช้ต่อได้ */ });
  return pool;
}

/** คืนตัวห่อ { query } (null = ยังไม่ได้ตั้งค่า) — การเชื่อมต่อถูกตัดกลางคัน → สร้างพูลใหม่แล้วลองซ้ำ ; โควตา connection เต็ม → รอ 1.5 วิ แล้วลองซ้ำ (รวมไม่เกิน 3 ครั้ง) */
export function getPool() {
  if (!raw()) return null;
  return {
    async query(sql, params) {
      for (let attempt = 0; ; attempt++) {
        try { return await raw().query(sql, params); } catch (e) {
          if (attempt >= 2) throw e;
          if (e?.code === TOO_MANY) { await sleep(1500); continue; }
          if (!isConnErr(e)) throw e;
          try { await pool?.end(); } catch { /* ข้าม */ }
          pool = null;
        }
      }
    },
  };
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
