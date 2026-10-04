// ข้อมูลเว็บไซต์ที่แอดมินแก้ได้จากหลังบ้าน (ช่องทางติดต่อ ข้อมูลสำนักงาน เวลาทำการ ประกาศบนหัวเว็บ ข้อความท้ายเว็บ)
// เก็บเป็นแถว key='site' ในตาราง law_data (ทุกคนอ่านได้ แอดมินเขียนได้) — ถ้ายังไม่ตั้งค่า ใช้ค่าเริ่มต้นจาก /site/config.js
// แคชใน sessionStorage 5 นาที เพื่อให้หน้าถัดไปแสดงข้อมูลทันทีไม่กะพริบ แล้วค่อยอัปเดตเมื่อโหลดค่าล่าสุดเสร็จ
import base from '/site/config.js';
import app from '/js/config.js';

const KEY = 'lawcraft:site:v1';
const TTL = 5 * 60 * 1000;

const merge = (live) => {
  const d = live && typeof live === 'object' ? live : {};
  return {
    ...base,
    ...d,
    office: { ...base.office, ...(d.office || {}) },
    contacts: Array.isArray(d.contacts) && d.contacts.length ? d.contacts : (base.contacts || []),
    hours: d.hours || base.hours || '',
    footerDesc: d.footerDesc || base.footerDesc || '',
    announcement: d.announcement || null,
  };
};

export function cachedSite() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (raw && Date.now() - raw.t < TTL) return merge(raw.d);
  } catch { /* ไม่มีแคช */ }
  return null;
}

export const defaultSite = () => merge(null);

export async function loadSite() {
  const sb = app?.supabase || {};
  let data = null;
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 5000);
    try {
      if (sb.url && sb.anonKey) {
        const r = await fetch(`${sb.url}/rest/v1/law_data?select=data&key=eq.site`, { headers: { apikey: sb.anonKey, Authorization: `Bearer ${sb.anonKey}` }, signal: ctl.signal });
        if (r.ok) data = (await r.json())[0]?.data || null;
      } else {
        const r = await fetch('/api/site', { signal: ctl.signal });
        if (r.ok) data = await r.json();
      }
    } finally { clearTimeout(to); }
  } catch { /* ใช้ค่าเริ่มต้น */ }
  try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d: data })); } catch { /* ข้าม */ }
  return merge(data);
}

/** ลิงก์ของช่องทางติดต่อตามประเภท (ผู้ดูแลกรอกแค่ค่า ระบบสร้างลิงก์ให้) */
export const CONTACT_KINDS = [
  ['tel', 'โทรศัพท์'], ['line', 'LINE'], ['mail', 'อีเมล'], ['facebook', 'Facebook'], ['web', 'เว็บไซต์'], ['other', 'อื่น ๆ'],
];
export function contactHref(kind, value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (kind === 'tel') return 'tel:' + v.replace(/[^\d+]/g, '');
  if (kind === 'mail') return 'mailto:' + v;
  if (kind === 'line') return /^https?:/i.test(v) ? v : `https://line.me/R/ti/p/${v.startsWith('@') ? '%40' + encodeURIComponent(v.slice(1)) : encodeURIComponent(v)}`;
  if (kind === 'facebook') return /^https?:/i.test(v) ? v : `https://facebook.com/${encodeURIComponent(v.replace(/^@/, ''))}`;
  if (kind === 'web') return /^https?:/i.test(v) ? v : 'https://' + v;
  return /^https?:/i.test(v) ? v : '';
}
