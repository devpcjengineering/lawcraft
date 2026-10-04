// แท็บ "ข้อกฎหมาย" ของหน้าจัดการเนื้อหา — แก้/เพิ่ม/ซ่อนข้อกฎหมายและฎีกา โดยไม่เขียนทับข้อมูลต้นฉบับ (data/*.json)
// เก็บเป็นชั้น "การแก้ไข" (content key 'laws') แล้วผสานทับตอนโหลดข้อมูล — ดูรูปแบบและตัวผสานที่ /shared/content-merge.js
//   { items:{[id]:{ฟิลด์ที่แก้}}, added:[ข้อกฎหมายเต็ม], removed:[id], precedents:{edited:{[คีย์]:{…}}, added:[…], removed:[คีย์]} }
// สัญญาโมดูลแท็บ: export default { id, label, hint, mount(box, ctx), unmount() } (ดู content-admin.js)
import { applyLawEdits, diffItem, diffPrecedent, precedentKeys, cleanItemPatch, cleanPrecPatch } from '/shared/content-merge.js';

const PAGE = 150;      // แถวต่อหน้าในรายการ
const SAVE_MS = 700;   // หน่วงก่อนบันทึกอัตโนมัติ
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

let c = null, root = null, saveT = null, saving = Promise.resolve(), dirty = false;
let base = { items: [], precedents: [] }, laws = [], lawMap = new Map(), baseMap = new Map(), keyOf = (p) => p?.caseNo ?? '';
let edits = null;
const st = { view: 'items', q: '', law: '', kind: '', status: '', limit: PAGE, sel: null, work: null, verManual: false,
  pq: '', pstatus: '', plimit: PAGE, psel: null, pwork: null, pVerManual: false };

function ensureCss() {
  if (document.getElementById('ctl-css')) return;
  const l = document.createElement('link');
  l.id = 'ctl-css'; l.rel = 'stylesheet'; l.href = '/css/content-laws.css';
  document.head.appendChild(l);
}

function normEdits(raw) {
  const r = isObj(raw) ? clone(raw) : {};
  const p = isObj(r.precedents) ? r.precedents : {};
  return {
    ...r,
    items: isObj(r.items) ? r.items : {},
    added: (Array.isArray(r.added) ? r.added : []).filter(isObj),
    removed: (Array.isArray(r.removed) ? r.removed : []).filter((x) => typeof x === 'string'),
    precedents: {
      ...p,
      edited: isObj(p.edited) ? p.edited : {},
      added: (Array.isArray(p.added) ? p.added : []).filter(isObj),
      removed: (Array.isArray(p.removed) ? p.removed : []).filter((x) => typeof x === 'string'),
    },
  };
}

const E = (s) => c.esc(s);
const lawName = (id) => { const l = lawMap.get(id); return l ? (l.short || l.name || id) : (id || '—'); };
const hasKeys = (o) => isObj(o) && Object.keys(o).length > 0;

/* ---------- ข้อมูลที่ใช้แสดง ---------- */
const isAdded = (id) => edits.added.some((a) => a.id === id);
const addedItem = (id) => edits.added.find((a) => a.id === id);
function effItem(id) {
  const a = addedItem(id);
  if (a) return { ...blankItem(), ...clone(a) };
  const b = baseMap.get(id);
  return b ? { ...clone(b), ...cleanItemPatch(edits.items[id], null), id } : null;
}
function blankItem() {
  return { id: '', section: '', name: '', category: '', kind: 'criminal', lawId: '', text: '', elements: [], penalty: '', privateOffence: false,
    compoundable: false, limitation: '', relatedSections: [], factTemplate: [], prayerTemplate: [], caution: '', source: '', verified: false };
}
// อ่านอย่างเดียว ไม่คัดลอก (ใช้กับรายการ/ตัวกรองที่วนทุกแถว)
function peek(id) {
  const a = addedItem(id);
  if (a) return a;
  const b = baseMap.get(id);
  return b ? { ...b, ...cleanItemPatch(edits.items[id], null), id } : null;
}
function flags(id) {
  const added = isAdded(id);
  const it = peek(id);
  return { added, edited: !added && hasKeys(edits.items[id]), removed: edits.removed.includes(id), unverified: !!it && it.verified !== true };
}
function badgesHtml(f) {
  return `${f.added ? '<span class="ct-badge">เพิ่มใหม่</span>' : ''}${f.edited ? '<span class="ct-badge">แก้ไขแล้ว</span>' : ''}`
    + `${f.unverified ? '<span class="ct-badge warn">ยังไม่ตรวจ</span>' : ''}${f.removed ? '<span class="ct-badge off">ลบ</span>' : ''}`;
}
function allIds() { return [...base.items.map((i) => i?.id).filter((x) => typeof x === 'string'), ...edits.added.map((a) => a.id)]; }

