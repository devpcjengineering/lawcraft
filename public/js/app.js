// หลังบ้าน: ระบบร่างคำฟ้อง — เมนูซ้ายเลือกเอกสาร ฟอร์มกลาง ตัวอย่างเอกสารขวา, บันทึกอัตโนมัติ, ออกเอกสาร
import { S, esc, actions, hooks, setPath } from './store.js';
import { NAV, TABS } from './tabs.js';
import { provinceList, refreshGeo } from './ui.js';
import { newCase, indexLaw, caseTitle, validateCase, newParty, uid, applyServiceAuto } from '/shared/model.js';
import { buildDocuments } from '/shared/docs.js';
import { resolveLayout, layoutCssVars } from '/shared/layout.js';
import { docsHtml, docHtml } from './render-html.js';
import { ageFromBirth, validCitizenId } from '/shared/thai.js';
import { selectBackend } from './api.js';
import { showBook, leaveBook } from './book.js';
import { openViewer } from './viewer.js';
import { showInbox } from './inbox.js';
import { confirmBox, alertBox, issuesBox, modal } from './modal.js';
import { notify, banner, clearBanner, mountBanners, inferType } from './notify.js';

const $ = (sel, root = document) => root.querySelector(sel);
const app = document.getElementById('app');
let backend;

// ข้อความสั้น ๆ จากทุกหน้า → toast (ชนิดเดาจากถ้อยคำ: ไม่สำเร็จ=แดง, แล้ว=เขียว, กรอก/เลือก=เหลือง)
hooks.toast = (msg, o = {}) => notify({ type: o.type || inferType(msg), message: msg, ...o });
const MODE_NAME = { 'cross-post': 'ส่งนอกเขต + ปิดหมาย', post: 'ปิดหมายอย่างเดียว', cross: 'ส่งนอกเขตอย่างเดียว', none: 'ไม่ต้องขอ' };

