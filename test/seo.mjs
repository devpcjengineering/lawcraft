// ตรวจคุณภาพหน้า SEO ที่ build ไว้ใน dist/ (scripts/build-seo-pages.js): H1/title/description/canonical/JSON-LD/ลิงก์ภายใน/หน้าบาง/seo-urls.json/sitemap
// ถ้ายังไม่มี dist/seo-urls.json จะรัน `node scripts/build-static.js` ให้ก่อน
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const SITE = (process.env.SITE_URL || 'https://www.law-craft.co').replace(/\/$/, '');
if (!fs.existsSync(path.join(dist, 'seo-urls.json'))) {
  console.log('seo: ยังไม่มี dist/seo-urls.json — รัน build ก่อน');
  execFileSync(process.execPath, [path.join(root, 'scripts/build-static.js')], { cwd: root, stdio: 'inherit' });
}

let fails = 0;
const bad = (m) => { fails++; if (fails <= 60) console.error('  ✗ ' + m); };
const read = (p) => fs.readFileSync(path.join(dist, p), 'utf8');
const plain = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const SECTIONS = ['jurisdiction', 'laws', 'procedure', 'precedents'];

const urls = JSON.parse(read('seo-urls.json'));
const listed = new Set(urls.map((u) => u.path));
if (listed.size !== urls.length) bad('seo-urls.json มีพาธซ้ำ');
for (const u of urls) {
  if (!/^\/[a-z0-9\-]+\/([a-z0-9\-]+\/)?$/.test(u.path)) bad(`พาธไม่เป็น ASCII ตามแบบ: ${u.path}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(u.lastmod)) bad(`lastmod ผิดรูปแบบ: ${u.path}`);
  if (/^\/(workspace|admin|api)\b/.test(u.path)) bad(`พาธชนกับเส้นทางระบบ: ${u.path}`);
}
if (urls.some((u, i) => i && Number(urls[i - 1].priority) < Number(u.priority))) bad('seo-urls.json ไม่ได้เรียงตาม priority');

// หน้าทั้งหมดใต้โฟลเดอร์ใหม่ต้องอยู่ใน seo-urls.json และกลับกัน
const onDisk = [];
(function walk(d, rel) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(d, e.name), `${rel}${e.name}/`);
    else if (e.name === 'index.html') onDisk.push(`/${rel}`);
  }
})(path.join(dist), '');
const seoDisk = onDisk.filter((p) => SECTIONS.some((s) => p.startsWith(`/${s}/`)));
for (const p of seoDisk) if (!listed.has(p)) bad(`มีไฟล์แต่ไม่อยู่ใน seo-urls.json: ${p}`);
for (const p of listed) if (!seoDisk.includes(p)) bad(`อยู่ใน seo-urls.json แต่ไม่มีไฟล์: ${p}`);

// ---- ตรวจรายหน้า ----
const titles = new Map(), descs = new Map(), counts = Object.fromEntries(SECTIONS.map((s) => [s, 0]));
const linkSources = [['/', read('index.html')]];
for (const p of seoDisk) {
  const html = read(`${p.slice(1)}index.html`);
  const sec = p.split('/')[1];
  counts[sec]++;
  linkSources.push([p, html]);
  const h1 = html.match(/<h1[\s>]/g) || [];
  if (h1.length !== 1) bad(`${p}: มี H1 ${h1.length} อัน`);
  const t = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  const d = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const dec = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  if (!t || dec(t).length > 60) bad(`${p}: title ยาว ${dec(t).length} (>60) "${t}"`);
  if (!d || dec(d).length > 155 || dec(d).length < 50) bad(`${p}: description ยาว ${dec(d).length} (50–155)`);
  if (titles.has(t)) bad(`${p}: title ซ้ำกับ ${titles.get(t)}`); else titles.set(t, p);
  if (descs.has(d)) bad(`${p}: description ซ้ำกับ ${descs.get(d)}`); else descs.set(d, p);
  const canon = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  if (canon !== SITE + p) bad(`${p}: canonical ไม่ตรง (${canon})`);
  if (!/<html lang="th">/.test(html)) bad(`${p}: ไม่มี lang="th"`);
  if (!/<meta name="robots" content="index,follow">/.test(html)) bad(`${p}: ไม่มี robots index,follow`);
  for (const k of ['og:title', 'og:description', 'og:url', 'twitter:card']) if (!html.includes(`"${k}"`)) bad(`${p}: ไม่มี ${k}`);
  let types = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); types.push(...(j['@graph'] || [j]).map((x) => x['@type'])); } catch (e) { bad(`${p}: JSON-LD parse ไม่ได้ (${e.message})`); }
  }
  if (!types.includes('BreadcrumbList') || !types.includes('WebPage')) bad(`${p}: JSON-LD ไม่มี WebPage/BreadcrumbList`);
  const main = (html.match(/<main[\s\S]*?<\/main>/) || [''])[0];
  if (plain(main).length < 300) bad(`${p}: เนื้อหาหลักบาง (${plain(main).length} ตัวอักษร)`);
  if (!/class="bc"/.test(main)) bad(`${p}: ไม่มี breadcrumb`);
  if ((html.match(/<nav class="nav"/g) || []).length !== 1 || (html.match(/id="siteFooter"/g) || []).length !== 1) bad(`${p}: เมนู/ท้ายเว็บไม่ครบหรือซ้ำ`);
  if (!/class="sf-grid"/.test(html)) bad(`${p}: ท้ายเว็บไม่ใช่ HTML สถิต`);
  if (!/\/css\/bundle-seo\.css\?v=/.test(html)) bad(`${p}: ไม่มี bundle-seo.css ที่ใส่เวอร์ชัน`);
  if (sec === 'laws' && /\/laws\/[a-z0-9-]+-\d/.test(p) && /ยังไม่ผ่านการตรวจกับแหล่งทางการ/.test(main) !== /note warn"><p><b>ยังไม่ผ่าน/.test(main)) bad(`${p}: ป้าย verified ไม่สอดคล้อง`);
}
// หน้าแรกต้องมีส่วนสารบัญและ JSON-LD
{
  const h = read('index.html');
  if (!/id="directory"/.test(h)) bad('หน้าแรกไม่มีสารบัญข้อมูลกฎหมาย');
  for (const l of ['/laws/', '/jurisdiction/', '/procedure/']) if (!h.includes(`href="${l}"`)) bad(`หน้าแรกไม่ลิงก์ ${l}`);
  if (h.includes('href="/precedents/"')) bad('หน้าแรกต้องไม่ลิงก์ /precedents/ (ถอด “ฎีกา” ออกจากหน้าแรกตามสั่ง)');
  if (/<!--SEO-(HEAD|DIRECTORY)-->/.test(h)) bad('หน้าแรกยังมีจุดแทรกที่ไม่ได้แทนที่');
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch { bad('หน้าแรก: JSON-LD parse ไม่ได้'); } }
  if (!h.includes(`<link rel="canonical" href="${SITE}/">`)) bad('หน้าแรกไม่มี canonical');
}
// เมนูหลักของทุกหน้าสาธารณะต้องลิงก์ฮับทั้ง 4
for (const f of ['index.html', 'articles/index.html', 'contact/index.html', 'privacy/index.html']) {
  const h = read(f);
  const nav = (h.match(/<div class="nav-links"[\s\S]*?<\/div>/) || [''])[0];
  for (const l of ['/laws/', '/jurisdiction/', '/procedure/']) if (!nav.includes(`href="${l}"`)) bad(`${f}: เมนูไม่มี ${l}`);
  if (nav.includes('href="/precedents/"')) bad(`${f}: เมนูต้องไม่มี /precedents/`);
  linkSources.push([`/${f.replace(/index\.html$/, '')}`, h]);
}

// ---- ลิงก์ภายในต้องมีปลายทางจริง ----
const exists = (u) => {
  let p = decodeURIComponent(u.split('#')[0].split('?')[0]);
  if (p.startsWith('/workspace/') || p.startsWith('/admin/') || p === '/workspace' || p === '/admin') return true; // vercel rewrite → /workspace/index.html
  if (p === '/sitemap.xml') return true; // rewrite → /api/sitemap
  const f = path.join(dist, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) return true;
  return fs.existsSync(path.join(f, 'index.html'));
};
let nLinks = 0;
const seen = new Set();
for (const [from, html] of linkSources) {
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    const u = m[1];
    if (u.startsWith('//')) continue;
    nLinks++;
    const key = u;
    if (seen.has(key)) continue; seen.add(key);
    if (!exists(u)) bad(`${from}: ลิงก์ไม่มีปลายทาง ${u}`);
  }
}

// ---- sitemap (api/sitemap.js) รวมหน้าใหม่ และทนต่อความล้มเหลว ----
{
  const real = globalThis.fetch;
  const run = async () => {
    const { default: handler } = await import(pathToFileURL(path.join(root, 'api/sitemap.js')).href);
    let body = '';
    await handler({ headers: { host: 'test.local' } }, { setHeader() {}, end(b) { body = b; }, set statusCode(_) {} });
    return body;
  };
  globalThis.fetch = async (u) => {
    const s = String(u);
    const m = s.match(/\/(seo-urls\.json|articles-data\/index\.json)$/);
    if (m) return { ok: true, json: async () => JSON.parse(read(m[1])) };
    throw new Error('offline'); // Supabase ใช้ไม่ได้ → ต้องยังคืนผลได้
  };
  const ok = await run();
  for (const sample of ['/laws/pc-326/', '/jurisdiction/bangkok/', '/procedure/', '/precedents/']) if (!ok.includes(`<loc>${SITE}${sample}</loc>`)) bad(`sitemap ไม่มี ${sample}`);
  const locs = (ok.match(/<loc>/g) || []).length;
  if (locs < urls.length) bad(`sitemap มี ${locs} URL น้อยกว่า seo-urls (${urls.length})`);
  if (locs > 50000) bad('sitemap เกิน 50,000 URL');
  globalThis.fetch = async () => { throw new Error('offline'); };
  const fb = await run();
  for (const base of ['/', '/articles/', '/contact/', '/privacy/']) if (!fb.includes(`<loc>${SITE}${base}</loc>`)) bad(`sitemap (ล้มเหลว) ไม่มี ${base}`);
  globalThis.fetch = real;
  console.log(`sitemap: ${locs} URL (ปกติ) · ${(fb.match(/<loc>/g) || []).length} URL (ดึงข้อมูลไม่ได้)`);
}

console.log(`seo: ตรวจ ${seoDisk.length} หน้า — ${SECTIONS.map((s) => `${s} ${counts[s]}`).join(' · ')} · ลิงก์ภายในที่ตรวจ ${nLinks} (ไม่ซ้ำ ${seen.size})`);
if (fails) { console.error(`seo: ไม่ผ่าน ${fails} รายการ`); process.exit(1); }
console.log('seo: ผ่านทั้งหมด');
