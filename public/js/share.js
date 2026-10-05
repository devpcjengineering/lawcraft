// แชร์คดี & PDF ชุดเอกสาร — แผงในหน้า “ออกเอกสาร” (ใช้ได้เมื่อหลังบ้านเป็น Supabase เท่านั้น)
//   1) สร้าง PDF รวมทุกฉบับในชุดจากหน้าที่จัดแล้ว (js/pdf-export.js — ตัวอักษรเป็นเวกเตอร์ ไฟล์เล็ก) แล้วอัปโหลดทับไฟล์เดิมของคดี (ไฟล์เดียวต่อคดี)
//   2) ลิงก์ดู PDF (ไม่ต้องล็อกอิน) เปิด/ปิด/ออกใหม่ได้ — ชี้ไฟล์ล่าสุดเสมอ
//   3) เชิญผู้อื่นด้วยอีเมลให้เข้ามาแก้ไขคดี (เจ้าของ/แอดมินเชิญ ถอน หรือผู้ถูกเชิญออกเอง)
// สิทธิ์จริงบังคับที่ฐานข้อมูล (supabase/migrations/20261006000000_case_sharing.sql) — หน้านี้เป็นเพียงตัวควบคุม
import { S, esc, actions, hooks } from './store.js';
import { icon } from './icons.js';
import { confirmBox, alertBox } from './modal.js';
import { go, urls } from './router.js';
import { docHtml } from './render-html.js';
import { paginateHtml, countSheets, documentFontsReady } from './paginate.js';

let ctx = null;
/** app.js ส่งตัวช่วยของตัวเองเข้ามา: backend() · docs() = เอกสารในชุดที่เลือก · guard() = ตรวจก่อนออกเอกสาร · flush() = บันทึกคดีที่ค้างให้เสร็จ */
export function bind(c) { ctx = c; }

export const available = () => !!ctx?.backend()?.canShare && !!S.c;
const blank = (id) => ({ id, loaded: false, loading: false, pdf: null, members: [], owner: false, me: '', busy: '', err: '' });
const st = () => { if (!S.ui.share || S.ui.share.id !== S.c.id) S.ui.share = blank(S.c.id); return S.ui.share; };

const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const fmtTime = (iso) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const caseLink = () => location.origin + urls.caseTab(S.c.id);

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* ใช้วิธีสำรอง */ }
  try {
    const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch { return false; }
}

/** โหลดข้อมูลแชร์ของคดีที่เปิดอยู่ (ครั้งเดียวต่อคดี; force = โหลดใหม่) แล้ววาดหน้าซ้ำ */
export async function ensureLoaded(force = false) {
  if (!available()) return;
  const s = st();
  if ((s.loaded && !force) || s.loading) return;
  s.loading = true;
  const id = S.c.id, b = ctx.backend();
  try {
    await ctx.flush(); // คดีต้องอยู่ในฐานข้อมูลก่อนจึงเชิญ/อัปโหลดได้
    const [pdf, members, owner, me] = await Promise.all([b.getCasePdf(id), b.listMembers(id), b.isCaseOwner(id), b.sessionEmail()]);
    if (S.c?.id !== id) return;
    Object.assign(s, { pdf, members, owner, me, err: '' });
  } catch (e) {
    if (S.c?.id === id) s.err = e.message || 'โหลดข้อมูลการแชร์ไม่สำเร็จ';
  } finally {
    s.loading = false; s.loaded = true;
    if (S.c?.id === id) hooks.rerender();
  }
}

function setBusy(text) {
  const s = st();
  const was = !!s.busy;
  s.busy = text;
  const el = document.getElementById('share-prog');
  if (el && !!text === was) el.textContent = text; else hooks.rerender();
}

