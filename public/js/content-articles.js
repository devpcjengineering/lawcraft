// แท็บ "บทความ" ในหน้า จัดการเนื้อหา: สร้าง/แก้/ซ่อน/ลบ/จัดลำดับบทความ — บันทึกอัตโนมัติ (หน่วง 700 ms)
// ที่เก็บ (key 'articles' → law_data 'content-articles' หรือ data/content/articles.json):
//   { items: { [slug]: บทความเต็ม (+ published:false ถ้าซ่อน) }, hidden: [slug ของบทความตั้งต้นที่ซ่อน], order: [slug] }
//   items เก็บเฉพาะบทความที่สร้างใหม่หรือแก้ไขแล้ว — บทความตั้งต้นที่ไม่ได้แตะจะไม่ถูกคัดลอกมาเก็บ
// กันเขียนทับกัน: ทุกครั้งที่บันทึกจะโหลดค่าล่าสุดจากหลังบ้านก่อน แล้วใช้ "การแก้ที่ค้างอยู่" ซ้ำลงไป (ไม่เขียนทับของคนอื่น)
// ตรรกะรวมกับบทความตั้งต้นอยู่ใน /articles/merge.js (ใช้ร่วมกับหน้าเว็บสาธารณะ)
import { SLUG_RE, normLive, isHidden, mergeIndex, refsFor } from '../articles/merge.js';
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (x) => JSON.parse(JSON.stringify(x));
const today = () => new Date().toLocaleDateString('en-CA');
const SAVE_MS = 700;
const CALLOUTS = [['', 'ไม่มีกล่องเน้น'], ['tip', 'คำแนะนำ'], ['warn', 'ข้อควรระวัง'], ['law', 'ตัวบทสำคัญ']];

// ---------- สถานะของโมดูล (ล้างทุกครั้งที่ mount) ----------
let ctx, box, ac, state, sIdx, sMap, pending, timer, flushP, sel, cur, q, creating, listRaf, staticCache, lawIdx;

const norm = (live) => normLive(live);

// ---------- บันทึกแบบสะสม (ops) ----------
/** ลงทะเบียนการแก้ 1 รายการ: ใช้กับ state ในเครื่องทันที + เก็บไว้ใช้ซ้ำกับค่าล่าสุดจากหลังบ้านตอนบันทึก */
function apply(key, fn) {
  pending.delete(key); pending.set(key, fn);
  fn(state);
  schedule();
}
function schedule() {
  ctx.setState('กำลังบันทึก…', 'busy');
  clearTimeout(timer);
  timer = setTimeout(flushNow, SAVE_MS);
}
function flushNow() {
  clearTimeout(timer); timer = null;
  flushP = flushP.then(doFlush, doFlush);
  return flushP;
}
async function doFlush() {
  if (!pending.size) return;
  const ops = [...pending.entries()];
  pending.clear();
  ctx.setState('กำลังบันทึก…', 'busy');
  try {
    const remote = norm(await ctx.load('articles'));
    ops.forEach(([, fn]) => fn(remote));
    const out = { items: remote.items };
    if (remote.hidden.length) out.hidden = [...new Set(remote.hidden)];
    if (remote.order.length) out.order = remote.order;
    await ctx.save('articles', out);
    state = remote;
    pending.forEach((fn) => fn(state)); // การแก้ที่เกิดระหว่างรอบันทึก
    ctx.setState('บันทึกแล้ว', 'ok');
  } catch (e) {
    for (const [k, fn] of ops) if (!pending.has(k)) pending.set(k, fn); // เก็บไว้ลองใหม่
    ctx.setState('บันทึกไม่สำเร็จ: ' + (e?.message || e), 'err');
  }
}

// ---------- ทำความสะอาดข้อมูลก่อนเก็บ ----------
const t = (s) => String(s ?? '').trim();
const arr = (x) => (Array.isArray(x) ? x : []);

