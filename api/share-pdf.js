// ลิงก์ดู PDF ชุดเอกสารแบบไม่ต้องล็อกอิน บนโดเมนของเว็บเอง:  GET /p/<token>  หรือ  /p/<token>.pdf  (vercel.json rewrite → /api/share-pdf?t=<token>)
//   • ลิงก์คงที่ต่อคดี — อัปโหลด PDF ทับแล้วลิงก์เดิมยังเปิดได้และได้ไฟล์ล่าสุดเสมอ (ปิดลิงก์/ออกลิงก์ใหม่จากหน้าออกเอกสาร → ลิงก์เดิม 404)
//   • ไฟล์จริงอยู่ใน Supabase (Edge Function `pdf` → bucket ส่วนตัว case-pdfs) ฟังก์ชันนี้ดึงมาส่งต่อ ผู้รับไม่เห็นและไม่ต้องใช้ URL ของ Supabase
//   • ตัวดึงภาพตัวอย่างของแอปแชต (LINE / Facebook / Messenger / X …) ได้หน้า HTML ที่มี og:image แทน เพราะบอทเหล่านั้นไม่เปิด PDF ; คนจริงได้ PDF ทันที
//   • Vercel จำกัดขนาดตอบกลับของฟังก์ชัน ~4.5 MB → ไฟล์ใหญ่กว่านั้นส่งต่อ (302) ไปยังไฟล์โดยตรง (ยังเปิดได้ เพียงแต่เห็น URL ของ Supabase)
import config from '../public/js/config.js';

const SITE = (process.env.SITE_URL || 'https://www.law-craft.co').replace(/\/$/, '');
const SB_URL = (process.env.SUPABASE_URL || config.supabase?.url || '').replace(/\/$/, '');
const MAX_PROXY = 4 * 1024 * 1024;
const BOT_RE = /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|WhatsApp|\bLine\b|LINE|Googlebot|bingbot|Applebot|Pinterest|Embedly|vkShare|Iframely|SkypeUriPreview|redditbot|Mastodon/i;
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** หน้าพักสำหรับบอทภาพตัวอย่าง (และสำรองเมื่อเปิดไฟล์ไม่ได้): แท็ก Open Graph + ปุ่มเปิดไฟล์ */
function landing(token, { ok = true } = {}) {
  const file = `/p/${token}.pdf`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>ชุดเอกสารคดี (PDF) · Law Craft</title>
<meta name="description" content="เปิดดูชุดเอกสารคดี (PDF) ที่แชร์จากระบบร่างคำฟ้อง Law Craft — ดูได้โดยไม่ต้องล็อกอิน ไฟล์ล่าสุดเสมอ">
<meta property="og:type" content="website"><meta property="og:site_name" content="Law Craft Legal Consultants"><meta property="og:locale" content="th_TH">
<meta property="og:title" content="ชุดเอกสารคดี (PDF) · Law Craft"><meta property="og:description" content="เอกสารยื่นศาลตามแบบพิมพ์ศาลยุติธรรม — แตะเพื่อเปิดดูไฟล์ล่าสุด (ไม่ต้องล็อกอิน)">
<meta property="og:url" content="${SITE}/p/${token}"><meta property="og:image" content="${SITE}/og-pdf.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="ชุดเอกสารคดี PDF จาก Law Craft">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="ชุดเอกสารคดี (PDF) · Law Craft"><meta name="twitter:description" content="เอกสารยื่นศาลตามแบบพิมพ์ศาลยุติธรรม — แตะเพื่อเปิดดูไฟล์ล่าสุด"><meta name="twitter:image" content="${SITE}/og-pdf.png">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">${ok ? `<meta http-equiv="refresh" content="0;url=${file}">` : ''}
<style>html,body{margin:0;min-height:100%;background:#f5f5f7;color:#1d1d1f;font-family:'Noto Sans Thai',system-ui,-apple-system,sans-serif}main{max-width:520px;margin:0 auto;padding:56px 20px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{color:#6b7280;margin:0 0 24px;line-height:1.5}.btn{display:inline-block;min-width:220px;padding:14px 24px;border-radius:999px;background:#0071e3;color:#fff;text-decoration:none;font-weight:600;font-size:17px}.err{color:#b42318}.back{display:block;margin-top:28px;color:#6b7280;font-size:14px}</style></head>
<body><main><h1>ชุดเอกสารคดี (PDF)</h1>${ok ? `<p>ถ้าไฟล์ไม่เปิดเอง แตะปุ่มด้านล่าง</p><a class="btn" href="${file}">เปิดไฟล์ PDF</a>` : '<p class="err">ไม่พบลิงก์นี้ หรือลิงก์ถูกยกเลิกแล้ว — ขอลิงก์ใหม่จากผู้ส่ง</p>'}<a class="back" href="/">www.law-craft.co</a></main></body></html>`;
}

function send(res, status, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(status).send(html);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return res.status(405).send('method not allowed'); }
  const u = new URL(req.url || '/', SITE);
  const token = String(u.searchParams.get('t') || '').toLowerCase();
  const wantsPdf = u.searchParams.get('f') === 'pdf';
  if (!/^[a-f0-9]{64}$/.test(token) || !SB_URL) return send(res, 404, landing('', { ok: false }));
  // บอทภาพตัวอย่าง (ไม่ใช่ลิงก์ .pdf) → หน้า HTML ที่มี og:image ; ไม่ต้องดึงไฟล์
  if (!wantsPdf && BOT_RE.test(req.headers['user-agent'] || '')) return send(res, 200, landing(token));
  const src = `${SB_URL}/functions/v1/pdf/${token}.pdf`;
  let up;
  try { up = await fetch(src, { method: req.method, headers: { Accept: 'application/pdf' }, signal: AbortSignal.timeout(12000) }); } catch { up = null; }
  if (!up || up.status === 404) return send(res, 404, landing(token, { ok: false }));
  if (!up.ok) return send(res, 502, landing(token, { ok: false }));
  const size = Number(up.headers.get('content-length') || 0);
  if (size > MAX_PROXY) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Location', src); return res.status(302).end(); }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', up.headers.get('content-disposition') || `inline; filename*=UTF-8''${encodeURIComponent('ชุดเอกสาร')}.pdf`);
  res.setHeader('Cache-Control', 'private, no-store'); // อัปโหลดใหม่แล้วลิงก์เดิมต้องได้ไฟล์ล่าสุดเสมอ
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') { if (size) res.setHeader('Content-Length', String(size)); return res.status(200).end(); }
  const buf = Buffer.from(await up.arrayBuffer());
  if (buf.length > MAX_PROXY + 65536) { res.removeHeader('Content-Type'); res.removeHeader('Content-Disposition'); res.setHeader('Location', src); return res.status(302).end(); }
  res.setHeader('Content-Length', String(buf.length));
  return res.status(200).send(buf);
}
