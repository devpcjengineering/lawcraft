// sitemap แบบสร้างตอนมีคนขอ (Vercel serverless) — เป็น "sitemap index" ชี้ไปยังไฟล์ย่อย (vercel.json rewrite):
//   /sitemap.xml                 → ดัชนี: sitemap-pages.xml + sitemap-precedents-1..N.xml
//   /sitemap-pages.xml           → หน้าสาธารณะ + บทความ (ตั้งต้น + ที่แอดมินสร้าง/แก้/ซ่อนใน law_data 'content-articles') + หน้าข้อมูลกฎหมายสถิต (seo-urls.json)
//   /sitemap-precedents-N.xml    → หน้าฎีกาแต่ละฉบับ (/precedents/<เลข>-<ปี>-<รหัส>/) จากฐาน Aiven ทีละ PRECEDENTS_PER_FILE รายการ
// ไม่เคยโยนข้อผิดพลาด — อ่านข้อมูลไม่ได้ = คืนเท่าที่มี (หน้าหลักแบบตายตัว / ไฟล์ฎีกาว่าง)
// ค่า Supabase ด้านล่างเป็นค่าสาธารณะเดียวกับ public/js/config.js (คีย์ anon อ่านอย่างเดียวผ่าน RLS) — ห้ามใส่ service_role key
import { mergeIndex } from '../public/articles/merge.js';
import { getPool, precedentPath } from './_aiven.js';

const SB_URL = process.env.SUPABASE_URL || 'https://rertcaxuqeuytleaqqft.supabase.co';
const SB_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlcnRjYXh1cWV1eXRsZWFxcWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMTk2NjgsImV4cCI6MjEwNjY5NTY2OH0.CtIOkb9shagUgYXb2X5CkiZkRto-JZJpQz4xpcUpgbM';
const SITE = (process.env.SITE_URL || 'https://www.law-craft.co').replace(/\/$/, ''); // ให้ตรงกับ scripts/build-static.js
const TIMEOUT = 4000;
export const PRECEDENTS_PER_FILE = 10000; // ต่ำกว่าเพดาน 50,000 ของ sitemap มาก; 10,000 แถวอ่านจาก Aiven ~0.5–1 วินาที

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const day = (s, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : fallback);
const urlset = (rows) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.map(([p, m, f, pr]) => `  <url><loc>${xml(SITE + p)}</loc>${m ? `<lastmod>${m}</lastmod>` : ''}${f ? `<changefreq>${f}</changefreq>` : ''}${pr ? `<priority>${pr}</priority>` : ''}</url>`).join('\n')}\n</urlset>\n`;

async function getJson(url, init = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/** ไฟล์ JSON (อาร์เรย์) ที่ build ไว้ในไซต์เดียวกัน เช่น articles-data/index.json, seo-urls.json (ถ้าอ่านไม่ได้ ลองโดเมนหลัก) */
async function staticList(host, file) {
  const bases = [host ? `https://${host}` : '', SITE].filter(Boolean);
  for (const b of [...new Set(bases)]) {
    try { const j = await getJson(`${b}/${file}`); if (Array.isArray(j)) return j; } catch { /* ลองที่ถัดไป */ }
  }
  return [];
}
const staticIndex = (host) => staticList(host, 'articles-data/index.json');
/** หน้าข้อมูลกฎหมายสถิต (เขตอำนาจศาล/ข้อกฎหมาย/ขั้นตอน/ฎีกา) จาก scripts/build-seo-pages.js: [{path,lastmod,priority}] */
const seoUrls = (host) => staticList(host, 'seo-urls.json');

async function liveArticles() {
  try {
    const rows = await getJson(`${SB_URL}/rest/v1/law_data?select=data&key=eq.content-articles`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } });
    return rows?.[0]?.data || {};
  } catch { return {}; }
}