/** แปลงโมเดลในฟอร์มเป็นบทความที่เก็บจริง (ตัดช่องว่าง/รายการว่าง และตัด related/precedents ที่ build ใส่ไว้ — หน้าเว็บหาใหม่จาก id) */
function clean(m) {
  const used = new Set();
  const sections = arr(m.sections).map((s, i) => {
    let id = t(s.id).replace(/[^A-Za-z0-9_-]/g, '') || `sec-${i + 1}`;
    while (used.has(id)) id += '-x';
    used.add(id);
    const r = { id, heading: t(s.heading), paragraphs: arr(s.paragraphs).map(t).filter(Boolean) };
    const bullets = arr(s.bullets).map(t).filter(Boolean);
    if (bullets.length) r.bullets = bullets;
    if (s.table && arr(s.table.head).length) r.table = s.table;
    if (s.callout?.type && t(s.callout.text)) r.callout = { type: s.callout.type, text: t(s.callout.text) };
    return r;
  });
  const items = arr(m.checklist?.items).map(t).filter(Boolean);
  const o = {
    slug: m.slug, title: t(m.title), subtitle: t(m.subtitle), category: t(m.category), tags: arr(m.tags).map(t).filter(Boolean),
    readMinutes: Math.max(1, Math.round(+m.readMinutes) || 1), updated: m.updated || today(), summary: t(m.summary),
    keyPoints: arr(m.keyPoints).map(t).filter(Boolean), sections,
    steps: arr(m.steps).filter((x) => t(x.title) || t(x.detail)).map((x) => ({ title: t(x.title), detail: t(x.detail) })),
    faq: arr(m.faq).filter((x) => t(x.q) || t(x.a)).map((x) => ({ q: t(x.q), a: t(x.a) })),
    relatedItems: arr(m.relatedItems).map(t).filter(Boolean), relatedPrecedents: arr(m.relatedPrecedents).map(t).filter(Boolean),
    sources: arr(m.sources).filter((x) => t(x.label) || t(x.url)).map((x) => ({ label: t(x.label), url: t(x.url), verified: !!x.verified })),
    reviewStatus: t(m.reviewStatus),
  };
  if (items.length) o.checklist = { title: t(m.checklist?.title) || 'รายการที่ควรเตรียม', items };
  const refs = lawIdx ? refsFor(o, ctx.data) : null;
  if (refs) o.refs = refs;
  if (m.published === false) o.published = false;
  return o;
}
const setItemOp = (slug, model) => apply('item:' + slug, (s) => { s.items[slug] = clean(model); });

const blank = (slug, title) => ({
  slug, title, subtitle: '', category: 'ภาพรวม', tags: [], readMinutes: 5, updated: today(), summary: '', keyPoints: [],
  sections: [{ id: 'sec-1', heading: '', paragraphs: [] }], steps: [], checklist: { title: '', items: [] }, faq: [], relatedItems: [], relatedPrecedents: [],
  sources: [], reviewStatus: 'ร่าง — ยังไม่ผ่านการตรวจโดยนักกฎหมาย', published: false,
});

/** เติมค่าที่ขาดเพื่อให้ฟอร์มวาดได้ */
function forEditor(a) {
  const m = clone(a);
  delete m.related; delete m.precedents; delete m.refs;
  for (const k of ['tags', 'keyPoints', 'sections', 'steps', 'faq', 'relatedItems', 'relatedPrecedents', 'sources']) m[k] = arr(m[k]);
  m.sections = m.sections.map((s, i) => ({ ...s, id: s.id || `sec-${i + 1}`, paragraphs: arr(s.paragraphs) }));
  m.checklist = { title: m.checklist?.title || '', items: arr(m.checklist?.items) };
  return m;
}

// ---------- ข้อมูลอ้างอิง (มาตรา/ฎีกา) สำหรับช่องเลือก ----------
function buildLawIdx() {
  const d = ctx.data;
  if (!d || !Array.isArray(d.items)) return null;
  const laws = new Map(arr(d.laws).map((l) => [l.id, l]));
  return {
    items: new Map(d.items.map((it) => [it.id, `${laws.get(it.lawId)?.short || laws.get(it.lawId)?.name || ''} ม.${it.section} ${it.name || ''}`.trim()])),
    prec: new Map(arr(d.precedents).map((p) => [p.caseNo, p.topic || ''])),
  };
}

// ---------- หน้ารายการ ----------
const rows = () => mergeIndex(sIdx, state, { all: true });

function badges(r) {
  const it = state.items[r.slug];
  const b = [];
  if (!r._isStatic) b.push('<span class="ct-badge">ใหม่</span>');
  else if (r._edited) b.push('<span class="ct-badge warn">แก้ไขแล้ว</span>');
  b.push(r._hidden ? '<span class="ct-badge off">ซ่อน</span>' : '<span class="ct-badge cta-ok">เผยแพร่</span>');
  if (it && /^ร่าง/.test(t(it.reviewStatus))) b.push('<span class="ct-badge warn">ร่าง</span>');
  return b.join('');
}

function renderList() {
  const el = box.querySelector('#cta-list');
  if (!el) return;
  const n = q.trim().toLowerCase();
  const all = rows();
  const rs = all.filter((r) => !n || [r.title, r.slug, r.category, ...(r.tags || [])].join(' ').toLowerCase().includes(n));
  const top = el.scrollTop;
  el.innerHTML = rs.length
    ? rs.map((r) => `<button type="button" class="ct-item${r.slug === sel ? ' on' : ''}" data-a="open" data-slug="${esc(r.slug)}"><b>${esc(r.title || r.slug)}</b><small>${esc(r.category)} · ${esc(r.slug)}</small><span class="cta-bd">${badges(r)}</span></button>`).join('')
    : `<p class="empty">${all.length ? 'ไม่พบบทความที่ตรงกับคำค้น' : 'ยังไม่มีบทความ'}</p>`;
  el.scrollTop = top;
  const c = box.querySelector('#cta-count');
  if (c) c.textContent = `${all.length} บทความ`;
}
const renderListSoon = () => { cancelAnimationFrame(listRaf); listRaf = requestAnimationFrame(renderList); };

