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

// หน้าข้อมูลกฎหมายแบบ HTML สถิต (/jurisdiction/ /laws/ /procedure/ /precedents/) + dist/seo-urls.json + สารบัญบนหน้าแรก
// ต้องรันก่อนขั้นรวม CSS / ใส่ ?v= (หน้าเหล่านี้ใช้ css/bundle-seo.css ที่สร้างในขั้นนี้)
const SITE_URL = (process.env.SITE_URL || 'https://lawcraft.pcjengineering.co.th').replace(/\/$/, '');
const seo = await (await import('./build-seo-pages.js')).buildSeoPages({ root, dist, site: SITE_URL });

// sitemap.xml + robots.txt สำหรับเสิร์ชเอนจิน: หน้าสาธารณะทั้งหมด + บทความทุกบท (หลังบ้าน /workspace/ ไม่ใส่)
{
  const SITE = SITE_URL;
  const { packArticles } = await import('../server/articles-pack.js');
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ['/', today, 'weekly', '1.0'], ['/articles/', today, 'weekly', '0.8'], ['/contact/', today, 'monthly', '0.6'], ['/privacy/', today, 'yearly', '0.3'],
    ...packArticles().index.map((a) => [`/articles/?a=${encodeURIComponent(a.slug)}`, /^\d{4}-\d{2}-\d{2}$/.test(a.updated || '') ? a.updated : today, 'monthly', '0.7']),
    ...seo.urls.map((u) => [u.path, u.lastmod, 'monthly', u.priority]),
  ];
  const x = (s) => s.replace(/&/g, '&amp;');
  // ปกติ /sitemap.xml มาจากฟังก์ชัน api/sitemap.js (รวมบทความที่แอดมินเพิ่มสด ๆ) — ตั้ง STATIC_SITEMAP=1 ถ้าต้องการไฟล์สถิตแทน
  if (process.env.STATIC_SITEMAP) fs.writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, m, f, pr]) => `  <url><loc>${x(SITE + p)}</loc><lastmod>${m}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`);
  const rp = path.join(dist, 'robots.txt');
  let rb = fs.readFileSync(rp, 'utf8').replace(/\r?\n?Sitemap:.*$/gim, '').trimEnd();
  fs.writeFileSync(rp, `${rb}\n\nSitemap: ${SITE}/sitemap.xml\n`);
  console.log(`sitemap.xml: ${urls.length} หน้า`);
}
// เร่งความเร็วหน้าสาธารณะ: รวมไฟล์ CSS หลายไฟล์ที่ <head> เป็นไฟล์เดียวต่อหน้า (ลดคำขอที่บล็อกการแสดงผล)
{
  const crypto = await import('node:crypto');
  for (const page of ['index.html', 'articles/index.html', 'contact/index.html', 'privacy/index.html']) {
    const hp = path.join(dist, page);
    let html = fs.readFileSync(hp, 'utf8');
    const re = /<link rel="stylesheet" href="(\/[^"?#]+\.css)">\r?\n?/g;
    const hrefs = [...html.matchAll(re)].map((m) => m[1]);
    if (hrefs.length < 2) continue;
    const css = hrefs.map((h) => fs.readFileSync(path.join(dist, h), 'utf8').replace(/^\uFEFF/, '').replace(/\/\*# sourceMappingURL=.*?\*\//g, '')).join('\n');
    const name = `css/bundle-${page.replace(/\/?index\.html$/, '') || 'home'}.css`.replace('//', '/');
    fs.writeFileSync(path.join(dist, name), css);
    let first = true;
    html = html.replace(re, () => { if (!first) return ''; first = false; return `<link rel="stylesheet" href="/${name}">\n`; });
    fs.writeFileSync(hp, html);
    console.log(`รวม CSS ${page}: ${hrefs.length} ไฟล์ → ${name}`);
  }
}

// llms.txt (สำหรับ AI/LLM อ่านภาพรวมเว็บ) + ai-catalog.json (/.well-known/) — สร้างจากรายการหน้า/บทความตอน build
{
  const SITE = (process.env.SITE_URL || 'https://lawcraft.pcjengineering.co.th').replace(/\/$/, '');
  const { packArticles } = await import('../server/articles-pack.js');
  const arts = packArticles().index;
  const one = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const llms = `# Law Craft Legal Consultants (สำนักงานกฎหมาย ลอว์คราฟต์)

> เว็บไซต์ภาษาไทยให้ความรู้กฎหมายไทยสำหรับผู้เสียหายและประชาชน (คดีออนไลน์ ซื้อขายออนไลน์ ฉ้อโกง หมิ่นประมาท ข่มขู่ ภาพส่วนตัว) พร้อมเครื่องมือร่างคำฟ้อง คำร้อง และเอกสารยื่นศาลตามแบบพิมพ์ของศาลยุติธรรม เนื้อหาเป็นข้อมูลทั่วไปเพื่อการศึกษา ไม่ใช่คำปรึกษาทางกฎหมายหรือการรับประกันผลของคดี ควรตรวจสอบกับแหล่งทางการและนักกฎหมายก่อนยื่นต่อศาล

## หน้าหลัก

- [หน้าแรก](${SITE}/): ค้นหามาตราและข้อกฎหมาย ตรวจเขตอำนาจศาล ขั้นตอนฟ้องคดี และทางเข้าระบบร่างคำฟ้อง
- [บทความกฎหมายคดีออนไลน์](${SITE}/articles/): รวมบทความอธิบายสิทธิ ขั้นตอน และการเก็บหลักฐาน
- [ติดต่อปรึกษากฎหมาย](${SITE}/contact/): ส่งเรื่องให้เจ้าหน้าที่ตรวจสอบเบื้องต้น
- [นโยบายความเป็นส่วนตัว](${SITE}/privacy/): ข้อมูลที่เก็บ วัตถุประสงค์ และสิทธิของเจ้าของข้อมูลตาม PDPA

## ข้อมูลกฎหมาย (หน้า HTML แยกรายการ)

- [ข้อกฎหมายไทย: มาตรา ระวางโทษ อายุความ](${SITE}/laws/): ${seo.counts.items} มาตราและมูลคดี (คดีอาญา/คดีแพ่ง) ตัวบท องค์ประกอบ ระวางโทษ อายุความ สถานะการตรวจแหล่งอ้างอิง — แต่ละฉบับอยู่ที่ ${SITE}/laws/<ฉบับ>/ และแต่ละมาตราที่ ${SITE}/laws/<รหัสข้อหา>/ เช่น ${SITE}/laws/pc-326/
- [เขตอำนาจศาล ฟ้องคดีแพ่ง อาญาที่ศาลไหน](${SITE}/jurisdiction/): ศาลที่มีเขตอำนาจรายอำเภอ/เขต พร้อมเบอร์โทรศัพท์ศาล ครบ ${seo.counts.provinces} จังหวัด (${SITE}/jurisdiction/<จังหวัดภาษาอังกฤษ>/ เช่น ${SITE}/jurisdiction/bangkok/)
- [ขั้นตอนฟ้องคดีและวิธีพิจารณาความ](${SITE}/procedure/): ขั้นตอนฟ้องคดีอาญาโดยราษฎร ค่าธรรมเนียมศาล และ ${seo.counts.procedure} มาตราวิธีพิจารณาที่ใช้บ่อย
- [ฎีกาที่เกี่ยวข้องกับข้อหาและมูลคดี](${SITE}/precedents/): สรุปแนวฎีกา ${seo.counts.precedents} รายการ (สรุปโดยเว็บไซต์ ควรตรวจกับต้นฉบับ)

## บทความ

${arts.map((a) => `- [${one(a.title)}](${SITE}/articles/?a=${encodeURIComponent(a.slug)}): ${one(a.summary || a.subtitle).slice(0, 160)}`).join('\n')}

## Optional

- [เนื้อหาเต็มทุกบทความ (Markdown)](${SITE}/llms-full.txt): ข้อความบทความทั้งหมดในไฟล์เดียวสำหรับ AI
- [Sitemap](${SITE}/sitemap.xml): รายการหน้าทั้งหมดสำหรับเสิร์ชเอนจิน
`;
  fs.writeFileSync(path.join(dist, 'llms.txt'), llms);
  // llms-full.txt: เนื้อหาทุกบทความเป็น Markdown ไฟล์เดียว (อนุญาตให้ AI ดึง/อ้างอิง/นำไปฝึกได้ — ดู robots.txt)
  {
    const all = packArticles().articles;
    const md = [];
    md.push(`# Law Craft Legal Consultants — เนื้อหาบทความฉบับเต็ม\n\n> ข้อมูลทั่วไปเพื่อการศึกษา ไม่ใช่คำปรึกษาทางกฎหมาย บทความทุกบทเป็นฉบับร่างหรือผ่านการตรวจตามสถานะที่ระบุ ควรตรวจกับแหล่งทางการและนักกฎหมายก่อนนำไปใช้ · ภาพรวมเว็บ: ${SITE}/llms.txt\n`);
    for (const a of Object.values(all)) {
      md.push(`\n---\n\n# ${one(a.title)}\n\nURL: ${SITE}/articles/?a=${encodeURIComponent(a.slug)}\nหมวด: ${one(a.category)} · ปรับปรุง: ${one(a.updated)} · สถานะการตรวจ: ${one(a.reviewStatus || 'ร่าง')}\n`);
      if (a.subtitle) md.push(`\n> ${one(a.subtitle)}\n`);
      if (a.summary) md.push(`\n${a.summary}\n`);
      if ((a.keyPoints || []).length) md.push(`\n## ประเด็นสำคัญ\n\n${a.keyPoints.map((k) => `- ${one(k)}`).join('\n')}\n`);
      for (const s of a.sections || []) {
        md.push(`\n## ${one(s.heading)}\n`);
        for (const para of s.paragraphs || []) md.push(`\n${para}\n`);
        if (s.table?.head) md.push(`\n| ${s.table.head.map(one).join(' | ')} |\n| ${s.table.head.map(() => '---').join(' | ')} |\n${(s.table.rows || []).map((r) => `| ${r.map((c) => one(c).replace(/\|/g, '/')).join(' | ')} |`).join('\n')}\n`);
        if (s.callout?.text) md.push(`\n> ${one(s.callout.text)}\n`);
      }
      if ((a.steps || []).length) md.push(`\n## ขั้นตอน\n\n${a.steps.map((st, i) => `${i + 1}. **${one(st.title)}** — ${one(st.detail)}`).join('\n')}\n`);
      if (a.checklist?.items?.length) md.push(`\n## ${one(a.checklist.title || 'รายการตรวจ')}\n\n${a.checklist.items.map((x) => `- [ ] ${one(x)}`).join('\n')}\n`);
      if ((a.faq || []).length) md.push(`\n## คำถามที่พบบ่อย\n\n${a.faq.map((q) => `**${one(q.q)}**\n${one(q.a)}`).join('\n\n')}\n`);
      if ((a.sources || []).length) md.push(`\n## แหล่งอ้างอิง\n\n${a.sources.map((so) => `- [${one(so.label)}](${so.url})${so.verified ? '' : ' (ยังไม่ได้ตรวจเปิดอ่าน)'}`).join('\n')}\n`);
    }
    fs.writeFileSync(path.join(dist, 'llms-full.txt'), md.join(''));
  }
  const host = new URL(SITE).hostname;
  const catalog = {
    specVersion: '1.0',
    host: { displayName: 'Law Craft Legal Consultants', identifier: host },
    entries: [{
      identifier: `urn:air:${host}:knowledge:site-overview`,
      displayName: 'Law Craft — ภาพรวมเว็บไซต์และรายการบทความ',
      type: 'text/markdown',
      url: `${SITE}/llms.txt`,
      description: 'ภาพรวมเว็บไซต์ความรู้กฎหมายไทยและระบบร่างคำฟ้อง พร้อมลิงก์ไปยังหน้าและบทความทั้งหมด (llms.txt)',
      representativeQueries: ['ฟ้องหมิ่นประมาทออนไลน์ทำอย่างไร', 'ถูกโกงซื้อของออนไลน์ ฟ้องคดีอาญาเองได้ไหม', 'เก็บหลักฐานดิจิทัลสำหรับคดีออนไลน์'],
    }, {
      identifier: `urn:air:${host}:knowledge:legal-data`,
      displayName: 'Law Craft — ข้อกฎหมาย เขตอำนาจศาล ขั้นตอนฟ้องคดี และฎีกา',
      type: 'text/html',
      url: `${SITE}/laws/`,
      description: `ข้อมูลกฎหมายไทยแยกเป็นหน้า: ${seo.counts.items} มาตรา/ข้อหา (ตัวบท ระวางโทษ อายุความ) · เขตอำนาจศาล ${seo.counts.provinces} จังหวัด · ขั้นตอนฟ้องคดี · ฎีกา ${seo.counts.precedents} รายการ (เพื่อการศึกษา ไม่ใช่คำปรึกษา)`,
      representativeQueries: ['หมิ่นประมาท มาตรา 326 โทษและอายุความ', 'ฟ้องคดีที่จังหวัดชัยภูมิต้องฟ้องศาลไหน', 'ขั้นตอนฟ้องคดีอาญาโดยราษฎร'],
    }, {
      identifier: `urn:air:${host}:knowledge:articles-full`,
      displayName: 'Law Craft — เนื้อหาบทความฉบับเต็ม (Markdown)',
      type: 'text/markdown',
      url: `/llms-full.txt`,
      description: 'ข้อความทุกบทความของเว็บไซต์ในไฟล์เดียว อนุญาตให้ AI ดึงข้อมูล อ้างอิง และนำไปฝึกได้',
    }],
  };
  fs.mkdirSync(path.join(dist, '.well-known'), { recursive: true });
  const json = JSON.stringify(catalog, null, 2) + '\n';
  fs.writeFileSync(path.join(dist, '.well-known', 'ai-catalog.json'), json);
  fs.writeFileSync(path.join(dist, 'ai-catalog.json'), json);
  console.log(`llms.txt: ${arts.length} บทความ · ai-catalog.json`);
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

// กันแคชค้างของ CDN: ใส่ ?v=<แฮชเนื้อหา> ให้ลิงก์ .js/.css/.ttf/.json ทุกตัว (ดู scripts/version-assets.js)
{
  const { versionAssets } = await import('./version-assets.js');
  const r = versionAssets(dist);
  console.log(`เวอร์ชันไฟล์: ?v=${r.version} (แก้ลิงก์ใน ${r.filesChanged} ไฟล์)`);
}

let files = 0, bytes = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; } } })(dist);
console.log(`dist/ พร้อม deploy: ${files} ไฟล์, ${(bytes / 1048576).toFixed(1)} MB`);