// ---------------- บันทึกอัตโนมัติ ----------------
let saveTimer, saveState = '', savePending = false, saveFailed = false;
function setSaveState(st, tone = '') {
  saveState = st;
  const el = $('#save-state');
  if (el) { el.textContent = st; el.dataset.tone = tone; }
}
async function doSave() {
  if (!S.c) return;
  setSaveState('กำลังบันทึก…', 'busy');
  try {
    await backend.saveCase(S.c);
    savePending = false;
    if (saveFailed) { saveFailed = false; clearBanner('save'); notify({ type: 'success', title: 'บันทึกสำเร็จแล้ว', message: 'ข้อมูลล่าสุดถูกเก็บเรียบร้อย', id: 'save-ok' }); }
    setSaveState('บันทึกแล้ว ✓', 'ok');
  } catch (e) {
    saveFailed = true;
    setSaveState('บันทึกไม่สำเร็จ', 'err');
    if (e.status === 401) return showLogin();
    banner('save', { type: 'error', message: 'บันทึกอัตโนมัติไม่สำเร็จ — ข้อมูลล่าสุดยังไม่ถูกเก็บ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง', action: { label: 'ลองบันทึกใหม่', onClick: doSave } });
  }
}
function serviceAutoNote() {
  const sv = S.c.service;
  notify({
    type: 'info', id: 'svc-auto', title: 'ปรับวิธีส่งหมายให้อัตโนมัติ',
    message: `${MODE_NAME[sv.mode] || sv.mode}${sv.court ? ` — ส่งผ่าน ${sv.court}` : ' (ฟ้องและส่งหมายที่ศาลเดียวกัน)'}`,
    action: { label: 'ดูคำร้อง', onClick: () => actions.goTab({ dataset: { tab: 'service' } }) },
  });
}
// เตือนเชิงรุก: กำหนด 3 เดือนความผิดต่อส่วนตัว (ป.อ. มาตรา 96) เหลือน้อย/เกินแล้ว — เตือนครั้งเดียวต่อข้อความ
const alerted = new Set(); let proTimer;
function proactive() {
  if (!S.c) return;
  for (const i of validateCase(S.c, S.idx)) {
    if (i.level === 'info' || !/เหลือเวลา|เกินกำหนด/.test(i.msg) || alerted.has(i.msg)) continue;
    alerted.add(i.msg);
    notify({
      type: i.level === 'error' ? 'error' : 'warn', id: 'deadline', duration: 0,
      title: i.level === 'error' ? 'เกินกำหนดร้องทุกข์/ฟ้อง' : 'ใกล้ครบกำหนดความผิดต่อส่วนตัว',
      message: i.msg, action: { label: 'ไปที่ข้อมูลคดี', onClick: () => actions.goTab({ dataset: { tab: 'case' } }) },
    });
  }
}
hooks.changed = () => {
  if (!S.c) return;
  if (S.bookMode) return hooks.bookChanged(); // กำลังแก้สมุดรายชื่อ ไม่ใช่คดี
  S.c.title = caseTitle(S.c);
  if (applyServiceAuto(S.c, S.data)) serviceAutoNote(); // ปิดหมาย / ส่งข้ามเขต ตามภูมิลำเนาจำเลยเทียบกับศาลที่ฟ้อง
  savePending = true;
  setSaveState('กำลังบันทึก…', 'busy');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 600);
  clearTimeout(proTimer); proTimer = setTimeout(proactive, 900);
  schedulePreview();
  renderStepsSoon();
  const nm = $('.case-name'); if (nm) nm.textContent = S.c.title;
};
window.addEventListener('beforeunload', (e) => { if (savePending || saveFailed) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('offline', () => banner('net', { type: 'warn', message: 'ออฟไลน์ — ยังแก้ไขได้ ระบบจะบันทึกเมื่อกลับมาออนไลน์' }));
window.addEventListener('online', () => { clearBanner('net'); if (saveFailed || savePending) doSave(); });
hooks.preview = () => schedulePreview();
/** ปรับตำแหน่ง/ขนาดแล้วเห็นเลื่อนตามทันที: อัปเดตตัวแปร CSS ของ .page ที่แสดงอยู่ ไม่สร้างเอกสารใหม่ */
hooks.layoutLive = () => {
  const inner = document.getElementById('pv-inner');
  if (!inner || !S.c) return;
  inner.classList.toggle('pv-guides', !!S.ui.guides);
  applyBrand();
  inner.querySelectorAll('.page[data-doc]').forEach((pg) => {
    pg.style.cssText = layoutCssVars(resolveLayout(S.data.layout, pg.dataset.doc));
    pg.classList.add('lay-flash');
  });
  clearTimeout(hooks._flash);
  hooks._flash = setTimeout(() => inner.querySelectorAll('.lay-flash').forEach((p) => p.classList.remove('lay-flash')), 350);
};

/** ขนาดโลโก้ครุฑบนหลังบ้านตามที่ตั้งไว้ในหน้า “ตำแหน่งตัวหนังสือ & ตราครุฑ” */
function applyBrand() {
  const h = Number(S.data.layout?.all?.['brand.admin']);
  document.documentElement.style.setProperty('--brand-h', (h >= 12 && h <= 64 ? h : 28) + 'px');
}

// ---------------- เข้าสู่ระบบ (ใช้เมื่อเชื่อม Supabase) ----------------
function showLogin(msg = '') {
  app.innerHTML = `<div class="login"><form class="login-card" id="loginForm">
    <svg class="login-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="7" r="2"/><path d="M24 9v29M16 41h16M13 38h22M7 14h34"/><path d="M10 14 3 28M10 14l7 14M38 14l-7 14M38 14l7 14"/><path d="M3 28h14c-.5 5-3.5 7.5-7 7.5S3.5 33 3 28zM31 28h14c-.5 5-3.5 7.5-7 7.5S31.5 33 31 28z"/></svg><h1>เข้าสู่ระบบหลังบ้าน</h1>
    <p class="hint">ข้อมูลคู่ความเป็นข้อมูลส่วนบุคคล ต้องเข้าสู่ระบบก่อนใช้งาน</p>
    <button type="button" class="g-btn" data-act="googleLogin"><svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>เข้าสู่ระบบด้วย Google</button>
    <div class="or"><span>หรือใช้อีเมลและรหัสผ่าน</span></div>
    <label class="f s12"><span>อีเมล</span><input type="email" name="email" required autocomplete="username"></label>
    <label class="f s12"><span>รหัสผ่าน</span><input type="password" name="password" required autocomplete="current-password"></label>
    <div class="login-err" role="alert">${esc(msg)}</div>
    <button class="btn primary" style="width:100%;justify-content:center">เข้าสู่ระบบ</button>
    <a class="hint" href="/" style="text-align:center">← กลับเว็บไซต์</a></form></div>`;
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await backend.signIn(f.get('email'), f.get('password')); await startApp(); }
    catch (err) { showLogin(err.message || 'เข้าสู่ระบบไม่สำเร็จ'); }
  });
}

/** หน้ายืนยันตั้งบัญชีที่ล็อกอินอยู่เป็นผู้ดูแลระบบคนแรก */
function showClaim(email) {
  app.innerHTML = `<div class="login"><div class="login-card">
    <h1>ตั้งผู้ดูแลระบบคนแรก</h1>
    <p class="hint">ระบบยังไม่มีผู้ดูแล คุณล็อกอินด้วยบัญชี Google:</p>
    <p style="text-align:center;font-weight:600;font-size:17px;margin:2px 0">${esc(email)}</p>
    <p class="hint">ต้องการตั้งบัญชีนี้เป็นผู้ดูแลระบบ (เข้าข้อมูลคดีและตั้งค่าได้ทั้งหมด) หรือไม่? หลังตั้งแล้ว คนอื่นจะเข้าไม่ได้จนกว่าจะถูกเพิ่ม ถ้าไม่ใช่บัญชีของคุณ ให้ออกจากระบบ</p>
    <div class="login-err" role="alert" id="claimErr"></div>
    <button class="btn primary" style="width:100%;justify-content:center" data-act="claimAdmin">ยืนยัน ตั้งเป็นผู้ดูแลระบบ</button>
    <button class="btn" style="width:100%;justify-content:center" data-act="signOut">ไม่ใช่บัญชีของฉัน — ออกจากระบบ</button>
  </div></div>`;
}
actions.claimAdmin = async () => {
  try {
    if (await backend.claimAdmin()) { notify({ type: 'success', title: 'ตั้งเป็นผู้ดูแลระบบแล้ว', message: 'ยินดีต้อนรับ — เริ่มสร้างคดีได้เลย' }); return startApp(); }
    $('#claimErr').textContent = 'ตั้งไม่สำเร็จ — อาจมีผู้ดูแลอยู่แล้ว หรือไม่ได้ล็อกอินด้วย Google';
  } catch (e) { $('#claimErr').textContent = e.message; }
};

