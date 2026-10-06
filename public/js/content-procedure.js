// แท็บ "ขั้นตอนฟ้องคดี" ของหน้าจัดการเนื้อหา — แก้/เพิ่ม/ซ่อน ขั้นตอนฟ้องคดี · ค่าธรรมเนียม · มาตราวิธีพิจารณาความอาญา-แพ่ง
// เก็บเป็นชั้น "การแก้ไข" (content key 'procedure') ผสานทับ data/procedure.json ตอนโหลด — ดูรูปแบบที่ /shared/procedure-merge.js
// สัญญาโมดูลแท็บ: export default { id, label, hint, mount(box, ctx), unmount() } (ดู content-admin.js)
// หมายเหตุ: หน้าเว็บสาธารณะ /procedure/ สร้างตอน deploy (ข้อมูลที่แก้จะขึ้นหน้าสถิตเมื่อ build รอบถัดไป) ส่วนตัวช่วยร่างในระบบเห็นผลทันที
import { applyProcedureEdits, diffFields, cleanStep, cleanFee, cleanSection, FEE_FIELDS, SECTION_FIELDS } from '/shared/procedure-merge.js';
import { icon } from './icons.js';
import { inlineLoading } from './loading.js';

const PAGE = 150, SAVE_MS = 700;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const hasKeys = (o) => isObj(o) && Object.keys(o).length > 0;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

let c = null, root = null, saveT = null, saving = Promise.resolve(), dirty = false;
let base = { sections: [], fees: { items: [] }, criminalCasePath: { steps: [] }, laws: [] };
let edits = null;
const st = { view: 'steps', q: '', status: '', limit: PAGE, sel: null, work: null, verManual: false, steps: [], stepsVer: new Set() };

const E = (s) => c.esc(s ?? '');
const $ = (s, r = root) => r?.querySelector(s);
const baseSteps = () => (Array.isArray(base.criminalCasePath) ? base.criminalCasePath : base.criminalCasePath?.steps) || [];
const lawName = (id) => { const l = (base.laws || []).find((x) => x.id === id); return l ? (l.short || l.name || id) : (id || '—'); };

/* ---------- ชุดข้อมูลแบบมีรหัส (ค่าธรรมเนียม / มาตรา) ---------- */
const COLL = {
  fees: {
    label: 'ค่าธรรมเนียม', list: () => base.fees?.items || [], fields: FEE_FIELDS, clean: cleanFee,
    blank: () => ({ id: '', title: '', detail: '', ref: '', source: '', caution: '', verified: false }),
    ready: (w) => !!(w.title || '').trim() && !!(w.detail || '').trim(), readyMsg: 'รายการใหม่จะมีผลเมื่อกรอกหัวข้อและรายละเอียด',
    name: (it) => it.title || '(ยังไม่มีหัวข้อ)', sub: (it) => it.ref || '',
    form: [['title', 'หัวข้อ', 'text'], ['detail', 'รายละเอียด (คัดจากแหล่งทางการเท่านั้น)', 'area', 5], ['ref', 'อ้างอิง (เช่น ป.วิ.อ. มาตรา 252)', 'text'], ['caution', 'ข้อควรระวัง', 'area', 2], ['source', 'แหล่งอ้างอิง (URL หรือชื่อกฎหมาย)', 'text']],
  },
  sections: {
    label: 'มาตราวิธีพิจารณา', list: () => base.sections || [], fields: SECTION_FIELDS, clean: cleanSection,
    blank: () => ({ id: '', law: '', section: '', title: '', summary: '', caution: '', source: '', verified: false }),
    ready: (w) => !!(w.law || '').trim() && !!(w.section || '').trim() && !!(w.title || '').trim(), readyMsg: 'รายการใหม่จะมีผลเมื่อเลือกกฎหมาย กรอกมาตรา และหัวข้อ',
    name: (it) => `${lawName(it.law)} ม.${it.section || ''} ${it.title || '(ยังไม่มีหัวข้อ)'}`, sub: (it) => it.summary || '',
    form: [['law', 'กฎหมาย', 'law'], ['section', 'มาตรา (เช่น 165, 2(4))', 'text'], ['title', 'หัวข้อ', 'text'], ['summary', 'สาระสำคัญ (สรุปจากตัวบทจริงเท่านั้น)', 'area', 5], ['caution', 'ข้อควรระวัง', 'area', 2], ['source', 'แหล่งอ้างอิง (URL)', 'text']],
  },
};
const V = () => COLL[st.view];
const ed = (view = st.view) => edits[view];
const isAdded = (id) => ed().added.some((a) => a.id === id);
const baseOf = (id) => V().list().find((x) => x?.id === id);
function peek(id, view = st.view) {
  const a = edits[view].added.find((x) => x.id === id);
  if (a) return a;
  const b = COLL[view].list().find((x) => x?.id === id);
  return b ? { ...b, ...COLL[view].clean(edits[view].edited[id]), id } : null;
}
const effItem = (id) => { const p = peek(id); return p ? { ...V().blank(), ...clone(p) } : null; };
const allIds = () => [...V().list().map((x) => x?.id).filter((x) => typeof x === 'string'), ...ed().added.map((a) => a.id)];
function flags(id) {
  const added = isAdded(id), it = peek(id);
  return { added, edited: !added && hasKeys(ed().edited[id]), removed: ed().removed.includes(id), unverified: !!it && it.verified !== true };
}
const badges = (f) => `${f.added ? '<span class="ct-badge">เพิ่มใหม่</span>' : ''}${f.edited ? '<span class="ct-badge">แก้ไขแล้ว</span>' : ''}${f.unverified ? '<span class="ct-badge warn">ยังไม่ตรวจ</span>' : ''}${f.removed ? '<span class="ct-badge off">ลบ</span>' : ''}`;

