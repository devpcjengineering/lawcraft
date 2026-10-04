// หน้าสำหรับแอดมิน: จัดการข้อมูลบนเว็บไซต์สาธารณะ — ช่องทางติดต่อ ข้อมูลสำนักงาน เวลาทำการ ประกาศบนหัวเว็บ ข้อความท้ายเว็บ
// เก็บเป็นแถว key='site' ใน law_data (ทุกคนอ่านได้ เฉพาะแอดมินเขียนได้) แล้วฟุตเตอร์/หน้าติดต่อของเว็บอ่านไปแสดง
// ใช้วิธีเดียวกับสมุดรายชื่อ: “คดีจำลอง” เป็นที่ผูกฟอร์ม (ตัวช่วย field() อ่านจาก S.c) ไม่ถูกบันทึกเป็นคดี
import { S, esc, actions, hooks } from './store.js';
import { field } from './ui.js';
import { confirmBox } from './modal.js';
import { notify } from './notify.js';
import { CONTACT_KINDS, contactHref } from '/site/live-config.js';
import base from '/site/config.js';

const $ = (s, r = document) => r.querySelector(s);
const KIND_LABEL = Object.fromEntries(CONTACT_KINDS);
let app, timer = 0, stateTxt = '', stateTone = '';

const normalize = (d = {}) => ({
  office: { label: base.office?.label || '', entity: base.office?.entity || '', street: base.office?.street || '', district: base.office?.district || '', province: base.office?.province || '', regNo: base.office?.regNo || '', ...(d.office || {}) },
  contacts: (Array.isArray(d.contacts) && d.contacts.length ? d.contacts : (base.contacts || [])).map((c) => ({ kind: c.kind || 'other', label: c.label || '', value: c.value || '' })),
  hours: d.hours || '',
  footerDesc: d.footerDesc || '',
  announcement: { on: !!d.announcement?.text, text: d.announcement?.text || '', link: d.announcement?.link || '', linkText: d.announcement?.linkText || '' },
});

/** รูปแบบที่เก็บจริง: ช่องทางที่ไม่กรอกค่าตัดทิ้ง, สร้างลิงก์ให้อัตโนมัติ */
function output() {
  const s = S.c.site;
  return {
    office: { ...s.office },
    contacts: s.contacts.filter((c) => String(c.value).trim()).map((c) => ({ kind: c.kind, label: (c.label || '').trim() || KIND_LABEL[c.kind] || 'ติดต่อ', value: String(c.value).trim(), href: contactHref(c.kind, c.value) })),
    hours: s.hours.trim(),
    footerDesc: s.footerDesc.trim(),
    announcement: s.announcement.on && s.announcement.text.trim() ? { text: s.announcement.text.trim(), link: s.announcement.link.trim(), linkText: s.announcement.linkText.trim() } : null,
  };
}

function setState(txt, tone = '') {
  stateTxt = txt; stateTone = tone;
  const el = $('#site-state');
  if (el) { el.textContent = txt; el.dataset.tone = tone; }
}

async function persist() {
  setState('กำลังบันทึก…', 'busy');
  try {
    await hooks.api.saveSite(output());
    try { sessionStorage.removeItem('lawcraft:site:v1'); } catch { /* ข้าม */ }
    setState('บันทึกแล้ว ✓ — เว็บไซต์อัปเดตภายในไม่กี่วินาที', 'ok');
  } catch (e) { setState('บันทึกไม่สำเร็จ: ' + (e.message || e), 'err'); }
}
const changed = () => {
  setState('กำลังบันทึก…', 'busy');
  clearTimeout(timer);
  timer = setTimeout(() => { timer = 0; persist(); }, 700);
};
const render = () => { const y = window.scrollY; renderForm(); window.scrollTo(0, y); };

