// แท็บ "ข้อความหน้าเว็บ" ของหน้าจัดการเนื้อหา: แก้ข้อความนโยบายความเป็นส่วนตัว · หน้าแรก · หน้าติดต่อ · ข้อสงวนสิทธิ์ท้ายเว็บ
// โครงข้อมูล (เก็บที่ law_data key='content-pages' / data/content/pages.json — เก็บเฉพาะช่องที่แก้ ช่องว่าง = ใช้ข้อความเดิมในไฟล์ HTML):
//   { privacy: { title, lead, updated, hideDraft, draftNote, intro, sections: [{ id, heading, paragraphs[], bullets[], after[] }] },
//     home: { heroEyebrow, heroTitle, heroAccent, heroLead, ctaPrimary, ctaSecondary, helpTitle, helpText, helpButton, tile1Title … tile4Text },
//     contact: { eyebrow, title, accent, lead, formNote },
//     site: { disclaimer } }
//   รายละเอียดช่องทั้งหมดอยู่ที่ /site/live-pages-schema.js (ใช้ร่วมกับหน้าสาธารณะ /site/live-pages.js)
// - ข้อความล้วนเท่านั้น (ขึ้นบรรทัดใหม่ได้) — ไม่เคยใส่ลง innerHTML โดยไม่ escape: ในฟอร์มใช้ esc() ส่วนหน้าสาธารณะใช้ textContent
// - ข้อความเดิมของแต่ละช่องอ่านจาก HTML จริงของหน้านั้น (fetch + DOMParser) แสดงเป็น placeholder ให้แอดมินเห็นว่าค่าเดิมคืออะไร
// - privacy.sections: กด "แก้ไขหัวข้อต่าง ๆ" เพื่อคัดลอกหัวข้อเดิมเป็นข้อความล้วนแล้วแก้/เพิ่ม/ลบ/สลับลำดับ; ชุดนี้จะแทนที่เนื้อหาเดิมทั้งหมด
// - บันทึกอัตโนมัติ (debounce 700 ms) · unmount() บันทึกที่ค้างให้เสร็จก่อนปิดแท็บ
import { PAGES, cleanSections, readText, stripNo, MAX_TEXT, MAX_SECTIONS, CONTENT_KEY } from '/site/live-pages-schema.js';

const $ = (s, r = document) => r.querySelector(s);
let st = null; // สถานะของแท็บที่เปิดอยู่

function injectCss() {
  if (document.getElementById('cp-css')) return;
  const l = document.createElement('link');
  l.id = 'cp-css'; l.rel = 'stylesheet'; l.href = '/css/content-pages.css';
  document.head.appendChild(l);
}

/** ข้อความตั้งต้นจาก HTML จริงของแต่ละหน้า (อ่านไม่ได้ → ว่าง แล้ว placeholder จะเป็นข้อความทั่วไป) */
async function loadDefaults() {
  const defs = {}; const secs = [];
  const urls = [...new Set(PAGES.map((p) => p.url))];
  const docs = {};
  await Promise.all(urls.map(async (u) => {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (r.ok) docs[u] = new DOMParser().parseFromString(await r.text(), 'text/html');
    } catch { /* ใช้ placeholder ทั่วไป */ }
  }));
  for (const p of PAGES) {
    defs[p.id] = {};
    for (const f of p.fields) {
      if (f.def) { defs[p.id][f.k] = f.def; continue; }
      const n = docs[p.url]?.querySelector(`[data-live="${p.id}.${f.k}"]`);
      defs[p.id][f.k] = n ? readText(n) : '';
    }
  }
  if (docs['/privacy/']) secs.push(...parseSections(docs['/privacy/']));
  return { defs, secs };
}

