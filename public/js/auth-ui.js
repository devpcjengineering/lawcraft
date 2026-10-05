// บทบาทผู้ใช้ + หน้าเข้าสู่ระบบ + โหมดทดลอง ของหลังบ้าน (แยกออกจาก app.js)
//   admin = อยู่ในตาราง admins (เห็น/จัดการทุกอย่าง, แก้แบบฟอร์ม/แม่แบบ/เลย์เอาต์ได้)
//   user  = ล็อกอินแล้วแต่ไม่ใช่แอดมิน (เห็น/แก้เฉพาะคดีของตน, แก้แบบฟอร์มไม่ได้)
//   (ต้องล็อกอินเท่านั้น — ไม่มีโหมดทดลอง/ผู้เยี่ยมชมที่ไม่ล็อกอิน)
// หมายเหตุความปลอดภัย: การซ่อนเมนูในหน้านี้เป็นเพียง UI — ตัวบังคับสิทธิ์จริงคือ RLS ใน supabase/migrations/20261005000000_user_cases.sql
//
// ตั้งแอดมินคนแรก: วิธีที่ปลอดภัยกว่าคือให้เจ้าของระบบรัน  select public.add_admin('you@example.com');  ใน SQL editor เอง
// (หรือ insert into public.admins) เพราะเว็บเปิดให้ทุกคนล็อกอินได้ ใครล็อกอิน Google เป็นคนแรกขณะที่ยังไม่มีแอดมินจะยึดระบบได้
// จึงแสดงหน้า “ตั้งเป็นผู้ดูแลคนแรก” เฉพาะเมื่อเปิด /workspace/setup เท่านั้น (ลิงก์เก่า /admin/#setup เด้งมาที่นี่)
import { S, esc, actions } from './store.js';
import { banner, clearBanner, notify } from './notify.js';
import { selectBackend } from './api.js';
import { connHtml } from './conn.js';
import { icon } from './icons.js';
import { urls, parseRoute, replaceUrl, setTitle } from './router.js';

/** หน้า (key ใน TABS) ที่เฉพาะแอดมินเข้าได้: ข้อความฟอร์ม, เลย์เอาต์/ตราครุฑ, แบบพิมพ์ศาล (กลุ่ม “ตั้งค่า” ในเมนูซ้าย) */
export const ADMIN_ONLY = new Set(['formtext', 'layout', 'forms']);

export const isAdmin = () => S.role === 'admin';
export const tabBlocked = (key) => !isAdmin() && ADMIN_ONLY.has(key);
/** ใช้กรองเมนูซ้าย (renderSteps): ซ่อนรายการตั้งค่าและกลุ่มที่ว่างสำหรับผู้ที่ไม่ใช่แอดมิน */
export const navItemVisible = (t) => isAdmin() || !ADMIN_ONLY.has(t.key);
export const navGroupVisible = (g) => isAdmin() || g.items.some((t) => !ADMIN_ONLY.has(t.key));

let ctx = null;
/** app.js ส่งตัวช่วยของตัวเองเข้ามา (backend เป็นตัวแปรในโมดูล app.js จึงต้องอ่าน/ตั้งผ่านฟังก์ชัน) */
export function bind(c) { ctx = c; }

const SETUP_KEY = 'lawcraft:setup';
const NOTE_KEY = 'lawcraft:user-note';
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ข้าม */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* ข้าม */ } },
};
const RETURN_KEY = 'lawcraft:return';
const onSetupPath = () => parseRoute().name === 'setup';
/** หน้าที่ขอไว้ก่อนถูกพามาล็อกอิน (เก็บใน sessionStorage เพราะ OAuth พาออกนอกเว็บแล้วกลับมา) — ไม่ใช่ login/setup */
export const peekReturn = () => {
  const v = ss.get(RETURN_KEY) || '';
  if (!v.startsWith('/workspace/')) return '';
  const [p, q] = v.split('?');
  const n = parseRoute(p, q ? '?' + q : '').name;
  return n !== 'login' && n !== 'setup' ? v : '';
};
export const takeReturn = () => { const v = peekReturn(); ss.del(RETURN_KEY); return v; };

/**
 * ตรวจสถานะก่อนเข้าแอป: ตั้ง S.role / S.email / S.uid แล้วคืน true ถ้าไปต่อได้
 * คืน false เมื่อแสดงหน้าเข้าสู่ระบบหรือหน้าตั้งแอดมินแล้ว
 */
