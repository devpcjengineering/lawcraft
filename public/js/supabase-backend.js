// Backend ของหลังบ้านที่ใช้ Supabase: ฐานข้อมูล Postgres (RLS) + Auth + Edge Function (ออกไฟล์ Word)
import config from './config.js';
import { caseListInfo } from '/shared/model.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const { url, anonKey } = config.supabase;
// PKCE + detectSessionInUrl: จำเป็นสำหรับ Login ด้วย Google (Supabase ส่ง ?code=… กลับมาที่ /admin/ ซึ่งเป็นหน้าเด้งต่อไป /workspace/ พร้อม search+hash แล้ว client ที่หน้าใหม่แลกเป็น session)
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
const seen = new Map(); // id คดี → updated_at ที่เห็นล่าสุด (ใช้ตรวจว่ามีผู้อื่นบันทึกคดีเดียวกันไปก่อนหรือไม่)
const PDF_BUCKET = 'case-pdfs';
// ไฟล์ PDF ของคดี: “ไฟล์เดียวต่อคดี” ในความหมายของผู้ใช้ แต่ชื่อวัตถุใน Storage ใหม่ทุกครั้งที่อัปโหลด (<คดี>/bundle-<เวลา>-<สุ่ม>.pdf) แล้วลบตัวเก่าทิ้ง
// ห้ามอัปโหลดทับชื่อเดิม (upsert): Storage อยู่หลัง CDN (Cloudflare) ที่แคชตามพาธ — หลังทับไฟล์ ผู้อ่านบางรายยังได้ไบต์ของไฟล์เก่า/ปนกับขนาดของไฟล์ใหม่ → PDF เปิดไม่ขึ้นหรือเป็นฉบับเก่า
// (พบเฉพาะตอนทับด้วยไฟล์ที่เล็กกว่าเดิม; พาธที่ไม่เคยมีมาก่อนไม่มีแคชค้าง) — พาธล่าสุดอยู่ที่ case_pdfs.path; คดีเก่าที่ยังเป็น <คดี>/bundle.pdf ใช้ต่อได้และถูกแทนที่ตอนอัปโหลดครั้งถัดไป
const legacyPdfPath = (caseId) => `${caseId}/bundle.pdf`;
const newPdfPath = (caseId) => `${caseId}/bundle-${Date.now().toString(36)}-${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 12)}.pdf`;
/** พาธของ PDF ล่าสุดตามรายการในตาราง case_pdfs ('' = ยังไม่มี) */
async function currentPdfPath(caseId) {
  const { data, error } = await sb.from('case_pdfs').select('path').eq('case_id', caseId).maybeSingle();
  if (error) { if (error.code === '42P01') return ''; fail(error); }
  return data?.path || '';
}
/** ลิงก์ดู PDF สาธารณะ (Edge Function `pdf` — ต้องรู้ token เท่านั้น ปิดลิงก์แล้วใช้ไม่ได้) */
// ลิงก์แชร์ชี้หน้าพัก /p/<token> ของเว็บเอง (public/p/index.html มีภาพตัวอย่าง og:image ให้แอปแชต แล้วพาต่อไปไฟล์จริงที่ ${url}/functions/v1/pdf/<token>.pdf — ลิงก์ตรงแบบเดิมยังใช้ได้)
const shareUrl = (token) => `${location.origin}/p/${token}`;