/** หัวข้อนโยบายเดิม → โครงข้อความล้วน (ตารางกลายเป็นรายการ “ช่องทาง — ข้อมูล”, ตัวหนา/ลิงก์ถูกตัดเหลือข้อความ) */
function parseSections(doc) {
  const box = doc.querySelector('[data-live-sections]');
  if (!box) return [];
  const out = []; let cur = null, listSeen = false;
  for (const n of box.children) {
    if (n.tagName === 'H2') { cur = { id: n.id, heading: stripNo(readText(n)), paragraphs: [], bullets: [], after: [] }; listSeen = false; out.push(cur); continue; }
    if (!cur) continue;
    if (n.tagName === 'P') (listSeen ? cur.after : cur.paragraphs).push(readText(n));
    else if (n.tagName === 'UL' || n.tagName === 'OL') { listSeen = true; n.querySelectorAll(':scope > li').forEach((li) => cur.bullets.push(readText(li))); }
    else if (n.querySelector('table')) { listSeen = true; n.querySelectorAll('tbody tr').forEach((tr) => cur.bullets.push([...tr.children].map(readText).filter(Boolean).join(' — '))); }
  }
  return cleanSections(out);
}

const str = (v) => (typeof v === 'string' ? v : '');
function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const data = {};
  for (const p of PAGES) {
    data[p.id] = {};
    for (const f of p.fields) {
      data[p.id][f.k] = str(d[p.id]?.[f.k]);
      if (f.hideKey) data[p.id][f.hideKey] = d[p.id]?.[f.hideKey] === true;
    }
  }
  data.privacy.sections = cleanSections(d.privacy?.sections);
  return data;
}

/** รูปแบบที่เก็บจริง: ตัดช่องว่างทิ้ง เก็บเฉพาะที่แก้ */
function output() {
  const out = {};
  for (const p of PAGES) {
    const o = {};
    for (const f of p.fields) {
      const v = str(st.data[p.id][f.k]).replace(/\r\n?/g, '\n').trim();
      if (v) o[f.k] = v;
      if (f.hideKey && st.data[p.id][f.hideKey]) o[f.hideKey] = true;
    }
    if (p.id === 'privacy') { const s = cleanSections(st.data.privacy.sections); if (s.length) o.sections = s; }
    if (Object.keys(o).length) out[p.id] = o;
  }
  return out;
}

// ---------- บันทึก ----------
function schedule() {
  st.ctx.setState('กำลังบันทึก…', 'busy');
  clearTimeout(st.timer);
  st.timer = setTimeout(() => { st.timer = 0; persist(); }, 700);
}
function persist() {
  const s = st; if (!s) return Promise.resolve();
  s.chain = s.chain.then(async () => {
    s.ctx.setState('กำลังบันทึก…', 'busy');
    try { await s.ctx.save(CONTENT_KEY, output()); s.ctx.setState('บันทึกแล้ว ✓', 'ok'); }
    catch (e) { s.ctx.setState('บันทึกไม่สำเร็จ: ' + (e.message || e), 'err'); }
  });
  return s.chain;
}

// ---------- ส่วนแสดงผล ----------
const countOf = (p) => p.fields.filter((f) => str(st.data[p.id][f.k]).trim()).length
  + (p.id === 'privacy' ? (st.data.privacy.sections.length ? 1 : 0) + (st.data.privacy.hideDraft ? 1 : 0) : 0);

function fieldHtml(p, f) {
  const { esc } = st.ctx;
  const key = `${p.id}.${f.k}`;
  const val = str(st.data[p.id][f.k]);
  const def = st.defs[p.id]?.[f.k] || '';
  return `${f.group ? `<h4 class="cp-group">${esc(f.group)}</h4>` : ''}
    <div class="cp-f" data-key="${esc(key)}">
      <label class="f"><span>${esc(f.label)}</span>
        <textarea rows="${f.rows || 2}" maxlength="${MAX_TEXT}" data-cp-in="${esc(key)}" placeholder="${esc(def || 'ใช้ข้อความเดิมของหน้านี้')}">${esc(val)}</textarea></label>
      <div class="cp-fb">
        ${f.today ? `<button type="button" class="btn sm ghost" data-cp="today" data-key="${esc(key)}">ใส่วันที่วันนี้</button>` : ''}
        ${f.hideKey ? `<label class="chk"><input type="checkbox" data-cp-hide="${esc(p.id + '.' + f.hideKey)}" ${st.data[p.id][f.hideKey] ? 'checked' : ''}><span>${esc(f.hideLabel)}</span></label>` : ''}
        <span class="grow"></span>
        <button type="button" class="btn sm ghost cp-reset" data-cp="resetField" data-key="${esc(key)}" ${val.trim() ? '' : 'hidden'}>ใช้ข้อความเดิม</button>
      </div>
    </div>`;
}