/* ---------- การบันทึก ---------- */
function snapshot() {
  const s = clone(edits);
  for (const v of ['fees', 'sections']) for (const k of Object.keys(s[v].edited)) if (!hasKeys(s[v].edited[k])) delete s[v].edited[k];
  if (s.path && !Object.keys(s.path).length) delete s.path;
  return s;
}
function applyLive() {
  try {
    const d = c.data;
    if (isObj(d) && isObj(d.procedure)) d.procedure = applyProcedureEdits(d.procedure, snapshot()); // ตัวช่วยร่างในระบบเห็นผลทันที (ต้นฉบับอยู่ที่ __procBase)
  } catch { /* ข้าม */ }
}
function scheduleSave() { dirty = true; c.setState('มีการแก้ไข…'); clearTimeout(saveT); saveT = setTimeout(doSave, SAVE_MS); }
function doSave() {
  clearTimeout(saveT); saveT = null;
  if (!dirty) return saving;
  dirty = false;
  saving = saving.then(async () => {
    c.setState('กำลังบันทึก…', 'busy');
    try {
      await c.save('procedure', snapshot());
      applyLive();
      c.setState(dirty ? 'มีการแก้ไข…' : 'บันทึกแล้ว', dirty ? '' : 'ok');
    } catch (e) {
      dirty = true;
      c.setState('บันทึกไม่สำเร็จ', 'err');
      c.notify?.({ type: 'error', message: 'บันทึกไม่สำเร็จ: ' + (e?.message || e) });
    }
  });
  return saving;
}
async function flush() { clearTimeout(saveT); saveT = null; if (dirty) await doSave(); else await saving; }

/* ---------- โครงหน้า ---------- */
function shell() {
  const tabs = [['steps', 'ขั้นตอนฟ้องคดี'], ['fees', 'ค่าธรรมเนียม'], ['sections', 'มาตราวิธีพิจารณา']];
  root.innerHTML = `<div class="ctl">
    <div class="ctl-notice" role="note"><b>${icon('alert')} ข้อมูลกฎหมายเป็นเรื่องความถูกต้อง — ตรวจกับแหล่งทางการก่อนเผยแพร่</b>
      <span>ขั้นตอนฟ้องคดี ค่าธรรมเนียม และสาระของมาตราต้องตรงกับตัวบทฉบับปัจจุบัน ห้ามเดาหรือแต่งเอง · รายการที่แก้เนื้อหาจะถูกตั้งเป็น "ยังไม่ตรวจ" จนกว่าจะติ๊กว่าตรวจกับแหล่งอ้างอิงแล้ว · ข้อมูลต้นฉบับไม่ถูกเขียนทับ (ย้อนกลับได้) · หน้าเว็บสาธารณะ /procedure/ จะอัปเดตเมื่อ deploy รอบถัดไป</span></div>
    <div class="ctl-views" role="tablist" aria-label="ประเภทข้อมูล">${tabs.map(([k, t]) => `<button type="button" class="btn sm ${st.view === k ? 'primary' : 'outline'}" role="tab" aria-selected="${st.view === k}" data-pr-view="${k}">${t}</button>`).join('')}</div>
    <div id="ctl-main"></div></div>`;
  if (st.view === 'steps') stepsView(); else collView();
}

