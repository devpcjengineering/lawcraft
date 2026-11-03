// หน้าโพสต์แบบ SSR (เสิร์ชเอนจิน/แชร์ลิงก์อ่านได้โดยไม่ต้องรัน JS):
//   /articles/<slug>/   บทความ  — ตั้งต้นจากไฟล์ที่ build ไว้ (articles-data/<slug>.json) + ชั้นที่แอดมินสร้าง/แก้/ซ่อนใน law_data 'content-articles'
//   /portfolio/<slug>/  ผลงาน   — จาก law_data 'content-portfolio' (เฉพาะที่เผยแพร่และได้รับความยินยอม)
// vercel.json rewrite มาที่ /api/post?kind=article|portfolio&slug=… ; แม่แบบหน้า dist/_px/<kind>.html สร้างตอน build (scripts/build-seo-pages.js) มีเมนู/ท้ายเว็บ/CSS เหมือนหน้าอื่น
// token ในแม่แบบ: @@PX_SLUG@@ @@PX_TITLE@@ @@PX_DESC@@ @@PX_CRUMB@@ @@PX_IMAGE@@ @@PX_ROBOTS@@ @@PX_MOD@@ (escape ตามบริบท HTML / JSON-LD) · @@PX_META@@ @@PX_MAIN@@ (HTML สำเร็จรูป) · "@@PX_LD@@" (โหนด JSON-LD ของโพสต์)
// มาร์กอัป/ค่า SEO/JSON-LD อยู่ใน shared/post-seo.js (ใช้ร่วมกับหลังบ้าน) · ค่าจากข้อมูลทุกตัวผ่าน esc() ที่นั่น
// ทดสอบในเครื่อง: PX_SHELL_DIR=dist/_px PX_DATA_DIR=dist PX_CONTENT_DIR=<โฟลเดอร์ที่มี articles.json/portfolio.json> (อ่านไฟล์แทนการดึงจากเว็บ/Supabase)
// ค่า Supabase ด้านล่างเป็นค่าสาธารณะเดียวกับ public/js/config.js (คีย์ anon อ่านอย่างเดียวผ่าน RLS) — ห้ามใส่ service_role key
import fs from 'node:fs';
import path from 'node:path';
import { mergeIndex, pickArticle, needsResolve, reuseStaticRefs, resolveRefs } from '../public/articles/merge.js';
import { publicItems } from '../public/portfolio/model.js';
import { articleSeo, portfolioSeo, renderArticleMain, renderPortfolioMain, articleLd, portfolioLd, articlePath, portfolioPath, esc, trunc, SLUG_RE } from '../shared/post-seo.js';