// ---------------- หน้าแรก (รายการคดี) ----------------
async function showHome() {
  S.c = null; S.bookMode = false;
  let list = [];
  try { list = await backend.listCases(); } catch (e) { if (e.status === 401) return showLogin(); }
  app.innerHTML = `
  <header class="topbar"><div class="brand" data-act="goHome"><svg class="brand-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="7" r="2"/><path d="M24 9v29M16 41h16M13 38h22M7 14h34"/><path d="M10 14 3 28M10 14l7 14M38 14l-7 14M38 14l7 14"/><path d="M3 28h14c-.5 5-3.5 7.5-7 7.5S3.5 33 3 28zM31 28h14c-.5 5-3.5 7.5-7 7.5S31.5 33 31 28z"/></svg><span class="brand-text">Law <b>Craft</b></span><span class="brand-sub">หลังบ้าน · ระบบร่างคำฟ้อง</span></div><span class="grow"></span>
    <span class="save-state" title="ที่เก็บข้อมูล">${esc(backend.label || '')}</span>
    ${backend.needsLogin ? '<button class="btn ghost" data-act="signOut">ออกจากระบบ</button>' : ''}
    <a class="btn ghost" href="/">← เว็บไซต์</a></header>
  <main class="home">
    <h1>คดีของฉัน</h1>
    <p class="lead">กรอกข้อมูลคู่ความและข้อเท็จจริงครั้งเดียว ระบบสร้างคำฟ้อง คำขอท้ายฟ้อง คำร้อง บัญชีพยาน หมายนัดไต่สวนมูลฟ้อง ตามแบบพิมพ์ศาลยุติธรรมให้ครบชุด เปิดคดีเดิมแล้วทำสำเนาเพื่อใช้ข้อมูลซ้ำได้</p>
    <div class="cards">
      <button class="card newcase" data-act="newCase" data-type="criminal"><h3>＋ คดีอาญา</h3><span class="hint">ราษฎรเป็นโจทก์ฟ้องเอง (ป.วิ.อ. มาตรา 28(2)) — คำฟ้อง คำขอท้ายฟ้อง คำร้องส่งหมาย บัญชีพยาน หมายนัดไต่สวนมูลฟ้อง</span></button>
      <button class="card newcase" data-act="newCase" data-type="civil"><h3>＋ คดีแพ่ง</h3><span class="hint">คำฟ้องแพ่ง คำขอท้ายฟ้อง ทุนทรัพย์และค่าขึ้นศาล มูลหนี้ตาม ป.พ.พ.</span></button>
      <button class="card newcase" data-act="openBook"><h3>☰ สมุดรายชื่อ</h3><span class="hint">เพิ่ม/แก้ไขบุคคล นิติบุคคล และทนายความไว้ล่วงหน้า แล้วกดเลือกเป็นโจทก์ จำเลย หรือทนายในคดีใดก็ได้</span></button>
      <button class="card newcase" data-act="openInbox"><h3>✉ กล่องข้อความปรึกษา <span class="ib-badge" data-inbox-badge hidden></span></h3><span class="hint">ข้อความที่ผู้เยี่ยมชมส่งจากหน้า “ติดต่อปรึกษากฎหมาย” ของเว็บไซต์ — ตรวจสอบ ติดต่อกลับ และทำเครื่องหมายว่าจัดการแล้ว</span></button>
      <label class="card newcase" style="cursor:pointer"><h3>⬆ นำเข้าข้อมูลคดี (.json)</h3><span class="hint">ไฟล์ที่ส่งออกจากระบบนี้</span><input type="file" id="importFile" accept=".json,application/json" hidden></label>
    </div>
    <h2 class="section-title">คดีที่บันทึกไว้ (${list.length})</h2>
    ${list.length ? `<div class="cards">${list.map((x) => `<div class="card case-item">
        <div><span class="pill ${x.type === 'civil' ? 'civil' : 'crim'}">${x.type === 'civil' ? 'แพ่ง' : 'อาญา'}</span></div>
        <h3>${esc(x.title || 'คดีใหม่')}</h3>
        <div class="meta">${esc(x.court || 'ยังไม่ได้เลือกศาล')} · แก้ไขล่าสุด ${new Date(x.updatedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        <div class="row"><button class="btn primary sm" data-act="openCase" data-id="${esc(x.id)}">เปิด</button>
          <button class="btn sm" data-act="dupCase" data-id="${esc(x.id)}" title="คัดลอกคู่ความ ทนาย และข้อมูลทั้งหมดไปเป็นคดีใหม่">ทำสำเนา</button>
          <button class="btn sm danger" data-act="delCase" data-id="${esc(x.id)}">ลบ</button></div></div>`).join('')}</div>`
      : '<div class="empty">ยังไม่มีคดี — เริ่มจากกดปุ่ม “คดีอาญา” หรือ “คดีแพ่ง” ด้านบน</div>'}
    <p class="hint" style="margin-top:28px">แบบพิมพ์อ้างอิงจากแบบพิมพ์ศาลยุติธรรม (สำนักงานศาลยุติธรรม) · ข้อมูลกฎหมายเป็นเครื่องมือช่วยร่าง ผู้ใช้ต้องตรวจสอบความถูกต้องก่อนยื่นต่อศาลทุกครั้ง</p>
  </main>`;
  mountBanners($('.topbar'));
  playEnter($('.home'));
  $('#importFile')?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const c = JSON.parse(await f.text());
      c.id = uid(); await backend.saveCase(c); openCase(c);
    } catch { alertBox('ไฟล์ไม่ถูกต้อง หรือไม่ใช่ไฟล์ข้อมูลคดีที่ส่งออกจากระบบนี้', { title: 'นำเข้าไม่สำเร็จ', tone: 'warn' }); }
  });
}

