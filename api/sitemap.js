// sitemap.xml แบบสร้างตอนมีคนขอ (Vercel serverless; vercel.json rewrite /sitemap.xml -> /api/sitemap)
// รวม: หน้าสาธารณะ + บทความตั้งต้น (articles-data/index.json ที่ build ไว้) + บทความที่แอดมินสร้าง/แก้/ซ่อน (law_data key 'content-articles')
// ไม่เคยโยนข้อผิดพลาด — ถ้าอ่านข้อมูลไม่ได้ จะคืนเฉพาะหน้าหลักแบบตายตัว
// ค่า Supabase ด้านล่างเป็นค่าสาธารณะเดียวกับ public/js/config.js (คีย์ anon อ่านอย่างเดียวผ่าน RLS) — ห้ามใส่ service_role key
import { mergeIndex } from '../public/articles/merge.js';

const SB_URL = process.env.SUPABASE_URL || 'https://rertcaxuqeuytleaqqft.supabase.co';
const SB_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlcnRjYXh1cWV1eXRsZWFxcWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMTk2NjgsImV4cCI6MjEwNjY5NTY2OH0.CtIOkb9shagUgYXb2X5CkiZkRto-JZJpQz4xpcUpgbM';
const SITE = (process.env.SITE_URL || 'https://www.law-craft.co').replace(/\/$/, ''); // ให้ตรงกับ scripts/build-static.js
const TIMEOUT = 4000;

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const day = (s, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : fallback);

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

export default async function handler(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [['/', today, 'weekly', '1.0'], ['/articles/', today, 'weekly', '0.8'], ['/contact/', today, 'monthly', '0.6'], ['/privacy/', today, 'yearly', '0.3'], ['/service-fee/', today, 'monthly', '0.7']];
  try {
    const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
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
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, m, f, pr]) => `  <url><loc>${xml(SITE + p)}</loc><lastmod>${m}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
  res.end(body);
}