const SB_URL = process.env.SUPABASE_URL || 'https://rertcaxuqeuytleaqqft.supabase.co';
const SB_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlcnRjYXh1cWV1eXRsZWFxcWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMTk2NjgsImV4cCI6MjEwNjY5NTY2OH0.CtIOkb9shagUgYXb2X5CkiZkRto-JZJpQz4xpcUpgbM';
const SITE = (process.env.SITE_URL || 'https://www.law-craft.co').replace(/\/$/, '');
const ALLOWED_HOST = /^(www\.law-craft\.co|law-craft\.co|[a-z0-9-]+\.vercel\.app|localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/i; // กัน Host header ปลอมพา fetch ไปที่อื่น
const TIMEOUT = 4000;
const KINDS = { article: { base: '/articles/', label: 'บทความ', notFound: 'ไม่พบบทความนี้' }, portfolio: { base: '/portfolio/', label: 'ผลงาน', notFound: 'ไม่พบผลงานนี้' } };

// ---------- แทนค่าในแม่แบบ ----------
const jsonEsc = (s) => JSON.stringify(String(s ?? '')).slice(1, -1).replace(/</g, '\\u003c');
/**
 * v = { slug, title, desc, crumb, image, robots, mod, meta (HTML), main (HTML), ld (array ของโหนด JSON-LD) }
 * ข้อความล้วน escape ตามบริบท (ใน <script type=ld+json> ใช้ JSON escape) · meta/main ใส่ตรง ๆ (ประกอบและ escape มาแล้ว)
 */
export function fillShell(shell, v) {
  const nodes = Array.isArray(v.ld) ? v.ld : [];
  let s = shell.replace(/,?"@@PX_LD@@"/, nodes.length ? ',' + nodes.map((n) => JSON.stringify(n)).join(',').replace(/</g, '\\u003c') : '');
  if (!v.mod) s = s.replace(/,"dateModified":"@@PX_MOD@@"/, ''); // ไม่มีวันที่ = ไม่ใส่ฟิลด์
  return s.split(/(<script type="application\/ld\+json">[\s\S]*?<\/script>)/).map((part, i) => part.replace(/@@PX_(SLUG|TITLE|DESC|CRUMB|IMAGE|ROBOTS|MOD|META|MAIN)@@/g, (m, k) => {
    const val = v[k.toLowerCase()] ?? '';
    if (k === 'MAIN' || k === 'META') return i % 2 ? '' : val;
    return i % 2 ? jsonEsc(val) : esc(val);
  })).join('');
}

// ---------- โหลดข้อมูล (แคชในหน่วยความจำของอินสแตนซ์) ----------
const cache = new Map(); // key → { at, val }
async function cached(key, ttl, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ttl) return c.val;
  const val = await fn();
  if (val != null) cache.set(key, { at: Date.now(), val });
  return val;
}
function bases(req) {
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  const proto = /^(localhost|127\.)/.test(host) ? 'http' : 'https';
  return [...new Set([ALLOWED_HOST.test(host) ? `${proto}://${host}` : '', SITE].filter(Boolean))];
}
async function fetchText(url, init = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
}
/** ไฟล์ในไซต์เดียวกัน (dist/…) เช่น _px/article.html, articles-data/<slug>.json — null = ไม่มี/อ่านไม่ได้ */
async function siteFile(req, rel, dirEnv) {
  const dir = process.env[dirEnv];
  if (dir) { try { return fs.readFileSync(path.join(dir, rel), 'utf8'); } catch { return null; } }
  for (const b of bases(req)) {
    try { return await fetchText(`${b}/${rel}`); } catch (e) { if (String(e.message) === '404') return null; }
  }
  return null;
}
const getShell = (req, kind) => cached('shell:' + kind, 10 * 60_000, async () => { const t = await siteFile(req, `${kind}.html`, 'PX_SHELL_DIR') ?? await siteFile(req, `_px/${kind}.html`, 'PX_SHELL_DIR'); return t && t.includes('@@PX_MAIN@@') ? t : null; });
const staticJson = async (req, rel) => { const t = await siteFile(req, rel, 'PX_DATA_DIR'); try { return t ? JSON.parse(t) : null; } catch { return null; } };
/** ชั้นที่แอดมินจัดการ (law_data 'content-<key>') — อ่านไม่ได้ = {} (ใช้ข้อมูลตั้งต้นต่อ) · แคช 30 วินาที */
const liveContent = (key) => cached('content:' + key, 30_000, async () => {
  const dir = process.env.PX_CONTENT_DIR;
  if (dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, `${key}.json`), 'utf8')); } catch { return {}; } }
  try {
    const rows = JSON.parse(await fetchText(`${SB_URL}/rest/v1/law_data?select=data&key=eq.content-${key}`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } }));
    return rows?.[0]?.data || {};
  } catch { return {}; }
});
/** ฐานกฎหมาย (items/laws) สำหรับบทความที่แอดมินแก้รายการมาตรา — ใช้เฉพาะเมื่อจำเป็น แคช 10 นาที */
const lawData = () => cached('law', 10 * 60_000, async () => {
  try {
    const rows = JSON.parse(await fetchText(`${SB_URL}/rest/v1/law_data?select=key,data&key=in.(items,laws)`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } }));
    const m = Object.fromEntries((rows || []).map((r) => [r.key, r.data]));
    return { items: m.items || [], laws: m.laws || [], precedents: [] };
  } catch { return null; }
});