function normalizeCase(c) {
  const base = newCase(c.type);
  const merged = { ...base, ...c, options: { ...base.options, ...c.options }, counsel: { ...base.counsel, ...c.counsel, address: { ...base.counsel.address, ...c.counsel?.address } },
    service: { ...base.service, ...c.service }, docs: { ...base.docs, ...c.docs }, proxy: { ...base.proxy, ...c.proxy, holder: { ...base.proxy.holder, ...c.proxy?.holder } },
    hearing: { ...base.hearing, ...c.hearing }, answer: { ...base.answer, ...c.answer }, settlement: { ...base.settlement, ...c.settlement }, date: { ...base.date, ...c.date } };
  // ข้อมูลเก่า: crossDistrict/postNotice (boolean) → mode
  if (c.service && !c.service.mode) {
    merged.service.mode = c.service.crossDistrict && c.service.postNotice ? 'cross-post' : c.service.crossDistrict ? 'cross' : c.service.postNotice ? 'post' : 'post';
  }
  merged.parties = (c.parties || base.parties).map((p) => ({ ...newParty(p.role), ...p, address: { ...newParty().address, ...p.address } }));
  return merged;
}

function openCase(c, tab = 'case') {
  S.c = normalizeCase(c);
  alerted.clear();
  applyServiceAuto(S.c, S.data);
  S.tab = TABS.some((t) => t.key === tab) ? tab : 'case';
  S.ui.pvDoc = '';
  syncPreviewDoc();
  showWorkspace();
}

actions.goHome = async () => { if (S.bookMode) await leaveBook(); showHome(); };
actions.openBook = () => showBook(app);
actions.openInbox = () => showInbox(app);
actions.signOut = async () => { await backend.signOut(); showLogin(); };
actions.googleLogin = async () => {
  try { await backend.signInWithGoogle(); } // เบราว์เซอร์จะถูกพาไปหน้า Google แล้วกลับมาที่ /admin/
  catch (e) { const el = $('.login-err'); if (el) el.textContent = e.message; else alertBox(e.message, { title: 'Login ด้วย Google ไม่สำเร็จ', tone: 'warn' }); }
};
actions.newCase = (el) => {
  const c = newCase(el.dataset.type);
  c.docs = el.dataset.type === 'civil' ? { ...c.docs, summons: false } : c.docs;
  S.c = c; S.tab = 'case'; S.ui.pvDoc = ''; alerted.clear(); hooks.changed(); showWorkspace();
  notify({ type: 'success', title: 'สร้างคดีใหม่แล้ว', message: 'ระบบบันทึกอัตโนมัติทุกครั้งที่แก้ไข เริ่มจากกรอกศาลและคู่ความ' });
};
actions.openCase = async (el) => openCase(await backend.getCase(el.dataset.id));
actions.dupCase = async (el) => {
  const c = await backend.getCase(el.dataset.id);
  c.id = uid(); c.caseNoBlack = ''; c.caseNoRed = ''; c.createdAt = new Date().toISOString();
  await backend.saveCase(c); hooks.toast('ทำสำเนาแล้ว'); showHome();
};
actions.delCase = async (el) => {
  if (!(await confirmBox('คดีนี้และเอกสารทั้งหมดจะถูกลบถาวร กู้คืนไม่ได้', { title: 'ลบคดี', okText: 'ลบคดี', danger: true }))) return;
  await backend.deleteCase(el.dataset.id); showHome();
};

const TAB_ALIAS = { charges: 'complaint', facts: 'complaint' };
actions.goTab = (el) => {
  S.tab = TAB_ALIAS[el.dataset.tab] || el.dataset.tab;
  if (S.tab === 'layout') S.ui.pvOn = true;
  syncPreviewDoc();
  renderShell(true);
  window.scrollTo({ top: 0 });
};

/** เลือกเอกสารที่แสดงในตัวอย่างให้ตรงกับหน้าที่เปิดอยู่ */
function syncPreviewDoc() {
  const t = TABS.find((x) => x.key === S.tab);
  if (t?.doc) S.ui.pvDoc = t.doc;
}