export async function gate() {
  const b = ctx.getBackend();
  S.email = ''; S.uid = '';
  clearBanner('guest');
  try { localStorage.removeItem('lawcraft:guest:on'); } catch { /* ข้าม */ } // ธงโหมดทดลองเก่า (เลิกใช้แล้ว)
  if (!b.needsLogin) { S.role = b.role?.() || 'admin'; return true; } // ไฟล์ในเครื่อง = เจ้าของเครื่อง
  const st = await b.sessionState();
  if (st === 'none') { await showLogin(); return false; }
  S.email = b.sessionEmail ? await b.sessionEmail() : '';
  S.uid = b.sessionUserId ? await b.sessionUserId() : '';
  if (st === 'ok') { S.role = 'admin'; ss.del(SETUP_KEY); return true; }
  S.role = 'user';
  // เสนอตั้งแอดมินคนแรกเฉพาะเมื่อผู้ใช้เปิดลิงก์ #setup (หรือเพิ่งกดล็อกอินจากหน้า #setup แล้วถูกพากลับมา) และยังไม่มีแอดมินจริง
  const wantSetup = onSetupPath() || ss.get(SETUP_KEY) === '1';
  if (wantSetup && b.adminExists && !(await b.adminExists())) { ctx.showClaim(S.email); return false; }
  ss.del(SETUP_KEY);
  if (!ss.get(NOTE_KEY)) {
    ss.set(NOTE_KEY, '1');
    notify({ type: 'info', title: 'เข้าสู่ระบบแล้ว', message: 'คดีที่คุณสร้างเป็นของบัญชีนี้ — จะถูกรักษาเป็นความลับ', duration: 7000 });
  }
  return true;
}

const G_SVG = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
const MARK_SVG = '<svg class="login-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="7" r="2"/><path d="M24 9v29M16 41h16M13 38h22M7 14h34"/><path d="M10 14 3 28M10 14l7 14M38 14l-7 14M38 14l7 14"/><path d="M3 28h14c-.5 5-3.5 7.5-7 7.5S3.5 33 3 28zM31 28h14c-.5 5-3.5 7.5-7 7.5S31.5 33 31 28z"/></svg>';

/** หน้าเข้าสู่ระบบ (บังคับ): Google เท่านั้น */
export async function showLogin(msg = '', { reset = false } = {}) {
  clearBanner('guest');
  S.c = null; S.role = 'user'; S.email = ''; S.uid = '';
  // หน้านี้ใช้ URL /workspace/login ; จำหน้าที่ขอไว้ (เฉพาะพาธที่ถูกรูป ไม่เก็บ ?code=… ของ OAuth) เพื่อกลับไปหลังล็อกอิน — ออกจากระบบเองไม่จำ
  const here = parseRoute();
  if (reset) ss.del(RETURN_KEY);
  else if (here.name !== 'login') {
    if (here.name === 'setup') ss.set(SETUP_KEY, '1'); // OAuth ส่งกลับมาโดยไม่มีพาธเดิม — จำไว้ว่ามาจากลิงก์ตั้งค่า
    else if (here.name !== 'home' || !ss.get(RETURN_KEY)) ss.set(RETURN_KEY, here.canonical);
  }
  replaceUrl(urls.login()); setTitle('เข้าสู่ระบบ');
  const app = ctx.app;
  app.innerHTML = `<div class="login"><form class="login-card" id="loginForm">
    <div class="login-top">${MARK_SVG}<h1>เริ่มร่างคำฟ้องของคุณเอง</h1>
    <p class="hint">เตรียมคำฟ้อง คำร้อง และเอกสารประกอบสำหรับยื่นต่อศาลได้ด้วยตนเอง ใช้ได้ทันที</p>
    <div class="conn-row">${connHtml()}</div></div>
    <button type="button" class="g-btn" data-act="googleLogin">${G_SVG}เข้าสู่ระบบด้วย Google</button>
    <div class="login-err" role="alert">${esc(msg)}</div>
    <div class="login-note">${icon('shield')}<p><b>ต้องเข้าสู่ระบบก่อนใช้งาน</b> ข้อมูลคดีถือเป็นข้อมูลส่วนบุคคลบริษัทจะไม่เปิดเผยทุกกรณี </p></div>
    <a class="login-back" href="/">${icon('arrowLeft')}กลับเว็บไซต์</a></form></div>`; app.querySelector('#loginForm').addEventListener('submit', (e) => e.preventDefault());
}

/** เข้าสู่ระบบ/ออกจากระบบ/ออกจากโหมดทดลอง → กลับหน้าเข้าสู่ระบบ */
export async function signOut() {
  const b = ctx.getBackend();
  try { await b.signOut(); } catch (e) { console.error(e); }
  ss.del(NOTE_KEY);
  return showLogin('', { reset: true });
}

