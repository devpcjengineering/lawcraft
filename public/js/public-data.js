// โหลดข้อมูลสาธารณะ (กฎหมาย ศาล จังหวัด) ของเว็บไซต์หลัก
// ถ้า config.js ตั้ง Supabase ไว้ → อ่านจากตาราง law_data (สิทธิ์ anon อ่านอย่างเดียว) ไม่ต้องพึ่งเซิร์ฟเวอร์ Node
// ไม่ตั้ง → ใช้ /api/* ของเซิร์ฟเวอร์ในเครื่อง
import config from './config.js';

const { url, anonKey } = config.supabase || {};
const useSb = !!(url && anonKey);
const hdr = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

async function rows(filter) {
  const r = await fetch(`${url}/rest/v1/law_data?select=key,data&${filter}`, { headers: hdr });
  if (!r.ok) throw new Error(r.status);
  return Object.fromEntries((await r.json()).map((x) => [x.key, x.data]));
}

export async function loadLawData() {
  if (!useSb) {
    const r = await fetch('/api/data');
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  const m = await rows('key=neq.geo');
  return {
    laws: m.laws || [], items: m.items || [], procedure: m.procedure || { laws: [], sections: [], snippets: [] },
    precedents: m.precedents || [], courts: m.courts || { groups: [] }, templates: m.templates || {},
    jurisdiction: m.jurisdiction || null, formText: m.formText || {}, layout: m.layout || { all: {}, forms: {} },
  };
}

export async function loadGeo() {
  if (!useSb) { const r = await fetch('/api/geo'); return r.ok ? r.json() : Promise.reject(r.status); }
  return (await rows('key=eq.geo')).geo || { provinces: [] };
}

export async function loadJurisdiction() {
  try {
    if (!useSb) { const r = await fetch('/api/jurisdiction'); return r.ok ? await r.json() : null; }
    return (await rows('key=eq.jurisdiction')).jurisdiction || null;
  } catch { return null; }
}