function createPanel() {
  if (!creating) return '';
  const { from, slug, title } = creating;
  return `<div class="ct-block cta-new">
    <b>${from ? 'ทำสำเนาบทความ' : 'บทความใหม่'}</b>
    <label class="f"><span>slug (ใช้ในลิงก์ — a-z 0-9 และ - ยาว 3–61 ตัว ตั้งแล้วเปลี่ยนไม่ได้)</span><input type="text" id="cta-nslug" value="${esc(slug)}" autocomplete="off" spellcheck="false" placeholder="เช่น online-scam-basics"></label>
    <label class="f"><span>ชื่อบทความ</span><input type="text" id="cta-ntitle" value="${esc(title)}" autocomplete="off"></label>
    <p class="hint" id="cta-nmsg" role="status"></p>
    <div class="ct-actions"><button type="button" class="btn sm" data-a="createGo">สร้าง</button><button type="button" class="btn sm outline" data-a="createCancel">ยกเลิก</button></div>
  </div>`;
}
const slugProblem = (s) => (!SLUG_RE.test(s) ? 'slug ต้องเป็น a-z 0-9 และ - (ขึ้นต้นด้วยตัวอักษรหรือตัวเลข ยาว 3–61 ตัว)'
  : (sMap.has(s) || state.items[s]) ? 'slug นี้มีอยู่แล้ว' : '');

function renderCreate() {
  const el = box.querySelector('#cta-create');
  if (el) el.innerHTML = createPanel();
}

// ---------- ฟอร์มแก้บทความ ----------
const field = (label, inner, cls = '') => `<label class="f ${cls}"><span>${label}</span>${inner}</label>`;
const inp = (p, v, extra = '') => `<input type="text" data-p="${esc(p)}" value="${esc(v)}" ${extra}>`;
const area = (p, v, rows, tp = '') => `<textarea data-p="${esc(p)}" ${tp ? `data-t="${tp}"` : ''} rows="${rows}">${esc(v)}</textarea>`;
const rowsFor = (txt, min = 3, max = 16) => Math.max(min, Math.min(max, Math.ceil(String(txt).length / 70) + String(txt).split('\n').length));
const mini = (a, p, i, extra = '') => `<button type="button" class="btn sm outline" data-a="${a}" data-p="${p}" data-i="${i}" ${extra}>`;

function listBlock(p, title, hint, rowsHtml, addLabel) {
  return `<div class="ct-block"><div class="ct-bh"><b>${title}</b></div>${hint ? `<p class="hint">${hint}</p>` : ''}${rowsHtml || '<p class="hint">ยังไม่มีรายการ</p>'}
    <div class="ct-actions"><button type="button" class="btn sm outline" data-a="add" data-p="${p}">${icon('plus')}${addLabel}</button></div></div>`;
}

function refChips(p, list, map, listId, ph) {
  const chips = list.map((id, i) => `<span class="cta-chip${map && !map.has(id) ? ' bad' : ''}" title="${esc(map?.get(id) || 'ไม่พบในฐานข้อมูล')}">${esc(id)}${map?.get(id) ? ` <small>${esc(map.get(id))}</small>` : ''}<button type="button" data-a="rm" data-p="${p}" data-i="${i}" aria-label="เอาออก ${esc(id)}">${icon('x', { size: 14, stroke: 2.2 })}</button></span>`).join('');
  return `<div class="cta-chips">${chips || '<span class="hint">ยังไม่มี</span>'}</div>
    <div class="cta-refadd"><input type="text" data-ref="${p}" list="${listId}" placeholder="${ph}" autocomplete="off"><button type="button" class="btn sm outline" data-a="addRef" data-p="${p}">เพิ่ม</button></div>`;
}

