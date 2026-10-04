// Backend ของหลังบ้านที่ใช้ Supabase: ฐานข้อมูล Postgres (RLS) + Auth + Edge Function (ออกไฟล์ Word)
import config from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const { url, anonKey } = config.supabase;
// PKCE + detectSessionInUrl: จำเป็นสำหรับ Login ด้วย Google (Supabase ส่ง ?code=… กลับมาที่ /admin/ แล้วแลกเป็น session)
const sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });

/** แปลงข้อผิดพลาดของ Supabase เป็น Error ที่มี status (401 = ต้องเข้าสู่ระบบใหม่) */
function fail(error, fallback = 'เกิดข้อผิดพลาด') {
  const e = new Error(error?.message || fallback);
  const code = String(error?.code || '');
  e.status = error?.status || (code === 'PGRST301' || /jwt|not authenticated/i.test(error?.message || '') ? 401 : code === '42501' ? 403 : 500);
  if (e.status === 403 || code === '42501') e.message = 'ไม่มีสิทธิ์ทำรายการนี้ (เฉพาะผู้ดูแลระบบ หรือเฉพาะเจ้าของข้อมูล)';
  throw e;
}
const must = ({ data, error }) => { if (error) fail(error); return data; };

let role = 'user';

/** ข้อมูลกฎหมายสาธารณะ (law_data อ่านได้ทุกคนรวม anon) — โหมดทดลองใช้ฟังก์ชันนี้ร่วมกัน */
export async function loadLaw() {
  const rows = must(await sb.from('law_data').select('key,data').neq('key', 'geo'));
  const m = Object.fromEntries(rows.map((r) => [r.key, r.data]));
  const data = {
    laws: m.laws || [], items: m.items || [], procedure: m.procedure || { laws: [], sections: [], snippets: [] },
    precedents: m.precedents || [], courts: m.courts || { groups: [] },
    templates: m.templates || { motions: [], answers: [], settlements: [] },
    jurisdiction: m.jurisdiction || null, formText: m.formText || {},
    courtPhones: m.courtPhones || {}, layout: m.layout || { all: {}, forms: {} },
  };
  const geo = (must(await sb.from('law_data').select('data').eq('key', 'geo').maybeSingle()))?.data || { provinces: [] };
  return { data, geo };
}