// ---------------- พื้นที่ทำงาน ----------------
function showWorkspace() {
  app.innerHTML = `
  <header class="topbar"><div class="brand" data-act="goHome"><svg class="brand-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="7" r="2"/><path d="M24 9v29M16 41h16M13 38h22M7 14h34"/><path d="M10 14 3 28M10 14l7 14M38 14l-7 14M38 14l7 14"/><path d="M3 28h14c-.5 5-3.5 7.5-7 7.5S3.5 33 3 28zM31 28h14c-.5 5-3.5 7.5-7 7.5S31.5 33 31 28z"/></svg><span class="brand-text">Law <b>Craft</b></span><span class="brand-sub">ระบบร่างคำฟ้อง</span></div>
    <span class="case-name">${esc(S.c.title || caseTitle(S.c))}</span><span class="grow"></span>
    <button class="ready-chip" id="ready-chip" data-act="showReadiness" type="button"></button>
    <span class="save-state" id="save-state" data-tone="">${esc(saveState)}</span>
    <button class="btn ghost" data-act="togglePreview">👁 ตัวอย่างเอกสาร</button>
    <button class="btn ghost" data-act="goHome">คดีทั้งหมด</button></header>
  <div class="work" id="work"><nav class="steps" id="steps" aria-label="เมนูเอกสารและขั้นตอน"></nav><main class="main" id="main"></main>
    <aside class="preview" id="preview"><div class="pv-bar" id="pv-bar"></div><div class="pv-scroll" id="pv-scroll"><div class="pv-inner" id="pv-inner"></div></div></aside></div>`;
  renderShell();
  schedulePreview(true);
  mountBanners($('.topbar'));
  updateReady();
}

const STATUS_TXT = { ok: 'พร้อม', todo: 'ยังไม่ครบ', off: 'ไม่ใช้' };
function renderSteps() {
  const el = $('#steps');
  if (!el || !S.c) return;
  const errors = validateCase(S.c, S.idx).filter((i) => i.level === 'error').length;
  const crim = S.c.type === 'criminal';
  el.innerHTML = NAV.map((g) => {
    const items = g.items.filter((t) => !t.only || t.only === S.c.type || (t.only === 'criminal' && crim));
    return `<div class="nav-group"><div class="nav-head">${esc(g.group)}${g.hint ? `<small>${esc(g.hint)}</small>` : ''}</div>${items.map((t) => {
      const st = t.status ? t.status() : null;
      const cnt = t.count ? t.count() : 0;
      return `<button class="nav-item ${S.tab === t.key ? 'on' : ''}" data-act="goTab" data-tab="${t.key}" ${S.tab === t.key ? 'aria-current="page"' : ''}>
        <span class="nav-ico">${t.num ?? t.icon ?? '•'}</span><span class="nav-label">${esc(t.label)}</span>
        ${cnt ? `<span class="nav-count">${cnt}</span>` : ''}
        ${t.key === 'export' && errors ? `<span class="badge">${errors}</span>` : ''}
        ${st ? `<span class="dot ${st}" title="${STATUS_TXT[st]}" role="img" aria-label="${STATUS_TXT[st]}"></span>` : ''}</button>`;
    }).join('')}</div>`;
  }).join('');
  updateReady();
}
function updateReady() {
  const chip = $('#ready-chip');
  if (!chip || !S.c) return;
  const iss = validateCase(S.c, S.idx);
  const e = iss.filter((i) => i.level === 'error').length, w = iss.filter((i) => i.level === 'warn').length;
  chip.className = 'ready-chip ' + (e ? 'err' : w ? 'warn' : 'ok');
  chip.innerHTML = '<i></i>' + (e ? `ต้องแก้ ${e} จุด` : w ? `ควรตรวจ ${w} ข้อ` : 'พร้อมยื่น');
  chip.title = 'คลิกเพื่อดูรายการตรวจสอบก่อนยื่น';
}
actions.showReadiness = async () => {
  const iss = validateCase(S.c, S.idx);
  const names = { case: 'ข้อมูลคดี', parties: 'คู่ความ', counsel: 'ทนายความ', charges: 'คำฟ้อง', facts: 'คำฟ้อง', complaint: 'คำฟ้อง', prayer: 'คำขอท้ายฟ้อง' };
  const mark = { error: ['err', '⛔'], warn: ['todo', '▲'], info: ['ok', 'ℹ'] };
  const body = iss.length
    ? `<ul class="modal-list">${iss.map((i) => `<li class="${mark[i.level][0]}"><span class="st">${mark[i.level][1]}</span><span>${esc(i.msg)}</span><button type="button" class="go" data-act="goTabClose" data-tab="${esc(i.tab)}">ไปแก้${names[i.tab] ? ' ' + esc(names[i.tab]) : ''}</button></li>`).join('')}</ul>`
    : '<p>ตรวจแล้วไม่พบจุดที่ต้องแก้ ✓ พร้อมออกเอกสาร</p>';
  const hasErr = iss.some((i) => i.level === 'error');
  const r = await modal({ title: iss.length ? 'รายการตรวจสอบก่อนยื่น' : 'พร้อมออกเอกสาร', tone: hasErr ? 'warn' : iss.length ? 'info' : 'ok', message: body, buttons: [{ label: 'ปิด', value: null }, { label: 'ไปหน้าออกเอกสาร', value: 'export', primary: true }] });
  if (r === 'export') actions.goTab({ dataset: { tab: 'export' } });
};
actions.goTabClose = (el) => { document.querySelector('dialog.modal')?.close(); actions.goTab(el); };
let stepsTimer;
function renderStepsSoon() { clearTimeout(stepsTimer); stepsTimer = setTimeout(renderSteps, 250); }

function renderMain(enter = false) {
  const tab = TABS.find((t) => t.key === S.tab) || TABS[0];
  const scrollY = window.scrollY;
  $('#main').innerHTML = provinceList() + tab.render();
  if (tab.key === 'export') renderDocList();
  window.scrollTo(0, scrollY);
  if (enter) playEnter($('#main'));
}