function secHtml(s, i, n) {
  const { esc } = st.ctx;
  return `<div class="ct-block cp-sec" data-i="${i}">
    <div class="ct-bh"><b>ข้อ ${i + 1}</b>
      <span class="ct-actions">
        <button type="button" class="btn sm ghost" data-cp="secUp" data-i="${i}" aria-label="เลื่อนข้อ ${i + 1} ขึ้น" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn sm ghost" data-cp="secDown" data-i="${i}" aria-label="เลื่อนข้อ ${i + 1} ลง" ${i === n - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="btn sm danger" data-cp="secDel" data-i="${i}" aria-label="ลบข้อ ${i + 1}">ลบ</button></span></div>
    <div class="ct-editor">
      <label class="f"><span>หัวข้อ (ไม่ต้องใส่เลขข้อ ระบบใส่ให้)</span><input type="text" maxlength="200" data-cp-sec="heading" data-i="${i}" value="${esc(s.heading)}"></label>
      <label class="f"><span>ย่อหน้า (เว้นบรรทัดว่างระหว่างย่อหน้า)</span><textarea rows="4" maxlength="${MAX_TEXT}" data-cp-sec="paragraphs" data-i="${i}">${esc(s.paragraphs.join('\n\n'))}</textarea></label>
      <label class="f"><span>รายการหัวข้อย่อย (1 บรรทัด = 1 รายการ)</span><textarea rows="4" maxlength="${MAX_TEXT}" data-cp-sec="bullets" data-i="${i}">${esc(s.bullets.join('\n'))}</textarea></label>
      <label class="f"><span>ย่อหน้าหลังรายการ (ถ้ามี)</span><textarea rows="2" maxlength="${MAX_TEXT}" data-cp-sec="after" data-i="${i}">${esc(s.after.join('\n\n'))}</textarea></label>
    </div></div>`;
}

function secsInner() {
  const secs = st.data.privacy.sections;
  if (!secs.length) {
    return `<div class="cp-empty"><p>ตอนนี้แสดงเนื้อหานโยบายตามข้อความเดิมของหน้า${st.defSecs.length ? ` (${st.defSecs.length} หัวข้อ)` : ''}</p>
      <button type="button" class="btn outline" data-cp="secStart">แก้ไขหัวข้อต่าง ๆ</button>
      <p class="hint">ระบบจะคัดลอกหัวข้อเดิมมาเป็นข้อความล้วนให้แก้ — ตาราง ตัวหนา และลิงก์ในเนื้อหาเดิมจะกลายเป็นข้อความธรรมดา และชุดที่แก้จะใช้แทนเนื้อหาเดิมทั้งหมด (กดล้างเพื่อกลับไปใช้ข้อความเดิมได้)</p></div>`;
  }
  return `${secs.map((s, i) => secHtml(s, i, secs.length)).join('')}
    <div class="ct-actions">
      <button type="button" class="btn outline" data-cp="secAdd" ${secs.length >= MAX_SECTIONS ? 'disabled' : ''}>+ เพิ่มหัวข้อ</button>
      <button type="button" class="btn ghost danger" data-cp="secReset">ใช้ข้อความเดิมทั้งหมด (ล้างหัวข้อที่แก้)</button></div>`;
}

function pageHtml(p) {
  const { esc } = st.ctx;
  const n = countOf(p);
  return `<details class="cp-page" data-page="${p.id}" ${st.open.has(p.id) ? 'open' : ''}>
    <summary><span class="cp-title">${esc(p.label)}</span><span class="ct-badge cp-count ${n ? '' : 'off'}">${n ? `แก้ไว้ ${n} รายการ` : 'ใช้ข้อความเดิม'}</span></summary>
    <div class="cp-body ct-editor">
      <div class="ct-actions">
        <a class="btn sm outline" href="${esc(p.url)}" target="_blank" rel="noopener">ดูหน้า ↗</a>
        <button type="button" class="btn sm ghost danger" data-cp="resetPage" data-page="${p.id}">ใช้ข้อความเดิมทั้งหมดของหน้านี้</button></div>
      ${p.id === 'site' ? '<p class="hint">ข้อความนี้แสดงท้ายเว็บ (ใต้ © …) ในหน้าที่ใช้ท้ายเว็บมาตรฐาน — เว้นว่าง = ใช้ข้อความมาตรฐาน</p>' : ''}
      ${p.fields.map((f) => fieldHtml(p, f)).join('')}
      ${p.id === 'privacy' ? `<section class="cp-secs"><h4 class="cp-group">หัวข้อของนโยบาย</h4><div id="cp-secs">${secsInner()}</div></section>` : ''}
    </div></details>`;
}