/* ---------- การบันทึก ---------- */
function snapshot() {
  const s = clone(edits);
  for (const k of Object.keys(s.items)) if (!hasKeys(s.items[k])) delete s.items[k];
  for (const k of Object.keys(s.precedents.edited)) if (!hasKeys(s.precedents.edited[k])) delete s.precedents.edited[k];
  return s;
}
function applyLive() {
  try {
    const d = c.data;
    if (!isObj(d)) return;
    const m = applyLawEdits(d, snapshot());
    d.items = m.items; d.precedents = m.precedents;   // ให้ตัวช่วยร่างคำฟ้องเห็นผลทันที (ต้นฉบับอยู่ที่ d.__lawBase)
  } catch { /* ข้าม */ }
}
function scheduleSave() {
  dirty = true;
  c.setState('มีการแก้ไข…');
  clearTimeout(saveT);
  saveT = setTimeout(doSave, SAVE_MS);
}
function doSave() {
  clearTimeout(saveT); saveT = null;
  if (!dirty) return saving;
  dirty = false;
  saving = saving.then(async () => {
    c.setState('กำลังบันทึก…', 'busy');
    try {
      await c.save('laws', snapshot());
      applyLive();
      c.setState(dirty ? 'มีการแก้ไข…' : 'บันทึกแล้ว', dirty ? '' : 'ok');
    } catch (e) {
      dirty = true;
      c.setState('บันทึกไม่สำเร็จ', 'err');
      c.notify?.({ type: 'error', message: 'บันทึกข้อกฎหมายไม่สำเร็จ: ' + (e?.message || e) });
    }
  });
  return saving;
}
async function flush() {
  clearTimeout(saveT); saveT = null;
  if (dirty) await doSave(); else await saving;
}

/* ---------- ส่วนประกอบ UI ---------- */
const listBlock = (name, rows, label, hint, opts = {}) => `<div class="ct-block ctl-list-block" data-block="${name}">
  <div class="ct-bh"><b>${label}</b><button type="button" class="btn sm outline" data-lw-add="${name}">+ เพิ่ม</button></div>
  ${hint ? `<p class="hint">${hint}</p>` : ''}
  <div class="ctl-rows" data-rows="${name}">${rowsHtml(name, rows, opts)}</div></div>`;

function rowsHtml(name, arr, opts = {}) {
  if (!arr.length) return '<p class="hint ctl-none">ยังไม่มีรายการ</p>';
  if (name === 'relatedSections') {
    return arr.map((r, i) => `<div class="ctl-row ctl-rel"><input type="text" data-rel="ref" data-i="${i}" value="${E(r.ref)}" placeholder="อ้างมาตรา เช่น ป.อ. มาตรา 83" aria-label="มาตราที่เกี่ยวข้อง">
      <input type="text" data-rel="why" data-i="${i}" value="${E(r.why)}" placeholder="เหตุที่เกี่ยวข้อง" aria-label="เหตุที่เกี่ยวข้อง">
      <button type="button" class="btn sm danger icon" data-lw-del="${name}:${i}" aria-label="ลบแถวนี้" title="ลบแถวนี้">✕</button></div>`).join('');
  }
  const long = !!opts.long;
  return arr.map((t, i) => `<div class="ctl-row"><span class="ctl-no">${i + 1}</span>
    ${long ? `<textarea rows="${Math.min(10, Math.max(3, Math.ceil(String(t).length / 70)))}" data-list="${name}" data-i="${i}" aria-label="ข้อที่ ${i + 1}">${E(t)}</textarea>`
      : `<input type="text" data-list="${name}" data-i="${i}" value="${E(t)}" aria-label="ข้อที่ ${i + 1}">`}
    <button type="button" class="btn sm danger icon" data-lw-del="${name}:${i}" aria-label="ลบข้อนี้" title="ลบข้อนี้">✕</button>
    ${opts.ph ? `<span class="ctl-warn" data-warn-for="${name}:${i}">${phWarn(t)}</span>` : ''}</div>`).join('');
}
function phWarn(t) {
  const o = (String(t).match(/\{\{/g) || []).length, cl = (String(t).match(/\}\}/g) || []).length;
  return o !== cl ? '⚠ วงเล็บ {{ }} ไม่ครบคู่' : '';
}

/* ---------- มุมมองข้อกฎหมาย ---------- */
function shell() {
  root.innerHTML = `<div class="ctl">
    <div class="ctl-notice" role="note"><b>⚠ ข้อมูลกฎหมายเป็นเรื่องความถูกต้อง — ตรวจกับแหล่งทางการก่อนเผยแพร่</b>
      <span>ตัวบท มาตรา และอัตราโทษต้องตรงกับราชกิจจานุเบกษา/สำนักงานคณะกรรมการกฤษฎีกา ห้ามเดาหรือแต่งข้อความกฎหมายเอง · รายการที่เพิ่มหรือแก้เนื้อหาจะถูกตั้งเป็น "ยังไม่ตรวจ" จนกว่าจะติ๊กว่าตรวจกับแหล่งอ้างอิงแล้ว · การแก้ไขมีผลกับหน้าเว็บและตัวช่วยร่างคำฟ้อง ข้อมูลต้นฉบับไม่ถูกเขียนทับ (ย้อนกลับได้)</span></div>
    <div class="ctl-views" role="tablist" aria-label="ประเภทข้อมูล">
      <button type="button" class="btn sm ${st.view === 'items' ? 'primary' : 'outline'}" role="tab" aria-selected="${st.view === 'items'}" data-lw-view="items">ข้อกฎหมาย</button>
      <button type="button" class="btn sm ${st.view === 'prec' ? 'primary' : 'outline'}" role="tab" aria-selected="${st.view === 'prec'}" data-lw-view="prec">ฎีกา</button></div>
    <div id="ctl-main"></div></div>`;
  if (st.view === 'items') itemsView(); else precView();
}

