// POST /api/pdf  body { case, title? }  header Authorization: Bearer <access_token ของผู้ใช้ Supabase>
// → application/pdf (สร้างด้วย Chrome บนเซิร์ฟเวอร์ — api/_pdf-render.js) ; header X-Pdf-Pages = จำนวนแผ่น
// GET /api/pdf?health=1 → ตรวจว่า Chrome บนเซิร์ฟเวอร์ทำงาน (ไม่ต้องล็อกอิน)
// ตรวจสิทธิ์: โทเค็นต้องเป็นของผู้ใช้ที่ล็อกอินอยู่ (ตรวจกับ Supabase Auth) — ข้อมูลคดีมาจากผู้ใช้เอง ไม่อ่านฐานข้อมูล
import config from '../public/js/config.js';
import { renderCasePdf, pdfHealth } from './_pdf-render.js';

const SITE = (process.env.SITE_URL || 'https://www.law-craft.co').replace(/\/$/, '');
const MAX_BODY = 4 * 1024 * 1024;

async function verifyUser(req) {
  const { url, anonKey } = config.supabase || {};
  if (!url || !anonKey) return null;
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return null;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${m[1]}` } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u?.id ? u : null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let s = '', n = 0;
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new Error('ข้อมูลคดีใหญ่เกินไป')); req.destroy(); } else s += c; });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('JSON ไม่ถูกต้อง')); } });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    if (!/(^|[?&])health=1/.test(req.url || '')) return res.status(405).json({ error: 'POST เท่านั้น' });
    try { return res.status(200).json(await pdfHealth()); } catch (e) { return res.status(500).json({ ok: false, error: String(e.message || e) }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST เท่านั้น' });
  try {
    const user = await verifyUser(req);
    if (!user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบ' });
    const body = await readBody(req);
    const c = body?.case;
    if (!c || typeof c !== 'object' || !Array.isArray(c.parties)) return res.status(400).json({ error: 'ไม่มีข้อมูลคดี' });
    const title = String(body.title || c.title || 'ชุดเอกสาร').slice(0, 200);
    const out = await renderCasePdf({ origin: SITE, caseData: c, title });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Pdf-Pages', String(out.sheets));
    res.setHeader('X-Pdf-Ms', String(out.ms));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(title)}.pdf`);
    return res.status(200).send(out.pdf);
  } catch (e) {
    console.error('api/pdf', e);
    return res.status(500).json({ error: 'สร้าง PDF บนเซิร์ฟเวอร์ไม่สำเร็จ: ' + String(e.message || e).slice(0, 300) });
  }
}
