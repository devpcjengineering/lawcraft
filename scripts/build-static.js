// สร้างเว็บสถิตสำหรับ deploy (Vercel / Netlify / Cloudflare Pages / เซิร์ฟเวอร์ไฟล์ใดก็ได้) → โฟลเดอร์ dist/
// รวม public/ + shared/ (โมดูลที่เบราว์เซอร์ import จาก /shared/) + templates/ (แบบพิมพ์ศาลต้นฉบับ)
// โหมด Supabase: เว็บและหลังบ้านคุยกับ Supabase โดยตรง จึงไม่ต้องมีเซิร์ฟเวอร์ Node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const cp = (from, to) => fs.cpSync(path.join(root, from), path.join(dist, to), { recursive: true });
cp('public', '.');
cp('shared', 'shared');
if (fs.existsSync(path.join(root, 'templates'))) cp('templates', 'templates');

// บทความ: ไฟล์ JSON ต่อบทความ (รวมมาตรา/ฎีกาที่อ้างถึง) + รายการ
{
  const { packArticles } = await import('../server/articles-pack.js');
  const pack = packArticles();
  const out = path.join(dist, 'articles-data');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(pack.index));
  for (const [slug, a] of Object.entries(pack.articles)) fs.writeFileSync(path.join(out, `${slug}.json`), JSON.stringify(a));
}

// ตรวจก่อนปล่อย: ต้องตั้ง Supabase ใน config.js ไม่เช่นนั้นเว็บจะพยายามเรียก /api (ซึ่งไม่มีในโหมดสถิต)
const cfg = fs.readFileSync(path.join(dist, 'js', 'config.js'), 'utf8');
const hasSb = /url:\s*'https:\/\/[^']+'/.test(cfg) && /anonKey:\s*'[^']{20,}'/.test(cfg);
if (!hasSb) console.warn('⚠ public/js/config.js ยังไม่ได้ตั้ง Supabase url/anonKey — เว็บสถิตจะโหลดข้อมูลกฎหมายไม่ได้');
// กันพลาด: คีย์ใน config.js ต้องเป็นบทบาท anon (ถอดรหัส JWT) และห้ามมีโทเค็นจัดการบัญชี sbp_…
const key = /anonKey:\s*'([^']+)'/.exec(cfg)?.[1] || '';
if (key) {
  let role = '';
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role; } catch { /* คีย์รูปแบบใหม่ (sb_publishable_…) ไม่ใช่ JWT */ }
  if (role && role !== 'anon') throw new Error(`คีย์ใน config.js มีบทบาท "${role}" — ต้องเป็น anon เท่านั้น ห้ามนำขึ้นเว็บ`);
  if (key.startsWith('sb_secret_')) throw new Error('พบ secret key ใน config.js — ห้ามนำขึ้นเว็บ');
}
if (/sbp_[a-f0-9]{20,}/.test(cfg)) throw new Error('พบโทเค็นจัดการบัญชี (sbp_…) ใน config.js — ห้ามนำขึ้นเว็บ');

let files = 0, bytes = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; } } })(dist);
console.log(`dist/ พร้อม deploy: ${files} ไฟล์, ${(bytes / 1048576).toFixed(1)} MB`);
