// เตรียมโฟลเดอร์ Edge Function "docx": คัดลอกโค้ดสร้างเอกสารที่ใช้ร่วมกัน (shared/*.js + render-docx.js) + ตราครุฑ (base64)
// รันก่อน deploy ทุกครั้งที่แก้ shared/ หรือ render-docx.js:  node server/build-edge.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'supabase', 'functions', 'docx');
fs.mkdirSync(path.join(out, 'shared'), { recursive: true });

for (const f of fs.readdirSync(path.join(root, 'shared')).filter((x) => x.endsWith('.js'))) {
  fs.copyFileSync(path.join(root, 'shared', f), path.join(out, 'shared', f));
}
// render-docx.js อยู่ใน server/ (import '../shared/…') แต่ใน Edge Function shared/ อยู่ในโฟลเดอร์เดียวกัน
fs.writeFileSync(path.join(out, 'render-docx.js'),
  fs.readFileSync(path.join(root, 'server', 'render-docx.js'), 'utf8').split("'../shared/").join("'./shared/"));
fs.copyFileSync(path.join(root, 'server', 'brace-fallback.js'), path.join(out, 'brace-fallback.js'));
const png = fs.readFileSync(path.join(root, 'public', 'garuda.png'));
fs.writeFileSync(path.join(out, 'emblem.js'), `// สร้างอัตโนมัติโดย server/build-edge.js\nexport default '${png.toString('base64')}';\n`);
console.log('คัดลอกแล้วไปที่', path.relative(root, out));
