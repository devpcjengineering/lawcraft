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

/** หน้าพักสำหรับบอทภาพตัวอย่าง และหน้าแสดงรายละเอียดคดีสำหรับผู้ใช้ */
function landing(token, { ok = true, title = 'ชุดเอกสารคดี', date = '', isBot = false } = {}) {
  const file = `/p/${token}.pdf`;
  const displayTitle = esc(title || 'ชุดเอกสารคดี');

  if (!ok) {
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ไม่พบเอกสาร · Law Craft</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500&display=swap');
body{margin:0;min-height:100vh;background:#0f172a;color:#f8fafc;font-family:'Noto Sans Thai',sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;}
.box{background:rgba(30,41,59,0.7);padding:40px;border-radius:20px;border:1px solid rgba(255,255,255,0.1);}
.err{color:#fca5a5;margin-bottom:20px;line-height:1.5;}
a{color:#64748b;text-decoration:none;font-size:14px;}
</style></head>
<body><div class="box"><p class="err">ไม่พบลิงก์นี้ หรือลิงก์ถูกยกเลิกแล้ว<br>กรุณาขอลิงก์ใหม่จากผู้ส่ง</p><a href="/">www.law-craft.co</a></div></body></html>`;
  }

  // สำหรับบอทแสดงภาพตัวอย่าง
  if (isBot) {
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${displayTitle} · Law Craft</title>
<meta name="description" content="เปิดดูชุดเอกสารคดี (PDF) ที่แชร์จากระบบร่างคำฟ้อง Law Craft — ดูได้โดยไม่ต้องล็อกอิน ไฟล์ล่าสุดเสมอ">
<meta property="og:type" content="website"><meta property="og:site_name" content="Law Craft Legal Consultants"><meta property="og:locale" content="th_TH">
<meta property="og:title" content="${displayTitle} · Law Craft"><meta property="og:description" content="เอกสารยื่นศาลตามแบบพิมพ์ศาลยุติธรรม — แตะเพื่อเปิดดูไฟล์ล่าสุด (ไม่ต้องล็อกอิน)">
<meta property="og:url" content="${SITE}/p/${token}"><meta property="og:image" content="${SITE}/og-pdf.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${displayTitle} · Law Craft"><meta name="twitter:image" content="${SITE}/og-pdf.png">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><meta http-equiv="refresh" content="0;url=${file}">
</head><body></body></html>`;
  }

  let dateText = '';
  if (date) {
    const d = new Date(date);
    if (!isNaN(d.getTime())) dateText = `อัปเดต: ${d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  }

  // สำหรับผู้ใช้ทั่วไป (Header + Iframe เปิด PDF ทันที)
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${displayTitle} · Law Craft</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600&display=swap');
html, body {
  margin: 0; padding: 0; height: 100vh; overflow: hidden;
  background: #0f172a; color: #f8fafc;
  font-family: 'Noto Sans Thai', system-ui, -apple-system, sans-serif;
  display: flex; flex-direction: column;
}
.header {
  height: 60px; min-height: 60px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; background: #1e293b; border-bottom: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 10;
}
.header-left { display: flex; align-items: center; gap: 12px; overflow: hidden; }
.logo-icon {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 8px; color: #fff; flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(37,99,235,0.4);
}
.title-group { display: flex; flex-direction: column; overflow: hidden; white-space: nowrap; }
.title { font-size: 15px; font-weight: 600; color: #f1f5f9; margin: 0; overflow: hidden; text-overflow: ellipsis; }
.subtitle { font-size: 12px; color: #94a3b8; margin: 0; }
.header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px;
  background: rgba(59,130,246,0.1); color: #60a5fa; text-decoration: none; font-size: 13px; font-weight: 500;
  border: 1px solid rgba(59,130,246,0.2); transition: all 0.2s;
}
.btn:hover { background: rgba(59,130,246,0.2); color: #93c5fd; }
.content { flex: 1; width: 100%; position: relative; background: #e2e8f0; }
iframe { width: 100%; height: 100%; border: none; display: block; }
@media (max-width: 600px) {
  .btn span { display: none; }
  .btn { padding: 8px; }
}
</style></head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="logo-icon">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"></path></svg>
      </div>
      <div class="title-group">
        <h1 class="title" title="${displayTitle}">${displayTitle}</h1>
        ${dateText ? `<div class="subtitle">${dateText}</div>` : ''}
      </div>
    </div>
    <div class="header-right">
      <a href="${file}" class="btn" download>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"></path></svg>
        <span>ดาวน์โหลด</span>
      </a>
    </div>
  </div>
  <div class="content">
    <iframe src="${file}#toolbar=0" title="PDF Viewer"></iframe>
  </div>
</body></html>`;
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
  
  const isBot = BOT_RE.test(req.headers['user-agent'] || '');
  if (!wantsPdf && isBot) return send(res, 200, landing(token, { isBot }));
  
  const src = `${SB_URL}/functions/v1/pdf/${token}.pdf`;
  
  if (!wantsPdf) {
    let headRes;
    try { headRes = await fetch(src, { method: 'HEAD', signal: AbortSignal.timeout(5000) }); } catch { headRes = null; }
    if (!headRes || headRes.status === 404) return send(res, 404, landing(token, { ok: false }));
    const title = decodeURIComponent(headRes.headers.get('X-Case-Title') || '');
    const date = decodeURIComponent(headRes.headers.get('X-Case-Updated') || '');
    return send(res, 200, landing(token, { ok: true, title, date, isBot }));
  }

  let up;
  try { up = await fetch(src, { method: req.method, headers: { Accept: 'application/pdf' }, signal: AbortSignal.timeout(12000) }); } catch { up = null; }
  if (!up || up.status === 404) return send(res, 404, landing(token, { ok: false }));
  if (!up.ok) return send(res, 502, landing(token, { ok: false }));
  const size = Number(up.headers.get('content-length') || 0);
  if (size > MAX_PROXY) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Location', src); return res.status(302).end(); }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', up.headers.get('content-disposition') || `inline; filename*=UTF-8''${encodeURIComponent('ชุดเอกสาร')}.pdf`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') { if (size) res.setHeader('Content-Length', String(size)); return res.status(200).end(); }
  const buf = Buffer.from(await up.arrayBuffer());
  if (buf.length > MAX_PROXY + 65536) { res.removeHeader('Content-Type'); res.removeHeader('Content-Disposition'); res.setHeader('Location', src); return res.status(302).end(); }
  res.setHeader('Content-Length', String(buf.length));
  return res.status(200).send(buf);
}