function itemsView() {
  const cats = [...new Set(base.items.map((i) => i?.category).filter(Boolean))];
  $('#ctl-main').innerHTML = `
    <div class="ct-split ctl-split">
      <div class="ctl-side">
        <div class="ctl-filters">
          <input type="search" id="ctl-q" placeholder="ค้นหา มาตรา ชื่อ หมวด หรือตัวบท" value="${E(st.q)}" aria-label="ค้นหาข้อกฎหมาย">
          <div class="ct-row2">
            <select id="ctl-law" aria-label="กรองตามกฎหมาย"><option value="">ทุกกฎหมาย</option>${laws.map((l) => `<option value="${E(l.id)}"${st.law === l.id ? ' selected' : ''}>${E(l.short || l.name || l.id)}</option>`).join('')}</select>
            <select id="ctl-kind" aria-label="กรองตามประเภท"><option value="">อาญา+แพ่ง</option><option value="criminal"${st.kind === 'criminal' ? ' selected' : ''}>อาญา</option><option value="civil"${st.kind === 'civil' ? ' selected' : ''}>แพ่ง</option></select></div>
          <select id="ctl-status" aria-label="กรองตามสถานะ">${[['', 'ทุกสถานะ'], ['edited', 'แก้ไขแล้ว'], ['added', 'เพิ่มใหม่'], ['unverified', 'ยังไม่ตรวจ'], ['removed', 'ลบ']].map(([v, t]) => `<option value="${v}"${st.status === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
          <button type="button" class="btn sm primary" data-lw-new="item">+ เพิ่มข้อกฎหมายใหม่</button>
        </div>
        <div class="ctl-count hint" id="ctl-count" aria-live="polite"></div>
        <div class="ct-list ctl-listbox" id="ctl-list"></div>
      </div>
      <div class="ctl-pane" id="ctl-pane"></div>
    </div>
    <datalist id="ctl-cats">${cats.map((x) => `<option value="${E(x)}">`).join('')}</datalist>`;
  renderList(); renderEditor();
}

function itemRowHtml(id) {
  const it = peek(id); if (!it) return '';
  const f = flags(id);
  return `<button type="button" class="ct-item ctl-item${st.sel === id ? ' on' : ''}${f.removed ? ' is-off' : ''}" data-lw-pick="${E(id)}" aria-pressed="${st.sel === id}">
    <b>${E(lawName(it.lawId))} ${it.section ? 'ม.' + E(it.section) : ''} ${E(it.name || '(ยังไม่มีชื่อ)')}</b>
    <small>${E(it.category || '')}${it.kind === 'civil' ? ' · แพ่ง' : ''}</small><span class="ctl-badges">${badgesHtml(f)}</span></button>`;
}
function filteredIds() {
  const q = st.q.trim().toLowerCase();
  const out = [];
  for (const id of allIds()) {
    const it = peek(id); if (!it) continue;
    if (st.law && it.lawId !== st.law) continue;
    if (st.kind && it.kind !== st.kind) continue;
    if (st.status) { const f = flags(id); if (!f[st.status]) continue; }
    if (q && !`${id} ${it.section} ${it.name} ${it.category} ${it.text} ${lawName(it.lawId)} ${it.penalty}`.toLowerCase().includes(q)) continue;
    out.push(id);
  }
  return out;
}
function renderList() {
  const box = $('#ctl-list'); if (!box) return;
  const ids = filteredIds();
  const shown = ids.slice(0, st.limit);
  box.innerHTML = shown.map(itemRowHtml).join('') || '<p class="empty">ไม่พบรายการที่ตรงเงื่อนไข</p>';
  if (ids.length > shown.length) box.insertAdjacentHTML('beforeend', `<button type="button" class="btn sm outline" data-lw-more="item">แสดงเพิ่ม (อีก ${ids.length - shown.length} รายการ)</button>`);
  $('#ctl-count').textContent = `พบ ${ids.length.toLocaleString('th-TH')} จาก ${allIds().length.toLocaleString('th-TH')} รายการ${ids.length > shown.length ? ` · แสดง ${shown.length}` : ''}`;
}
function refreshRow(id) {
  const old = $(`[data-lw-pick="${CSS.escape(id)}"]`);
  if (old) old.outerHTML = itemRowHtml(id);
  refreshHead();
}

function selectItem(id) {
  st.sel = id; st.work = effItem(id); st.verManual = false;
  renderEditor();
  document.querySelectorAll('#ctl-list .ct-item').forEach((b) => { const on = b.dataset.lwPick === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
}

function headHtml(id) {
  const f = flags(id), w = st.work;
  return `<div class="ct-bh"><div><h3 class="ctl-h">${E(lawName(w.lawId))} ${w.section ? 'ม.' + E(w.section) : ''} ${E(w.name || '(ยังไม่มีชื่อ)')}</h3>
    <div class="ctl-id"><code>${E(id)}</code> ${badgesHtml(f)}</div></div>
    <div class="ct-actions">
      ${f.added ? '<button type="button" class="btn sm danger" data-lw-act="delete">ลบรายการนี้ถาวร</button>'
      : `${(f.edited || f.removed) ? '<button type="button" class="btn sm outline" data-lw-act="revert">ย้อนกลับเป็นค่าเดิม</button>' : ''}
         <button type="button" class="btn sm ${f.removed ? 'primary' : 'danger'}" data-lw-act="toggle-remove">${f.removed ? 'กู้คืนรายการ' : 'ทำเครื่องหมายลบ'}</button>`}
    </div></div>
    ${f.removed ? '<p class="ctl-flag">รายการนี้ถูกซ่อน — ไม่แสดงบนเว็บไซต์และไม่ขึ้นในตัวเลือกข้อหา</p>' : ''}
    ${f.added && !(w.lawId && (w.section || w.name)) ? '<p class="ctl-flag">รายการใหม่จะมีผลเมื่อเลือกกฎหมายและกรอกมาตราหรือชื่ออย่างน้อยหนึ่งอย่าง</p>' : ''}`;
}
function refreshHead() {
  const h = $('#ctl-head'); if (h && st.sel) h.innerHTML = headHtml(st.sel);
}

function renderEditor() {
  const pane = $('#ctl-pane'); if (!pane) return;
  const w = st.work;
  if (!w) { pane.innerHTML = '<p class="empty">เลือกข้อกฎหมายจากรายการ หรือกด “+ เพิ่มข้อกฎหมายใหม่”</p>'; return; }
  const f = (name, label, val, extra = '') => `<label class="f"><span>${label}</span><input type="text" data-f="${name}" value="${E(val)}" ${extra}></label>`;
  const ta = (name, label, val, rows = 4, extra = '') => `<label class="f"><span>${label}</span><textarea data-f="${name}" rows="${rows}" ${extra}>${E(val)}</textarea></label>`;
  pane.innerHTML = `<div class="ct-editor ctl-editor" data-id="${E(w.id)}">
    <div id="ctl-head">${headHtml(w.id)}</div>
    <div class="ct-row2">${f('section', 'มาตรา (เลขอารบิก เช่น 288, 4(2))', w.section)}${f('name', 'ชื่อฐานความผิด / มูลคดี', w.name)}</div>
    <div class="ct-row2">
      <label class="f"><span>กฎหมาย</span><select data-f="lawId">${w.lawId ? '' : '<option value="">— เลือกกฎหมาย —</option>'}${laws.map((l) => `<option value="${E(l.id)}"${w.lawId === l.id ? ' selected' : ''}>${E(l.short ? l.short + ' — ' : '')}${E(l.name || l.id)}</option>`).join('')}</select></label>
      <label class="f"><span>ประเภท</span><select data-f="kind"><option value="criminal"${w.kind === 'criminal' ? ' selected' : ''}>คดีอาญา</option><option value="civil"${w.kind === 'civil' ? ' selected' : ''}>คดีแพ่ง</option></select></label></div>
    <label class="f"><span>หมวดหมู่</span><input type="text" data-f="category" list="ctl-cats" value="${E(w.category)}"></label>
    ${ta('text', 'ตัวบท / สรุปองค์ประกอบ (คัดจากแหล่งทางการเท่านั้น)', w.text, 5)}
    ${listBlock('elements', w.elements, 'องค์ประกอบความผิด / มูลคดี', 'หนึ่งบรรทัดต่อหนึ่งองค์ประกอบ')}
    <div class="ct-row2">${f('penalty', 'อัตราโทษ (เฉพาะคดีอาญา)', w.penalty)}${f('limitation', 'อายุความ', w.limitation)}</div>
    <div class="ctl-checks">
      <label class="chk"><input type="checkbox" data-f="privateOffence"${w.privateOffence ? ' checked' : ''}><span>ความผิดต่อส่วนตัว (ต้องร้องทุกข์/ฟ้องภายใน 3 เดือน)</span></label>
      <label class="chk"><input type="checkbox" data-f="compoundable"${w.compoundable ? ' checked' : ''}><span>ยอมความได้</span></label></div>
    ${listBlock('relatedSections', w.relatedSections, 'มาตราที่เกี่ยวข้อง', 'อ้างมาตราอื่นที่มักใช้ประกอบ พร้อมเหตุผลสั้น ๆ')}
    ${listBlock('factTemplate', w.factTemplate, 'ร่างข้อเท็จจริงในคำฟ้อง (ย่อหน้า)', 'ใช้ <code>{{ชื่อช่อง}}</code> แทนข้อมูลที่ผู้ใช้กรอก เช่น <code>{{วันเวลาเกิดเหตุ}}</code> · ตัวแปรระบบ <code>{{โจทก์}}</code> <code>{{จำเลย}}</code> <code>{{ศาล}}</code> <code>{{มาตรา}}</code> · ห้ามใส่ข้อเท็จจริงของบุคคลจริง', { long: true, ph: true })}
    ${listBlock('prayerTemplate', w.prayerTemplate, 'ร่างคำขอท้ายฟ้อง', 'ข้อความต่อจาก “ขอให้…”', { long: true, ph: true })}
    ${ta('caution', 'ข้อควรระวัง (ไม่เกิน 2 ประโยค)', w.caution, 3)}
    ${f('source', 'แหล่งอ้างอิง (URL หรือชื่อกฎหมาย/ฉบับที่ใช้ตรวจ)', w.source, 'placeholder="https://www.krisdika.go.th/…"')}
    <label class="chk ctl-verified"><input type="checkbox" data-f="verified"${w.verified ? ' checked' : ''}><span><b>ตรวจกับแหล่งทางการแล้ว</b> — ติ๊กเมื่อได้เทียบเลขมาตรา ตัวบท และอัตราโทษกับแหล่งอ้างอิงด้านบนแล้วเท่านั้น</span></label>
    <p class="hint ctl-vernote" id="ctl-vernote" hidden>เนื้อหาถูกแก้ จึงยกเลิกเครื่องหมาย “ตรวจแล้ว” ให้โดยอัตโนมัติ — ติ๊กกลับเองเมื่อตรวจแล้ว</p>
  </div>`;
}

/* ---------- บันทึกการเปลี่ยนแปลงของข้อกฎหมายที่เปิดอยู่ ---------- */
function commitItem() {
  const id = st.sel, w = st.work;
  if (!id || !w) return;
  if (isAdded(id)) {
    const i = edits.added.findIndex((a) => a.id === id);
    edits.added[i] = { id, ...cleanItemPatch(w, null) };
  } else {
    const p = diffItem(baseMap.get(id), w);
    if (hasKeys(p)) edits.items[id] = p; else delete edits.items[id];
  }
  refreshRow(id);
  scheduleSave();
}
function touchItem(field) {
  const w = st.work;
  if (field !== 'verified' && w.verified && !st.verManual) {
    w.verified = false;
    const cb = $('[data-f="verified"]'); if (cb) cb.checked = false;
    const n = $('#ctl-vernote'); if (n) n.hidden = false;
  }
}

function newId() {
  for (let i = 0; i < 20; i++) {
    const id = 'custom-' + Math.random().toString(36).slice(2, 8);
    if (!allIds().includes(id)) return id;
  }
  return 'custom-' + Date.now().toString(36);
}

async function itemAction(act) {
  const id = st.sel; if (!id) return;
  if (act === 'toggle-remove') {
    if (edits.removed.includes(id)) edits.removed = edits.removed.filter((x) => x !== id);
    else {
      if (!(await c.confirmBox('ซ่อนรายการนี้จากเว็บไซต์และตัวช่วยร่างคำฟ้อง? (กู้คืนได้ภายหลัง ข้อมูลต้นฉบับไม่ถูกลบ)', { title: 'ทำเครื่องหมายลบ', okText: 'ซ่อนรายการ', danger: true }))) return;
      edits.removed.push(id);
    }
  } else if (act === 'revert') {
    if (!(await c.confirmBox('ย้อนกลับรายการนี้เป็นค่าเดิมทั้งหมด? การแก้ไขของคุณในรายการนี้จะหายไป', { title: 'ย้อนกลับเป็นค่าเดิม', okText: 'ย้อนกลับ', danger: true }))) return;
    delete edits.items[id]; edits.removed = edits.removed.filter((x) => x !== id);
  } else if (act === 'delete') {
    if (!(await c.confirmBox('ลบรายการที่เพิ่มเองนี้ถาวร? ไม่สามารถกู้คืนได้', { title: 'ลบถาวร', okText: 'ลบถาวร', danger: true }))) return;
    edits.added = edits.added.filter((a) => a.id !== id);
    st.sel = null; st.work = null;
    scheduleSave(); renderList(); renderEditor();
    return;
  }
  st.work = effItem(id); st.verManual = false;
  scheduleSave(); refreshRow(id); renderEditor();
}

function newItem() {
  const id = newId();
  const lawId = st.law || laws[0]?.id || '';
  const kind = st.kind || 'criminal';
  edits.added.push({ ...blankItem(), id, lawId, kind, section: '', name: '' });
  st.status = ''; st.q = ''; st.limit = PAGE;
  const q = $('#ctl-q'); if (q) q.value = '';
  const s = $('#ctl-status'); if (s) s.value = '';
  renderList();
  selectItem(id);
  const list = $('#ctl-list'); if (list) list.scrollTop = 0;
  $('#ctl-pane [data-f="name"]')?.focus();
  scheduleSave();
}

/* ---------- มุมมองฎีกา ---------- */
const pAddedIdx = (k) => (k.startsWith('add:') ? +k.slice(4) : -1);
function precEff(k) {
  const ai = pAddedIdx(k);
  if (ai >= 0) return edits.precedents.added[ai] ? { itemId: '', year: '', topic: '', holding: '', relevance: '', source: '', verified: false, ...clone(edits.precedents.added[ai]) } : null;
  const b = base.precedents.find((p) => keyOf(p) === k);
  return b ? { ...clone(b), ...cleanPrecPatch({ ...edits.precedents.edited[k], caseNo: undefined }) } : null;
}
function precFlags(k) {
  const added = pAddedIdx(k) >= 0, p = precEff(k);
  return { added, edited: !added && hasKeys(edits.precedents.edited[k]), removed: !added && edits.precedents.removed.includes(k), unverified: !!p && p.verified !== true };
}
function precKeys() { return [...base.precedents.filter(isObj).map((p) => keyOf(p)), ...edits.precedents.added.map((_, i) => 'add:' + i)]; }

function precView() {
  $('#ctl-main').innerHTML = `
    <div class="ct-split ctl-split">
      <div class="ctl-side">
        <div class="ctl-filters">
          <input type="search" id="ctl-pq" placeholder="ค้นหา เลขฎีกา หัวข้อ หรือข้อสรุป" value="${E(st.pq)}" aria-label="ค้นหาฎีกา">
          <select id="ctl-pstatus" aria-label="กรองตามสถานะ">${[['', 'ทุกสถานะ'], ['edited', 'แก้ไขแล้ว'], ['added', 'เพิ่มใหม่'], ['unverified', 'ยังไม่ตรวจ'], ['removed', 'ลบ']].map(([v, t]) => `<option value="${v}"${st.pstatus === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
          <button type="button" class="btn sm primary" data-lw-new="prec">+ เพิ่มฎีกาใหม่</button>
        </div>
        <div class="ctl-count hint" id="ctl-count" aria-live="polite"></div>
        <div class="ct-list ctl-listbox" id="ctl-list"></div>
      </div>
      <div class="ctl-pane" id="ctl-pane"></div>
    </div>
    <datalist id="ctl-itemids">${base.items.filter((i) => i?.id).map((i) => `<option value="${E(i.id)}">${E(lawName(i.lawId))} ม.${E(i.section)} ${E(i.name)}</option>`).join('')}</datalist>`;
  renderPrecList(); renderPrecEditor();
}
function precRowHtml(k) {
  const p = precEff(k); if (!p) return '';
  const f = precFlags(k);
  return `<button type="button" class="ct-item ctl-item${st.psel === k ? ' on' : ''}${f.removed ? ' is-off' : ''}" data-lw-ppick="${E(k)}" aria-pressed="${st.psel === k}">
    <b>${E(p.caseNo || '(ยังไม่มีเลขฎีกา)')}</b><small>${E(p.topic || p.holding || '')}</small><span class="ctl-badges">${badgesHtml(f)}</span></button>`;
}
function renderPrecList() {
  const box = $('#ctl-list'); if (!box) return;
  const q = st.pq.trim().toLowerCase();
  const ids = precKeys().filter((k) => {
    const p = precEff(k); if (!p) return false;
    if (st.pstatus && !precFlags(k)[st.pstatus]) return false;
    return !q || `${p.caseNo} ${p.topic} ${p.holding} ${p.itemId}`.toLowerCase().includes(q);
  });
  const shown = ids.slice(0, st.plimit);
  box.innerHTML = shown.map(precRowHtml).join('') || '<p class="empty">ไม่พบฎีกาที่ตรงเงื่อนไข</p>';
  if (ids.length > shown.length) box.insertAdjacentHTML('beforeend', `<button type="button" class="btn sm outline" data-lw-more="prec">แสดงเพิ่ม (อีก ${ids.length - shown.length} รายการ)</button>`);
  $('#ctl-count').textContent = `พบ ${ids.length.toLocaleString('th-TH')} จาก ${precKeys().length.toLocaleString('th-TH')} รายการ`;
}
function precHead(k) {
  const f = precFlags(k), w = st.pwork;
  return `<div class="ct-bh"><div><h3 class="ctl-h">${E(w.caseNo || '(ยังไม่มีเลขฎีกา)')}</h3><div class="ctl-id">${badgesHtml(f)}</div></div>
    <div class="ct-actions">${f.added ? '<button type="button" class="btn sm danger" data-lw-pact="delete">ลบรายการนี้ถาวร</button>'
    : `${(f.edited || f.removed) ? '<button type="button" class="btn sm outline" data-lw-pact="revert">ย้อนกลับเป็นค่าเดิม</button>' : ''}
       <button type="button" class="btn sm ${f.removed ? 'primary' : 'danger'}" data-lw-pact="toggle-remove">${f.removed ? 'กู้คืนรายการ' : 'ทำเครื่องหมายลบ'}</button>`}</div></div>
    ${f.removed ? '<p class="ctl-flag">ฎีกานี้ถูกซ่อน — ไม่แสดงในตัวช่วยร่างคำฟ้อง</p>' : ''}
    ${f.added && !(w.caseNo && (w.topic || w.holding)) ? '<p class="ctl-flag">ฎีกาใหม่จะมีผลเมื่อกรอกเลขฎีกาและหัวข้อหรือข้อสรุปอย่างน้อยหนึ่งอย่าง</p>' : ''}`;
}
function renderPrecEditor() {
  const pane = $('#ctl-pane'); if (!pane) return;
  const w = st.pwork;
  if (!w) { pane.innerHTML = '<p class="empty">เลือกฎีกาจากรายการ หรือกด “+ เพิ่มฎีกาใหม่”</p>'; return; }
  const k = st.psel, add = pAddedIdx(k) >= 0;
  const f = (name, label, val, extra = '') => `<label class="f"><span>${label}</span><input type="text" data-pf="${name}" value="${E(val ?? '')}" ${extra}></label>`;
  const ta = (name, label, val, rows) => `<label class="f"><span>${label}</span><textarea data-pf="${name}" rows="${rows}">${E(val ?? '')}</textarea></label>`;
  pane.innerHTML = `<div class="ct-editor ctl-editor">
    <div id="ctl-head">${precHead(k)}</div>
    <div class="ct-row2">${f('caseNo', 'เลขฎีกา (เช่น ฎีกาที่ 1234/2565)', w.caseNo, add ? '' : 'readonly')}${f('year', 'ปี พ.ศ.', w.year, 'inputmode="numeric"')}</div>
    ${f('itemId', 'เชื่อมกับข้อกฎหมาย (รหัสรายการ เช่น pc-288)', w.itemId, 'list="ctl-itemids"')}
    ${ta('topic', 'หัวข้อ', w.topic, 2)}
    ${ta('holding', 'ข้อสรุปคำวินิจฉัย (สรุปจากต้นฉบับจริงเท่านั้น)', w.holding, 5)}
    ${ta('relevance', 'ใช้ประกอบอย่างไร', w.relevance, 3)}
    ${f('source', 'แหล่งอ้างอิง (URL)', w.source, 'placeholder="https://deka.supremecourt.or.th/…"')}
    <label class="chk ctl-verified"><input type="checkbox" data-pf="verified"${w.verified ? ' checked' : ''}><span><b>ตรวจกับต้นฉบับแล้ว</b> — ติ๊กเมื่อได้เทียบเลขฎีกาและข้อสรุปกับแหล่งอ้างอิงแล้วเท่านั้น</span></label>
    <p class="hint ctl-vernote" id="ctl-vernote" hidden>เนื้อหาถูกแก้ จึงยกเลิกเครื่องหมาย “ตรวจแล้ว” ให้โดยอัตโนมัติ — ติ๊กกลับเองเมื่อตรวจแล้ว</p>
  </div>`;
}
function selectPrec(k) {
  st.psel = k; st.pwork = precEff(k); st.pVerManual = false;
  renderPrecEditor();
  document.querySelectorAll('#ctl-list .ct-item').forEach((b) => { const on = b.dataset.lwPpick === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
}
function commitPrec() {
  const k = st.psel, w = st.pwork; if (!k || !w) return;
  const ai = pAddedIdx(k);
  if (ai >= 0) edits.precedents.added[ai] = cleanPrecPatch(w);
  else {
    const p = diffPrecedent(base.precedents.find((x) => keyOf(x) === k), w);
    if (hasKeys(p)) edits.precedents.edited[k] = p; else delete edits.precedents.edited[k];
  }
  const old = $(`[data-lw-ppick="${CSS.escape(k)}"]`); if (old) old.outerHTML = precRowHtml(k);
  const h = $('#ctl-head'); if (h) h.innerHTML = precHead(k);
  scheduleSave();
}
async function precAction(act) {
  const k = st.psel; if (!k) return;
  const ed = edits.precedents;
  if (act === 'toggle-remove') {
    if (ed.removed.includes(k)) ed.removed = ed.removed.filter((x) => x !== k);
    else {
      if (!(await c.confirmBox('ซ่อนฎีกานี้จากตัวช่วยร่างคำฟ้อง? (กู้คืนได้ภายหลัง)', { title: 'ทำเครื่องหมายลบ', okText: 'ซ่อน', danger: true }))) return;
      ed.removed.push(k);
    }
  } else if (act === 'revert') {
    if (!(await c.confirmBox('ย้อนกลับฎีกานี้เป็นค่าเดิมทั้งหมด?', { title: 'ย้อนกลับเป็นค่าเดิม', okText: 'ย้อนกลับ', danger: true }))) return;
    delete ed.edited[k]; ed.removed = ed.removed.filter((x) => x !== k);
  } else if (act === 'delete') {
    if (!(await c.confirmBox('ลบฎีกาที่เพิ่มเองนี้ถาวร? ไม่สามารถกู้คืนได้', { title: 'ลบถาวร', okText: 'ลบถาวร', danger: true }))) return;
    ed.added.splice(pAddedIdx(k), 1);
    st.psel = null; st.pwork = null;
    scheduleSave(); renderPrecList(); renderPrecEditor();
    return;
  }
  st.pwork = precEff(k); st.pVerManual = false;
  scheduleSave(); renderPrecList(); renderPrecEditor();
}
function newPrec() {
  edits.precedents.added.push({ caseNo: '', year: '', topic: '', holding: '', relevance: '', source: '', itemId: '', verified: false });
  st.pstatus = ''; st.pq = '';
  renderPrecList();
  selectPrec('add:' + (edits.precedents.added.length - 1));
  $('#ctl-pane [data-pf="caseNo"]')?.focus();
  scheduleSave();
}

/* ---------- เหตุการณ์ (delegation ภายในกล่องของแท็บนี้เอง) ---------- */
const $ = (s, r = root) => r?.querySelector(s);

function onInput(e) {
  const t = e.target;
  if (t.id === 'ctl-q') { st.q = t.value; st.limit = PAGE; return renderList(); }
  if (t.id === 'ctl-pq') { st.pq = t.value; st.plimit = PAGE; return renderPrecList(); }
  if (st.view === 'items' && st.work) {
    if (t.dataset.f && t.type !== 'checkbox' && t.tagName !== 'SELECT') { st.work[t.dataset.f] = t.value; touchItem(t.dataset.f); return commitItem(); }
    if (t.dataset.list) {
      const arr = st.work[t.dataset.list]; arr[+t.dataset.i] = t.value; touchItem(t.dataset.list);
      const w = $(`[data-warn-for="${t.dataset.list}:${t.dataset.i}"]`); if (w) w.textContent = phWarn(t.value);
      return commitItem();
    }
    if (t.dataset.rel) { st.work.relatedSections[+t.dataset.i][t.dataset.rel] = t.value; touchItem('relatedSections'); return commitItem(); }
  }
  if (st.view === 'prec' && st.pwork && t.dataset.pf && t.type !== 'checkbox') {
    st.pwork[t.dataset.pf] = t.value;
    if (t.dataset.pf !== 'verified' && st.pwork.verified && !st.pVerManual) {
      st.pwork.verified = false; const cb = $('[data-pf="verified"]'); if (cb) cb.checked = false;
      const n = $('#ctl-vernote'); if (n) n.hidden = false;
    }
    commitPrec();
  }
}
function onChange(e) {
  const t = e.target;
  if (t.id === 'ctl-law') { st.law = t.value; st.limit = PAGE; return renderList(); }
  if (t.id === 'ctl-kind') { st.kind = t.value; st.limit = PAGE; return renderList(); }
  if (t.id === 'ctl-status') { st.status = t.value; st.limit = PAGE; return renderList(); }
  if (t.id === 'ctl-pstatus') { st.pstatus = t.value; st.plimit = PAGE; return renderPrecList(); }
  if (st.view === 'items' && st.work && t.dataset.f && (t.type === 'checkbox' || t.tagName === 'SELECT')) {
    const f = t.dataset.f;
    st.work[f] = t.type === 'checkbox' ? t.checked : t.value;
    if (f === 'verified') st.verManual = true; else touchItem(f);
    return commitItem();
  }
  if (st.view === 'prec' && st.pwork && t.dataset.pf === 'verified') { st.pwork.verified = t.checked; st.pVerManual = true; commitPrec(); }
}
function onClick(e) {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.lwView) { st.view = d.lwView; return shell(); }
  if (d.lwPick) return selectItem(d.lwPick);
  if (d.lwPpick) return selectPrec(d.lwPpick);
  if (d.lwMore === 'item') { st.limit += PAGE; return renderList(); }
  if (d.lwMore === 'prec') { st.plimit += PAGE; return renderPrecList(); }
  if (d.lwNew === 'item') return newItem();
  if (d.lwNew === 'prec') return newPrec();
  if (d.lwAct) return itemAction(d.lwAct);
  if (d.lwPact) return precAction(d.lwPact);
  if (d.lwAdd && st.work) {
    const n = d.lwAdd;
    st.work[n].push(n === 'relatedSections' ? { ref: '', why: '' } : '');
    touchItem(n);
    const rows = $(`[data-rows="${n}"]`); rows.innerHTML = rowsHtml(n, st.work[n], LISTOPTS[n]);
    (rows.querySelector('.ctl-row:last-child input, .ctl-row:last-child textarea'))?.focus();
    return commitItem();
  }
  if (d.lwDel && st.work) {
    const [n, i] = d.lwDel.split(':');
    st.work[n].splice(+i, 1);
    touchItem(n);
    $(`[data-rows="${n}"]`).innerHTML = rowsHtml(n, st.work[n], LISTOPTS[n]);
    return commitItem();
  }
}
const LISTOPTS = { elements: {}, relatedSections: {}, factTemplate: { long: true, ph: true }, prayerTemplate: { long: true, ph: true } };

export default {
  id: 'laws',
  label: 'ข้อกฎหมาย',
  hint: 'แก้ เพิ่ม หรือซ่อนข้อกฎหมายและฎีกา — ไม่เขียนทับข้อมูลต้นฉบับ ย้อนกลับได้',
  async mount(box, ctx) {
    c = ctx; ensureCss();
    const d = isObj(ctx.data) ? ctx.data : {};
    // เก็บ "ต้นฉบับ" ไว้เทียบ/ย้อนกลับ (ถ้าข้อมูลที่โหลดผสานแล้ว จะมี __lawBase มาให้อยู่แล้ว)
    if (!d.__lawBase && isObj(ctx.data)) Object.defineProperty(d, '__lawBase', { value: { items: d.items || [], precedents: d.precedents || [] }, enumerable: false, configurable: true, writable: true });
    base = d.__lawBase || { items: [], precedents: [] };
    base = { items: Array.isArray(base.items) ? base.items : [], precedents: Array.isArray(base.precedents) ? base.precedents : [] };
    laws = (Array.isArray(d.laws) ? d.laws : []).filter((l) => l && typeof l.id === 'string');
    lawMap = new Map(laws.map((l) => [l.id, l]));
    baseMap = new Map(base.items.filter((i) => i && typeof i.id === 'string').map((i) => [i.id, i]));
    keyOf = precedentKeys(base.precedents);
    box.innerHTML = '<div class="boot"><div class="boot-logo-wrap"><div class="spinner" aria-hidden="true"></div></div><p>กำลังโหลดการแก้ไข…</p></div>';
    let raw = {};
    try { raw = await ctx.load('laws'); } catch (e) { box.innerHTML = `<p class="empty">โหลดข้อมูลการแก้ไขไม่สำเร็จ: ${ctx.esc(e.message || e)}</p>`; return; }
    edits = normEdits(raw);
    dirty = false; saving = Promise.resolve(); clearTimeout(saveT);
    Object.assign(st, { view: 'items', q: '', law: '', kind: '', status: '', limit: PAGE, sel: null, work: null, pq: '', pstatus: '', plimit: PAGE, psel: null, pwork: null });
    // กล่องย่อยของแท็บนี้เอง: ผูกเหตุการณ์ไว้ที่นี่ที่เดียว (หายไปพร้อมกล่องเมื่อสลับแท็บ ไม่ผูกกับ document)
    const inner = document.createElement('div');
    inner.className = 'ctl-root';
    box.replaceChildren(inner);
    root = inner;
    shell();
    inner.addEventListener('input', onInput);
    inner.addEventListener('change', onChange);
    inner.addEventListener('click', onClick);
    ctx.setState('');
  },
  async unmount() {
    await flush();
    root = null;
  },
};