/** ทำให้เนื้อหาที่เพิ่งเปลี่ยนค่อย ๆ ปรากฏ (fade + เลื่อนขึ้นเล็กน้อย ทีละส่วน) */
function playEnter(el) {
  if (!el) return;
  el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
  clearTimeout(playEnter.t); playEnter.t = setTimeout(() => el.classList.remove('enter'), 900);
}

function renderShell(enter = false) {
  renderSteps();
  renderMain(enter);
  $('#work').classList.toggle('live', S.tab === 'layout');
  $('#work').classList.toggle('nopreview', !S.ui.pvOn);
  schedulePreview();
}
hooks.rerender = () => { if (S.bookMode) return hooks.bookRender(); renderSteps(); renderMain(); schedulePreview(); };

actions.togglePreview = () => {
  const w = $('#work');
  if (matchMedia('(max-width: 1280px)').matches) {
    // จอแคบ: ตัวอย่างซ่อนอยู่เป็นปริยาย กดครั้งเดียวเปิด/ปิดเป็นแผงทับด้านขวา
    S.ui.pvOn = true;
    w.classList.remove('nopreview');
    w.classList.toggle('showpv');
  } else {
    S.ui.pvOn = !S.ui.pvOn;
    w.classList.toggle('nopreview', !S.ui.pvOn);
  }
  schedulePreview();
};

// ---------------- ตัวอย่างเอกสาร ----------------
let pvTimer;
function schedulePreview(now) {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(renderPreview, now ? 0 : 220);
}

function currentDocs() { return buildDocuments(S.c, S.data); }

// หน้า “ตำแหน่งตัวหนังสือ & ตราครุฑ”: เลือกแบบใดต้องเห็นเอกสารแบบนั้นทันที แม้ยังไม่ได้เปิดใช้ในชุด (เช่น ใบแต่งทนาย)
const LAYOUT_DOCKEY = { complaint: 'complaint', prayer: 'prayer', attachment: 'attachment', service: 'service', motion: 'motions', witness: 'witness', summons: 'summons', attorney: 'attorney', proxy: 'proxy', answer: 'answer', settlement: 'settlement' };
const isDocOf = (d, key) => d.id === key || d.id.startsWith(key + '-') || (key === 'motions' && d.id.startsWith('motion-'));
function previewDocs() {
  const docs = currentDocs();
  const key = S.tab === 'layout' ? LAYOUT_DOCKEY[S.ui.layoutForm] : null;
  if (!key || docs.some((d) => isDocOf(d, key))) return docs;
  // สร้างตัวอย่างเฉพาะแบบนี้จากสำเนาคดี (เติมข้อมูลตัวอย่างเท่าที่จำเป็น) — ไม่กระทบคดีจริงและชุดที่ออกเอกสาร
  const tmp = structuredClone(S.c);
  if (key === 'service' && tmp.service.mode === 'none') tmp.service.mode = 'cross-post';
  if (key === 'summons') tmp.type = 'criminal';
  if (key === 'motions' && !tmp.motions.length) tmp.motions = [{ id: 'sample', title: 'ตัวอย่างคำร้อง', text: 'โจทก์ขอยื่นคำร้องนี้เพื่อประกอบการพิจารณาของศาล\n\nขอศาลได้โปรดพิจารณา' }];
  if (key === 'attachment') {
    for (const role of ['plaintiff', 'defendant']) {
      const list = tmp.parties.filter((p) => p.role === role);
      if (list.length < 2) tmp.parties.push({ ...structuredClone(list[0] || newParty(role)), id: uid(), first: (list[0]?.first || 'ตัวอย่าง') + ' (คนที่ 2)' });
    }
  }
  const extra = buildDocuments(tmp, S.data, [key]);
  return extra.length ? [...docs, ...extra] : docs;
}

