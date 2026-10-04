// โหลดข้อมูลสาธารณะ (กฎหมาย ศาล จังหวัด) ของเว็บไซต์หลัก
// ถ้า config.js ตั้ง Supabase ไว้ → อ่านจากตาราง law_data (สิทธิ์ anon อ่านอย่างเดียว) ไม่ต้องพึ่งเซิร์ฟเวอร์ Node
// ไม่ตั้ง → ใช้ /api/* ของเซิร์ฟเวอร์ในเครื่อง
// ข้อกฎหมายที่แอดมินแก้/เพิ่ม/ลบ (content key 'laws') ผสานทับข้อมูลต้นฉบับที่นี่ (shared/content-merge.js) — อ่านไม่ได้ก็ใช้ข้อมูลต้นฉบับ
import config from './config.js';
import { applyLawEdits } from '/shared/content-merge.js';

const { url, anonKey } = config.supabase || {};
const useSb = !!(url && anonKey);
const hdr = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

async function rows(filter) {
  const r = await fetch(`${url}/rest/v1/law_data?select=key,data&${filter}`, { headers: hdr });
  if (!r.ok) throw new Error(r.status);
  return Object.fromEntries((await r.json()).map((x) => [x.key, x.data]));
}

/** การแก้ไขข้อกฎหมายจากหลังบ้าน — ไม่เคยโยนข้อผิดพลาด (ไม่มี/อ่านไม่ได้ = {}) */
async function loadLawEdits() {
  try {
    if (!useSb) { const r = await fetch('/api/content/laws'); return r.ok ? await r.json() : {}; }
    return (await rows('key=eq.content-laws'))['content-laws'] || {};
  } catch { return {}; }
}

export async function loadLawData() {
  if (!useSb) {
    const [r, edits] = await Promise.all([fetch('/api/data'), loadLawEdits()]);
    if (!r.ok) throw new Error(r.status);
    return applyLawEdits(await r.json(), edits);
  }
  const [m, edits] = await Promise.all([rows('and=(key.neq.geo,key.not.like.content-*)'), loadLawEdits()]);
  return applyLawEdits({
    laws: m.laws || [], items: m.items || [], procedure: m.procedure || { laws: [], sections: [], snippets: [] },
    precedents: m.precedents || [], courts: m.courts || { groups: [] }, templates: m.templates || {},
    jurisdiction: m.jurisdiction || null, formText: m.formText || {}, layout: m.layout || { all: {}, forms: {} },
  }, edits);
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
