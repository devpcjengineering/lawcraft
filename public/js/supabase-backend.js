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
  throw e;
}
const must = ({ data, error }) => { if (error) fail(error); return data; };

export const supabaseBackend = {
  mode: 'supabase',
  label: 'Supabase (ฐานข้อมูลออนไลน์)',
  needsLogin: true,
  async init() {},

  async isSignedIn() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return false;
    // ต้องเป็นแอดมินด้วย ไม่ใช่แค่ล็อกอิน
    const { data: ok, error } = await sb.rpc('is_admin');
    return !error && ok === true;
  },
  /** 'none' = ยังไม่ล็อกอิน | 'notAdmin' = ล็อกอินแล้วแต่อีเมลไม่อยู่ในรายชื่อแอดมิน | 'ok' */
  async sessionState() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return 'none';
    const { data: ok, error } = await sb.rpc('is_admin');
    return !error && ok === true ? 'ok' : 'notAdmin';
  },
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
    if (error) throw new Error(/invalid/i.test(error.message) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : error.message);
    const { data: ok } = await sb.rpc('is_admin');
    if (ok !== true) { await sb.auth.signOut(); throw new Error('บัญชีนี้ไม่มีสิทธิ์เข้าหลังบ้าน'); }
  },
  async signOut() { await sb.auth.signOut(); },

  async loadAll() {
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
    const people = must(await sb.from('people').select('id,kind,label,data'));
    return { data, geo, people };
  },

  async listCases() {
    const rows = must(await sb.from('cases').select('id,title,type,court,updated_at').order('updated_at', { ascending: false }));
    return rows.map((r) => ({ id: r.id, title: r.title, type: r.type, court: r.court, updatedAt: r.updated_at }));
  },
  async getCase(id) {
    const row = must(await sb.from('cases').select('data').eq('id', id).maybeSingle());
    if (!row) { const e = new Error('ไม่พบคดี'); e.status = 404; throw e; }
    return row.data;
  },
  async saveCase(c) {
    const now = new Date().toISOString();
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