// ---------- ประกอบหน้า (ไม่มี I/O — ทดสอบได้) ----------
/** บทความ: sa = ไฟล์ตั้งต้น (null ถ้าไม่มี), sIdx = รายการตั้งต้น, live = content-articles, law = ฐานกฎหมาย (ใช้เมื่อแอดมินแก้รายการมาตรา) */
export function buildArticle({ slug, sa, sIdx, live, law }) {
  let a = pickArticle(sa, live, slug);
  if (!a) return { status: 404 };
  if (needsResolve(a, sa)) a = law ? { ...a, ...resolveRefs(a, law) } : { ...a, related: [], precedents: [] };
  else a = reuseStaticRefs(a, sa);
  const list = mergeIndex(Array.isArray(sIdx) ? sIdx : [], live);
  const seo = articleSeo(a, SITE);
  const meta = [
    seo.datePublished ? `<meta property="article:published_time" content="${esc(seo.datePublished)}">` : '',
    seo.dateModified ? `<meta property="article:modified_time" content="${esc(seo.dateModified)}">` : '',
    a.category ? `<meta property="article:section" content="${esc(a.category)}">` : '',
    ...(Array.isArray(a.tags) ? a.tags : []).slice(0, 10).map((t) => `<meta property="article:tag" content="${esc(t)}">`),
  ].filter(Boolean).join('\n');
  return { status: 200, seo, item: a, fill: { slug, title: seo.title, desc: seo.description, crumb: trunc(a.title, 60), image: seo.image, robots: seo.noindex ? 'noindex,follow' : 'index,follow', mod: seo.dateModified, meta, main: renderArticleMain(a, { list, noCrumb: true }), ld: articleLd(a, SITE) } };
}
/** ผลงาน: live = content-portfolio */
export function buildPortfolio({ slug, live }) {
  const list = publicItems(live);
  const it = list.find((x) => x.slug === slug);
  if (!it) return { status: 404 };
  const seo = portfolioSeo(it, SITE);
  const meta = [
    seo.datePublished ? `<meta property="article:published_time" content="${esc(seo.datePublished)}">` : '',
    seo.dateModified ? `<meta property="article:modified_time" content="${esc(seo.dateModified)}">` : '',
    it.category ? `<meta property="article:section" content="${esc(it.category)}">` : '',
    ...it.tags.slice(0, 10).map((t) => `<meta property="article:tag" content="${esc(t)}">`),
  ].filter(Boolean).join('\n');
  return { status: 200, seo, item: it, fill: { slug, title: seo.title, desc: seo.description, crumb: trunc(it.title, 60), image: seo.image, robots: seo.noindex ? 'noindex,follow' : 'index,follow', mod: seo.dateModified, meta, main: renderPortfolioMain(it, { list, noCrumb: true }), ld: portfolioLd(it, SITE) } };
}

// ---------- ตอบ HTTP ----------
const out = (res, status, html, cacheCtl, extra = {}) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cacheCtl);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(html);
};
const plainPage = (title, msg, back = '/') => `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head><body style="font-family:system-ui,sans-serif;max-width:40em;margin:12vh auto;padding:0 20px"><h1>${esc(title)}</h1><p>${esc(msg)}</p><p><a href="${esc(back)}">กลับ</a> · <a href="/">หน้าแรก</a></p></body></html>`;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return out(res, 405, plainPage('ไม่รองรับ', 'method not allowed'), 'no-store'); }
  const u = new URL(req.url, 'http://x');
  const kind = String(u.searchParams.get('kind') || '');
  const slug = String(u.searchParams.get('slug') || '').replace(/\/+$/, '').toLowerCase();
  const K = KINDS[kind];
  if (!K || !SLUG_RE.test(slug)) return out(res, 404, plainPage('ไม่พบหน้านี้', 'ที่อยู่ไม่ถูกต้อง'), 'public, s-maxage=300');
  const preview = u.searchParams.has('v'); // หลังบ้านเปิดดูด้วย ?v=<เวลา> → ไม่แคช เห็นฉบับล่าสุดทันที
  try {
    let shell, page;
    if (kind === 'article') {
      const [sh, sa, sIdx, live] = await Promise.all([getShell(req, 'article'), staticJson(req, `articles-data/${slug}.json`), staticJson(req, 'articles-data/index.json'), liveContent('articles')]);
      shell = sh;
      const pre = pickArticle(sa, live, slug);
      const law = pre && needsResolve(pre, sa) ? await lawData() : null;
      page = buildArticle({ slug, sa, sIdx, live, law });
    } else {
      const [sh, live] = await Promise.all([getShell(req, 'portfolio'), liveContent('portfolio')]);
      shell = sh;
      page = buildPortfolio({ slug, live });
    }
    if (!shell) return out(res, 503, plainPage('ยังไม่พร้อมใช้งาน', 'โหลดแม่แบบหน้าไม่สำเร็จ ลองใหม่อีกครั้ง', K.base), 'no-store');
    if (page.status !== 200) {
      const html = fillShell(shell, { slug, title: `${K.notFound} | LawCraft by PKT`, desc: K.notFound, crumb: K.notFound, image: `${SITE}/og-image.png`, robots: 'noindex,follow', mod: '', meta: '', main: `<h1>${esc(K.notFound)}</h1><p>ลิงก์อาจผิด หรือ${K.label}ถูกย้าย/นำออกแล้ว — <a href="${K.base}">ดู${K.label}ทั้งหมด</a></p>`, ld: [] });
      return out(res, 404, req.method === 'HEAD' ? '' : html, preview ? 'no-store' : 'public, s-maxage=120, stale-while-revalidate=600');
    }
    const html = fillShell(shell, page.fill);
    return out(res, 200, req.method === 'HEAD' ? '' : html, preview ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=86400');
  } catch (e) {
    console.error('post page:', kind, slug, e.message);
    return out(res, 500, plainPage('เกิดข้อผิดพลาด', `โหลด${K.label}ไม่สำเร็จ ลองใหม่อีกครั้ง`, K.base), 'no-store');
  }
}
