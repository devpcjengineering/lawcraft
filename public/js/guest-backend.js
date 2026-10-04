// โหมดทดลอง (ไม่ต้องเข้าสู่ระบบ): เก็บคดีและสมุดรายชื่อใน localStorage ของเบราว์เซอร์นี้เท่านั้น
// - ไม่ส่งข้อมูลคดีไปที่เซิร์ฟเวอร์/ฐานข้อมูล ผู้ดูแลระบบจึงมองไม่เห็น และข้ามเครื่อง/ข้ามเบราว์เซอร์ไม่ได้
// - ข้อมูลกฎหมายสาธารณะ (กฎหมาย แบบฟอร์ม เลย์เอาต์) โหลดแบบอ่านอย่างเดียวเหมือนบทบาทอื่น
import config from './config.js';
import { loadLawData, loadGeo } from './public-data.js';

const NS = 'lawcraft:guest:';
const K_FLAG = NS + 'on';
const K_CASE = NS + 'case:';
const K_PERSON = NS + 'person:';

const mem = new Map(); // ใช้เมื่อเบราว์เซอร์ไม่ให้ใช้ localStorage (เช่น โหมดส่วนตัวบางตัว) — อยู่ได้เท่าที่แท็บเปิดอยู่
let memOnly = false;

/** ธงว่าผู้ใช้เลือกโหมดทดลองไว้ (เก็บใน localStorage) */
export function guestFlag() { try { return localStorage.getItem(K_FLAG) === '1'; } catch { return false; } }
export function setGuestFlag(on) {
  try { if (on) localStorage.setItem(K_FLAG, '1'); else localStorage.removeItem(K_FLAG); } catch { /* ใช้ไม่ได้ก็ข้าม */ }
}

const isQuota = (e) => e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
function quotaError() {
  const e = new Error('พื้นที่เก็บข้อมูลของเบราว์เซอร์เต็ม — ลบคดีเก่า หรือเข้าสู่ระบบเพื่อบันทึกบนระบบ');
  e.status = 507; return e;
}

function put(key, value) {
  const s = JSON.stringify(value);
  if (!memOnly) {
    try { localStorage.setItem(key, s); return; }
    catch (e) {
      if (isQuota(e)) throw quotaError();
      memOnly = true; // ใช้ localStorage ไม่ได้เลย → เก็บในหน่วยความจำแทน
    }
  }
  mem.set(key, s);
}
function get(key) {
  let s = null;
  if (!memOnly) { try { s = localStorage.getItem(key); } catch { memOnly = true; } }
  if (s == null) s = mem.get(key) ?? null;
  if (s == null) return null;
  try { return JSON.parse(s); } catch { return null; }
}
function del(key) {
  try { localStorage.removeItem(key); } catch { /* ข้าม */ }
  mem.delete(key);
}
function keysOf(prefix) {
  const out = new Set();
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(prefix)) out.add(k); } } catch { /* ข้าม */ }
  for (const k of mem.keys()) if (k.startsWith(prefix)) out.add(k);
  return [...out];
}

const withDefaults = (d) => ({
  laws: [], items: [], procedure: { laws: [], sections: [], snippets: [] }, precedents: [], courts: { groups: [] },
  templates: { motions: [], answers: [], settlements: [] }, jurisdiction: null, formText: {}, courtPhones: {}, layout: { all: {}, forms: {} },
  ...d,
});

async function lawAll() {
  if (config.supabase?.url && config.supabase?.anonKey) {
    const { loadLaw } = await import('./supabase-backend.js'); // anon อ่าน law_data ได้ (RLS)
    return loadLaw();
  }
  const [data, geo] = await Promise.all([loadLawData(), loadGeo().catch(() => ({ provinces: [] }))]);
  return { data: withDefaults(data), geo };
}

const denied = (what) => () => { const e = new Error(`${what} — เฉพาะผู้ดูแลระบบ`); e.status = 403; throw e; };

export const guestBackend = {
  mode: 'guest',
  label: 'เก็บในเบราว์เซอร์นี้',
  needsLogin: false,
  async init() {},
  role: () => 'guest',
  sessionEmail: async () => '',
  async signOut() { setGuestFlag(false); },

  async loadAll() {
    const { data, geo } = await lawAll();
    const people = keysOf(K_PERSON).map(get).filter(Boolean);
    return { data, geo, people };
  },

  async listCases() {
    return keysOf(K_CASE).map(get).filter(Boolean)
      .map((c) => ({ id: c.id, title: c.title, type: c.type, court: c.court || '', updatedAt: c.updatedAt || c.createdAt || new Date(0).toISOString() }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },
  async getCase(id) {
    const c = get(K_CASE + id);
    if (!c) { const e = new Error('ไม่พบคดี'); e.status = 404; throw e; }
    return c;
  },
  async saveCase(c) {
    const updatedAt = new Date().toISOString();
    put(K_CASE + c.id, { ...c, updatedAt });
    return { ok: true, updatedAt };
  },
  async deleteCase(id) { del(K_CASE + id); return { ok: true }; },

  async savePerson(rec) { put(K_PERSON + rec.id, { id: rec.id, kind: rec.kind, label: rec.label, data: rec.data }); return { ok: true }; },
  async deletePerson(id) { del(K_PERSON + id); return { ok: true }; },

  // การตั้งค่าแบบฟอร์ม/เลย์เอาต์และกล่องข้อความเป็นของผู้ดูแลระบบ — โหมดทดลองแก้ไม่ได้
  saveLayout: denied('แก้การจัดหน้า'),
  saveFormText: denied('แก้ข้อความแบบฟอร์ม'),
  listInquiries: denied('ดูกล่องข้อความ'),
  setInquiryStatus: denied('จัดการกล่องข้อความ'),
  deleteInquiry: denied('จัดการกล่องข้อความ'),
  async docx() { throw new Error('การออกไฟล์ Word ไม่มีแล้ว — ใช้ “ตัวอย่างเอกสาร / พิมพ์” แทน'); },
};