export const supabaseBackend = {
  mode: 'supabase',
  label: 'Supabase (ฐานข้อมูลออนไลน์)',
  needsLogin: true,
  /** ตรวจว่า Supabase ตอบสนองหรือไม่ (ใช้แสดงจุดเขียว “ออนไลน์”) — คืนเวลาตอบสนองเป็น ms */
  async ping() {
    const t0 = performance.now();
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey }, cache: 'no-store', signal: ctl.signal });
      if (!r.ok) throw new Error(String(r.status));
    } finally { clearTimeout(to); }
    return Math.round(performance.now() - t0);
  },
  async init() {},

  /** มี session อยู่หรือไม่ (ไม่ยิง RPC) — ใช้ตัดสินว่าจะใช้ backend นี้หรือโหมดทดลอง */
  async hasSession() { const { data } = await sb.auth.getSession(); return !!data.session; },
  async isSignedIn() { return (await this.sessionState()) !== 'none'; },
  /** 'none' = ยังไม่ล็อกอิน | 'ok' = แอดมิน | 'user' = ล็อกอินแล้วแต่ไม่ใช่แอดมิน (ใช้งานได้เฉพาะคดีของตน) */
  async sessionState() {
    const { data } = await sb.auth.getSession();
    if (!data.session) { role = 'user'; return 'none'; }
    const { data: ok, error } = await sb.rpc('is_admin');
    role = !error && ok === true ? 'admin' : 'user';
    return role === 'admin' ? 'ok' : 'user';
  },
  /** 'admin' | 'user' (ค่าจริงหลังเรียก sessionState แล้ว; RLS ในฐานข้อมูลเป็นตัวบังคับจริง ไม่ใช่ค่านี้) */
  role: () => role,
  /** อีเมลของบัญชีที่ล็อกอินอยู่ (ใช้แสดงในหน้ายืนยันตั้งเป็นแอดมินคนแรก) */
  async sessionEmail() { const { data } = await sb.auth.getSession(); return data.session?.user?.email || ''; },
  async adminExists() { const { data, error } = await sb.rpc('has_admin'); return !error && data === true; },
  /** ขอเป็นแอดมินคนแรก (สำเร็จเฉพาะบัญชี Google ขณะที่ยังไม่มีแอดมิน) */
  async claimAdmin() { const { data, error } = await sb.rpc('claim_first_admin'); if (error) throw new Error(error.message); return data === true; },
  async addAdmin(email) { const { data, error } = await sb.rpc('add_admin', { new_email: email }); if (error) throw new Error(error.message); return data === true; },
  async signInWithGoogle() {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/admin/', queryParams: { prompt: 'select_account' } } });
    if (error) {
      throw new Error(/provider is not enabled|Unsupported provider/i.test(error.message)
        ? 'ยังไม่ได้เปิดใช้ Login ด้วย Google ใน Supabase — ตั้งค่า Google OAuth ก่อน (ดูขั้นตอนในหน้าตั้งค่า/README)'
        : error.message);
    }
  },
  async signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    // ทุกบัญชีเข้าได้ (ผู้ใช้ทั่วไปเห็นเฉพาะคดีของตน) — สิทธิ์แอดมินตัดสินที่ฐานข้อมูล (is_admin)
    if (error) throw new Error(/invalid/i.test(error.message) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : error.message);
  },
  async signOut() { role = 'user'; await sb.auth.signOut(); },
  /** id ของบัญชีที่ล็อกอิน (แอดมินใช้แยก “คดีของฉัน” ออกจากคดีของคนอื่น) */
  async sessionUserId() { const { data } = await sb.auth.getSession(); return data.session?.user?.id || ''; },

  async loadAll() {
    const { data, geo } = await loadLaw();
    // RLS: ผู้ใช้ทั่วไปได้เฉพาะรายชื่อของตน, แอดมินได้ทั้งหมด
    const people = must(await sb.from('people').select('id,kind,label,data'));
    return { data, geo, people };
  },

  async listCases() {
    const cols = 'id,title,type,court,updated_at';
    let res = await sb.from('cases').select(`${cols},user_id,owner_email`).order('updated_at', { ascending: false });
    // ฐานข้อมูลที่ยังไม่ได้รัน migration 20261005000000_user_cases.sql ยังไม่มีคอลัมน์เจ้าของ → ถอยไปอ่านแบบเดิม
    if (res.error && (res.error.code === '42703' || /user_id|owner_email/.test(res.error.message || ''))) {
      res = await sb.from('cases').select(cols).order('updated_at', { ascending: false });
    }
    return must(res).map((r) => ({ id: r.id, title: r.title, type: r.type, court: r.court, updatedAt: r.updated_at, userId: r.user_id || '', ownerEmail: r.owner_email || '' }));
  },
  async getCase(id) {
    const row = must(await sb.from('cases').select('data').eq('id', id).maybeSingle());
    if (!row) { const e = new Error('ไม่พบคดี'); e.status = 404; throw e; }
    return row.data;
  },
  async saveCase(c) {
    const now = new Date().toISOString();
    // ไม่ส่ง user_id/owner_email: แถวใหม่ให้ DB เติมจาก auth.uid(); แถวเดิม (รวมกรณีแอดมินแก้คดีของผู้ใช้) เจ้าของไม่เปลี่ยน
    must(await sb.from('cases').upsert({ id: c.id, title: c.title || null, type: c.type, court: c.court || null, data: { ...c, updatedAt: now }, updated_at: now }, { onConflict: 'id' }));
    return { ok: true, updatedAt: now };
  },
  async deleteCase(id) { must(await sb.from('cases').delete().eq('id', id)); return { ok: true }; },

  async savePerson(rec) {
    must(await sb.from('people').upsert({ id: rec.id, kind: rec.kind, label: rec.label, data: rec.data, updated_at: new Date().toISOString() }, { onConflict: 'id' }));
    return { ok: true };
  },
  async deletePerson(id) { must(await sb.from('people').delete().eq('id', id)); return { ok: true }; },
  async saveLayout(obj) {
    must(await sb.from('law_data').upsert({ key: 'layout', data: obj, updated_at: new Date().toISOString() }, { onConflict: 'key' }));
    return { ok: true };
  },
  async saveFormText(obj) {
    must(await sb.from('law_data').upsert({ key: 'formText', data: obj, updated_at: new Date().toISOString() }, { onConflict: 'key' }));
    return { ok: true };
  },

  // กล่องข้อความปรึกษาจากหน้าเว็บ (ตาราง inquiries — RLS: เฉพาะแอดมินอ่าน/แก้/ลบได้)
  async listInquiries() {
    const rows = must(await sb.from('inquiries').select('id,created_at,name,contact,topic,message,consent,status').order('created_at', { ascending: false }).limit(500));
    return rows.map((r) => ({ id: r.id, createdAt: r.created_at, name: r.name, contact: r.contact, topic: r.topic || '', message: r.message, consent: r.consent, status: r.status }));
  },
  async setInquiryStatus(id, status) { must(await sb.from('inquiries').update({ status }).eq('id', id)); return { ok: true }; },
  async deleteInquiry(id) { must(await sb.from('inquiries').delete().eq('id', id)); return { ok: true }; },

  async docx(c, docId) {
    const { data } = await sb.auth.getSession();
    if (!data.session) { const e = new Error('หมดเวลาเข้าสู่ระบบ'); e.status = 401; throw e; }
    const res = await fetch(`${url}/functions/v1/docx`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ case: c, docId: docId || undefined }),
    });
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({}))).error || String(res.status);
      const e = new Error(msg); e.status = res.status; throw e;
    }
    const name = res.headers.get('X-Filename');
    return { blob: await res.blob(), filename: name ? decodeURIComponent(name) : 'ชุดเอกสารยื่นศาล.docx' };
  },
};
