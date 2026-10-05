// หน้าเฉพาะของแต่ละฎีกา (SSR): /precedents/<เลขฎีกา>-<ปี>-<docId>/  — vercel.json rewrite มาที่ /api/precedent?slug=…
// อ่านฎีกาจาก Aiven (api/_aiven.js, บทบาทอ่านอย่างเดียว) แล้วเติมลงแม่แบบหน้า dist/_px/precedent.html (สร้างตอน build โดย scripts/build-seo-pages.js; มีเมนู/ท้ายเว็บเหมือนหน้าอื่น)
// ค่าที่แทนในแม่แบบ: @@PX_TITLE@@ @@PX_DESC@@ @@PX_SLUG@@ @@PX_CRUMB@@ (escape ตามบริบท: HTML / JSON-LD) และ @@PX_MAIN@@ (HTML ที่ประกอบและ escape แล้วที่นี่)
// ทดสอบในเครื่อง: PX_SHELL_FILE=<ไฟล์แม่แบบ> (อ่านไฟล์แทนการดึงจากเว็บ)
import fs from 'node:fs';
import { getPool, NOTICE, precedentSlug, docIdFromSlug } from './_aiven.js';

const SITE = (process.env.SITE_URL || 'https://www.law-craft.co').replace(/\/$/, '');
const ALLOWED_HOST = /^(www\.law-craft\.co|law-craft\.co|[a-z0-9-]+\.vercel\.app|localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/i; // กัน Host header ปลอมพา fetch ไปที่อื่น

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const para = (s) => String(s ?? '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`).join('');
const trunc = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };

/** แทนค่าในแม่แบบ: ข้อความล้วนที่ escape ตามบริบท (JSON-LD ใช้ JSON escape), main = HTML สำเร็จรูป */
export function fillShell(shell, v) {
  return shell.split(/(<script type="application\/ld\+json">[\s\S]*?<\/script>)/).map((part, i) => part.replace(/@@PX_(SLUG|TITLE|DESC|CRUMB|MAIN)@@/g, (m, k) => {
    const val = v[k.toLowerCase()] ?? '';
    if (k === 'MAIN') return val;
    return i % 2 ? JSON.stringify(String(val)).slice(1, -1).replace(/</g, '\\u003c') : esc(val);
  })).join('');
}

export function titleOf(it) {
  const no = `ฎีกาที่ ${it.case_no}/${it.year}`;
  const hint = trunc((it.headnote || '').split(/\n/)[0], 38);
  return hint ? `${no} ${hint} | Law Craft` : `${no} | Law Craft`;
}

/** เนื้อหาหน้า (main) — ทุกค่าจากฐานผ่าน esc() */
export function renderMain(it) {
  const typeTag = it.case_type ? `<span class="tag ${it.case_type === 'แพ่ง' ? 'civil' : 'crim'}">${esc(it.case_type)}</span>` : '';
  const laws = (it.laws || []).map((l) => `${esc(l.name || l.abbr || '')}${l.sections?.length ? ` — ${l.sections.map(esc).join(', ')}` : ''}`);
  const fact = (k, arr) => (arr && arr.length ? `<dt>${k}</dt><dd>${arr.join('<br>')}</dd>` : '');
  const list = (a) => (a || []).map(esc);
  return `
    <p class="sp-eyebrow"><span class="tag">ฎีกา</span> <span>ปี พ.ศ. ${esc(it.year)}</span> ${typeTag}</p>
    <h1>ฎีกาที่ ${esc(it.case_no)}/${esc(it.year)}</h1>
    ${it.headnote ? `<h2>คำพิพากษาย่อ (ย่อสั้น)</h2><div class="px-text">${para(it.headnote)}</div>` : '<p class="fine">ไม่มีคำพิพากษาย่อสั้นในแหล่งข้อมูล</p>'}
    ${it.full_text ? `<h2>คำพิพากษาย่อ (ย่อยาว)</h2><div class="px-text">${para(it.full_text)}</div>` : ''}
    <h2>ข้อมูลคดี</h2>
    <dl class="facts">${fact('คู่ความ', list(it.litigants))}${fact('กฎหมายที่อ้าง', laws)}${fact('องค์คณะ', list(it.judges))}${fact('ศาลชั้นต้น/อุทธรณ์', list(it.lower_courts))}${fact('หมายเลขคดี', list(it.primary_court_nos))}${fact('แผนก', list(it.departments))}</dl>
    <div class="note src"><p><b>ที่มาของข้อมูล</b> — ศูนย์เทคโนโลยีสารสนเทศและการสื่อสารในศาลฎีกา<br>ศาลฎีกา เลขที่ 6 ถนนราชดำเนินใน แขวงพระบรมมหาราชวัง เขตพระนคร กรุงเทพฯ 10200 <span class="tag ok">✓ ตรวจสอบแล้ว</span></p>
    <p class="fine">${esc(NOTICE)} · <a href="https://deka.supremecourt.or.th/" rel="noopener noreferrer" target="_blank">ระบบสืบค้นคำพิพากษาศาลฎีกา</a></p></div>
    <p class="sp-bar"><a class="link-arrow" href="/precedents/">ค้นหาฎีกาอื่น</a><a class="link-arrow" href="/laws/">ข้อกฎหมายและมาตรา</a></p>`;
}

let shellCache = null;
async function getShell(req) {
  if (process.env.PX_SHELL_FILE) return fs.readFileSync(process.env.PX_SHELL_FILE, 'utf8');
  if (shellCache && Date.now() - shellCache.at < 10 * 60_000) return shellCache.text;
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  const proto = /^(localhost|127\.)/.test(host) ? 'http' : 'https';
  const bases = [...new Set([ALLOWED_HOST.test(host) ? `${proto}://${host}` : '', SITE].filter(Boolean))];
  for (const b of bases) {
    try {
      const r = await fetch(`${b}/_px/precedent.html`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) { const text = await r.text(); if (text.includes('@@PX_MAIN@@')) { shellCache = { text, at: Date.now() }; return text; } }
    } catch { /* ลองที่ถัดไป */ }
  }
  return null;
}

const out = (res, status, html, cache, extra = {}) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(html);
};
const plainPage = (title, msg) => `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head><body style="font-family:system-ui,sans-serif;max-width:40em;margin:12vh auto;padding:0 20px"><h1>${esc(title)}</h1><p>${esc(msg)}</p><p><a href="/precedents/">ค้นหาฎีกา</a> · <a href="/">หน้าแรก</a></p></body></html>`;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return out(res, 405, plainPage('ไม่รองรับ', 'method not allowed'), 'no-store'); }
  const slug = String(new URL(req.url, 'http://x').searchParams.get('slug') || '').replace(/\/+$/, '');
  const docId = docIdFromSlug(slug);
  if (!docId || !/^[0-9a-z-]{3,80}$/i.test(slug)) return out(res, 404, plainPage('ไม่พบหน้านี้', 'ที่อยู่ของฎีกาไม่ถูกต้อง'), 'public, s-maxage=300');
  const p = getPool();
  if (!p) return out(res, 503, plainPage('ยังไม่พร้อมใช้งาน', 'ระบบอ่านฎีกายังไม่พร้อมใช้งาน (ยังไม่ได้ตั้งค่าฐานข้อมูล) ลองใหม่ภายหลัง'), 'no-store');
  try {
    const [shell, r] = await Promise.all([getShell(req), p.query('select source_doc_id, case_no, year, case_type, headnote, full_text, laws, litigants, judges, lower_courts, primary_court_nos, departments from precedents_full where source_doc_id = $1', [docId])]);
    if (!shell) return out(res, 503, plainPage('ยังไม่พร้อมใช้งาน', 'โหลดแม่แบบหน้าไม่สำเร็จ ลองใหม่อีกครั้ง'), 'no-store');
    if (!r.rowCount) {
      const html = fillShell(shell, { slug, title: 'ไม่พบฎีกานี้ | Law Craft', desc: 'ไม่พบฎีกาที่ระบุ', crumb: 'ไม่พบฎีกา', main: '<h1>ไม่พบฎีกานี้</h1><p>ไม่พบฎีกาตามที่อยู่นี้ ลอง <a href="/precedents/">ค้นหาฎีกา</a> ใหม่อีกครั้ง</p>' }).replace('content="index,follow"', 'content="noindex,follow"');
      return out(res, 404, html, 'public, s-maxage=300');
    }
    const it = r.rows[0];
    const canonical = precedentSlug(it.case_no, it.year, it.source_doc_id);
    if (slug !== canonical) return out(res, 301, '', 'public, s-maxage=86400', { Location: `/precedents/${canonical}/` });
    const desc = trunc(it.headnote || `คำพิพากษาศาลฎีกาที่ ${it.case_no}/${it.year}`, 155);
    const html = fillShell(shell, { slug: canonical, title: titleOf(it), desc, crumb: `${it.case_no}/${it.year}`, main: renderMain(it) });
    return out(res, 200, req.method === 'HEAD' ? '' : html, 'public, s-maxage=86400, stale-while-revalidate=604800');
  } catch (e) {
    console.error('precedent page:', e.code || '', e.message);
    return out(res, e.code === '57014' ? 504 : 500, plainPage('เกิดข้อผิดพลาด', 'โหลดฎีกาไม่สำเร็จ ลองใหม่อีกครั้ง'), 'no-store');
  }
}