/** แผงในหน้าออกเอกสาร (ว่างเมื่อไม่ใช่ Supabase) */
export function panelHtml() {
  if (!available()) return '';
  const s = st();
  const b = !!s.busy, dis = b ? ' disabled' : '';
  const pdf = s.pdf;
  const status = pdf
    ? `<span class="st-ico ok" aria-hidden="true">${icon('check')}</span><span class="r-main">ไฟล์ล่าสุดบน Supabase: ${pdf.pages ? pdf.pages + ' แผ่น · ' : ''}${esc(fmtSize(pdf.sizeBytes || 0))}<span class="r-note">อัปโหลดเมื่อ ${esc(fmtTime(pdf.updatedAt))}${pdf.by ? ' โดย ' + esc(pdf.by) : ''} · อัปโหลดใหม่จะทับไฟล์นี้</span></span>`
    : `<span class="st-ico todo" aria-hidden="true">${icon('circle')}</span><span class="r-main">ยังไม่เคยอัปโหลด PDF ของคดีนี้<span class="r-note">กด “สร้าง PDF แล้วอัปโหลด” — ไฟล์จะรวมทุกฉบับในชุดที่เลือกไว้ด้านบน</span></span>`;
  const shareBox = !pdf ? '' : pdf.shareUrl
    ? `<div class="share-link"><input type="text" readonly value="${esc(pdf.shareUrl)}" aria-label="ลิงก์ดู PDF" onfocus="this.select()">
        <button class="btn sm primary" data-act="shareCopy"${dis}>${icon('copy', { size: 15 })}<span>คัดลอก</span></button></div>
      <div class="btn-group share-btns"><button class="btn sm outline" data-act="shareNewLink"${dis}>${icon('refresh', { size: 15 })}<span>ออกลิงก์ใหม่ (ลิงก์เดิมใช้ไม่ได้)</span></button>
        <button class="btn sm danger" data-act="shareOff"${dis}><span>ปิดลิงก์</span></button></div>
      <p class="hint">ใครมีลิงก์นี้ก็ดู PDF ได้โดยไม่ต้องล็อกอิน (ดูอย่างเดียว แก้ไม่ได้) และเห็นไฟล์ล่าสุดเสมอ — PDF มีข้อมูลส่วนบุคคลของคู่ความ ส่งให้เฉพาะคนที่ไว้ใจ</p>`
    : `<button class="btn outline" data-act="shareOn"${dis}>${icon('link', { size: 16 })}<span>เปิดลิงก์ดู PDF</span></button>
      <p class="hint">เปิดแล้วจะได้ลิงก์ที่ส่งให้ใครก็ได้ดู PDF โดยไม่ต้องล็อกอิน (ดูอย่างเดียว) — ปิดหรือออกลิงก์ใหม่ได้ทุกเมื่อ</p>`;
  const notified = (m) => (m.notified_at ? `ส่งอีเมลแจ้งเมื่อ ${fmtTime(m.notified_at)}` : 'ยังไม่ได้ส่งอีเมลแจ้ง');
  const members = s.members.length
    ? `<ul class="rows">${s.members.map((m) => `<li><span class="st-ico ok" aria-hidden="true">${icon('user')}</span><span class="r-main">${esc(m.email)}${m.email === s.me ? ' (ฉัน)' : ''}${s.owner && m.email !== s.me ? `<span class="r-note">${esc(notified(m))}</span>` : ''}</span>
        <span class="r-act">${s.owner ? `${m.email !== s.me ? `<button class="btn sm outline" data-act="shareResend" data-email="${esc(m.email)}"${dis} title="ส่งอีเมลเชิญซ้ำ">${icon('send', { size: 14 })}<span>ส่งอีเมลอีกครั้ง</span></button> ` : ''}<button class="btn sm danger" data-act="shareRemove" data-email="${esc(m.email)}"${dis}>ถอนสิทธิ์</button>` : m.email === s.me ? `<button class="btn sm outline" data-act="shareLeave"${dis}>ออกจากคดีนี้</button>` : ''}</span></li>`).join('')}</ul>`
    : '<p class="hint">ยังไม่มีผู้ร่วมแก้ไข — คดีนี้เห็นและแก้ได้เฉพาะเจ้าของ</p>';
  const invite = s.owner
    ? `<div class="share-invite"><input type="email" id="share-email" placeholder="อีเมล Google ของผู้ร่วมแก้ไข เช่น name@gmail.com" autocomplete="off" aria-label="อีเมลผู้ร่วมแก้ไข">
        <button class="btn sm primary" data-act="shareInvite"${dis}>${icon('plus', { size: 15 })}<span>เชิญแก้ไขคดี</span></button></div>
      <div class="btn-group share-btns"><button class="btn sm outline" data-act="shareCopyCase">${icon('copy', { size: 15 })}<span>คัดลอกลิงก์เปิดคดี</span></button></div>
      <p class="hint">เชิญแล้วระบบส่งอีเมลแจ้งให้อัตโนมัติ (ผู้ส่ง alert@law-craft.co) · ผู้ที่ถูกเชิญเข้าสู่ระบบด้วย Google ด้วยอีเมลนี้ แล้วเปิดลิงก์คดี (หรือเลือกคดีนี้จากรายการ) จะเห็นและแก้คดีนี้ได้ · ลบคดี/เชิญคนอื่นไม่ได้ · ถ้ามีคนแก้พร้อมกัน ระบบจะเตือนก่อนเขียนทับ</p>`
    : '<p class="hint">เฉพาะเจ้าของคดีหรือผู้ดูแลระบบเท่านั้นที่เชิญหรือถอนผู้ร่วมแก้ไขได้</p>';
  return `<div class="panel share-panel"><h3>PDF ชุดเอกสาร &amp; แชร์</h3>
    <p class="hint panel-note">อัปโหลด PDF รวมทั้งชุดขึ้น Supabase (ตัวอักษรเป็นเวกเตอร์ คมชัด ไฟล์เล็ก) ทับไฟล์เดิมของคดีนี้ แล้วแชร์ลิงก์ดู หรือเชิญคนอื่นเข้ามาช่วยแก้คดี</p>
    ${s.err ? `<div class="share-err" role="alert">${icon('alertCircle', { size: 16 })}<span>${esc(s.err)}</span></div>` : ''}
    <ul class="rows"><li>${s.loading && !s.loaded ? `<span class="r-main">กำลังโหลด…</span>` : status}
      <span class="r-act"></span></li></ul>
    <div class="btn-group share-btns"><button class="btn primary" data-act="shareUpload"${dis}>${icon('upload', { size: 16 })}<span>${pdf ? 'สร้าง PDF แล้วอัปโหลดทับไฟล์เดิม' : 'สร้าง PDF แล้วอัปโหลด'}</span></button>
      ${pdf ? `<button class="btn outline" data-act="shareOpenPdf"${dis}>${icon('eye', { size: 16 })}<span>เปิดดูไฟล์ที่อัปโหลดไว้</span></button>` : ''}</div>
    <div class="hint share-prog" id="share-prog" role="status" aria-live="polite">${esc(s.busy)}</div>
    <div class="dl-sub share-sub">ลิงก์ดู PDF (ไม่ต้องล็อกอิน)</div>
    ${pdf ? shareBox : '<p class="hint">อัปโหลด PDF ก่อน จึงเปิดลิงก์ดูได้</p>'}
    <div class="dl-sub share-sub">ผู้ร่วมแก้ไขคดี</div>
    ${members}${invite}</div>`;
}