function renderPreview() {
  const box = $('#preview');
  if (!box || !S.c) return;
  box.style.display = S.ui.pvOn ? '' : 'none';
  if (!S.ui.pvOn) return;
  const docs = previewDocs();
  if (!docs.length) { $('#pv-bar').innerHTML = ''; $('#pv-inner').innerHTML = '<p class="empty" style="margin:20px">ยังไม่ได้เลือกเอกสาร</p>'; return; }
  if (S.tab === 'layout' && S.ui.lastLayoutForm !== S.ui.layoutForm) {
    S.ui.lastLayoutForm = S.ui.layoutForm;
    const k = LAYOUT_DOCKEY[S.ui.layoutForm];
    const hit = k && docs.find((d) => isDocOf(d, k));
    if (hit) S.ui.pvDoc = hit.id;
  }
  if (!docs.some((d) => d.id === S.ui.pvDoc)) {
    const t = TABS.find((x) => x.key === S.tab);
    S.ui.pvDoc = docs.find((d) => d.id === t?.doc || (t?.doc === 'motions' && d.id.startsWith('motion-')) || (t?.doc === 'summons' && d.id.startsWith('summons-')))?.id || docs[0].id;
  }
  // ตัวเลือกเอกสารเดียว (แทนแท็บเรียงยาว): ลูกศรก่อนหน้า/ถัดไป + เมนูเลือก + ตัวนับ
  const idx = Math.max(0, docs.findIndex((d) => d.id === S.ui.pvDoc));
  const bar = $('#pv-bar');
  const barHtml = `<div class="pv-nav">
    <button type="button" class="pv-arrow" data-act="pvPrev" aria-label="เอกสารก่อนหน้า" ${docs.length < 2 ? 'disabled' : ''}>‹</button>
    <label class="pv-select"><select data-onchange="pvSelect" aria-label="เลือกเอกสารที่แสดงในตัวอย่าง">${docs.map((d) => `<option value="${esc(d.id)}" ${d.id === S.ui.pvDoc ? 'selected' : ''}>${esc(d.title)}</option>`).join('')}</select></label>
    <button type="button" class="pv-arrow" data-act="pvNext" aria-label="เอกสารถัดไป" ${docs.length < 2 ? 'disabled' : ''}>›</button>
    <span class="pv-count" aria-hidden="true">${idx + 1}/${docs.length}</span></div>`;
  // สร้างแถบเลือกเอกสารใหม่เฉพาะเมื่อเนื้อหาเปลี่ยน (ไม่ให้เมนูที่เปิดอยู่ปิด/เด้งทุกครั้งที่พิมพ์)
  if (bar.dataset.sig !== barHtml) { bar.innerHTML = barHtml; bar.dataset.sig = barHtml; }
  const doc = docs.find((d) => d.id === S.ui.pvDoc);
  const inner = $('#pv-inner');
  const sc = $('#pv-scroll');
  // จำตำแหน่งเลื่อนไว้: แก้ไขเอกสารเดิม → คงที่เดิมไม่เด้ง; เปลี่ยนไปเอกสารอื่น → เริ่มบนสุด
  const same = inner.dataset.doc === doc.id;
  const keepTop = sc.scrollTop, keepLeft = sc.scrollLeft;
  const oldZoom = parseFloat(inner.style.zoom) || 1;
  const avail = sc.clientWidth - 24;
  const zoom = Math.min(1, avail / 794);
  inner.style.zoom = zoom; // ตั้งก่อนใส่เนื้อหา เพื่อไม่ให้ความสูงสะดุด
  inner.style.margin = '0 12px';
  inner.innerHTML = docHtml(doc, S.data.layout);
  inner.classList.toggle('pv-guides', !!S.ui.guides);
  inner.dataset.doc = doc.id;
  if (same) { sc.scrollTop = keepTop * (zoom / oldZoom); sc.scrollLeft = keepLeft; }
  else { sc.scrollTop = 0; sc.scrollLeft = 0; inner.classList.remove('pv-swap'); void inner.offsetWidth; inner.classList.add('pv-swap'); }
}
actions.pvDoc = (el) => { S.ui.pvDoc = el.dataset.id; renderPreview(); };
actions.pvSelect = (el) => { S.ui.pvDoc = el.value; renderPreview(); };
const pvStep = (d) => { const docs = previewDocs(); if (!docs.length) return; const i = docs.findIndex((x) => x.id === S.ui.pvDoc); S.ui.pvDoc = docs[(i + d + docs.length) % docs.length].id; renderPreview(); };
actions.pvPrev = () => pvStep(-1);
actions.pvNext = () => pvStep(1);
window.addEventListener('resize', () => schedulePreview());

// ---------------- ออกเอกสาร ----------------
function renderDocList() {
  const box = $('#doclist');
  if (!box) return;
  const docs = currentDocs();
  box.innerHTML = docs.length ? docs.map((d) => `<div class="docrow"><span class="grow">📄 ${esc(d.title)}</span>
    <button class="btn sm" data-act="printDoc" data-id="${esc(d.id)}">ดู PDF</button></div>`).join('') : '<div class="empty">ยังไม่ได้เลือกเอกสาร</div>';
}

/** ตรวจก่อนออกเอกสาร: มีรายการผิดพลาด/เตือน → แสดง popup ให้เลือกกลับไปแก้หรือออกต่อ */
async function guardExport() {
  const issues = validateCase(S.c, S.idx).filter((i) => i.level !== 'info');
  if (!issues.length) return true;
  const r = await issuesBox(issues);
  if (r === 'fix') {
    S.tab = 'export'; syncPreviewDoc(); renderShell();
    return false;
  }
  return true;
}

/** ดูเอกสารในหน้า (ไม่ดาวน์โหลด) แล้วพิมพ์/บันทึกเป็น PDF จากตัวดู */
function viewDocs(docs, title) {
  openViewer({ title, html: docsHtml(docs, S.data.layout) });
}
actions.printAll = async () => { if (await guardExport()) viewDocs(currentDocs(), 'ชุดเอกสารทั้งหมด'); };
actions.printDoc = async (el) => { const d = currentDocs().filter((x) => x.id === el.dataset.id); if (d.length && await guardExport()) viewDocs(d, d[0].title); };
actions.dlJson = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S.c, null, 2)], { type: 'application/json' }));
  a.download = `${S.c.title || 'คดี'}.json`; a.click(); URL.revokeObjectURL(a.href);
};