function sectionBlock(s, i, n) {
  const p = `sections.${i}`;
  const paras = arr(s.paragraphs).join('\n\n');
  const hasT = s.table && arr(s.table.head).length;
  return `<div class="ct-block cta-sec" data-sec="${i}">
    <div class="ct-bh"><b>หัวข้อที่ ${i + 1}</b><div class="ct-actions">${mini('mv', 'sections', i, 'data-d="-1"' + (i === 0 ? ' disabled' : ''))}${icon('arrowUp')}</button>${mini('mv', 'sections', i, 'data-d="1"' + (i === n - 1 ? ' disabled' : ''))}${icon('arrowDown')}</button>${mini('rm', 'sections', i, 'data-confirm="1"').replace('outline', 'danger')}ลบ</button></div></div>
    ${field('หัวข้อ', inp(`${p}.heading`, s.heading))}
    ${field('เนื้อหา (เว้นบรรทัดว่าง 1 บรรทัด = ขึ้นย่อหน้าใหม่)', area(`${p}.paragraphs`, paras, rowsFor(paras, 5, 18), 'paras'))}
    ${field('รายการย่อย (บรรทัดละ 1 ข้อ — ไม่บังคับ)', area(`${p}.bullets`, arr(s.bullets).join('\n'), rowsFor(arr(s.bullets).join('\n'), 2, 8), 'lines'))}
    <div class="ct-row2">
      ${field('กล่องเน้น', `<select data-a="calloutType" data-i="${i}">${CALLOUTS.map(([v, l]) => `<option value="${v}"${(s.callout?.type || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${s.callout?.type ? field('ข้อความในกล่องเน้น', area(`${p}.callout.text`, s.callout.text || '', 3)) : '<span></span>'}
    </div>
    ${hasT ? `<div class="cta-table"><span class="hint">มีตาราง ${arr(s.table.rows).length} แถว × ${arr(s.table.head).length} คอลัมน์ — เก็บไว้ตามเดิม (แก้ตารางไม่ได้ในหน้านี้)</span>${mini('rmTable', 'sections', i, 'data-confirm="1"')}เอาตารางออก</button></div>` : ''}
  </div>`;
}

function editorHtml() {
  const m = cur;
  const slug = m.slug, isStatic = sMap.has(slug), edited = !!state.items[slug], hid = isHidden(state, slug);
  const order = rows().map((r) => r.slug), pos = order.indexOf(slug);
  const cats = [...new Set(rows().map((r) => r.category).filter(Boolean))];
  const kp = m.keyPoints.map((k, i) => `<div class="cta-li">${area(`keyPoints.${i}`, k, rowsFor(k, 2, 8))}${mini('rm', 'keyPoints', i)}ลบ</button></div>`).join('');
  const steps = m.steps.map((s, i) => `<div class="ct-block cta-li2"><div class="ct-bh"><b>ขั้นตอนที่ ${i + 1}</b><div class="ct-actions">${mini('mv', 'steps', i, 'data-d="-1"' + (i === 0 ? ' disabled' : ''))}${icon('arrowUp')}</button>${mini('mv', 'steps', i, 'data-d="1"' + (i === m.steps.length - 1 ? ' disabled' : ''))}${icon('arrowDown')}</button>${mini('rm', 'steps', i)}ลบ</button></div></div>
      ${field('หัวข้อขั้นตอน', inp(`steps.${i}.title`, s.title))}${field('รายละเอียด', area(`steps.${i}.detail`, s.detail, rowsFor(s.detail, 2, 8)))}</div>`).join('');
  const faq = m.faq.map((s, i) => `<div class="ct-block cta-li2"><div class="ct-bh"><b>คำถามที่ ${i + 1}</b><div class="ct-actions">${mini('mv', 'faq', i, 'data-d="-1"' + (i === 0 ? ' disabled' : ''))}${icon('arrowUp')}</button>${mini('mv', 'faq', i, 'data-d="1"' + (i === m.faq.length - 1 ? ' disabled' : ''))}${icon('arrowDown')}</button>${mini('rm', 'faq', i)}ลบ</button></div></div>
      ${field('คำถาม', inp(`faq.${i}.q`, s.q))}${field('คำตอบ', area(`faq.${i}.a`, s.a, rowsFor(s.a, 2, 8)))}</div>`).join('');
  const src = m.sources.map((s, i) => `<div class="ct-block cta-li2"><div class="ct-bh"><b>แหล่งที่ ${i + 1}</b>${mini('rm', 'sources', i)}ลบ</button></div>
      ${field('ชื่อแหล่งอ้างอิง', inp(`sources.${i}.label`, s.label))}${field('ลิงก์ (https://…)', `<input type="text" inputmode="url" data-p="sources.${i}.url" value="${esc(s.url)}" autocomplete="off">`)}
      <label class="chk cta-chk"><input type="checkbox" data-p="sources.${i}.verified" data-t="bool"${s.verified ? ' checked' : ''}><span>ตรวจเปิดอ่านแล้ว (ถ้าไม่ติ๊ก หน้าเว็บจะแสดง “ยังไม่ได้ตรวจเปิดอ่าน”)</span></label></div>`).join('');
  return `
  <div class="ct-block cta-head">
    <div class="ct-bh"><div><b>${esc(m.title || '(ยังไม่มีชื่อ)')}</b> <small class="cta-slug">/${esc(slug)}</small><div class="cta-bd">${badges({ slug, _isStatic: isStatic, _edited: edited, _hidden: hid })}</div></div>
      <div class="ct-actions"><a class="btn sm outline" href="/articles/?a=${encodeURIComponent(slug)}" target="_blank" rel="noopener">ดูหน้าบทความ${icon('external')}</a></div></div>
    <div class="ct-actions">
      <button type="button" class="btn sm${hid ? '' : ' outline'}" data-a="toggleHide">${hid ? 'เผยแพร่' : 'ซ่อนจากเว็บ'}</button>
      <button type="button" class="btn sm outline" data-a="dup">ทำสำเนา</button>
      <button type="button" class="btn sm outline" data-a="up"${pos <= 0 ? ' disabled' : ''}>เลื่อนขึ้น</button>
      <button type="button" class="btn sm outline" data-a="down"${pos < 0 || pos >= order.length - 1 ? ' disabled' : ''}>เลื่อนลง</button>
      ${isStatic && edited ? '<button type="button" class="btn sm outline" data-a="restore">คืนค่าเดิม</button>' : ''}
      ${!isStatic ? '<button type="button" class="btn sm danger" data-a="del">ลบบทความ</button>' : ''}
    </div>
    <p class="hint">${hid ? 'บทความนี้ซ่อนอยู่ — คนทั่วไปยังไม่เห็น (ลิงก์ตรงก็เปิดไม่ได้) กด “เผยแพร่” เมื่อพร้อม · ' : ''}${isStatic ? (edited ? 'บทความตั้งต้นที่ถูกแก้ไขแล้ว — เว็บแสดงฉบับที่แก้นี้แทนต้นฉบับ' : 'บทความตั้งต้น — จะเริ่มเก็บฉบับแก้ไขเมื่อคุณแก้ข้อความ') : 'บทความที่สร้างใหม่'}</p>
  </div>
  <div class="ct-editor">
    ${field('ชื่อบทความ', inp('title', m.title))}
    ${field('คำโปรยใต้ชื่อ', inp('subtitle', m.subtitle))}
    <div class="ct-row2">
      ${field('หมวดหมู่', `<input type="text" data-p="category" value="${esc(m.category)}" list="cta-cats" autocomplete="off"><datalist id="cta-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}
      ${field('เวลาอ่าน (นาที)', `<input type="number" min="1" max="120" data-p="readMinutes" data-t="num" value="${esc(m.readMinutes)}">`)}
    </div>
    ${field('แท็ก (คั่นด้วยเครื่องหมายจุลภาค ,)', inp('tags', arr(m.tags).join(', '), 'data-t="tags"'))}
    ${field('สรุป (แสดงใต้ชื่อในหน้าอ่านและใช้เป็นคำอธิบายในผลค้นหา)', area('summary', m.summary, rowsFor(m.summary, 3, 10)))}
    ${listBlock('keyPoints', 'ใจความสำคัญ', '', kp, 'เพิ่มข้อ')}
    <div class="ct-block"><div class="ct-bh"><b>เนื้อหาบทความ</b><span class="hint">${m.sections.length} หัวข้อ</span></div>
      ${m.sections.map((s, i) => sectionBlock(s, i, m.sections.length)).join('') || '<p class="hint">ยังไม่มีหัวข้อ</p>'}
      <div class="ct-actions"><button type="button" class="btn sm outline" data-a="add" data-p="sections">${icon('plus')}เพิ่มหัวข้อ</button></div></div>
    ${listBlock('steps', 'ขั้นตอนปฏิบัติ', '', steps, 'เพิ่มขั้นตอน')}
    <div class="ct-block"><div class="ct-bh"><b>รายการตรวจสอบ (checklist)</b></div>
      ${field('ชื่อรายการ', inp('checklist.title', m.checklist.title))}
      ${field('รายการ (บรรทัดละ 1 ข้อ — เว้นว่างทั้งหมด = ไม่แสดงส่วนนี้)', area('checklist.items', m.checklist.items.join('\n'), rowsFor(m.checklist.items.join('\n'), 3, 12), 'lines'))}</div>
    <div class="ct-block"><div class="ct-bh"><b>มาตราที่เกี่ยวข้อง</b></div>
      <p class="hint">พิมพ์รหัสมาตราหรือเลือกจากรายการ (เช่น pc-326) หน้าเว็บจะดึงชื่อมาตรา โทษ และอายุความจากฐานกฎหมายให้เอง</p>
      ${refChips('relatedItems', m.relatedItems, lawIdx?.items, 'cta-dl-items', 'รหัสมาตรา เช่น pc-326')}</div>
    <div class="ct-block"><div class="ct-bh"><b>คำพิพากษาฎีกาที่เกี่ยวข้อง</b></div>
      ${refChips('relatedPrecedents', m.relatedPrecedents, lawIdx?.prec, 'cta-dl-prec', 'เลขฎีกา เช่น ฎีกาที่ 1234/2565')}</div>
    ${listBlock('faq', 'คำถามที่พบบ่อย', '', faq, 'เพิ่มคำถาม')}
    ${listBlock('sources', 'แหล่งอ้างอิง', '', src, 'เพิ่มแหล่งอ้างอิง')}
    <div class="ct-row2">
      ${field('สถานะการตรวจ (แสดงใต้ชื่อบทความ)', inp('reviewStatus', m.reviewStatus))}
      ${field('ปรับปรุงล่าสุด', `<input type="date" id="cta-updated" data-p="updated" value="${esc(m.updated)}">`)}
    </div>
    <p class="hint">บันทึกอัตโนมัติทุกครั้งที่แก้ · วันที่ปรับปรุงล่าสุดจะเปลี่ยนเป็นวันนี้เองเมื่อแก้เนื้อหา</p>
  </div>`;
}

function renderEditor(focus) {
  const el = box.querySelector('#cta-ed');
  if (!el) return;
  if (!cur) { el.innerHTML = '<p class="empty">เลือกบทความทางซ้ายเพื่อแก้ไข หรือกด “+ บทความใหม่”</p>'; return; }
  el.innerHTML = editorHtml();
  if (focus) el.querySelector(`[data-p="${focus}"]`)?.focus();
}

// ---------- เปิด/แก้ไขบทความ ----------
async function loadStatic(slug) {
  if (staticCache.has(slug)) return staticCache.get(slug);
  const r = await fetch(`/articles-data/${encodeURIComponent(slug)}.json`);
  if (!r.ok) throw new Error('โหลดบทความตั้งต้นไม่ได้ (' + r.status + ')');
  const a = await r.json();
  staticCache.set(slug, a);
  return a;
}

async function openArticle(slug) {
  try {
    const a = state.items[slug] || await loadStatic(slug);
    cur = forEditor(a);
    if (state.items[slug]?.published === false) cur.published = false;
    sel = slug;
  } catch (e) {
    ctx.notify({ type: 'error', message: 'เปิดบทความไม่สำเร็จ: ' + (e.message || e) });
    return;
  }
  renderList(); renderEditor();
  if (matchMedia('(max-width: 860px)').matches) box.querySelector('#cta-ed')?.scrollIntoView({ block: 'start' });
}

const getAt = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setAt(o, path, v) {
  const ks = path.split('.');
  const last = ks.pop();
  const p = ks.reduce((a, k) => (a[k] ??= {}), o);
  p[last] = v;
}
const readVal = (el) => {
  const tp = el.dataset.t, v = el.value;
  if (tp === 'bool') return el.checked;
  if (tp === 'num') return Math.max(1, Math.round(+v) || 1);
  if (tp === 'lines') return v.split('\n').map(t).filter(Boolean);
  if (tp === 'paras') return v.split(/\n\s*\n/).map((x) => t(x.replace(/\n/g, ' ').replace(/ {2,}/g, ' '))).filter(Boolean);
  if (tp === 'tags') return v.split(/[,，]/).map(t).filter(Boolean);
  return v;
};

/** มีการแก้เนื้อหา: อัปเดตวันที่ + ลงทะเบียนบันทึก */
function touch(path) {
  if (!cur) return;
  if (path !== 'updated') {
    cur.updated = today();
    const d = box.querySelector('#cta-updated');
    if (d) d.value = cur.updated;
  }
  const first = !state.items[cur.slug];
  setItemOp(cur.slug, cur);
  if (first || path === 'title' || path === 'category' || path === 'subtitle') renderListSoon();
  if (path === 'title') { const b = box.querySelector('.cta-head .ct-bh b'); if (b) b.textContent = cur.title || '(ยังไม่มีชื่อ)'; }
  if (first) { const bd = box.querySelector('.cta-head .cta-bd'); if (bd) bd.innerHTML = badges({ slug: cur.slug, _isStatic: sMap.has(cur.slug), _edited: true, _hidden: isHidden(state, cur.slug) }); }
}

const NEW_ITEM = {
  keyPoints: () => '', steps: () => ({ title: '', detail: '' }), faq: () => ({ q: '', a: '' }), sources: () => ({ label: '', url: '', verified: false }),
  sections: () => ({ id: `sec-${Math.max(0, ...cur.sections.map((s) => +String(s.id).replace(/\D/g, '') || 0)) + 1}`, heading: '', paragraphs: [] }),
};

function setHidden(slug, hide) {
  const isStatic = sMap.has(slug);
  if (isStatic) apply('hidden:' + slug, (s) => { s.hidden = s.hidden.filter((x) => x !== slug); if (hide) s.hidden.push(slug); });
  // บทความที่มีฉบับของตัวเอง (สร้างใหม่/แก้แล้ว) ต้องเก็บ published ให้ตรงกัน; บทความตั้งต้นที่ยังไม่แก้ใช้แค่รายการ hidden
  const has = !!state.items[slug];
  const m = cur?.slug === slug ? cur : (has ? clone(state.items[slug]) : null);
  if (m && has) {
    if (hide && !isStatic) m.published = false; else delete m.published;
    setItemOp(slug, m);
  }
  flushNow();
}

async function onAction(btn) {
  const a = btn.dataset.a, p = btn.dataset.p, i = +btn.dataset.i;
  const slug = cur?.slug;
  switch (a) {
    case 'open': return openArticle(btn.dataset.slug);
    case 'new': creating = { from: null, slug: '', title: '' }; renderCreate(); box.querySelector('#cta-nslug')?.focus(); return;
    case 'dup': creating = { from: slug, slug: `${slug}-copy`.slice(0, 61), title: `สำเนา ${cur.title || ''}`.trim() }; renderCreate(); box.querySelector('#cta-create')?.scrollIntoView({ block: 'nearest' }); box.querySelector('#cta-nslug')?.select(); return;
    case 'createCancel': creating = null; renderCreate(); return;
    case 'createGo': {
      const s = t(box.querySelector('#cta-nslug')?.value).toLowerCase(), ti = t(box.querySelector('#cta-ntitle')?.value);
      const bad = slugProblem(s);
      if (bad) { const m = box.querySelector('#cta-nmsg'); if (m) { m.textContent = bad; m.classList.add('cta-err'); } return; }
      const model = creating?.from ? { ...forEditor(clean(cur)), slug: s, title: ti || s, updated: today(), published: false } : blank(s, ti || s);
      creating = null; renderCreate();
      cur = model; sel = s;
      setItemOp(s, model); flushNow();
      renderList(); renderEditor('title');
      return;
    }
    case 'toggleHide': setHidden(slug, !isHidden(state, slug)); renderList(); renderEditor(); return;
    case 'del': {
      if (!await ctx.confirmBox(`ลบบทความ “${cur.title || slug}” ถาวร?\nคนที่มีลิงก์จะเปิดไม่ได้อีก`, { title: 'ลบบทความ', okText: 'ลบ', danger: true })) return;
      apply('item:' + slug, (s) => { delete s.items[slug]; });
      apply('order-rm:' + slug, (s) => { s.order = s.order.filter((x) => x !== slug); });
      cur = null; sel = null; flushNow(); renderList(); renderEditor(); return;
    }
    case 'restore': {
      if (!await ctx.confirmBox('ทิ้งฉบับที่แก้ไข แล้วกลับไปใช้บทความต้นฉบับ?', { title: 'คืนค่าเดิม', okText: 'คืนค่าเดิม', danger: true })) return;
      apply('item:' + slug, (s) => { delete s.items[slug]; });
      flushNow();
      try { cur = forEditor(await loadStatic(slug)); } catch (e) { cur = null; ctx.notify({ type: 'error', message: String(e.message || e) }); }
      renderList(); renderEditor(); return;
    }
    case 'up': case 'down': {
      const order = rows().map((r) => r.slug), k = order.indexOf(slug), j = k + (a === 'up' ? -1 : 1);
      if (k < 0 || j < 0 || j >= order.length) return;
      [order[k], order[j]] = [order[j], order[k]];
      apply('order', (s) => { s.order = order.slice(); });
      flushNow(); renderList(); renderEditor(); return;
    }
    case 'add': {
      const list = (cur[p] = arr(cur[p])), item = NEW_ITEM[p]();
      list.push(item); touch(p);
      renderEditor(p === 'keyPoints' ? `keyPoints.${list.length - 1}` : p === 'sections' ? `sections.${list.length - 1}.heading` : `${p}.${list.length - 1}.${p === 'faq' ? 'q' : p === 'sources' ? 'label' : 'title'}`);
      return;
    }
    case 'rm': {
      if (btn.dataset.confirm && !await ctx.confirmBox('ลบหัวข้อนี้พร้อมเนื้อหาในหัวข้อ?', { title: 'ลบหัวข้อ', okText: 'ลบ', danger: true })) return;
      cur[p].splice(i, 1); touch(p); renderEditor(); return;
    }
    case 'mv': {
      const d = +btn.dataset.d, j = i + d;
      if (j < 0 || j >= cur[p].length) return;
      [cur[p][i], cur[p][j]] = [cur[p][j], cur[p][i]]; touch(p); renderEditor(); return;
    }
    case 'rmTable':
      if (!await ctx.confirmBox('เอาตารางในหัวข้อนี้ออก? (กู้คืนไม่ได้ ยกเว้นกด “คืนค่าเดิม”)', { title: 'เอาตารางออก', okText: 'เอาออก', danger: true })) return;
      delete cur.sections[i].table; touch('sections'); renderEditor(); return;
    case 'addRef': {
      const el = btn.closest('.ct-block').querySelector('[data-ref]'), v = t(el?.value);
      if (!v) return;
      if (!cur[p].includes(v)) { cur[p].push(v); touch(p); }
      renderEditor(); box.querySelector(`[data-ref="${p}"]`)?.focus(); return;
    }
    default:
  }
}

export default {
  id: 'articles',
  label: 'บทความ',
  hint: 'สร้าง แก้ ซ่อน และจัดลำดับบทความในหน้า /articles/',
  async mount(b, c) {
    ctx = c; box = b;
    state = norm({}); sIdx = []; sMap = new Map(); pending = new Map(); timer = null; flushP = Promise.resolve();
    sel = null; cur = null; q = ''; creating = null; staticCache = new Map(); lawIdx = buildLawIdx();
    if (!document.getElementById('cta-css')) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.id = 'cta-css'; l.href = '/css/content-articles.css';
      document.head.appendChild(l);
    }
    const [live, idx] = await Promise.all([
      c.load('articles'),
      fetch('/articles-data/index.json').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    state = norm(live); sIdx = Array.isArray(idx) ? idx : []; sMap = new Map(sIdx.map((e) => [e.slug, e]));

    const dl = lawIdx ? `<datalist id="cta-dl-items">${[...lawIdx.items].map(([id, lb]) => `<option value="${esc(id)}" label="${esc(lb)}"></option>`).join('')}</datalist>
      <datalist id="cta-dl-prec">${[...lawIdx.prec].map(([id, lb]) => `<option value="${esc(id)}" label="${esc(lb)}"></option>`).join('')}</datalist>` : '';
    box.innerHTML = `<div class="ct-split">
      <div class="cta-side">
        <div class="ct-actions"><button type="button" class="btn sm" data-a="new">${icon('plus')}บทความใหม่</button></div>
        <div id="cta-create"></div>
        <input type="search" id="cta-q" class="cta-q" placeholder="ค้นหาบทความ" aria-label="ค้นหาบทความ" autocomplete="off">
        <p class="hint" id="cta-count" role="status"></p>
        <div class="ct-list" id="cta-list"></div>
        ${sIdx.length ? '' : '<p class="hint">โหลดรายการบทความตั้งต้นไม่ได้ — จะเห็นเฉพาะบทความที่สร้างเอง</p>'}
      </div>
      <div id="cta-ed"></div>${dl}
    </div>`;
    ac = new AbortController();
    const sig = { signal: ac.signal };
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-a]');
      if (btn && box.contains(btn) && btn.tagName === 'BUTTON' && !btn.disabled) onAction(btn);
    }, sig);
    box.addEventListener('input', (e) => {
      const el = e.target;
      if (el.id === 'cta-q') { q = el.value; renderList(); return; }
      if (el.id === 'cta-nslug' || el.id === 'cta-ntitle') {
        if (creating) { if (el.id === 'cta-nslug') creating.slug = el.value; else creating.title = el.value; }
        const m = box.querySelector('#cta-nmsg');
        if (m && el.id === 'cta-nslug') { const bad = el.value ? slugProblem(el.value.trim().toLowerCase()) : ''; m.textContent = bad; m.classList.toggle('cta-err', !!bad); }
        return;
      }
      if (!el.dataset?.p || !cur) return;
      setAt(cur, el.dataset.p, readVal(el));
      touch(el.dataset.p);
    }, sig);
    box.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset?.a === 'calloutType' && cur) {
        const s = cur.sections[+el.dataset.i];
        s.callout = el.value ? { type: el.value, text: s.callout?.text || '' } : undefined;
        touch('sections'); renderEditor();
      }
    }, sig);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.dataset?.ref) { e.preventDefault(); e.target.closest('.ct-block').querySelector('[data-a=addRef]')?.click(); }
      if (e.key === 'Enter' && (e.target.id === 'cta-nslug' || e.target.id === 'cta-ntitle')) { e.preventDefault(); box.querySelector('[data-a=createGo]')?.click(); }
    }, sig);
    renderList(); renderEditor();
  },
  async unmount() {
    await flushNow();
    ac?.abort();
    cancelAnimationFrame(listRaf);
    if (pending?.size) ctx.notify({ type: 'error', message: 'บันทึกบทความไม่สำเร็จ — การแก้ล่าสุดอาจหาย กรุณาตรวจการเชื่อมต่อแล้วแก้ใหม่' });
  },
};
