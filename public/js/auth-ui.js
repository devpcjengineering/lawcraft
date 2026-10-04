// บทบาทผู้ใช้ + หน้าเข้าสู่ระบบ + โหมดทดลอง ของหลังบ้าน (แยกออกจาก app.js)
//   admin = อยู่ในตาราง admins (เห็น/จัดการทุกอย่าง, แก้แบบฟอร์ม/แม่แบบ/เลย์เอาต์ได้)
//   user  = ล็อกอินแล้วแต่ไม่ใช่แอดมิน (เห็น/แก้เฉพาะคดีของตน, แก้แบบฟอร์มไม่ได้)
//   (ต้องล็อกอินเท่านั้น — ไม่มีโหมดทดลอง/ผู้เยี่ยมชมที่ไม่ล็อกอิน)
// หมายเหตุความปลอดภัย: การซ่อนเมนูในหน้านี้เป็นเพียง UI — ตัวบังคับสิทธิ์จริงคือ RLS ใน supabase/migrations/20261005000000_user_cases.sql
//
// ตั้งแอดมินคนแรก: วิธีที่ปลอดภัยกว่าคือให้เจ้าของระบบรัน  select public.add_admin('you@example.com');  ใน SQL editor เอง
// (หรือ insert into public.admins) เพราะเว็บเปิดให้ทุกคนล็อกอินได้ ใครล็อกอิน Google เป็นคนแรกขณะที่ยังไม่มีแอดมินจะยึดระบบได้
// จึงแสดงหน้า “ตั้งเป็นผู้ดูแลคนแรก” เฉพาะเมื่อเปิด /admin/#setup เท่านั้น
import { S, esc, actions } from './store.js';
import { banner, clearBanner, notify } from './notify.js';
import { selectBackend } from './api.js';
import { connHtml } from './conn.js';

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
const hashHasSetup = () => new URLSearchParams(location.hash.slice(1)).has('setup');

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
  const wantSetup = hashHasSetup() || ss.get(SETUP_KEY) === '1';
  if (wantSetup && b.adminExists && !(await b.adminExists())) { ctx.showClaim(S.email); return false; }
  ss.del(SETUP_KEY);
  if (!ss.get(NOTE_KEY)) {
    ss.set(NOTE_KEY, '1');
    notify({ type: 'info', title: 'เข้าสู่ระบบแล้ว', message: 'คดีที่คุณสร้างเป็นของบัญชีนี้ — ผู้ใช้อื่นมองไม่เห็น (ผู้ดูแลระบบเปิดดูได้เพื่อช่วยแก้ปัญหา)', duration: 7000 });
  }
  return true;
}

const G_SVG = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
const MARK_SVG = '<svg class="login-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="7" r="2"/><path d="M24 9v29M16 41h16M13 38h22M7 14h34"/><path d="M10 14 3 28M10 14l7 14M38 14l-7 14M38 14l7 14"/><path d="M3 28h14c-.5 5-3.5 7.5-7 7.5S3.5 33 3 28zM31 28h14c-.5 5-3.5 7.5-7 7.5S31.5 33 31 28z"/></svg>';

/** หน้าเข้าสู่ระบบ (บังคับ): Google | อีเมล+รหัสผ่าน */
export async function showLogin(msg = '') {
  clearBanner('guest');
  S.c = null; S.role = 'user'; S.email = ''; S.uid = '';
  if (hashHasSetup()) ss.set(SETUP_KEY, '1'); // OAuth ส่งกลับมาโดยไม่มี hash — จำไว้ว่ามาจากลิงก์ตั้งค่า
  const app = ctx.app;
  app.innerHTML = `<div class="login"><form class="login-card" id="loginForm">
    ${MARK_SVG}<h1>เริ่มร่างคำฟ้องของคุณเอง</h1>
    <div class="conn-row">${connHtml()}</div>
    <p class="hint">เตรียมคำฟ้อง คำร้อง และเอกสารประกอบสำหรับยื่นต่อศาลได้ด้วยตนเอง ใช้ได้ทันที</p>
    <button type="button" class="g-btn" data-act="googleLogin">${G_SVG}เข้าสู่ระบบด้วย Google</button>
    <div class="or"><span>หรือใช้อีเมลและรหัสผ่านที่มีอยู่แล้ว</span></div>
    <label class="f s12"><span>อีเมล</span><input type="email" name="email" required autocomplete="username"></label>
    <label class="f s12"><span>รหัสผ่าน</span><input type="password" name="password" required autocomplete="current-password"></label>
    <div class="login-err" role="alert">${esc(msg)}</div>
    <button class="btn primary" style="width:100%;justify-content:center">เข้าสู่ระบบ</button>
    <div class="login-note">
      <p><b>ต้องเข้าสู่ระบบก่อนใช้งาน</b> คดีที่บันทึกเป็นของบัญชีคุณ ผู้ใช้คนอื่นมองไม่เห็น แต่ผู้ดูแลระบบสามารถเปิดดูได้เพื่อช่วยแก้ปัญหาการใช้งาน</p>
    </div>
    <a class="hint" href="/" style="text-align:center">← กลับเว็บไซต์</a></form></div>`;
  app.querySelector('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await ctx.getBackend().signIn(f.get('email'), f.get('password')); await ctx.startApp(); }
    catch (err) { showLogin(err.message || 'เข้าสู่ระบบไม่สำเร็จ'); }
  });
}

/** เข้าสู่ระบบ/ออกจากระบบ/ออกจากโหมดทดลอง → กลับหน้าเข้าสู่ระบบ */
export async function signOut() {
  const b = ctx.getBackend();
  try { await b.signOut(); } catch (e) { console.error(e); }
  ss.del(NOTE_KEY);
  return showLogin();
}

// actions.signOut อยู่ใน app.js (เรียก authUi.signOut) — ตรงนี้เพิ่มเฉพาะปุ่มที่ app.js ไม่มี
actions.authLogin = signOut;
actions.casesScope = (el) => { S.ui.onlyMine = el.dataset.scope === 'mine'; ctx.showHome(); };

// ---------- ชิ้นส่วน UI ----------
/** ปุ่มมุมขวาบน: ใครล็อกอินอยู่ + บทบาท + ออกจากระบบ (โหมดไฟล์ในเครื่องไม่มีบัญชี → ไม่แสดง) */
export function userBar() {
  if (!ctx.getBackend().needsLogin) return '';
  return `${connHtml()}${S.email ? `<span class="who" title="${esc(S.email)}">${esc(S.email)}</span>` : ''}`
    + `${isAdmin() ? '<span class="role-badge">ผู้ดูแลระบบ</span>' : ''}`
    + '<button class="btn ghost" data-act="signOut">ออกจากระบบ</button>';
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
/** แอดมิน: บรรทัดเล็ก ๆ สีเทาบอกเจ้าของคดี */
export function ownerLine(x) {
  if (!isAdmin() || !S.uid) return '';
  return `<div class="owner-line">เจ้าของ: ${esc(x.ownerEmail || 'ไม่ระบุ (ข้อมูลเดิม)')}${x.userId && x.userId === S.uid ? ' (ฉัน)' : ''}</div>`;
}
/** หลังวาดหน้าแรก: ผู้ที่ไม่ใช่แอดมินไม่เห็นการ์ดกล่องข้อความปรึกษา */
export function afterHome(root = document) {
  if (!isAdmin()) root.querySelectorAll('[data-act="openInbox"]').forEach((n) => n.remove());
}