// ---------------- ผูกฟอร์ม ----------------
function handleBind(el) {
  const path = el.dataset.bind;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'radio') { if (!el.checked) return false; v = el.value; }
  else v = el.value;
  setPath(S.c, path, v);
  if (el.dataset.idcheck) {
    const chk = el.closest('.f')?.querySelector('.idchk');
    if (chk) chk.innerHTML = !v ? '' : validCitizenId(v) ? '<span class="idok ok">✓ เลขถูกต้อง</span>' : '<span class="idok bad">⚠ เลขไม่ผ่านการตรวจหลักสุดท้าย</span>';
  }
  return true;
}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset?.oninput) { actions[el.dataset.oninput]?.(el); return; }
  if (!S.c) return;
  if (el.dataset.var !== undefined) { S.c.vars[el.dataset.var] = el.value; hooks.changed(); return; }
  if (el.dataset.bind && el.type !== 'radio' && el.type !== 'checkbox' && el.tagName !== 'SELECT') { if (handleBind(el)) hooks.changed(); }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.onchange) { actions[el.dataset.onchange]?.(el); return; }
  if (!S.c || !el.dataset.bind) return;
  if (!handleBind(el)) return;
  if (el.dataset.age && el.value) {
    const scope = el.dataset.bind.replace(/\.birth$/, '');
    const age = ageFromBirth(el.value);
    setPath(S.c, scope + '.age', age);
    const ageEl = document.querySelector(`[data-bind="${scope}.age"]`); if (ageEl) ageEl.value = age;
  }
  if (el.dataset.geo) geoChanged(el);
  hooks.changed();
  if (el.dataset.rerender) hooks.rerender();
});

function geoChanged(el) {
  const scope = el.dataset.scope, kind = el.dataset.geo;
  const a = scope.split('.').reduce((o, k) => o[k], S.c);
  const prov = S.geo.provinces.find((p) => p.name === a.province);
  if (kind === 'province') {
    if (prov && a.district && !prov.districts.some((d) => d.name === a.district)) { a.district = ''; a.sub = ''; a.zip = ''; }
    hooks.rerender();
  } else if (kind === 'district') {
    const d = prov?.districts.find((x) => x.name === a.district);
    if (d && a.sub && !d.subs.some((s) => s.name === a.sub)) { a.sub = ''; a.zip = ''; }
    refreshGeo(scope);
    hooks.rerender();
  } else if (kind === 'sub') {
    const sub = prov?.districts.find((x) => x.name === a.district)?.subs.find((s) => s.name === a.sub);
    if (sub) { a.zip = sub.zip; const z = document.querySelector(`[data-bind="${scope}.zip"]`); if (z) z.value = sub.zip; }
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

// ---------------- เริ่มต้น ----------------
async function startApp() {
  app.innerHTML = '<div class="boot"><div class="spinner" aria-hidden="true"></div><p>กำลังโหลดข้อมูลกฎหมาย…</p></div>';
  try {
    const { data, geo, people } = await backend.loadAll();
    S.data = data; S.idx = indexLaw(data); S.geo = geo; S.people = people;
    applyBrand();
    hooks.api = backend;
  } catch (e) {
    if (e.status === 401) return showLogin();
    app.innerHTML = '<div class="boot"><p>เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — รัน <code>npm start</code> ก่อน หรือตรวจการตั้งค่าใน <code>js/config.js</code></p></div>';
    console.error(e);
    return;
  }
  // ลิงก์ตรง: /admin/#case=<id>&tab=<tab>
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('case')) {
    try { openCase(await backend.getCase(h.get('case')), h.get('tab') || 'case'); return; } catch (err) { console.error('เปิดคดีไม่สำเร็จ', err); }
  }
  // ลิงก์จากบทความ: /admin/#newcase=criminal|civil&charge=<itemId> → เปิดคดีใหม่พร้อมข้อหาที่เลือก
  const nt = h.get('newcase');
  if (nt === 'criminal' || nt === 'civil') {
    const c = newCase(nt);
    if (nt === 'civil') c.docs = { ...c.docs, summons: false };
    const itemId = h.get('charge');
    if (itemId && S.data.items.some((x) => x.id === itemId)) c.charges.push({ itemId, related: [] });
    S.c = c; S.tab = 'case'; S.ui.pvDoc = ''; alerted.clear(); hooks.changed(); showWorkspace();
    history.replaceState(null, '', location.pathname);
    notify({ type: 'success', title: 'สร้างคดีใหม่แล้ว', message: itemId ? 'เลือกข้อหาจากบทความให้แล้ว เริ่มจากกรอกศาลและคู่ความ' : 'เริ่มจากกรอกศาลและคู่ความ' });
    return;
  }
  showHome();
}

(async function boot() {
  backend = await selectBackend();
  if (backend.needsLogin) {
    const st = backend.sessionState ? await backend.sessionState() : ((await backend.isSignedIn()) ? 'ok' : 'none');
    if (st === 'notAdmin') {
      // ยังไม่มีแอดมินเลย → เสนอให้บัญชีนี้ (ถ้าเป็น Google) เป็นผู้ดูแลคนแรก; มีแอดมินแล้ว → ปฏิเสธ
      if (backend.adminExists && !(await backend.adminExists())) return showClaim(await backend.sessionEmail());
      const em = backend.sessionEmail ? await backend.sessionEmail() : '';
      await backend.signOut();
      return showLogin(`บัญชี ${em || 'นี้'} ยังไม่ได้รับสิทธิ์เข้าหลังบ้าน — ให้ผู้ดูแลระบบเพิ่มอีเมลนี้ก่อน`);
    }
    if (st !== 'ok') return showLogin();
  }
  startApp();
})();
