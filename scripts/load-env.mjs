// อ่านไฟล์ .env / .env.local ที่รากโปรเจกต์ (อยู่ใน .gitignore) แล้วตั้งเป็น process.env เฉพาะตัวแปรที่ยังไม่ถูกตั้ง
// ใช้กับสคริปต์ในเครื่อง (scripts/deka/load-aiven.mjs, test/precedents-api.mjs) — บน Vercel ใช้ Environment Variables จริง ไม่ผ่านไฟล์นี้
// รูปแบบ: KEY=VALUE (ไม่ต้องมีเครื่องหมายคำพูด; ถ้ามีคำพูดครอบจะตัดออก), บรรทัดขึ้นต้น # = หมายเหตุ ; AIVEN_CA_FILE ที่เป็นพาธสัมพัทธ์จะอิงรากโปรเจกต์
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv(files = ['.env', '.env.local']) {
  for (const f of files) {
    let text; try { text = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || line.trim().startsWith('#')) continue;
      let v = m[2];
      if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
  if (process.env.AIVEN_CA_FILE && !path.isAbsolute(process.env.AIVEN_CA_FILE)) process.env.AIVEN_CA_FILE = path.join(ROOT, process.env.AIVEN_CA_FILE);
  return process.env;
}