export async function showSiteAdmin(root) {
  app = root;
  hooks.bookChanged = changed; hooks.bookRender = render; // ใช้กลไกเดียวกับหน้าสมุดรายชื่อ (S.bookMode)
  S.bookMode = true; S.c = null; stateTxt = ''; stateTone = '';
  app.innerHTML = `
  <header class="topbar"><div class="brand" data-act="goHome"><svg class="brand-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="7" r="2"/><path d="M24 9v29M16 41h16M13 38h22M7 14h34"/><path d="M10 14 3 28M10 14l7 14M38 14l-7 14M38 14l7 14"/><path d="M3 28h14c-.5 5-3.5 7.5-7 7.5S3.5 33 3 28zM31 28h14c-.5 5-3.5 7.5-7 7.5S31.5 33 31 28z"/></svg><span class="brand-text"><span class="lt-th">สำนักงานกฎหมาย ลอว์คราฟต์</span><span class="lt-en">Law Craft Legal Consultants</span></span><span class="brand-sub">จัดการเว็บไซต์</span></div><span class="grow"></span>
    <a class="btn ghost" href="/" target="_blank" rel="noopener"><span class="tb-t">ดูหน้าเว็บ ↗</span></a>
    <button class="btn ghost" data-act="goHome"><span class="tb-i" aria-hidden="true">←</span><span class="tb-t"> คดีทั้งหมด</span></button></header>
  <main class="sitepage" id="site-main"><div class="boot"><div class="spinner" aria-hidden="true"></div><p>กำลังโหลดข้อมูลเว็บไซต์…</p></div></main>`;
  let data = {};
  try { data = await hooks.api.loadSite(); } catch (e) { notify({ type: 'warn', title: 'โหลดข้อมูลเว็บไซต์ไม่สำเร็จ', message: e.message || String(e) }); }
  S.c = { site: normalize(data) };
  renderForm();
}

