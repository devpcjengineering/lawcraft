// สมุดรายชื่อ: เพิ่ม/แก้ไข/ลบ บุคคลและทนายความได้โดยตรง ไม่ต้องเปิดคดีหรือเพิ่มเป็นโจทก์/จำเลยก่อน
// วิธีทำ: ใช้ “คดีจำลอง” เป็นที่เก็บข้อมูลชั่วคราวของรายการที่กำลังแก้ ให้ตัวช่วยฟอร์มเดิม (field/addressFields) ใช้ได้เหมือนหน้าคู่ความ
import { S, esc, actions, hooks } from './store.js';
import { field, select, addressFields, group, provinceList, idField } from './ui.js';
import { personFields } from './tabs.js';
import { newCase, newParty, uid, partyName } from '/shared/model.js';
import { confirmBox } from './modal.js';
import { morphInto } from './morph.js';
import { isAdmin } from './auth-ui.js';

const $ = (s, r = document) => r.querySelector(s);
const KIND_TXT = { party: 'บุคคลธรรมดา', juristic: 'นิติบุคคล', counsel: 'ทนายความ' };
let app, sel = null, q = '', filter = 'all', timer = 0, stateTxt = '', stateTone = '';

const typeOf = (rec) => (rec.kind === 'counsel' ? 'counsel' : rec.data?.kind === 'juristic' ? 'juristic' : 'party');
const metaOf = (rec) => {
  const d = rec.data || {};
  const id = String(d.idCard || '').replace(/\D/g, '');
  return [KIND_TXT[typeOf(rec)], rec.kind === 'counsel' && d.license && `ใบอนุญาต ${d.license}`, id.length === 13 && `x-xxxx-xxxxx-${id.slice(10, 12)}-${id[12]}`,
    d.address?.province && 'จ.' + d.address.province, d.phone, isAdmin() && rec.owner_email && `เจ้าของ ${rec.owner_email}`].filter(Boolean).map(esc).join(' · ');
};

/** สร้างคดีจำลองจากรายการที่เลือก (ใช้เฉพาะเป็นที่ผูกฟอร์ม ไม่ถูกบันทึกเป็นคดี) */
function pseudoCase(rec) {
  const c = newCase('criminal');
  const d = structuredClone(rec.data || {});
  if (rec.kind === 'counsel') {
    c.counsel = { ...c.counsel, ...d, enabled: true, address: { ...c.counsel.address, ...(d.address || {}) } };
  } else {
    const base = newParty('plaintiff');
    c.parties = [{ ...base, ...d, role: 'plaintiff', id: 'book', address: { ...base.address, ...(d.address || {}) } }];
  }
  return c;
}

/** อ่านข้อมูลจากคดีจำลองกลับเป็นรายการสมุดรายชื่อ */
function readBack() {
  if (sel.rec.kind === 'counsel') {
    const data = structuredClone(S.c.counsel);
    return { label: data.first || data.last ? `ทนาย ${[data.first, data.last].filter(Boolean).join(' ')}` : '', data };
  }
  const data = structuredClone(S.c.parties[0]);
  delete data.id; delete data.role;
  return { label: partyName(S.c.parties[0]) || '', data };
}

function setState(txt, tone = '') {
  stateTxt = txt; stateTone = tone;
  const el = $('#book-state');
  if (el) { el.textContent = txt; el.dataset.tone = tone; }
}

async function persist() {
  if (!sel) return;
  const { label, data } = readBack();
  if (!label) return setState('กรอกชื่อเพื่อบันทึก', '');
  const rec = sel.rec;
  rec.label = label; rec.data = data;
  setState('กำลังบันทึก…', 'busy');
  try { await hooks.api.savePerson(rec); } catch (e) { return setState('บันทึกไม่สำเร็จ: ' + e.message, 'err'); }
  if (sel.isNew) {
    S.people.push(rec); sel.isNew = false;
    // เปลี่ยนหัวฟอร์มจาก “เพิ่ม” เป็น “แก้ไข” และสลับปุ่ม ยกเลิก → ลบ โดยไม่วาดฟอร์มใหม่ (ไม่ให้เคอร์เซอร์หลุด)
    const h = $('.bk-head h2'); if (h) h.textContent = 'แก้ไข' + KIND_TXT[typeOf(rec)];
    const b = $('.bk-head [data-act=bookCancel]'); if (b) { b.dataset.act = 'bookDel'; b.textContent = 'ลบ'; b.classList.add('danger'); }
  }
  setState('บันทึกแล้ว ✓', 'ok');
  renderList();
}

hooks.bookChanged = () => {
  setState('กำลังบันทึก…', 'busy');
  clearTimeout(timer);
  timer = setTimeout(() => { timer = 0; persist(); }, 500);
};
hooks.bookRender = () => { const y = window.scrollY; renderEditor(); window.scrollTo(0, y); };

