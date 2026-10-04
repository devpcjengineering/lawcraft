// สร้าง templates/index.json จากไฟล์แบบพิมพ์ศาลใน templates/word และ templates/pdf
// รัน: node server/build-template-index.js (ทำใหม่ทุกครั้งที่เพิ่ม/เปลี่ยนไฟล์แบบพิมพ์)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const list = (d) => (fs.existsSync(path.join(root, d)) ? fs.readdirSync(path.join(root, d)) : []);
const key = (f) => f.replace(/\.(docx?|pdf)$/i, '').normalize('NFC');
const map = new Map();
for (const f of list('word')) map.set(key(f), { ...(map.get(key(f)) || {}), word: f });
for (const f of list('pdf')) map.set(key(f), { ...(map.get(key(f)) || {}), pdf: f });

const forms = [...map].map(([k, v]) => {
  const m = /^(ข[0-9]|คป[0-9]|[0-9]+)\s*(ทวิ|ตรี|ก|พ)?\s*(.*)$/.exec(k);
  const no = m ? m[1] + (m[2] ? ' ' + m[2] : '') : '';
  const title = (m ? m[3] : k).replace(/^แบบฟอร์ม|^แบบพิมพ์/, '').trim() || k;
  return { id: k, no, title, ...v };
}).sort((a, b) => a.id.localeCompare(b.id, 'th', { numeric: true }));

fs.writeFileSync(path.join(root, 'index.json'),
  JSON.stringify({ note: 'แบบพิมพ์ศาลยุติธรรม (ต้นฉบับ) สำหรับเปิดแก้ไขใน Word หรืออ้างอิง', forms }, null, 1), 'utf8');
console.log(`${forms.length} แบบ (มีทั้ง Word+PDF ${forms.filter((f) => f.word && f.pdf).length})`);