const fail = (e, title) => { st().err = ''; return alertBox(e?.message || 'ทำรายการไม่สำเร็จ', { title, tone: 'warn' }); };
const guarded = async (title, fn) => {
  const s = st();
  if (s.busy) return;
  try { return await fn(s); } catch (e) {
    if (e?.status === 401) { hooks.toast('หมดเวลาเข้าสู่ระบบ — เข้าสู่ระบบใหม่แล้วลองอีกครั้ง', { type: 'warn' }); return; }
    return fail(e, title);
  } finally { if (s.busy) setBusy(''); }
};

actions.shareUpload = () => guarded('อัปโหลด PDF ไม่สำเร็จ', async (s) => {
  if (!(await ctx.guard())) return;
  const docs = ctx.docs();
  if (!docs.length) return alertBox('ยังไม่ได้เลือกเอกสารในชุด — เลือกเอกสารที่ต้องการด้านบนก่อน', { title: 'ยังไม่มีเอกสาร', tone: 'warn' });
  setBusy('กำลังจัดหน้าเอกสาร…');
  await ctx.flush();
  await documentFontsReady();
  const html = docs.map((d) => paginateHtml(docHtml(d, S.data.layout))).join('');
  const { buildPdf } = await import('./pdf-export.js');
  const blob = await buildPdf(html, { title: S.c.title || 'ชุดเอกสาร', onProgress: (n, t) => setBusy(`กำลังสร้าง PDF… ${n}/${t} แผ่น`) });
  setBusy(`กำลังอัปโหลด… (${fmtSize(blob.size)})`);
  s.pdf = await ctx.backend().uploadCasePdf(S.c.id, blob, { pages: countSheets(html) });
  s.err = '';
  hooks.toast(`อัปโหลด PDF แล้ว (${s.pdf.pages || '-'} แผ่น · ${fmtSize(s.pdf.sizeBytes || blob.size)}) — ทับไฟล์เดิมเรียบร้อย`, { type: 'success' });
});

actions.shareOpenPdf = () => guarded('เปิดไฟล์ไม่สำเร็จ', async () => {
  const w = window.open('', '_blank'); // เปิดหน้าต่างก่อน await เพื่อไม่ให้ถูกบล็อกป๊อปอัป
  try {
    const u = await ctx.backend().casePdfViewUrl(S.c.id);
    if (w) w.location.replace(u); else window.location.assign(u);
  } catch (e) { w?.close(); throw e; }
});