// ---------- หน้าจอ ----------
export function showBook(root, selectId) {
  app = root;
  S.bookMode = true;
  S.c = null;
  sel = null; q = ''; filter = 'all'; stateTxt = ''; stateTone = '';
  app.innerHTML = `
  <header class="topbar"><div class="brand" data-act="goHome"><svg class="brand-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="7" r="2"/><path d="M24 9v29M16 41h16M13 38h22M7 14h34"/><path d="M10 14 3 28M10 14l7 14M38 14l-7 14M38 14l7 14"/><path d="M3 28h14c-.5 5-3.5 7.5-7 7.5S3.5 33 3 28zM31 28h14c-.5 5-3.5 7.5-7 7.5S31.5 33 31 28z"/></svg><span class="brand-text"><span class="lt-th">สำนักงานกฎหมาย ลอว์คราฟต์</span><span class="lt-en">Law Craft Legal Consultants</span></span><span class="brand-sub">สมุดรายชื่อ</span></div><span class="grow"></span>
    <button class="btn ghost" data-act="goHome" aria-label="คดีทั้งหมด"><span class="tb-i" aria-hidden="true">←</span><span class="tb-t"> คดีทั้งหมด</span></button></header>
  <main class="bookpage">
    <aside class="bk-side" aria-label="รายชื่อ">
      <div class="bk-add">
        <button class="btn primary sm" data-act="bookNew" data-k="party">+ บุคคล</button>
        <button class="btn sm" data-act="bookNew" data-k="juristic">+ นิติบุคคล</button>
        <button class="btn sm" data-act="bookNew" data-k="counsel">+ ทนายความ</button>
      </div>
      <input type="search" id="bk-q" data-oninput="bookSearch" placeholder="ค้นหาชื่อ / เลขบัตร / จังหวัด" aria-label="ค้นหาในสมุดรายชื่อ">
      <div class="seg-mini" role="group" aria-label="กรองประเภท">${[['all', 'ทั้งหมด'], ['party', 'บุคคล'], ['juristic', 'นิติบุคคล'], ['counsel', 'ทนาย']].map(([k, t]) => `<button type="button" data-act="bookFilter" data-k="${k}" aria-pressed="${k === filter}">${t}</button>`).join('')}</div>
      <div class="bk-list" id="bk-list"></div>
    </aside>
    <section class="bk-edit" id="bk-edit" aria-live="polite"></section>
  </main>`;
  renderList();
  const first = selectId && S.people.find((x) => x.id === selectId);
  if (first) pick(first); else renderEditor();
}

function renderList() {
  const box = $('#bk-list');
  if (!box) return;
  const n = q.trim().toLowerCase();
  const rows = S.people
    .filter((x) => x.kind === 'party' || x.kind === 'counsel')
    .filter((x) => filter === 'all' || typeOf(x) === filter)
    .filter((x) => !n || `${x.label} ${x.data?.idCard || ''} ${x.data?.address?.province || ''} ${x.data?.license || ''}`.toLowerCase().includes(n))
    .sort((a, b) => a.label.localeCompare(b.label, 'th'));
  const draft = sel?.isNew ? `<button class="bk-row on" type="button"><b>${esc(readBackLabel() || 'รายการใหม่')}</b><small>ยังไม่ได้บันทึก — กรอกชื่อ</small></button>` : '';
  morphInto(box, draft + (rows.map((x) => `<button type="button" class="bk-row ${sel?.rec.id === x.id ? 'on' : ''}" data-act="bookPick" data-id="${esc(x.id)}"><b>${esc(x.label)}</b><small>${metaOf(x)}</small></button>`).join('')
    || (draft ? '' : `<div class="empty">${S.people.length ? 'ไม่พบรายการ' : 'ยังไม่มีรายการ — กด “+ บุคคล” เพื่อเพิ่มรายแรก'}</div>`)), { mark: false });
}
const readBackLabel = () => { try { return readBack().label; } catch { return ''; } };