/* ---------- ขั้นตอนฟ้องคดี ---------- */
function curPath() {
  const bp = isObj(base.criminalCasePath) ? base.criminalCasePath : {};
  const p = edits.path || {};
  return { title: p.title ?? bp.title ?? '', note: p.note ?? bp.note ?? '' };
}
function loadSteps() {
  const src = Array.isArray(edits.path?.steps) ? edits.path.steps : baseSteps();
  st.steps = src.filter(isObj).map((s) => ({ title: '', detail: '', ref: '', ...cleanStep(s), verified: s.verified === true }));
}
const renum = () => st.steps.forEach((s, i) => { if (/^\d+\.\s*/.test(s.title)) s.title = s.title.replace(/^\d+\.\s*/, `${i + 1}. `); });
function stepCard(s, i) {
  const n = st.steps.length;
  return `<div class="ct-block pr-step" data-i="${i}">
    <div class="ct-bh"><b>ขั้นที่ ${i + 1}</b><span class="ct-actions">
      <button type="button" class="btn sm outline icon" data-pr-mv="${i}:-1" aria-label="เลื่อนขึ้น" ${i === 0 ? 'disabled' : ''}>${icon('arrowUp')}</button>
      <button type="button" class="btn sm outline icon" data-pr-mv="${i}:1" aria-label="เลื่อนลง" ${i === n - 1 ? 'disabled' : ''}>${icon('arrowDown')}</button>
      <button type="button" class="btn sm danger icon" data-pr-sdel="${i}" aria-label="ลบขั้นนี้" title="ลบขั้นนี้">${icon('x')}</button></span></div>
    <label class="f"><span>หัวข้อขั้นตอน</span><input type="text" data-sf="title" data-i="${i}" value="${E(s.title)}"></label>
    <label class="f"><span>รายละเอียด</span><textarea data-sf="detail" data-i="${i}" rows="${Math.min(10, Math.max(3, Math.ceil(s.detail.length / 70)))}">${E(s.detail)}</textarea></label>
    <label class="f"><span>อ้างอิงมาตรา</span><input type="text" data-sf="ref" data-i="${i}" value="${E(s.ref)}" placeholder="เช่น ป.วิ.อ. มาตรา 158, 159"></label>
    <label class="chk ctl-verified"><input type="checkbox" data-sf="verified" data-i="${i}"${s.verified ? ' checked' : ''}><span><b>ตรวจกับแหล่งทางการแล้ว</b></span></label></div>`;
}
function stepsView() {
  loadSteps();
  const p = curPath(), changed = hasKeys(edits.path);
  $('#ctl-main').innerHTML = `<div class="ct-editor ctl-editor">
    <div class="ct-bh"><div><h3 class="ctl-h">ขั้นตอนฟ้องคดีอาญาโดยราษฎร</h3><div class="ctl-id">${changed ? '<span class="ct-badge">แก้ไขแล้ว</span>' : ''}</div></div>
      <div class="ct-actions">${changed ? '<button type="button" class="btn sm outline" data-pr-act="revert-path">ย้อนกลับเป็นค่าเดิม</button>' : ''}<button type="button" class="btn sm primary" data-pr-act="add-step">${icon('plus')}เพิ่มขั้นตอน</button></div></div>
    <label class="f"><span>ชื่อหัวข้อ</span><input type="text" data-pf="title" value="${E(p.title)}"></label>
    <label class="f"><span>หมายเหตุใต้หัวข้อ</span><textarea data-pf="note" rows="2">${E(p.note)}</textarea></label>
    <div id="pr-steps">${st.steps.map(stepCard).join('') || '<p class="empty">ยังไม่มีขั้นตอน</p>'}</div></div>`;
}
function commitPath() {
  const bp = isObj(base.criminalCasePath) ? base.criminalCasePath : {};
  const p = edits.path || {};
  const cleanSteps = st.steps.map((s) => ({ title: s.title, detail: s.detail, ref: s.ref, verified: s.verified === true }));
  const baseCmp = baseSteps().map((s) => ({ title: s.title ?? '', detail: s.detail ?? '', ref: s.ref ?? '', verified: s.verified === true }));
  if (same(cleanSteps, baseCmp)) delete p.steps; else p.steps = cleanSteps;
  edits.path = p;
  for (const k of ['title', 'note']) if (p[k] !== undefined && p[k] === (bp[k] ?? '')) delete p[k];
  if (!Object.keys(p).length) delete edits.path;
  scheduleSave();
}
function rerenderSteps() { const box = $('#pr-steps'); if (box) box.innerHTML = st.steps.map(stepCard).join('') || '<p class="empty">ยังไม่มีขั้นตอน</p>'; }