function renderForm() {
  const box = $('#site-main');
  if (!box || !S.c?.site) return;
  const s = S.c.site;
  const kindOpts = (cur) => CONTACT_KINDS.map(([k, t]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${t}</option>`).join('');
  box.innerHTML = `
    <div class="sp-head"><div><h1>จัดการข้อมูลบนเว็บไซต์</h1><p class="hint">แก้ไขแล้วบันทึกอัตโนมัติ — แสดงที่ท้ายเว็บ หน้าติดต่อปรึกษา และข้อมูลสำหรับเสิร์ชเอนจิน (เฉพาะแอดมินแก้ได้)</p></div>
      <span class="save-state" id="site-state" data-tone="${esc(stateTone)}">${esc(stateTxt)}</span></div>

    <section class="panel"><h3>ช่องทางติดต่อ</h3>
      <p class="hint">ใส่เฉพาะที่ใช้จริง ระบบสร้างลิงก์ให้เอง (โทรศัพท์กดโทรได้ · LINE ใส่ @ไอดี หรือลิงก์ · อีเมลกดส่งได้) ช่องที่ว่างจะไม่แสดงบนเว็บ</p>
      <div class="sp-contacts">${s.contacts.map((c, i) => `<div class="sp-row">
        <label class="f"><span>ประเภท</span><select data-bind="site.contacts.${i}.kind" data-rerender="1">${kindOpts(c.kind)}</select></label>
        ${field('ชื่อที่แสดง (ไม่บังคับ)', `site.contacts.${i}.label`, { ph: KIND_LABEL[c.kind] || 'ติดต่อ' })}
        ${field('ค่า', `site.contacts.${i}.value`, { ph: { tel: '02-123-4567', line: '@lawcraft', mail: 'contact@example.com', facebook: 'lawcraft', web: 'www.example.com' }[c.kind] || '' })}
        <button type="button" class="btn sm danger" data-act="siteDelContact" data-i="${i}" aria-label="ลบช่องทางที่ ${i + 1}">ลบ</button></div>`).join('') || '<p class="empty">ยังไม่มีช่องทางติดต่อ — กด “+ เพิ่มช่องทาง”</p>'}</div>
      <div class="toolbar" style="margin:12px 0 0"><button type="button" class="btn outline" data-act="siteAddContact">+ เพิ่มช่องทาง</button></div></section>

    <section class="panel"><h3>เวลาทำการ</h3>
      ${field('ข้อความเวลาทำการ (ขึ้นท้ายเว็บ)', 'site.hours', { type: 'textarea', rows: 2, ph: 'เช่น จันทร์–ศุกร์ 9.00–17.00 น.', cls: 's12' })}</section>

    <section class="panel"><h3>ประกาศบนหัวเว็บ</h3>
      <label class="chk"><input type="checkbox" data-bind="site.announcement.on" data-type="bool" data-rerender="1" ${s.announcement.on ? 'checked' : ''}><span>แสดงแถบประกาศบนทุกหน้าของเว็บ (ผู้เยี่ยมชมปิดได้)</span></label>
      ${s.announcement.on ? `<div class="grid" style="margin-top:12px">${field('ข้อความประกาศ', 'site.announcement.text', { cls: 's12', ph: 'เช่น สำนักงานหยุดทำการวันที่ …' })}
        ${field('ลิงก์ (ไม่บังคับ)', 'site.announcement.link', { cls: 's6', ph: '/contact/ หรือ https://…' })}${field('ข้อความลิงก์', 'site.announcement.linkText', { cls: 's6', ph: 'รายละเอียด' })}</div>` : ''}</section>

    <section class="panel"><h3>ข้อมูลสำนักงาน</h3><div class="grid">
      ${field('ป้ายหัวข้อ', 'site.office.label', { cls: 's4', ph: 'สำนักงานแห่งใหญ่' })}${field('ชื่อนิติบุคคล', 'site.office.entity', { cls: 's8' })}
      ${field('เลขที่ หมู่ ตำบล', 'site.office.street', { cls: 's12' })}
      ${field('อำเภอ/เขต', 'site.office.district', { cls: 's4' })}${field('จังหวัด', 'site.office.province', { cls: 's4' })}${field('ทะเบียนนิติบุคคลเลขที่', 'site.office.regNo', { cls: 's4' })}</div></section>

    <section class="panel"><h3>ข้อความท้ายเว็บ</h3>
      ${field('คำอธิบายสำนักงาน (เว้นว่าง = ใช้ข้อความมาตรฐาน)', 'site.footerDesc', { type: 'textarea', rows: 4, cls: 's12' })}</section>

    <div class="toolbar"><button type="button" class="btn outline" data-act="siteReset">ล้างข้อมูลที่ตั้งไว้ (กลับค่าเริ่มต้น)</button></div>`;
}

actions.siteAddContact = () => { S.c.site.contacts.push({ kind: 'tel', label: '', value: '' }); render(); changed(); };
actions.siteDelContact = (el) => { S.c.site.contacts.splice(+el.dataset.i, 1); render(); changed(); };
actions.siteReset = async () => {
  if (!(await confirmBox('ล้างช่องทางติดต่อ เวลาทำการ ประกาศ และข้อความท้ายเว็บที่ตั้งไว้ทั้งหมด แล้วใช้ค่าเริ่มต้นของเว็บแทน?', { title: 'กลับค่าเริ่มต้น', okText: 'ล้างค่า', danger: true }))) return;
  try { await hooks.api.saveSite({}); } catch (e) { return notify({ type: 'error', title: 'ล้างไม่สำเร็จ', message: e.message || String(e) }); }
  try { sessionStorage.removeItem('lawcraft:site:v1'); } catch { /* ข้าม */ }
  S.c = { site: normalize({}) }; setState('ล้างแล้ว ✓', 'ok'); renderForm();
};

export async function leaveSiteAdmin() {
  if (timer) { clearTimeout(timer); timer = 0; await persist(); }
  S.bookMode = false; S.c = null;
}