/** ข้อมูลกฎหมายสาธารณะ (law_data อ่านได้ทุกคนรวม anon) — โหมดทดลองใช้ฟังก์ชันนี้ร่วมกัน */
export async function loadLaw() {
  const rows = must(await sb.from('law_data').select('key,data').neq('key', 'geo').not('key', 'like', 'content-*'));
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
    // เข้าสู่ระบบได้ด้วย Google เท่านั้น — เซสชันจากวิธีอื่น (อีเมล+รหัสผ่าน ฯลฯ) ถูกปฏิเสธและออกจากระบบ
    const u = data.session.user, viaGoogle = u?.app_metadata?.provider === 'google' || (u?.identities || []).some((i) => i.provider === 'google');
    if (!viaGoogle) { role = 'user'; try { await sb.auth.signOut(); } catch { /* ข้าม */ } return 'none'; }
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
    // redirectTo คง /admin/ ไว้ตามรายการ Redirect URLs ใน Supabase Auth (ยังไม่ได้เพิ่ม /workspace/) — public/admin/index.html เด้งต่อโดยพก ?code / #access_token ไปด้วย
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/admin/', queryParams: { prompt: 'select_account' } } });
    if (error) {
      throw new Error(/provider is not enabled|Unsupported provider/i.test(error.message)
        ? 'ยังไม่ได้เปิดใช้ Login ด้วย Google ใน Supabase — ตั้งค่า Google OAuth ก่อน (ดูขั้นตอนในหน้าตั้งค่า/README)'
        : error.message);
    }
  },
  async signOut() { role = 'user'; await sb.auth.signOut(); },
  /** id ของบัญชีที่ล็อกอิน (แอดมินใช้แยก “คดีของฉัน” ออกจากคดีของคนอื่น) */
  async sessionUserId() { const { data } = await sb.auth.getSession(); return data.session?.user?.id || ''; },
  /** โทเค็นของผู้ใช้ที่ล็อกอินอยู่ (ส่งให้ /api/pdf บน Vercel ตรวจกับ Supabase Auth) */
  async accessToken() { const { data } = await sb.auth.getSession(); return data.session?.access_token || ''; },

  async loadAll() {
    const { data, geo } = await loadLaw();
    // RLS: ผู้ใช้ทั่วไปได้เฉพาะรายชื่อของตน, แอดมินได้ทั้งหมด
    const people = must(await sb.from('people').select('id,kind,label,data,owner_email,user_id'));
    return { data, geo, people };
  },

  async listCases() {
    // meta = data->listMeta : ชื่อโจทก์/จำเลยแบบย่อที่ saveCase เก็บไว้ในตัวคดี (ไม่ต้องดึงรายชื่อคู่ความทั้งก้อนมาแสดงรายการ)
    const cols = 'id,title,type,court,updated_at,caseNoBlack:data->>caseNoBlack,caseYearBlack:data->>caseYearBlack,caseNoRed:data->>caseNoRed,caseYearRed:data->>caseYearRed,caseYear:data->>caseYear,side:data->>side,meta:data->listMeta';
    let res = await sb.from('cases').select(`${cols},user_id,owner_email`).order('updated_at', { ascending: false });
    // ฐานข้อมูลที่ยังไม่ได้รัน migration 20261005000000_user_cases.sql ยังไม่มีคอลัมน์เจ้าของ → ถอยไปอ่านแบบเดิม
    if (res.error && (res.error.code === '42703' || /user_id|owner_email/.test(res.error.message || ''))) {
      res = await sb.from('cases').select(cols).order('updated_at', { ascending: false });
    }
    const rows = must(res);
    // คดีเก่าที่ยังไม่เคยบันทึกซ้ำหลังมี listMeta → ดึงเฉพาะรายชื่อคู่ความของคดีเหล่านั้นมาย่อทีหลัง (ข้อมูลมาไม่ได้ก็ข้ามไป ไม่ให้รายการล่ม)
    const old = rows.filter((r) => !r.meta).map((r) => r.id);
    const legacy = new Map();
    for (let i = 0; i < old.length; i += 40) {
      const part = await sb.from('cases').select('id,parties:data->parties').in('id', old.slice(i, i + 40));
      if (part.error) break;
      for (const r of part.data || []) legacy.set(r.id, caseListInfo({ parties: Array.isArray(r.parties) ? r.parties : [] }));
    }
    return rows.map((r) => {
      const m = r.meta || legacy.get(r.id) || {};
      const black = r.caseNoBlack || '', red = r.caseNoRed || '';
      return {
        id: r.id, title: r.title, caseNoBlack: black, caseYearBlack: r.caseYearBlack || '', caseNoRed: red, caseYearRed: r.caseYearRed || '', caseYear: r.caseYear || '' /* ข้อมูลเก่า: ปีช่องเดียว — caseLabel ใช้เป็นปีของเลขที่มีอยู่ */, filed: !!(black.trim() || red.trim()),
        plName: m.plName || '', plMore: m.plMore || 0, dfName: m.dfName || '', dfMore: m.dfMore || 0,
        type: r.type, side: r.side === 'defendant' ? 'defendant' : 'plaintiff', court: r.court, updatedAt: r.updated_at, userId: r.user_id || '', ownerEmail: r.owner_email || '',
      };
    });
  },
  async getCase(id) {
    const row = must(await sb.from('cases').select('data,updated_at').eq('id', id).maybeSingle());
    if (!row) { const e = new Error('ไม่พบคดี'); e.status = 404; throw e; }
    seen.set(id, row.updated_at);
    return row.data;
  },
  /**
   * บันทึกคดี — คดีที่แชร์ให้ผู้อื่นแก้ได้ จึงบันทึกแบบ “ต้องยังเป็นเวอร์ชันที่เราเห็นล่าสุด” (updated_at ตรงกัน)
   * ถ้ามีคนบันทึกไปก่อน → throw status 409 (ไม่เขียนทับ) ให้หน้าจอถามว่าจะโหลดล่าสุดหรือบันทึกทับ ; opt.force = บันทึกทับโดยตั้งใจ
   */
  async saveCase(c, opt = {}) {
    const now = new Date().toISOString();
    // ไม่ส่ง user_id/owner_email: แถวใหม่ให้ DB เติมจาก auth.uid(); แถวเดิม (รวมกรณีแอดมิน/ผู้แก้ไขแก้คดีของผู้อื่น) เจ้าของไม่เปลี่ยน
    const row = { id: c.id, title: c.title || null, type: c.type, court: c.court || null, data: { ...c, updatedAt: now, listMeta: caseListInfo(c) }, updated_at: now };
    const known = seen.get(c.id);
    if (known && !opt.force) {
      const { id, ...patch } = row;
      const res = await sb.from('cases').update(patch).eq('id', id).eq('updated_at', known).select('id');
      if (res.error) fail(res.error);
      if (!res.data.length) {
        const cur = must(await sb.from('cases').select('updated_at').eq('id', id).maybeSingle());
        if (!cur) { const e = new Error('คดีนี้ถูกลบแล้ว หรือคุณไม่มีสิทธิ์แก้ไขคดีนี้อีกต่อไป'); e.status = 404; throw e; }
        const e = new Error('มีผู้อื่นบันทึกคดีนี้ไปก่อนแล้ว'); e.status = 409; e.conflict = true; throw e;
      }
    } else {
      must(await sb.from('cases').upsert(row, { onConflict: 'id' }));
    }
    seen.set(c.id, now);
    return { ok: true, updatedAt: now };
  },
  async deleteCase(id) {
    // เจ้าของ/แอดมินลบคดี: ลบไฟล์ PDF ใน Storage ก่อน (หลังลบคดีแล้วนโยบาย Storage จะไม่เห็นว่าเป็นคดีของใคร) ; ผู้แก้ไขที่ไม่ใช่เจ้าของลบไม่ได้
    const owner = await sb.rpc('is_case_owner', { cid: id });
    if (owner.data === true) {
      try { // ลบทุกไฟล์ในโฟลเดอร์ของคดี (ปกติมีไฟล์เดียว; อาจมีตัวเก่าค้างถ้าลบตัวเก่าตอนอัปโหลดไม่สำเร็จ)
        const names = ((await sb.storage.from(PDF_BUCKET).list(id, { limit: 100 })).data || []).map((o) => `${id}/${o.name}`);
        await sb.storage.from(PDF_BUCKET).remove(names.length ? names : [legacyPdfPath(id)]);
      } catch { /* ข้าม: ไฟล์ค้างไม่กระทบการใช้งาน */ }
    }
    const rows = must(await sb.from('cases').delete().eq('id', id).select('id'));
    if (!rows.length) { const e = new Error('ลบไม่ได้ — เฉพาะเจ้าของคดีหรือผู้ดูแลระบบ'); e.status = 403; throw e; }
    seen.delete(id);
    return { ok: true };
  },

  // ---------- แชร์คดี: ผู้แก้ไขที่เชิญด้วยอีเมล · PDF ชุดเอกสาร · ลิงก์ดู PDF ----------
  canShare: true,
  /** เจ้าของคดีหรือแอดมิน (เชิญ/ถอนผู้แก้ไข ลบคดีได้) — ผู้แก้ไขที่ถูกเชิญได้ false */
  async isCaseOwner(caseId) { const { data, error } = await sb.rpc('is_case_owner', { cid: caseId }); if (error) fail(error); return data === true; },
  async listMembers(caseId) {
    return must(await sb.from('case_members').select('email,created_at,notified_at').eq('case_id', caseId).order('created_at', { ascending: true }));
  },
  /** ส่งอีเมลแจ้งผู้ที่ถูกเชิญ (Edge Function invite-email → Resend) ; ส่งซ้ำถึงคนเดิมได้ทุก 30 วินาที (ถี่กว่านั้น throw status 429) */
  async notifyMember(caseId, email) {
    const { data } = await sb.auth.getSession();
    if (!data.session) { const e = new Error('หมดเวลาเข้าสู่ระบบ'); e.status = 401; throw e; }
    const res = await fetch(`${url}/functions/v1/invite-email`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, email: String(email).toLowerCase() }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(out.error || `ส่งอีเมลไม่สำเร็จ (${res.status})`); e.status = res.status; throw e; }
    return { ok: true, at: new Date().toISOString() };
  },
  /** เชิญอีเมลเป็นผู้แก้ไขคดี (เฉพาะเจ้าของ/แอดมิน) — ผู้ถูกเชิญเห็นคดีในรายการทันทีที่เข้าสู่ระบบด้วยอีเมลนั้น */
  async addMember(caseId, email) {
    const em = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || em.length > 254) throw new Error('อีเมลไม่ถูกต้อง');
    const { error } = await sb.from('case_members').insert({ case_id: caseId, email: em });
    if (error) {
      if (error.code === '23505') throw new Error('อีเมลนี้ได้รับเชิญไว้แล้ว');
      if (error.code === '54000') throw new Error(error.message);
      if (error.code === '42501') throw new Error('เฉพาะเจ้าของคดีหรือผู้ดูแลระบบเท่านั้นที่เชิญผู้แก้ไขได้');
      fail(error);
    }
    return { email: em };
  },
  /** ถอนผู้แก้ไข (เจ้าของ/แอดมิน) หรือออกจากคดีที่ถูกเชิญเอง (ใส่อีเมลตนเอง) */
  async removeMember(caseId, email) {
    const rows = must(await sb.from('case_members').delete().eq('case_id', caseId).eq('email', String(email).toLowerCase()).select('email'));
    if (!rows.length) { const e = new Error('ไม่มีสิทธิ์ถอนรายชื่อนี้'); e.status = 403; throw e; }
    return { ok: true };
  },
  /** ข้อมูล PDF ล่าสุดของคดี (null = ยังไม่เคยอัปโหลด) พร้อมลิงก์ดูถ้าเปิดแชร์ไว้ */
  async getCasePdf(caseId) {
    const { data, error } = await sb.from('case_pdfs').select('size_bytes,pages,share_token,updated_at,updated_by_email').eq('case_id', caseId).maybeSingle();
    if (error) { if (error.code === '42P01') return null; fail(error); }
    if (!data) return null;
    return { sizeBytes: data.size_bytes, pages: data.pages, updatedAt: data.updated_at, by: data.updated_by_email || '', shareUrl: data.share_token ? shareUrl(data.share_token) : '' };
  },
  /**
   * อัปโหลด PDF ชุดเอกสารแทนไฟล์เดิมของคดี (ผู้ใช้เห็นเป็นไฟล์เดียว): อัปโหลดเป็นวัตถุใหม่ → บันทึกพาธใหม่ลง case_pdfs (ลิงก์ดูชี้ไฟล์ล่าสุดทันที) → ลบวัตถุเก่า
   * ไม่อัปโหลดทับพาธเดิม เพราะ CDN หน้า Storage แคชตามพาธ (ดูหมายเหตุที่ newPdfPath) ; ถ้าบันทึกรายการไม่สำเร็จ ไฟล์ใหม่ที่เพิ่งอัปโหลดจะถูกลบและไฟล์เดิมยังใช้งานได้ตามปกติ
   */
  async uploadCasePdf(caseId, blob, { pages = null } = {}) {
    const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer()), tail = new TextDecoder('latin1').decode(await blob.slice(Math.max(0, blob.size - 32)).arrayBuffer());
    if (new TextDecoder('latin1').decode(head) !== '%PDF-' || !tail.includes('%%EOF')) throw new Error('สร้างไฟล์ PDF ไม่สมบูรณ์ (ไฟล์ไม่ครบ) — ลองกดสร้างใหม่อีกครั้ง');
    const old = await currentPdfPath(caseId).catch(() => '');
    const path = newPdfPath(caseId);
    const up = await sb.storage.from(PDF_BUCKET).upload(path, blob, { upsert: false, contentType: 'application/pdf', cacheControl: '3600' });
    if (up.error) {
      const denied = /row-level security|not authorized|403/i.test(up.error.message || '');
      const e = new Error(denied ? 'ไม่มีสิทธิ์อัปโหลด PDF ของคดีนี้' : (up.error.message || 'อัปโหลดไม่สำเร็จ'));
      e.status = denied ? 403 : 500; throw e;
    }
    const row = await sb.from('case_pdfs').upsert({ case_id: caseId, path, size_bytes: blob.size, pages }, { onConflict: 'case_id' });
    if (row.error) { try { await sb.storage.from(PDF_BUCKET).remove([path]); } catch { /* ข้าม */ } fail(row.error); }
    if (old && old !== path) { try { await sb.storage.from(PDF_BUCKET).remove([old]); } catch { /* ข้าม: ไฟล์เก่าค้างไม่กระทบการใช้งาน */ } }
    return this.getCasePdf(caseId);
  },
  /** ลิงก์ชั่วคราว (5 นาที) สำหรับเปิดดู PDF ล่าสุดที่อัปโหลดไว้ในแท็บใหม่ */
  async casePdfViewUrl(caseId) {
    const path = (await currentPdfPath(caseId)) || legacyPdfPath(caseId);
    const r = await sb.storage.from(PDF_BUCKET).createSignedUrl(path, 300);
    if (r.error) fail(r.error);
    return r.data.signedUrl;
  },
  /** เปิด/ปิด/ออกลิงก์ดูใหม่ (mode = on | off | new) → คืน URL หรือ '' เมื่อปิด */
  async setPdfShare(caseId, mode) {
    const { data, error } = await sb.rpc('set_case_share', { cid: caseId, mode });
    if (error) { if (error.code === 'P0002') throw new Error('ยังไม่ได้อัปโหลด PDF ของคดีนี้'); fail(error); }
    return data ? shareUrl(data) : '';
  },

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
  // ข้อมูลเว็บไซต์ (แถว key='site' ใน law_data): ทุกคนอ่านได้ แอดมินเขียนได้
  async loadSite() { const rows = must(await sb.from('law_data').select('data').eq('key', 'site')); return rows[0]?.data || {}; },
  // เนื้อหาที่แอดมินจัดการ (บทความ ข้อกฎหมายที่แก้ หน้าข้อความ): แถว key='content-<ชื่อ>' ใน law_data
  async loadContent(key) { const rows = must(await sb.from('law_data').select('data').eq('key', 'content-' + key)); return rows[0]?.data || {}; },
  async saveContent(key, obj) { must(await sb.from('law_data').upsert({ key: 'content-' + key, data: obj, updated_at: new Date().toISOString() }, { onConflict: 'key' })); return { ok: true }; },
  async saveSite(obj) { must(await sb.from('law_data').upsert({ key: 'site', data: obj, updated_at: new Date().toISOString() }, { onConflict: 'key' })); return { ok: true }; },

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