function render() {
  const y = window.scrollY;
  st.box.innerHTML = `<div class="cp-wrap"><p class="hint cp-intro">แก้ข้อความที่แสดงบนหน้าเว็บสาธารณะโดยไม่ต้อง deploy ใหม่ — ช่องที่เว้นว่างจะใช้ข้อความเดิม (แสดงเป็นตัวอักษรจางในช่อง) · เป็นข้อความล้วน ขึ้นบรรทัดใหม่ได้ ใส่ HTML ไม่ได้ · บันทึกอัตโนมัติ</p>
    ${PAGES.map(pageHtml).join('')}</div>`;
  window.scrollTo(0, y);
}

function refreshBadges() {
  for (const p of PAGES) {
    const n = countOf(p);
    const b = $(`.cp-page[data-page="${p.id}"] .cp-count`, st.box);
    if (b) { b.textContent = n ? `แก้ไว้ ${n} รายการ` : 'ใช้ข้อความเดิม'; b.classList.toggle('off', !n); }
  }
}
const setVal = (key, v) => { const [p, k] = key.split('.'); st.data[p][k] = v; };
const getVal = (key) => { const [p, k] = key.split('.'); return st.data[p]?.[k]; };
const splitBlocks = (t) => String(t).replace(/\r\n?/g, '\n').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
const splitLines = (t) => String(t).replace(/\r\n?/g, '\n').split('\n').map((x) => x.trim()).filter(Boolean);
const changed = () => { refreshBadges(); schedule(); };
const redrawSecs = (focusSel) => {
  const box = $('#cp-secs', st.box); if (!box) return;
  box.innerHTML = secsInner(); refreshBadges();
  if (focusSel) $(focusSel, box)?.focus();
};

// ---------- เหตุการณ์ (delegation ภายใน box) ----------
function onInput(e) {
  const t = e.target;
  if (t.dataset.cpIn) {
    setVal(t.dataset.cpIn, t.value);
    const rb = $(`[data-cp="resetField"][data-key="${CSS.escape(t.dataset.cpIn)}"]`, st.box);
    if (rb) rb.hidden = !t.value.trim();
    changed();
  } else if (t.dataset.cpSec) {
    const s = st.data.privacy.sections[+t.dataset.i]; if (!s) return;
    const k = t.dataset.cpSec;
    s[k] = k === 'heading' ? t.value : (k === 'bullets' ? splitLines(t.value) : splitBlocks(t.value));
    changed();
  }
}
function onChange(e) {
  const t = e.target;
  if (t.dataset.cpHide) { const [p, k] = t.dataset.cpHide.split('.'); st.data[p][k] = t.checked; changed(); }
}

