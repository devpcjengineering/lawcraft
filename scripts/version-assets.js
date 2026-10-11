// ใส่เลขเวอร์ชัน ?v=<แฮชเนื้อหา> ต่อท้ายลิงก์ไฟล์ .js/.css/.ttf/.json ใน dist/ เพื่อกัน “HTML ใหม่ + JS/CSS เก่า”
// เหตุผล: ถ้ามี CDN/พร็อกซี (เช่น Cloudflare หน้าโดเมน) แคช .js/.css ไว้หลายชั่วโมง หลัง deploy ผู้เยี่ยมชมจะได้ไฟล์เก่าปนกับ HTML ใหม่
// หน้าเว็บ/ดีไซน์/ฟุตเตอร์จึงเพี้ยน — ใส่เวอร์ชันแล้ว URL เปลี่ยนทุกครั้งที่เนื้อหาเปลี่ยน CDN ต้องดึงไฟล์ใหม่เสมอ
// ES module: ทุก import ต้องผ่านการเติมเวอร์ชันเหมือนกันหมด (ไม่งั้นโมดูลเดียวกันจะถูกโหลดซ้ำเป็นสองสำเนา) — ท้ายไฟล์มีตรวจให้
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TEXT = /\.(html|css|js|mjs)$/;
const ASSET_EXT = 'js|mjs|css|ttf|woff2?|json|svg|png|ico|webmanifest';

function listFiles(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(path.join(dir, e.name), r)); else out.push(r);
  }
  return out;
}

/** แฮชเนื้อหาไฟล์ทั้งหมด (ก่อนแก้ลิงก์) → รหัสเวอร์ชัน 10 ตัวอักษร: เนื้อหาเดิม = เวอร์ชันเดิม (แคชใช้ต่อได้) */
export function contentVersion(dist) {
  const h = crypto.createHash('sha1');
  for (const f of listFiles(dist).sort()) { h.update(f); h.update(fs.readFileSync(path.join(dist, f))); }
  return h.digest('hex').slice(0, 10);
}

const addV = (u, v) => (/[?#]/.test(u) ? u : `${u}?v=${v}`);

export function formatThaiDate(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const day = get('day');
  const mNum = parseInt(get('month'), 10) - 1;
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const month = months[mNum] || '';
  const year = parseInt(get('year'), 10) + 543;
  let hour = get('hour');
  if (hour === '24') hour = '00';
  hour = String(hour).padStart(2, '0');
  const time = `${hour}:${String(get('minute')).padStart(2, '0')}`;
  return `${day} ${month} ${year} ${time}`;
}


export function rewrite(text, kind, v, dateStr = formatThaiDate()) {
  if (kind === 'html') {
    // src="…" / href="…" ที่ชี้ไฟล์ในเว็บ (ไม่แตะลิงก์ภายนอก, #, mailto:, tel:, หน้า HTML/โฟลเดอร์)
    let s = text.replace(new RegExp(`((?:src|href)=")(?!https?:|//|mailto:|tel:|data:|#)([^"#?]+\\.(?:${ASSET_EXT}))(")`, 'g'), (_, a, u, c) => `${a}${addV(u, v)}${c}`);
    s = s.replace(/__APP_VERSION__/g, v);
    s = s.replace(/__APP_DATE__/g, dateStr);
    return s;
  }
  if (kind === 'css') {
    return text.replace(new RegExp(`url\\(\\s*(['"]?)(?!https?:|//|data:)([^'")?#]+\\.(?:${ASSET_EXT}))\\1\\s*\\)`, 'g'), (_, q, u) => `url(${q}${addV(u, v)}${q})`);
  }
  // js
  let s = text;
  // import … from '…' / import '…' / import('…') — เฉพาะพาธภายใน (./ ../ /)
  s = s.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])((?:\.{1,2}\/|\/)[^'"?#]*\.m?js)\2/g, (_, pre, q, u) => `${pre}${q}${addV(u, v)}${q}`);
  // fetch('/articles-data/….json') และ fetch('/templates/index.json')
  s = s.replace(/(['"`])(\/(?:articles-data|templates)\/[^'"`$\s]*\.json)\1/g, (_, q, u) => `${q}${addV(u, v)}${q}`);
  // `/articles-data/${slug}.json`
  s = s.replace(/(`\/articles-data\/\$\{[^}`]+\}\.json)(`)/g, (_, a, b) => `${a}?v=${v}${b}`);
  // หน้าต่าง PDF ในหน้า (iframe srcdoc) โหลด css/doc.css
  s = s.replace(/href="css\/doc\.css"/g, `href="css/doc.css?v=${v}"`);
  s = s.replace(/__APP_VERSION__/g, v);
  s = s.replace(/__APP_DATE__/g, dateStr);
  return s;
}

export function versionAssets(dist, options = {}) {
  const v = contentVersion(dist);
  const dateStr = options.date || formatThaiDate();
  let changed = 0;
  for (const f of listFiles(dist)) {
    if (!TEXT.test(f)) continue;
    const p = path.join(dist, f);
    const src = fs.readFileSync(p, 'utf8');
    const kind = f.endsWith('.html') ? 'html' : f.endsWith('.css') ? 'css' : 'js';
    const out = rewrite(src, kind, v, dateStr);
    if (out !== src) { fs.writeFileSync(p, out); changed++; }
  }
  // ตรวจ: ทุก import ภายในต้องมี ?v= (กันโมดูลซ้ำสองสำเนา) และไม่มี import แบบคำนวณค่าที่เราแก้ไม่ได้
  const bad = [];
  for (const f of listFiles(dist)) {
    if (!/\.m?js$/.test(f)) continue;
    const s = fs.readFileSync(path.join(dist, f), 'utf8');
    for (const m of s.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])((?:\.{1,2}\/|\/)[^'"]*\.m?js)(\?[^'"]*)?\1/g)) {
      if (!m[3] || m[3] !== `?v=${v}`) bad.push(`${f}: ${m[2]}${m[3] || ''}`);
    }
    for (const m of s.matchAll(/\bimport\s*\(\s*(?!['"])/g)) bad.push(`${f}: import() แบบคำนวณค่า (ใส่เวอร์ชันไม่ได้)`);
  }
  if (bad.length) throw new Error(`ใส่เวอร์ชันให้ import ไม่ครบ:\n  ${bad.slice(0, 20).join('\n  ')}`);
  return { version: v, date: dateStr, filesChanged: changed };
}