// actions.signOut อยู่ใน app.js (เรียก authUi.signOut) — ตรงนี้เพิ่มเฉพาะปุ่มที่ app.js ไม่มี
actions.authLogin = signOut;
actions.casesScope = (el) => { S.ui.onlyMine = el.dataset.scope === 'mine'; ctx.showHome(); };

// ---------- ชิ้นส่วน UI ----------
/** ปุ่มมุมขวาบน: ใครล็อกอินอยู่ + บทบาท + ออกจากระบบ (โหมดไฟล์ในเครื่องไม่มีบัญชี → ไม่แสดง) */
export function userBar() {
  if (!ctx.getBackend().needsLogin) return '';
  return `<div class="ubar">${connHtml()}${S.email ? `<span class="who" title="${esc(S.email)}">${emailHtml(S.email)}</span>` : ''}`
    + `${isAdmin() ? '<span class="role-badge">ผู้ดูแลระบบ</span>' : ''}`
    + `<button class="btn" data-act="signOut" aria-label="ออกจากระบบ" title="ออกจากระบบ"><span class="tb-i" aria-hidden="true">${icon('logout')}</span><span class="tb-t">ออกจากระบบ</span></button></div>`;
}
/** อีเมลเต็ม ไม่ตัดด้วย … — แทรกจุดตัดบรรทัดก่อน @ (และหลังจุด/ขีดในโดเมน) ให้ขึ้นบรรทัดใหม่ได้อย่างอ่านง่ายเมื่อที่แคบ */
export function emailHtml(email) {
  const e = String(email || '');
  const i = e.indexOf('@');
  return i < 0 ? esc(e) : `${esc(e.slice(0, i))}<wbr>${esc(e.slice(i))}`;
}

/** แอดมิน: ตัวกรอง “ทั้งหมด / เฉพาะคดีของฉัน” เหนือรายการคดี */
export function caseToolbar() {
  if (!isAdmin() || !S.uid) return '';
  const mine = !!S.ui.onlyMine;
  return `<div class="case-scope" role="group" aria-label="ขอบเขตรายการคดี">
    <button type="button" class="${mine ? '' : 'on'}" aria-pressed="${!mine}" data-act="casesScope" data-scope="all">ทั้งหมด</button>
    <button type="button" class="${mine ? 'on' : ''}" aria-pressed="${mine}" data-act="casesScope" data-scope="mine">แสดงเฉพาะคดีของฉัน</button></div>`;
}
export function filterCases(list) {
  return isAdmin() && S.uid && S.ui.onlyMine ? list.filter((x) => x.userId === S.uid) : list;
}
/** คดีที่ผู้อื่นเชิญให้ร่วมแก้ไข (ผู้ใช้ทั่วไปเห็นเฉพาะคดีของตนกับคดีที่ถูกเชิญ) — แอดมินเห็นทุกคดีจึงไม่นับ */
export const isSharedWithMe = (x) => !isAdmin() && !!S.uid && !!x.userId && x.userId !== S.uid;
/** บรรทัดเล็ก ๆ สีเทาบอกเจ้าของคดี: แอดมินเห็นทุกคดี · ผู้ใช้ทั่วไปเห็นเฉพาะคดีที่แชร์มา */
export function ownerLine(x) {
  if (isSharedWithMe(x)) return `<div class="owner-line shared" title="คดีนี้เจ้าของเชิญคุณให้ร่วมแก้ไข">${icon('users')}<span>แชร์ให้คุณแก้ไข · เจ้าของ: ${x.ownerEmail ? emailHtml(x.ownerEmail) : esc('ไม่ระบุ')}</span></div>`;
  if (!isAdmin() || !S.uid) return '';
  return `<div class="owner-line" title="เจ้าของคดี">${icon('user')}<span>เจ้าของ: ${x.ownerEmail ? emailHtml(x.ownerEmail) : esc('ไม่ระบุ (ข้อมูลเดิม)')}${x.userId && x.userId === S.uid ? ' (ฉัน)' : ''}</span></div>`;
}
/** หลังวาดหน้าแรก: ผู้ที่ไม่ใช่แอดมินไม่เห็นการ์ด/หมวดจัดการเว็บไซต์ (กล่องข้อความปรึกษา ฯลฯ) */
export function afterHome(root = document) {
  if (!isAdmin()) {
    root.querySelectorAll('[data-act="openInbox"],[data-act="openSite"],[data-act="openContent"]').forEach((n) => n.remove());
    root.querySelectorAll('[data-admin-only]').forEach((n) => n.remove());
  }
}