/** หน้าสาธารณะ + บทความ + หน้าข้อมูลกฎหมายสถิต (เหมือน sitemap เดิม) */
export async function pagesSitemap(host) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [['/', today, 'weekly', '1.0'], ['/articles/', today, 'weekly', '0.8'], ['/contact/', today, 'monthly', '0.6'], ['/privacy/', today, 'yearly', '0.3'], ['/service-fee/', today, 'monthly', '0.7']];
  try {
    const [idx, live, seo] = await Promise.all([staticIndex(host), liveArticles(), seoUrls(host).catch(() => [])]);
    for (const a of mergeIndex(idx, live)) {
      if (a?.slug) urls.push([`/articles/?a=${encodeURIComponent(a.slug)}`, day(a.updated, today), 'monthly', '0.7']);
    }
    // หน้าสถิตจากชุดข้อมูลกฎหมาย: เรียงตามความสำคัญ (priority มากไปน้อย) ต่อท้ายหน้าหลัก/บทความ
    const have = new Set(urls.map((u) => u[0]));
    const extra = (Array.isArray(seo) ? seo : []).filter((u) => typeof u?.path === 'string' && u.path.startsWith('/') && !have.has(u.path))
      .map((u) => [u.path, day(u.lastmod, today), 'monthly', /^[01](\.\d)?$/.test(String(u.priority)) ? String(u.priority) : '0.5'])
      .sort((a, b) => Number(b[3]) - Number(a[3]));
    urls.push(...extra);
  } catch { /* เหลือเฉพาะหน้าหลัก */ }
  return urlset(urls);
}

/** จำนวนฎีกาทั้งหมดในฐาน (0 = ไม่มีฐาน/อ่านไม่ได้) */
export async function precedentCount() {
  try {
    const p = getPool();
    if (!p) return 0;
    const r = await p.query('select count(*)::int as n from precedents_full');
    return r.rows[0]?.n || 0;
  } catch { return 0; }
}

/** ไฟล์ย่อยฎีกาลำดับที่ n (เริ่ม 1): เรียงตาม id คงที่ จึงแบ่งหน้าได้แน่นอน; lastmod = วันที่นำเข้าฐาน */
export async function precedentsSitemap(n) {
  const rows = [];
  try {
    const p = getPool();
    if (p && n >= 1) {
      const r = await p.query('select source_doc_id, case_no, year, created_at::date::text as d from precedents_full order by id limit $1 offset $2', [PRECEDENTS_PER_FILE, (n - 1) * PRECEDENTS_PER_FILE]);
      for (const x of r.rows) rows.push([precedentPath(x.case_no, x.year, x.source_doc_id), day(x.d, ''), '', '0.4']);
    }
  } catch { /* ไฟล์ว่าง */ }
  return urlset(rows);
}

/** ดัชนี sitemap: ไฟล์หน้า + ไฟล์ฎีกาตามจำนวนที่มี */
export async function indexSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const n = await precedentCount();
  const files = ['/sitemap-pages.xml'];
  for (let i = 1; i <= Math.ceil(n / PRECEDENTS_PER_FILE); i++) files.push(`/sitemap-precedents-${i}.xml`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files.map((f) => `  <sitemap><loc>${xml(SITE + f)}</loc><lastmod>${today}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`;
}

/** แยกว่าขอไฟล์ไหน: จาก query (?part=pages | ?part=precedents&n=3) หรือจากพาธเดิม (/sitemap-precedents-3.xml) */
export function partOf(req) {
  const raw = String(req?.url || '');
  const u = new URL(raw, 'http://x');
  const part = u.searchParams.get('part') || '';
  if (part === 'pages' || /\/sitemap-pages\.xml$/.test(u.pathname)) return { part: 'pages' };
  const m = /\/sitemap-precedents-(\d+)\.xml$/.exec(u.pathname);
  if (part === 'precedents' || m) return { part: 'precedents', n: Math.max(1, parseInt(u.searchParams.get('n') || (m ? m[1] : '1'), 10) || 1) };
  return { part: 'index' };
}

export default async function handler(req, res) {
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  const { part, n } = partOf(req);
  let body, cache = 's-maxage=600, stale-while-revalidate=86400';
  if (part === 'pages') body = await pagesSitemap(host);
  else if (part === 'precedents') { body = await precedentsSitemap(n); cache = 's-maxage=86400, stale-while-revalidate=604800'; } // ฎีกาเปลี่ยนไม่บ่อย
  else { body = await indexSitemap(); cache = 's-maxage=3600, stale-while-revalidate=86400'; }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(body);
}