/* ---------- ค่าธรรมเนียม / มาตรา ---------- */
function collView() {
  const status = [['', 'ทุกสถานะ'], ['edited', 'แก้ไขแล้ว'], ['added', 'เพิ่มใหม่'], ['unverified', 'ยังไม่ตรวจ'], ['removed', 'ลบ']];
  $('#ctl-main').innerHTML = `
    <div class="ct-split ctl-split">
      <div class="ctl-side">
        <div class="ctl-filters">
          <input type="search" id="ctl-q" placeholder="ค้นหา${V().label}" value="${E(st.q)}" aria-label="ค้นหา">
          <select id="ctl-status" aria-label="กรองตามสถานะ">${status.map(([v, t]) => `<option value="${v}"${st.status === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
          <button type="button" class="btn sm primary" data-pr-act="new">${icon('plus')}เพิ่มรายการใหม่</button>
        </div>
        ${st.view === 'fees' ? `<label class="f"><span>หมายเหตุใต้หัวข้อค่าธรรมเนียม</span><textarea data-pf="feesNote" rows="3">${E(edits.fees.note ?? base.fees?.note ?? '')}</textarea></label>` : ''}
        <div class="ctl-count hint" id="ctl-count" aria-live="polite"></div>
        <div class="ct-list ctl-listbox" id="ctl-list"></div>
      </div>
      <div class="ctl-pane" id="ctl-pane"></div>
    </div>`;
  renderList(); renderEditor();
}
function rowHtml(id) {
  const it = peek(id); if (!it) return '';
  const f = flags(id);
  return `<button type="button" class="ct-item ctl-item${st.sel === id ? ' on' : ''}${f.removed ? ' is-off' : ''}" data-pr-pick="${E(id)}" aria-pressed="${st.sel === id}">
    <b>${E(V().name(it))}</b><small>${E(String(V().sub(it)).slice(0, 80))}</small><span class="ctl-badges">${badges(f)}</span></button>`;
}
function filteredIds() {
  const q = st.q.trim().toLowerCase(), out = [];
  for (const id of allIds()) {
    const it = peek(id); if (!it) continue;
    if (st.status && !flags(id)[st.status]) continue;
    if (q && !`${id} ${Object.values(it).filter((x) => typeof x === 'string').join(' ')} ${lawName(it.law)}`.toLowerCase().includes(q)) continue;
    out.push(id);
  }
  return out;
}
function renderList() {
  const box = $('#ctl-list'); if (!box) return;
  const ids = filteredIds(), shown = ids.slice(0, st.limit);
  box.innerHTML = shown.map(rowHtml).join('') || '<p class="empty">ไม่พบรายการที่ตรงเงื่อนไข</p>';
  if (ids.length > shown.length) box.insertAdjacentHTML('beforeend', `<button type="button" class="btn sm outline" data-pr-more="1">แสดงเพิ่ม (อีก ${ids.length - shown.length} รายการ)</button>`);
  $('#ctl-count').textContent = `พบ ${ids.length.toLocaleString('th-TH')} จาก ${allIds().length.toLocaleString('th-TH')} รายการ`;
}
function headHtml(id) {
  const f = flags(id), w = st.work;
  return `<div class="ct-bh"><div><h3 class="ctl-h">${E(V().name(w))}</h3><div class="ctl-id"><code>${E(id)}</code> ${badges(f)}</div></div>
    <div class="ct-actions">${f.added ? '<button type="button" class="btn sm danger" data-pr-act="delete">ลบรายการนี้ถาวร</button>'
    : `${(f.edited || f.removed) ? '<button type="button" class="btn sm outline" data-pr-act="revert">ย้อนกลับเป็นค่าเดิม</button>' : ''}
       <button type="button" class="btn sm ${f.removed ? 'primary' : 'danger'}" data-pr-act="toggle-remove">${f.removed ? 'กู้คืนรายการ' : 'ทำเครื่องหมายลบ'}</button>`}</div></div>
    ${f.removed ? '<p class="ctl-flag">รายการนี้ถูกซ่อน — ไม่แสดงบนเว็บไซต์และตัวช่วยร่าง</p>' : ''}
    ${f.added && !V().ready(w) ? `<p class="ctl-flag">${V().readyMsg}</p>` : ''}`;
}
function renderEditor() {
  const pane = $('#ctl-pane'); if (!pane) return;
  const w = st.work;
  if (!w) { pane.innerHTML = '<p class="empty">เลือกรายการจากด้านซ้าย หรือกด “+ เพิ่มรายการใหม่”</p>'; return; }
  const laws = (base.laws || []).filter((l) => l?.id);
  const fld = ([k, label, kind, rows]) => (kind === 'area' ? `<label class="f"><span>${label}</span><textarea data-f="${k}" rows="${rows || 4}">${E(w[k])}</textarea></label>`
    : kind === 'law' ? `<label class="f"><span>${label}</span><select data-f="${k}">${w[k] ? '' : '<option value="">— เลือกกฎหมาย —</option>'}${laws.map((l) => `<option value="${E(l.id)}"${w[k] === l.id ? ' selected' : ''}>${E(l.short ? l.short + ' — ' : '')}${E(l.name || l.id)}</option>`).join('')}</select></label>`
    : `<label class="f"><span>${label}</span><input type="text" data-f="${k}" value="${E(w[k])}"></label>`);
  pane.innerHTML = `<div class="ct-editor ctl-editor"><div id="ctl-head">${headHtml(w.id)}</div>${V().form.map(fld).join('')}
    <label class="chk ctl-verified"><input type="checkbox" data-f="verified"${w.verified ? ' checked' : ''}><span><b>ตรวจกับแหล่งทางการแล้ว</b> — ติ๊กเมื่อเทียบกับตัวบท/แหล่งอ้างอิงด้านบนแล้วเท่านั้น</span></label>
    <p class="hint ctl-vernote" id="ctl-vernote" hidden>เนื้อหาถูกแก้ จึงยกเลิกเครื่องหมาย “ตรวจแล้ว” ให้โดยอัตโนมัติ — ติ๊กกลับเองเมื่อตรวจแล้ว</p></div>`;
}
function select(id) {
  st.sel = id; st.work = effItem(id); st.verManual = false;
  renderEditor();
  document.querySelectorAll('#ctl-list .ct-item').forEach((b) => { const on = b.dataset.prPick === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
}
function refresh(id) {
  const old = $(`[data-pr-pick="${CSS.escape(id)}"]`); if (old) old.outerHTML = rowHtml(id);
  const h = $('#ctl-head'); if (h && st.sel === id) h.innerHTML = headHtml(id);
}
function commit() {
  const id = st.sel, w = st.work; if (!id || !w) return;
  if (isAdded(id)) {
    const i = ed().added.findIndex((a) => a.id === id);
    ed().added[i] = { id, ...V().clean(w), verified: w.verified === true };
  } else {
    const p = diffFields(baseOf(id), w, V().fields);
    if (hasKeys(p)) ed().edited[id] = p; else delete ed().edited[id];
  }
  refresh(id); scheduleSave();
}
const newId = () => { for (let i = 0; i < 20; i++) { const id = 'custom-' + Math.random().toString(36).slice(2, 8); if (!allIds().includes(id)) return id; } return 'custom-' + Date.now().toString(36); };

async function act(a) {
  if (a === 'add-step') {
    st.steps.push({ title: '', detail: '', ref: '', verified: false }); renum(); rerenderSteps(); commitPath();
    root.querySelector('.pr-step:last-child [data-sf="title"]')?.focus(); return;
  }
  if (a === 'revert-path') {
    if (!(await c.confirmBox('ย้อนกลับขั้นตอนฟ้องคดีทั้งหมดเป็นค่าเดิม? การแก้ไขของคุณในหน้านี้จะหายไป', { title: 'ย้อนกลับเป็นค่าเดิม', okText: 'ย้อนกลับ', danger: true }))) return;
    delete edits.path; scheduleSave(); return stepsView();
  }
  if (a === 'new') {
    const id = newId();
    ed().added.push({ ...V().blank(), id, ...(st.view === 'sections' ? { law: base.laws?.[0]?.id || 'pvor' } : {}) });
    st.status = ''; st.q = ''; st.limit = PAGE; collView(); select(id); scheduleSave();
    $('#ctl-pane [data-f="title"]')?.focus(); return;
  }
  const id = st.sel; if (!id) return;
  if (a === 'toggle-remove') {
    if (ed().removed.includes(id)) ed().removed = ed().removed.filter((x) => x !== id);
    else {
      if (!(await c.confirmBox('ซ่อนรายการนี้จากเว็บไซต์และตัวช่วยร่าง? (กู้คืนได้ภายหลัง ข้อมูลต้นฉบับไม่ถูกลบ)', { title: 'ทำเครื่องหมายลบ', okText: 'ซ่อนรายการ', danger: true }))) return;
      ed().removed.push(id);
    }
  } else if (a === 'revert') {
    if (!(await c.confirmBox('ย้อนกลับรายการนี้เป็นค่าเดิมทั้งหมด?', { title: 'ย้อนกลับเป็นค่าเดิม', okText: 'ย้อนกลับ', danger: true }))) return;
    delete ed().edited[id]; ed().removed = ed().removed.filter((x) => x !== id);
  } else if (a === 'delete') {
    if (!(await c.confirmBox('ลบรายการที่เพิ่มเองนี้ถาวร? ไม่สามารถกู้คืนได้', { title: 'ลบถาวร', okText: 'ลบถาวร', danger: true }))) return;
    ed().added = ed().added.filter((x) => x.id !== id); st.sel = null; st.work = null;
    scheduleSave(); renderList(); renderEditor(); return;
  }
  st.work = effItem(id); st.verManual = false; scheduleSave(); refresh(id); renderEditor();
}

/* ---------- เหตุการณ์ (delegation ภายในกล่องของแท็บนี้เอง) ---------- */
function unverifyStep(i) {
  const s = st.steps[i];
  if (s.verified && !st.stepsVer.has(i)) { s.verified = false; const cb = root.querySelector(`[data-sf="verified"][data-i="${i}"]`); if (cb) cb.checked = false; }
}
function onInput(e) {
  const t = e.target;
  if (t.id === 'ctl-q') { st.q = t.value; st.limit = PAGE; return renderList(); }
  if (t.dataset.sf && t.type !== 'checkbox') { const i = +t.dataset.i; st.steps[i][t.dataset.sf] = t.value; unverifyStep(i); return commitPath(); }
  if (t.dataset.pf === 'title' || t.dataset.pf === 'note') {
    edits.path = edits.path || {}; edits.path[t.dataset.pf] = t.value; return commitPath();
  }
  if (t.dataset.pf === 'feesNote') {
    const b = base.fees?.note ?? '';
    if (t.value === b) delete edits.fees.note; else edits.fees.note = t.value;
    return scheduleSave();
  }
  if (st.view !== 'steps' && st.work && t.dataset.f && t.type !== 'checkbox' && t.tagName !== 'SELECT') {
    st.work[t.dataset.f] = t.value;
    if (st.work.verified && !st.verManual) {
      st.work.verified = false; const cb = $('[data-f="verified"]'); if (cb) cb.checked = false;
      const n = $('#ctl-vernote'); if (n) n.hidden = false;
    }
    commit();
  }
}
function onChange(e) {
  const t = e.target;
  if (t.id === 'ctl-status') { st.status = t.value; st.limit = PAGE; return renderList(); }
  if (t.dataset.sf === 'verified') { const i = +t.dataset.i; st.steps[i].verified = t.checked; if (t.checked) st.stepsVer.add(i); else st.stepsVer.delete(i); return commitPath(); }
  if (st.view !== 'steps' && st.work && t.dataset.f && (t.type === 'checkbox' || t.tagName === 'SELECT')) {
    const f = t.dataset.f;
    st.work[f] = t.type === 'checkbox' ? t.checked : t.value;
    if (f === 'verified') st.verManual = true;
    else if (st.work.verified && !st.verManual) { st.work.verified = false; const cb = $('[data-f="verified"]'); if (cb) cb.checked = false; const n = $('#ctl-vernote'); if (n) n.hidden = false; }
    commit();
  }
}
async function onClick(e) {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.prView) { st.view = d.prView; st.q = ''; st.status = ''; st.limit = PAGE; st.sel = null; st.work = null; return shell(); }
  if (d.prPick) return select(d.prPick);
  if (d.prMore) { st.limit += PAGE; return renderList(); }
  if (d.prAct) return act(d.prAct);
  if (d.prMv) {
    const [i, dir] = d.prMv.split(':').map(Number), j = i + dir;
    if (j < 0 || j >= st.steps.length) return;
    [st.steps[i], st.steps[j]] = [st.steps[j], st.steps[i]]; st.stepsVer = new Set(); renum(); rerenderSteps(); return commitPath();
  }
  if (d.prSdel !== undefined) {
    const i = +d.prSdel;
    if (!(await c.confirmBox('ลบขั้นตอนนี้? (ย้อนกลับได้ด้วยปุ่ม “ย้อนกลับเป็นค่าเดิม” ของทั้งหน้า)', { title: 'ลบขั้นตอน', okText: 'ลบ', danger: true }))) return;
    st.steps.splice(i, 1); st.stepsVer = new Set(); renum(); rerenderSteps(); return commitPath();
  }
}

export default {
  id: 'procedure',
  label: 'ขั้นตอนฟ้องคดี',
  hint: 'แก้ขั้นตอนฟ้องคดี ค่าธรรมเนียม และมาตราวิธีพิจารณาความอาญา-แพ่ง — ไม่เขียนทับข้อมูลต้นฉบับ ย้อนกลับได้',
  async mount(box, ctx) {
    c = ctx;
    if (!document.getElementById('ctl-css')) { const l = document.createElement('link'); l.id = 'ctl-css'; l.rel = 'stylesheet'; l.href = '/css/content-laws.css'; document.head.appendChild(l); }
    const d = isObj(ctx.data) ? ctx.data : {};
    const p = isObj(d.procedure) ? d.procedure : {};
    const b = p.__procBase || p;
    base = { sections: Array.isArray(b.sections) ? b.sections : [], fees: isObj(b.fees) ? b.fees : { items: [] }, criminalCasePath: b.criminalCasePath || { steps: [] }, laws: Array.isArray(b.laws) ? b.laws : [] };
    base.fees = { ...base.fees, items: Array.isArray(base.fees.items) ? base.fees.items : [] };
    box.innerHTML = inlineLoading('การแก้ไขขั้นตอนฟ้องคดี');
    let raw = {};
    try { raw = await ctx.load('procedure'); } catch (e) { box.innerHTML = `<p class="empty">โหลดข้อมูลการแก้ไขไม่สำเร็จ: ${ctx.esc(e.message || e)}</p>`; return; }
    const r = isObj(raw) ? clone(raw) : {};
    const coll = (x) => ({ ...(isObj(x) ? x : {}), edited: isObj(x?.edited) ? x.edited : {}, added: (Array.isArray(x?.added) ? x.added : []).filter(isObj), removed: (Array.isArray(x?.removed) ? x.removed : []).filter((v) => typeof v === 'string') });
    edits = { ...r, fees: coll(r.fees), sections: coll(r.sections) };
    if (isObj(r.path)) edits.path = r.path; else delete edits.path;
    dirty = false; saving = Promise.resolve(); clearTimeout(saveT);
    Object.assign(st, { view: 'steps', q: '', status: '', limit: PAGE, sel: null, work: null, stepsVer: new Set() });
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
  async unmount() { await flush(); root = null; },
};