async function onClick(e) {
  const b = e.target.closest('[data-cp]'); if (!b || !st.box.contains(b)) return;
  const act = b.dataset.cp; const secs = st.data.privacy.sections; const i = +b.dataset.i;
  const { confirmBox } = st.ctx;
  if (act === 'resetField') {
    const key = b.dataset.key; setVal(key, '');
    const ta = $(`[data-cp-in="${CSS.escape(key)}"]`, st.box); if (ta) ta.value = '';
    b.hidden = true; changed();
  } else if (act === 'today') {
    const v = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    setVal(b.dataset.key, v);
    const ta = $(`[data-cp-in="${CSS.escape(b.dataset.key)}"]`, st.box); if (ta) ta.value = v;
    const rb = $(`[data-cp="resetField"][data-key="${CSS.escape(b.dataset.key)}"]`, st.box); if (rb) rb.hidden = false;
    changed();
  } else if (act === 'resetPage') {
    const p = PAGES.find((x) => x.id === b.dataset.page);
    if (!(await confirmBox(`ล้างข้อความที่แก้ไว้ของหน้า “${p.label}” ทั้งหมด แล้วกลับไปใช้ข้อความเดิม?`, { title: 'ใช้ข้อความเดิม', okText: 'ล้างค่า', danger: true }))) return;
    for (const f of p.fields) { st.data[p.id][f.k] = ''; if (f.hideKey) st.data[p.id][f.hideKey] = false; }
    if (p.id === 'privacy') st.data.privacy.sections = [];
    st.open.add(p.id); render(); schedule();
  } else if (act === 'secStart') {
    if (!(await confirmBox('คัดลอกหัวข้อนโยบายเดิมมาเป็นข้อความล้วนเพื่อแก้ไข? ตาราง ตัวหนา และลิงก์ในเนื้อหาเดิมจะกลายเป็นข้อความธรรมดา และชุดที่แก้จะใช้แทนเนื้อหาเดิมทั้งหมด', { title: 'แก้ไขหัวข้อนโยบาย', okText: 'เริ่มแก้ไข' }))) return;
    st.data.privacy.sections = st.defSecs.length ? JSON.parse(JSON.stringify(st.defSecs)) : [{ id: 'n' + Date.now().toString(36), heading: '', paragraphs: [], bullets: [], after: [] }];
    redrawSecs(); schedule();
  } else if (act === 'secAdd') {
    secs.push({ id: 'n' + Date.now().toString(36), heading: '', paragraphs: [], bullets: [], after: [] });
    redrawSecs(`[data-cp-sec="heading"][data-i="${secs.length - 1}"]`); schedule();
  } else if (act === 'secDel') {
    if (!(await confirmBox(`ลบข้อ ${i + 1}${secs[i]?.heading ? ` “${secs[i].heading}”` : ''}?`, { title: 'ลบหัวข้อ', okText: 'ลบ', danger: true }))) return;
    secs.splice(i, 1); redrawSecs(); changed();
  } else if (act === 'secUp' || act === 'secDown') {
    const j = act === 'secUp' ? i - 1 : i + 1; if (j < 0 || j >= secs.length) return;
    [secs[i], secs[j]] = [secs[j], secs[i]];
    redrawSecs(`[data-cp="${act}"][data-i="${j}"]:not([disabled])`); changed();
  } else if (act === 'secReset') {
    if (!(await confirmBox('ล้างหัวข้อที่แก้ไว้ทั้งหมด แล้วกลับไปใช้เนื้อหานโยบายเดิมของหน้า?', { title: 'ใช้ข้อความเดิม', okText: 'ล้างค่า', danger: true }))) return;
    st.data.privacy.sections = []; redrawSecs(); changed();
  }
}

function onToggle(e) {
  const d = e.target; if (!d.classList?.contains('cp-page')) return;
  if (d.open) st.open.add(d.dataset.page); else st.open.delete(d.dataset.page);
}

export default {
  id: 'pages',
  label: 'ข้อความหน้าเว็บ',
  hint: 'แก้ข้อความนโยบายความเป็นส่วนตัว หน้าแรก หน้าติดต่อ และข้อสงวนสิทธิ์ท้ายเว็บ',
  async mount(box, ctx) {
    injectCss();
    ctx.setState('');
    let loaded = {};
    try { loaded = await ctx.load(CONTENT_KEY); } catch (e) { ctx.notify?.({ type: 'warn', title: 'โหลดข้อความที่แก้ไว้ไม่สำเร็จ', message: e.message || String(e) }); }
    const { defs, secs } = await loadDefaults();
    st = { ctx, box, data: normalize(loaded), defs, defSecs: secs, timer: 0, chain: Promise.resolve(), open: new Set(['privacy']) };
    render();
    box.addEventListener('input', onInput);
    box.addEventListener('change', onChange);
    box.addEventListener('click', onClick);
    box.addEventListener('toggle', onToggle, true);
  },
  async unmount() {
    if (!st) return;
    const s = st;
    s.box.removeEventListener('input', onInput); s.box.removeEventListener('change', onChange);
    s.box.removeEventListener('click', onClick); s.box.removeEventListener('toggle', onToggle, true);
    if (s.timer) { clearTimeout(s.timer); s.timer = 0; await persist(); } else await s.chain;
    st = null;
  },
};