const setShare = (mode, okMsg) => guarded('ตั้งค่าลิงก์ไม่สำเร็จ', async (s) => {
  const url = await ctx.backend().setPdfShare(S.c.id, mode);
  s.pdf = { ...s.pdf, shareUrl: url };
  hooks.rerender();
  if (okMsg) hooks.toast(okMsg, { type: 'success' });
  return url;
});
actions.shareOn = async () => { const u = await setShare('on', 'เปิดลิงก์ดู PDF แล้ว'); if (u) copyText(u); };
actions.shareNewLink = async () => {
  if (!(await confirmBox('ลิงก์เดิมจะใช้ไม่ได้ทันที — ผู้ที่ได้รับลิงก์เดิมไว้จะเปิด PDF ไม่ได้ จนกว่าจะส่งลิงก์ใหม่ให้', { title: 'ออกลิงก์ดู PDF ใหม่', okText: 'ออกลิงก์ใหม่' }))) return;
  const u = await setShare('new', 'ออกลิงก์ใหม่แล้ว'); if (u) copyText(u);
};
actions.shareOff = async () => {
  if (!(await confirmBox('ลิงก์ดู PDF จะใช้ไม่ได้ทันที (ไฟล์ PDF ที่อัปโหลดไว้ยังอยู่ เปิดลิงก์ใหม่ได้ภายหลัง)', { title: 'ปิดลิงก์ดู PDF', okText: 'ปิดลิงก์', danger: true }))) return;
  await setShare('off', 'ปิดลิงก์ดู PDF แล้ว');
};
actions.shareCopy = async () => { const u = st().pdf?.shareUrl; if (u) hooks.toast((await copyText(u)) ? 'คัดลอกลิงก์ดู PDF แล้ว' : 'คัดลอกไม่สำเร็จ — เลือกข้อความในช่องแล้วกดคัดลอกเอง', { type: 'info' }); };
actions.shareCopyCase = async () => hooks.toast((await copyText(caseLink())) ? 'คัดลอกลิงก์เปิดคดีแล้ว — ส่งให้ผู้ที่เชิญไว้' : 'คัดลอกไม่สำเร็จ', { type: 'info' });

actions.shareInvite = () => guarded('เชิญไม่สำเร็จ', async (s) => {
  const input = document.getElementById('share-email');
  const email = String(input?.value || '').trim();
  if (!email) { input?.focus(); return hooks.toast('กรอกอีเมลของผู้ที่จะเชิญก่อน', { type: 'warn' }); }
  await ctx.flush();
  const { email: em } = await ctx.backend().addMember(S.c.id, email);
  if (input) input.value = '';
  // ส่งอีเมลแจ้งทันที — ส่งไม่สำเร็จก็ยังเชิญสำเร็จแล้ว (เขาเห็นคดีเมื่อล็อกอิน) บอกให้ส่งลิงก์เองหรือกดส่งอีเมลซ้ำ
  let mailed = true, why = '';
  try { await ctx.backend().notifyMember(S.c.id, em); } catch (e) { mailed = false; why = e.message || ''; }
  s.members = await ctx.backend().listMembers(S.c.id);
  hooks.rerender();
  if (mailed) hooks.toast(`เชิญ ${em} แล้ว และส่งอีเมลแจ้งเรียบร้อย`, { type: 'success' });
  else hooks.toast(`เชิญ ${em} แล้ว แต่ส่งอีเมลแจ้งไม่สำเร็จ${why ? ` (${why})` : ''} — กด “ส่งอีเมลอีกครั้ง” หรือคัดลอกลิงก์เปิดคดีส่งให้เขาเอง`, { type: 'warn' });
});

actions.shareResend = (el) => guarded('ส่งอีเมลไม่สำเร็จ', async (s) => {
  const email = el.dataset.email;
  await ctx.flush();
  await ctx.backend().notifyMember(S.c.id, email);
  s.members = await ctx.backend().listMembers(S.c.id);
  hooks.rerender();
  hooks.toast(`ส่งอีเมลแจ้ง ${email} แล้ว`, { type: 'success' });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target?.id === 'share-email') { e.preventDefault(); actions.shareInvite(); } });

actions.shareRemove = (el) => guarded('ถอนสิทธิ์ไม่สำเร็จ', async (s) => {
  const email = el.dataset.email;
  if (!(await confirmBox(`${email} จะเปิดหรือแก้คดีนี้ไม่ได้อีก`, { title: 'ถอนสิทธิ์ผู้ร่วมแก้ไข', okText: 'ถอนสิทธิ์', danger: true }))) return;
  await ctx.backend().removeMember(S.c.id, email);
  s.members = s.members.filter((m) => m.email !== email);
  hooks.rerender();
  hooks.toast('ถอนสิทธิ์แล้ว', { type: 'success' });
});

actions.shareLeave = () => guarded('ออกจากคดีไม่สำเร็จ', async (s) => {
  if (!(await confirmBox('คุณจะไม่เห็นและแก้คดีนี้ได้อีก จนกว่าเจ้าของจะเชิญใหม่', { title: 'ออกจากคดีนี้', okText: 'ออกจากคดี', danger: true }))) return;
  await ctx.backend().removeMember(S.c.id, s.me);
  hooks.toast('ออกจากคดีแล้ว', { type: 'success' });
  go(urls.home());
});