function renderEditor() {
  const box = $('#bk-edit');
  if (!box) return;
  if (!sel) {
    box.innerHTML = `<div class="bk-empty"><h2>สมุดรายชื่อ</h2><p>บันทึกข้อมูลบุคคลและทนายความไว้ครั้งเดียว แล้วกดเลือกเป็นโจทก์ จำเลย หรือทนายความในคดีใดก็ได้ — เพิ่มได้ตรงนี้เลย ไม่ต้องเปิดคดีก่อน</p>
      <p class="hint">เลือกรายการทางซ้ายเพื่อแก้ไข หรือกดปุ่ม “+ บุคคล / + นิติบุคคล / + ทนายความ”</p></div>`;
    return;
  }
  const isC = sel.rec.kind === 'counsel';
  const p = S.c.parties[0];
  let form;
  if (isC) {
    form = `${group('ข้อมูลส่วนตัว', `
        ${field('คำนำหน้า', 'counsel.prefix', { cls: 's3', list: 'dl-prefix' })}
        ${field('ชื่อ', 'counsel.first', { cls: 's4', required: true })}
        ${field('นามสกุล', 'counsel.last', { cls: 's5' })}
        ${field('ใบอนุญาตทนายความเลขที่', 'counsel.license', { cls: 's6' })}
        ${idField('เลขประจำตัวประชาชน', 'counsel.idCard', { cls: 's6' })}`)}
      <section class="grp">${addressFields('counsel.address', { title: 'ที่อยู่สำนักงาน' })}</section>
      ${group('ติดต่อ', `${field('โทรศัพท์', 'counsel.phone', { cls: 's6' })}${field('อีเมล', 'counsel.email', { cls: 's6' })}`)}
      ${group('อำนาจที่มอบ', field('อำนาจที่มอบให้ทนายความเพิ่มเติม (ช่อง * ในใบแต่งทนายความ)', 'counsel.powers', { cls: 's12', type: 'textarea', rows: 2, hint: 'ตาม ป.วิ.พ. มาตรา 62 ต้องระบุชัดแจ้ง — ไม่ระบุหากไม่ให้อำนาจ' }))}`;
  } else {
    const b = 'parties.0';
    form = `<div class="item-toolbar">${select('', b + '.kind', [['person', 'บุคคลธรรมดา'], ['juristic', 'นิติบุคคล']], { rerender: true, aria: 'ประเภทบุคคล' })}</div>
      ${personFields(b, p)}
      <section class="grp">${addressFields(b + '.address', { title: 'ที่อยู่ / ภูมิลำเนา', building: false })}</section>
      ${group('ติดต่อ', `${field('โทรศัพท์', b + '.phone', { cls: 's6' })}${field('โทรสาร', b + '.fax', { cls: 's6' })}${field('ไปรษณีย์อิเล็กทรอนิกส์', b + '.email', { cls: 's12' })}`)}
      ${p.kind === 'juristic' ? '' : group('ข้อมูลเพิ่มเติม', `${field('วันเกิด', b + '.birth', { cls: 's6', type: 'date', attrs: 'data-age="1"' })}${field('อายุ (ปี)', b + '.age', { cls: 's6', type: 'number' })}${field('เชื้อชาติ', b + '.ethnicity', { cls: 's6' })}${field('สัญชาติ', b + '.nationality', { cls: 's6' })}`)}`;
  }
  box.innerHTML = `${provinceList()}
    <div class="bk-head"><h2>${sel.isNew ? 'เพิ่ม' : 'แก้ไข'}${KIND_TXT[typeOf(sel.rec)]}</h2><span class="grow"></span>
      <span class="save-state" id="book-state" data-tone="${esc(stateTone)}">${esc(stateTxt)}</span>
      ${sel.isNew ? '<button class="btn sm" data-act="bookCancel">ยกเลิก</button>' : '<button class="btn sm danger" data-act="bookDel">ลบ</button>'}</div>
    ${form}`;
}

function pick(rec, isNew = false) {
  clearTimeout(timer);
  sel = { rec: structuredClone(rec), isNew };
  S.c = pseudoCase(sel.rec);
  setState(isNew ? 'กรอกชื่อเพื่อบันทึก' : '', '');
  renderList();
  renderEditor();
  if (!matchMedia('(min-width: 861px)').matches) $('#bk-edit')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- ปุ่มต่าง ๆ ----------
actions.bookPick = async (el) => {
  await flush();
  const rec = S.people.find((x) => x.id === el.dataset.id);
  if (rec) pick(rec);
};
actions.bookNew = async (el) => {
  await flush();
  const k = el.dataset.k;
  const rec = k === 'counsel'
    ? { id: uid(), kind: 'counsel', label: '', data: { ...newCase('criminal').counsel, enabled: true } }
    : (() => { const d = { ...newParty('plaintiff'), kind: k === 'juristic' ? 'juristic' : 'person' }; delete d.id; delete d.role; return { id: uid(), kind: 'party', label: '', data: d }; })();
  pick(rec, true);
  setTimeout(() => $('#bk-edit input[data-bind]')?.focus(), 50);
};
actions.bookCancel = () => { sel = null; S.c = null; renderList(); renderEditor(); };
actions.bookDel = async () => {
  if (!sel || sel.isNew) return;
  const rec = sel.rec;
  if (!(await confirmBox(`ลบ “${rec.label}” ออกจากสมุดรายชื่อ? (คดีที่ใช้ข้อมูลนี้ไปแล้วไม่ได้รับผลกระทบ)`, { title: 'ลบออกจากสมุดรายชื่อ', okText: 'ลบ', danger: true }))) return;
  try { await hooks.api.deletePerson(rec.id); } catch (e) { return hooks.toast('ลบไม่สำเร็จ: ' + e.message); }
  S.people = S.people.filter((x) => x.id !== rec.id);
  sel = null; S.c = null;
  renderList(); renderEditor();
  hooks.toast(`ลบ “${rec.label}” แล้ว`);
};
actions.bookFilter = (el) => {
  filter = el.dataset.k;
  document.querySelectorAll('.seg-mini [data-k]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === filter)));
  renderList();
};
actions.bookSearch = (el) => { q = el.value; renderList(); };

/** ก่อนสลับรายการ ให้บันทึกที่ค้างอยู่ให้เสร็จ */
async function flush() {
  if (!timer) return;
  clearTimeout(timer); timer = 0;
  await persist();
}
export const leaveBook = async () => { await flush(); S.bookMode = false; S.c = null; };
