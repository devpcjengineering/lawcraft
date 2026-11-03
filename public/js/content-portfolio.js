// แท็บ "ผลงาน" ในหน้า จัดการเนื้อหา: สร้าง/แก้/เผยแพร่/แนะนำ/จัดลำดับ/ลบผลงานที่ผ่านมา — บันทึกอัตโนมัติ (หน่วง 700 ms)
// หน้าจอ 2 ระดับเหมือนแท็บบทความ: (1) รายการ + ค้นหา/ตัวกรอง (2) หน้าแก้ไขเต็มหน้า แถบหัวติดบน + ฟอร์มพับได้ + ตัวอย่างการ์ด + รายการตรวจมรรยาท
// ที่เก็บ (key 'portfolio' → law_data 'content-portfolio' หรือ data/content/portfolio.json): { items: [ผลงาน], order: [id] } — ดู /portfolio/model.js
// กติกาเผยแพร่: สวิตช์ "เผยแพร่" กดได้ต่อเมื่อ consent = true (ผู้รับบริการยินยอมให้เผยแพร่) — หน้าเว็บก็กรอง published && consent ซ้ำอีกชั้น
// กันเขียนทับกัน: ทุกครั้งที่บันทึกจะโหลดค่าล่าสุดจากหลังบ้านก่อน แล้วใช้ "การแก้ที่ค้างอยู่" ซ้ำลงไป (เหมือน content-articles.js)
// SEO: หน้าสาธารณะเป็น /portfolio/<slug>/ (เรนเดอร์ฝั่งเซิร์ฟเวอร์) — ช่อง seo{title,description,noindex} · รูปแรกใน images = ภาพปก/ภาพตอนแชร์ลิงก์
//   ตัวอย่างผลค้นหา/รายการตรวจใช้ /shared/post-seo.js · อัปโหลดรูปผ่าน ctx.api.uploadMedia (bucket media/portfolio) ย่อก่อนด้วย js/media.js
import { SLUG_RE, CATEGORIES, ROLES, GUARANTEE_RE, normPortfolio, orderedItems, cleanItem, canPublish, isLive, newId, yearLabel } from '../portfolio/model.js';
import { portfolioPath } from '/shared/post-seo.js';
import { seoBody, seoMeta, renderSeo } from './content-seo.js';
import { prepareImage, fmtBytes } from './media.js';
import { icon } from './icons.js';
import { urls } from './router.js';

const KEY = 'portfolio';
const KIND = 'portfolio';
const MAX_IMAGES = 12; // ตรงกับ cleanItem
const isHttp = (u) => /^https?:\/\/\S+$/i.test(String(u || ''));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (x) => JSON.parse(JSON.stringify(x));
const t = (s) => String(s ?? '').trim();
const arr = (x) => (Array.isArray(x) ? x : []);
const nowIso = () => new Date().toISOString();
const shortDate = (iso) => { try { return iso ? new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : ''; } catch { return iso || ''; } };
const SAVE_MS = 700;
const FILTERS = [['all', 'ทั้งหมด'], ['pub', 'เผยแพร่'], ['draft', 'ร่าง'], ['featured', 'แนะนำ'], ['noconsent', 'ยังไม่ยินยอม']];
const CUR_YEAR = new Date().getFullYear() + 543;

// ---------- สถานะของโมดูล (ล้างทุกครั้งที่ mount) ----------
let ctx, box, ac, state, pending, timer, flushP, sel, cur, q, creating, listRaf, slugErr;
let view, fil, openK, listY, stTxt, stTone, upBusy;
const canUpload = () => typeof ctx?.api?.uploadMedia === 'function'; // โหมดไฟล์ในเครื่องไม่มีที่เก็บรูป
/** ลิงก์เปิดดูหน้าสาธารณะ — ?v= กันแคช CDN ให้แอดมินเห็นฉบับล่าสุดเสมอ */
const viewUrl = (slug) => `${portfolioPath(slug)}?v=${Date.now()}`;

// ---------- บันทึกแบบสะสม (ops) ----------
function apply(key, fn) { pending.delete(key); pending.set(key, fn); fn(state); schedule(); }
function schedule() { ctx.setState('กำลังบันทึก…', 'busy'); clearTimeout(timer); timer = setTimeout(flushNow, SAVE_MS); }
function flushNow() { clearTimeout(timer); timer = null; flushP = flushP.then(doFlush, doFlush); return flushP; }
async function doFlush() {
  if (!pending.size) return;
  const ops = [...pending.entries()];
  pending.clear();
  ctx.setState('กำลังบันทึก…', 'busy');
  try {
    const remote = normPortfolio(await ctx.load(KEY));
    ops.forEach(([, fn]) => fn(remote));
    await ctx.save(KEY, { items: remote.items, order: remote.order });
    state = remote;
    pending.forEach((fn) => fn(state));
    ctx.setState('บันทึกแล้ว', 'ok');
  } catch (e) {
    for (const [k, fn] of ops) if (!pending.has(k)) pending.set(k, fn);
    ctx.setState('บันทึกไม่สำเร็จ: ' + (e?.message || e), 'err');
  }
}

// ---------- ข้อมูล ----------
const byId = (id, s = state) => s.items.find((x) => x.id === id);
const rows = () => orderedItems(state);
const clean = (m) => cleanItem(m) || m;
const setItemOp = (id, model) => apply('item:' + id, (s) => {
  const c = cleanItem(model); if (!c) return;
  const i = s.items.findIndex((x) => x.id === id);
  if (i < 0) { s.items.push(c); if (!s.order.includes(id)) s.order.unshift(id); } else s.items[i] = c;
});
const blank = (id, slug, title) => ({
  id, slug, title, category: CATEGORIES[0], summary: '', body: [], outcome: '', court: '', year: CUR_YEAR, role: ROLES[0], tags: [], images: [],
  consent: false, anonymized: true, noGuarantee: false, published: false, featured: false, createdAt: nowIso(), updatedAt: nowIso(),
  seo: { title: '', description: '', noindex: false },
});
/** โมเดลสำหรับฟอร์ม: cleanItem ตัด seo ที่ว่างทิ้ง จึงเติมกลับให้ช่องกรอกอ้างถึงได้ */
const forEditor = (it) => ({ ...clone(it), seo: { title: '', description: '', noindex: false, ...(it.seo || {}) } });
/** ตั้งค่าตามพาธ a.b.c (สร้างออบเจ็กต์กลางทางให้) */
function setAt(o, path, v) {
  const ks = path.split('.'), last = ks.pop();
  ks.reduce((a, k) => (a[k] ??= {}), o)[last] = v;
}
const slugTaken = (slug, exceptId) => state.items.some((x) => x.id !== exceptId && (x.slug === slug || x.id === slug));
const slugProblem = (s, exceptId) => (!SLUG_RE.test(s) ? 'slug ต้องเป็น a-z 0-9 และ - (ขึ้นต้นด้วยตัวอักษรหรือตัวเลข ยาว 3–61 ตัว)' : slugTaken(s, exceptId) ? 'slug นี้มีอยู่แล้ว' : '');
/** ข้อความที่อาจเข้าข่ายรับประกันผล (ให้ทนายตรวจ) */
const guaranteeHits = (m) => [m.title, m.summary, m.outcome, ...arr(m.body)].filter((x) => GUARANTEE_RE.test(String(x || '')));

// ---------- ป้าย ----------
function badges(r) {
  const b = [];
  b.push(isLive(r) ? '<span class="ct-badge cta-ok">เผยแพร่</span>' : r.published ? '<span class="ct-badge warn">รอความยินยอม</span>' : '<span class="ct-badge off">ร่าง</span>');
  if (r.featured) b.push(`<span class="ct-badge cpf-feat">${icon('sparkle', { size: 13, stroke: 2 })}แนะนำ</span>`);
  if (!r.consent) b.push('<span class="ct-badge cpf-nc">ยังไม่ยินยอม</span>');
  if (r.anonymized) b.push(`<span class="ct-badge cpf-anon">${icon('eyeOff', { size: 13, stroke: 2 })}ปกปิดข้อมูล</span>`);
  return b.join('');
}

// ---------- หน้ารายการ ----------
const filterOk = (r) => fil === 'all' || (fil === 'pub' && isLive(r)) || (fil === 'draft' && !isLive(r)) || (fil === 'featured' && r.featured) || (fil === 'noconsent' && !r.consent);
function renderChips(all) {
  const el = box.querySelector('#cpf-fchips');
  if (!el) return;
  const n = (f) => all.filter((r) => { const o = fil; fil = f; const ok = filterOk(r); fil = o; return ok; }).length;
  el.innerHTML = FILTERS.map(([f, l]) => `<button type="button" class="cpf-fc" data-a="filter" data-f="${f}" aria-pressed="${f === fil}">${l}<i>${n(f)}</i></button>`).join('');
}
function rowHtml(r, no, k, total, canMove) {
  const id = esc(r.id);
  const mv = (dir, ico, label, off) => `<button type="button" class="cpf-ib" data-a="${dir}" data-id="${id}" title="${label}" aria-label="${label}"${off ? ' disabled' : ''}>${icon(ico)}</button>`;
  const pubOff = !r.consent;
  return `<article class="cpf-row${isLive(r) ? '' : ' is-off'}${r.id === sel ? ' on' : ''}" data-id="${id}">
    <span class="cpf-no" aria-label="ลำดับที่ ${no}">${String(no).padStart(2, '0')}</span>
    <div class="cpf-main">
      <h3><button type="button" class="cpf-title" data-a="open" data-id="${id}">${esc(r.title || '(ยังไม่มีชื่อ)')}</button></h3>
      ${r.summary ? `<p class="cpf-sub">${esc(r.summary)}</p>` : ''}
      <p class="cpf-meta"><span class="cpf-cat">${esc(r.category || 'ไม่มีหมวด')}</span>${r.year ? `<span class="cpf-dot">${icon('calendar', { size: 14 })}${esc(yearLabel(r.year))}</span>` : ''}${r.role ? `<span class="cpf-dot">${icon('user', { size: 14 })}${esc(r.role)}</span>` : ''}${r.court ? `<span class="cpf-dot">${icon('building', { size: 14 })}${esc(r.court)}</span>` : ''}${arr(r.tags).slice(0, 3).map((x) => `<span class="cpf-tag">${esc(x)}</span>`).join('')}${r.updatedAt ? `<span class="cpf-dot">${icon('clock', { size: 14 })}แก้ ${esc(shortDate(r.updatedAt))}</span>` : ''}<code class="cpf-slug">${esc(portfolioPath(r.slug))}</code></p>
    </div>
    <div class="cpf-side">
      <div class="cpf-bd">${badges(r)}</div>
      <div class="cpf-acts">
        <button type="button" class="btn sm primary" data-a="open" data-id="${id}">${icon('edit')}แก้ไข</button>
        <button type="button" class="btn sm outline" data-a="togglePub" data-id="${id}"${pubOff ? ' disabled title="ต้องติ๊ก “ได้รับความยินยอมแล้ว” ในหน้าแก้ไขก่อน"' : ''}>${icon(r.published ? 'eyeOff' : 'eye')}${r.published ? 'ซ่อน' : 'เผยแพร่'}</button>
        <button type="button" class="cpf-ib${r.featured ? ' on' : ''}" data-a="toggleFeat" data-id="${id}" title="${r.featured ? 'เอาออกจากผลงานแนะนำ' : 'ตั้งเป็นผลงานแนะนำ'}" aria-pressed="${r.featured}" aria-label="ผลงานแนะนำ ${esc(r.title)}">${icon('sparkle')}</button>
        <button type="button" class="cpf-ib" data-a="dup" data-id="${id}" title="ทำสำเนา" aria-label="ทำสำเนา ${esc(r.title)}">${icon('copy')}</button>
        <a class="cpf-ib" href="${esc(viewUrl(r.slug))}" target="_blank" rel="noopener" title="ดูหน้าผลงาน" aria-label="ดูหน้าผลงาน ${esc(r.title)}">${icon('external')}</a>
        ${mv('up', 'arrowUp', canMove ? 'ย้ายขึ้น' : 'ล้างคำค้นและตัวกรองก่อนจึงจะย้ายลำดับได้', !canMove || k === 0)}
        ${mv('down', 'arrowDown', canMove ? 'ย้ายลง' : 'ล้างคำค้นและตัวกรองก่อนจึงจะย้ายลำดับได้', !canMove || k === total - 1)}
      </div>
    </div>
  </article>`;
}
function renderList() {
  const el = box.querySelector('#cpf-list');
  if (!el) return;
  const n = q.trim().toLowerCase();
  const all = rows();
  renderChips(all);
  const rs = all.filter((r) => filterOk(r) && (!n || [r.title, r.summary, r.slug, r.category, r.court, r.role, ...arr(r.tags)].join(' ').toLowerCase().includes(n)));
  const canMove = !n && fil === 'all';
  const no = new Map(all.map((r, i) => [r.id, i]));
  el.innerHTML = rs.length
    ? rs.map((r) => rowHtml(r, no.get(r.id) + 1, no.get(r.id), all.length, canMove)).join('')
    : `<p class="empty">${all.length ? 'ไม่พบผลงานที่ตรงกับคำค้นหรือตัวกรอง' : 'ยังไม่มีผลงาน — กด “ผลงานใหม่” เพื่อเริ่ม'}</p>`;
  const c = box.querySelector('#cpf-count');
  if (c) c.textContent = rs.length === all.length ? `${all.length} ผลงาน · ${all.filter(isLive).length} เผยแพร่ · เรียงตามที่แสดงบนเว็บ (ผลงานแนะนำขึ้นก่อนเสมอ)` : `แสดง ${rs.length} จาก ${all.length} ผลงาน`;
}
const renderListSoon = () => { cancelAnimationFrame(listRaf); listRaf = requestAnimationFrame(renderList); };

function createPanel() {
  if (!creating) return '';
  const { from, slug, title } = creating;
  return `<div class="ct-block cpf-new">
    <b>${from ? 'ทำสำเนาผลงาน' : 'ผลงานใหม่'}</b>
    <label class="f"><span>ชื่อผลงาน (เช่น “คดีฉ้อโกงซื้อขายออนไลน์ เรียกเงินคืน”) — ไม่ใส่ชื่อลูกความ</span><input type="text" id="cpf-ntitle" value="${esc(title)}" autocomplete="off"></label>
    <label class="f"><span>slug ใช้ในลิงก์ (a-z 0-9 และ - ยาว 3–61 ตัว — แก้ภายหลังได้)</span><input type="text" id="cpf-nslug" value="${esc(slug)}" autocomplete="off" spellcheck="false" placeholder="เช่น online-fraud-refund-2568"></label>
    <p class="hint" id="cpf-nmsg" role="status"></p>
    <div class="ct-actions"><button type="button" class="btn sm primary" data-a="createGo">สร้างและเปิดแก้ไข</button><button type="button" class="btn sm outline" data-a="createCancel">ยกเลิก</button></div>
  </div>`;
}
function renderCreate() { const el = box.querySelector('#cpf-create'); if (el) el.innerHTML = createPanel(); }

// ---------- ฟอร์มแก้ไข ----------
const field = (label, inner, cls = '') => `<label class="f ${cls}"><span>${label}</span>${inner}</label>`;
const inp = (p, v, extra = '') => `<input type="text" data-p="${esc(p)}" value="${esc(v)}" ${extra}>`;
const area = (p, v, rowsN, tp = '') => `<textarea data-p="${esc(p)}" ${tp ? `data-t="${tp}"` : ''} rows="${rowsN}">${esc(v)}</textarea>`;
const rowsFor = (txt, min = 3, max = 16) => Math.max(min, Math.min(max, Math.ceil(String(txt).length / 70) + String(txt).split('\n').length));
const isOpen = (key, def) => (openK.has(key) ? openK.get(key) : def);
function dsec(key, ico, title, meta, body, def = false) {
  return `<details class="cpf-d" data-k="${key}"${isOpen(key, def) ? ' open' : ''}>
    <summary><span class="cpf-d-i">${icon(ico)}</span><span class="cpf-d-t"><b>${title}</b>${meta ? `<small>${meta}</small>` : ''}</span>${icon('chevronDown', { cls: 'cpf-d-c' })}</summary>
    <div class="cpf-d-b">${body}</div></details>`;
}

/** การ์ดตัวอย่าง = หน้าตาเดียวกับการ์ดบนเว็บ (/portfolio/portfolio.css .pf-card) */
function previewHtml(m) {
  const live = isLive(m);
  return `<div class="cpf-pv-h"><b>ตัวอย่างการ์ดบนเว็บ</b><span class="hint">${live ? 'กำลังแสดงอยู่ที่ /portfolio/' : m.consent ? 'ยังไม่เผยแพร่ — คนทั่วไปยังไม่เห็น' : 'ยังไม่ได้รับความยินยอม — เผยแพร่ไม่ได้'}</span></div>
    <article class="cpf-pv-card${m.featured ? ' feat' : ''}">
      ${m.images[0] ? `<img class="cpf-pv-img" src="${esc(m.images[0])}" alt="" loading="lazy">` : ''}
      <span class="cpf-pv-top"><span class="cpf-pv-cat">${esc(m.category || 'ไม่มีหมวด')}</span>${m.featured ? '<span class="cpf-pv-feat">ผลงานแนะนำ</span>' : ''}</span>
      <h3>${esc(m.title || '(ยังไม่มีชื่อ)')}</h3>
      <p>${esc(m.summary || 'สรุปสั้น ๆ ว่าเป็นเรื่องอะไร ลูกความประสบปัญหาอะไร และดำเนินการอย่างไร')}</p>
      ${m.outcome ? `<p class="cpf-pv-out"><b>ผลลัพธ์</b> ${esc(m.outcome)}</p>` : ''}
      <span class="cpf-pv-meta">${[m.role, m.court, yearLabel(m.year)].filter(Boolean).map(esc).join(' · ')}</span>
      ${m.anonymized ? `<span class="cpf-pv-anon">${icon('eyeOff', { size: 13 })}ปกปิดข้อมูลผู้รับบริการ</span>` : ''}
    </article>`;
}
function renderPreview() { const el = box.querySelector('#cpf-pv'); if (el && cur) el.innerHTML = previewHtml(cur); }

/** รายการตรวจมรรยาท (ให้ทนายยืนยัน — ข้อบังคับสภาทนายความว่าด้วยมรรยาททนายความ) */
function checklistHtml(m) {
  const hits = guaranteeHits(m);
  const row = (p, ok, label, hint) => `<label class="cpf-ck${ok ? ' ok' : ''}"><input type="checkbox" data-p="${p}" data-t="bool"${ok ? ' checked' : ''}><span><b>${label}</b><small>${hint}</small></span></label>`;
  return `<p class="hint">ติ๊กยืนยันก่อนเผยแพร่ — เว็บแสดงผลงานได้ต่อเมื่อได้รับความยินยอมจากผู้รับบริการแล้วเท่านั้น (สวิตช์ “เผยแพร่” จะกดได้หลังติ๊กข้อสุดท้าย)</p>
    ${row('anonymized', m.anonymized, 'ไม่ระบุชื่อ/ข้อมูลที่ระบุตัวลูกความ', 'ปกปิดชื่อ ชื่อร้าน เลขคดี ภาพ และรายละเอียดที่ทำให้รู้ว่าเป็นใคร — หน้าเว็บจะแสดงป้าย “ปกปิดข้อมูลผู้รับบริการ”')}
    ${row('noGuarantee', m.noGuarantee, 'ไม่รับประกันผล / ไม่อวดอ้าง', 'เล่าข้อเท็จจริงและผลที่เกิดขึ้นจริง ไม่ใช้คำว่าชนะแน่ การันตี 100% หรือเปรียบเทียบกับสำนักงานอื่น')}
    ${row('consent', m.consent, 'ได้รับความยินยอมแล้ว', 'ผู้รับบริการยินยอมให้นำเรื่องมาเผยแพร่ (ควรเก็บหลักฐานความยินยอมไว้) — บังคับก่อนเผยแพร่')}
    ${hits.length ? `<div class="cpf-warn" role="alert">${icon('alert', { size: 16, stroke: 2 })}<div><b>พบข้อความที่อาจเข้าข่ายรับประกันผล</b> — ให้ทนายตรวจก่อนเผยแพร่: ${hits.map((h) => `“${esc(String(h).slice(0, 80))}${String(h).length > 80 ? '…' : ''}”`).join(', ')}</div></div>` : ''}`;
}
function renderChecklist() { const el = box.querySelector('#cpf-ck'); if (el && cur) el.innerHTML = checklistHtml(cur); }

/** รูปภาพ: รูปย่อพร้อมปุ่มลบ (รูปแรก = ปก) + ปุ่มอัปโหลดหลายรูป + ช่องลิงก์ */
function thumbsHtml(m) {
  const imgs = arr(m.images);
  return imgs.filter(isHttp).length ? imgs.map((u, i) => (isHttp(u) ? `<figure class="cpf-img"><img src="${esc(u)}" alt="" loading="lazy" decoding="async">${i === 0 ? '<span class="cpf-img-cover">ปก</span>' : ''}<button type="button" class="cpf-img-rm" data-a="rmImg" data-i="${i}" title="ลบรูปนี้" aria-label="ลบรูปที่ ${i + 1}"${upBusy ? ' disabled' : ''}>${icon('x', { size: 16, stroke: 2.4 })}</button></figure>` : '')).join('') : '';
}
function imagesHtml(m) {
  const can = canUpload(), full = arr(m.images).length >= MAX_IMAGES;
  return `<p class="hint">รูปแรกใช้เป็นภาพปกบนการ์ดและภาพตอนแชร์ลิงก์ (OG) · สูงสุด ${MAX_IMAGES} รูป · ห้ามใช้ภาพที่เห็นหน้า ชื่อ หรือเอกสารของลูกความ</p>
    <div class="ct-actions cpf-up">
      <button type="button" class="btn sm outline" data-a="upload"${can && !upBusy && !full ? '' : ' disabled'}${can ? (full ? ` title="ครบ ${MAX_IMAGES} รูปแล้ว"` : '') : ' title="อัปโหลดรูปได้เมื่อใช้ Supabase"'}>${icon('upload')}อัปโหลดรูป (เลือกได้หลายรูป)</button>
      <input type="file" id="cpf-file" accept="image/*" multiple hidden>
      <span class="hint" id="cpf-upst" role="status">${can ? '' : 'อัปโหลดรูปได้เมื่อใช้ Supabase — ตอนนี้ใส่ได้เฉพาะลิงก์รูป'}</span>
    </div>
    <div class="cpf-imgs" id="cpf-imgs">${thumbsHtml(m)}</div>
    ${field('ลิงก์รูปภาพ (https://… บรรทัดละ 1 รูป — เรียงลำดับใหม่ได้ที่นี่)', area('images', m.images.join('\n'), rowsFor(m.images.join('\n'), 2, 8), 'lines'))}`;
}
function renderImages() {
  const el = box.querySelector('#cpf-imgsec'); if (el && cur) el.innerHTML = imagesHtml(cur);
  const s = box.querySelector('.cpf-d[data-k="images"] > summary small'); if (s && cur) s.textContent = `${cur.images.length} รูป`;
}
const upStatus = (txt) => { const e = box.querySelector('#cpf-upst'); if (e) e.textContent = txt; };

/** อัปโหลดรูปทีละไฟล์: ย่อ → ส่งขึ้น Storage → ต่อท้าย images (ถ้าสลับผลงานไประหว่างรอ จะไม่ใส่ผิดเรื่อง) */
async function uploadImages(files) {
  if (!files.length || !cur || !canUpload() || upBusy) return;
  const id = cur.id, errs = [];
  upBusy = true; renderImages();
  for (let k = 0; k < files.length; k++) {
    if (!cur || cur.id !== id) break;
    if (cur.images.length >= MAX_IMAGES) { errs.push(`ครบ ${MAX_IMAGES} รูปแล้ว — รูปที่เหลือไม่ได้อัปโหลด`); break; }
    const n = files.length > 1 ? ` ${k + 1}/${files.length}` : '';
    try {
      upStatus(`กำลังย่อรูป${n}…`);
      const blob = await prepareImage(files[k], { max: 1600 });
      upStatus(`กำลังอัปโหลด${n}… (${fmtBytes(blob.size)})`);
      const { url } = await ctx.api.uploadMedia(blob, { folder: 'portfolio' });
      if (!cur || cur.id !== id) break;
      cur.images.push(url); touch('images');
    } catch (e) { errs.push(`${files[k]?.name || 'รูป'}: ${e?.message || e}`); }
  }
  upBusy = false;
  if (cur && cur.id === id) { renderImages(); upStatus(errs.length ? '' : `อัปโหลดแล้ว ${files.length - errs.length} รูป`); }
  if (errs.length) ctx.notify({ type: 'error', message: 'อัปโหลดรูปไม่สำเร็จ: ' + errs.join(' · ') });
}

function editorHtml() {
  const m = cur;
  const order = rows().map((r) => r.id), pos = order.indexOf(m.id);
  const cats = [...new Set([...CATEGORIES, ...rows().map((r) => r.category).filter(Boolean)])];
  const body = m.body.join('\n\n');
  const main = `
    ${field('ชื่อผลงาน (ไม่ใส่ชื่อลูกความ)', inp('title', m.title, 'class="cpf-big" placeholder="เช่น คดีฉ้อโกงซื้อขายออนไลน์ เรียกเงินคืน"'))}
    <div class="ct-row2">
      ${field('หมวด', `<input type="text" data-p="category" value="${esc(m.category)}" list="cpf-cats" autocomplete="off"><datalist id="cpf-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}
      ${field('บทบาท', `<select data-p="role">${[...ROLES, ...(ROLES.includes(m.role) || !m.role ? [] : [m.role])].map((r) => `<option value="${esc(r)}"${r === m.role ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>`)}
    </div>
    <div class="ct-row2">
      ${field('ปี พ.ศ.', `<input type="number" min="2500" max="2700" inputmode="numeric" data-p="year" data-t="num" value="${esc(m.year || '')}">`)}
      ${field('ศาล (ไม่บังคับ — ไม่ใส่เลขคดี)', inp('court', m.court, 'placeholder="เช่น ศาลแขวง… / ศาลจังหวัด…"'))}
    </div>
    ${field('สรุปสั้น (แสดงบนการ์ดและผลค้นหา)', area('summary', m.summary, rowsFor(m.summary, 2, 6)))}
    ${field('แท็ก (คั่นด้วยเครื่องหมายจุลภาค ,)', inp('tags', m.tags.join(', '), 'data-t="tags"'))}
    ${field('slug ใช้ในลิงก์ /portfolio/&lt;slug&gt;/ (เปลี่ยนแล้วลิงก์เดิมที่เคยแชร์จะเปิดไม่ได้)', `<input type="text" data-p="slug" value="${esc(m.slug)}" autocomplete="off" spellcheck="false"><small class="hint cpf-err" id="cpf-slugerr">${esc(slugErr || '')}</small>`, 'cpf-slugf')}`;
  const content = `
    ${field('รายละเอียด (เว้นบรรทัดว่าง 1 บรรทัด = ขึ้นย่อหน้าใหม่) — เล่าข้อเท็จจริงโดยย่อ ประเด็นกฎหมาย และสิ่งที่ทำ', area('body', body, rowsFor(body, 6, 20), 'paras'))}
    ${field('ผลลัพธ์ (เล่าตามจริง ไม่รับประกันว่าคดีอื่นจะได้ผลเดียวกัน)', area('outcome', m.outcome, rowsFor(m.outcome, 2, 8)))}`;
  const images = `<div id="cpf-imgsec" class="cpf-imgsec">${imagesHtml(m)}</div>`;
  const manage = `
    <p class="hint">ลำดับที่ ${pos + 1} จาก ${order.length} · สร้าง ${esc(shortDate(m.createdAt))} · แก้ล่าสุด ${esc(shortDate(m.updatedAt))} · id <code>${esc(m.id)}</code></p>
    <label class="chk cpf-chk"><input type="checkbox" data-p="featured" data-t="bool"${m.featured ? ' checked' : ''}><span>ผลงานแนะนำ — ขึ้นก่อนในหน้า /portfolio/ และแสดงบนหน้าแรก (สูงสุด 3 รายการ)</span></label>
    <div class="ct-actions">
      <button type="button" class="btn sm outline" data-a="dup" data-id="${esc(m.id)}">${icon('copy')}ทำสำเนา</button>
      <button type="button" class="btn sm outline" data-a="up" data-id="${esc(m.id)}"${pos <= 0 ? ' disabled' : ''}>${icon('arrowUp')}ย้ายขึ้น</button>
      <button type="button" class="btn sm outline" data-a="down" data-id="${esc(m.id)}"${pos < 0 || pos >= order.length - 1 ? ' disabled' : ''}>${icon('arrowDown')}ย้ายลง</button>
      <button type="button" class="btn sm danger" data-a="del">${icon('trash')}ลบผลงาน</button>
    </div>`;
  return `<div class="cpf-note" id="cpf-note" role="status"></div>
    <div class="cpf-grid">
      <div class="cpf-form">
        ${dsec('main', 'briefcase', 'ข้อมูลหลัก', 'ชื่อ · หมวด · บทบาท · ปี · สรุป', main, true)}
        ${dsec('content', 'fileText', 'รายละเอียดและผลลัพธ์', `${m.body.length} ย่อหน้า${m.outcome ? ' · มีผลลัพธ์' : ''}`, content, true)}
        ${dsec('check', 'shield', 'ความยินยอมและมรรยาททนายความ', `${[m.anonymized, m.noGuarantee, m.consent].filter(Boolean).length}/3 ข้อ`, `<div id="cpf-ck">${checklistHtml(m)}</div>`, true)}
        ${dsec('images', 'paperclip', 'รูปภาพ (ไม่บังคับ)', `${m.images.length} รูป`, images)}
        ${dsec('seo', 'globe', 'SEO · ผลค้นหา', seoMeta(KIND, m), seoBody(KIND, m, 'cpf', { title: 'ใช้ชื่อผลงาน + | ผลงาน LawCraft by PKT', description: 'ใช้สรุปสั้น' }))}
        ${dsec('manage', 'settings', 'จัดการผลงาน', 'แนะนำ · สำเนา · ลำดับ · ลบ', manage)}
        <p class="hint cpf-foot">บันทึกอัตโนมัติทุกครั้งที่แก้ · เว็บแสดงเฉพาะผลงานที่เผยแพร่และได้รับความยินยอมแล้ว<br>หน้าสาธารณะอยู่ที่ <code>${esc(portfolioPath(m.slug))}</code> — เสิร์ชเอนจินเก็บหน้านี้ได้โดยตรง (ฉบับที่แก้ขึ้นเว็บภายในไม่กี่นาที)</p>
      </div>
      <aside class="cpf-pv" id="cpf-pv" aria-label="ตัวอย่าง">${previewHtml(m)}</aside>
    </div>`;
}

function barHtml() {
  const m = cur, ok = canPublish(m), live = isLive(m);
  return `<button type="button" class="btn sm outline cpf-back" data-a="back">${icon('arrowLeft')}<span>ผลงานทั้งหมด</span></button>
    <div class="cpf-bar-t"><b>${esc(m.title || '(ยังไม่มีชื่อ)')}</b>
      <div class="cpf-bar-bd">${badges(m)}<small>${esc(portfolioPath(m.slug))}</small></div></div>
    <span class="save-state cpf-state" id="cpf-st" data-tone="${esc(stTone)}">${esc(stTxt)}</span>
    <button type="button" class="cpf-sw" role="switch" aria-checked="${live ? 'true' : 'false'}" data-a="togglePub" data-id="${esc(m.id)}"${ok ? '' : ' disabled title="ต้องติ๊ก “ได้รับความยินยอมแล้ว” ก่อนเผยแพร่"'}><span class="cpf-sw-k" aria-hidden="true"></span><span>${live ? 'เผยแพร่' : ok ? 'ยังไม่เผยแพร่' : 'รอความยินยอม'}</span></button>
    <a class="btn sm outline cpf-view" href="${esc(viewUrl(m.slug))}" target="_blank" rel="noopener">${icon('external')}<span>ดูหน้าผลงาน</span></a>`;
}
function renderBar() {
  const bar = box.querySelector('#cpf-bar');
  if (bar && cur) bar.innerHTML = barHtml();
  const note = box.querySelector('#cpf-note');
  if (note && cur) {
    const live = isLive(cur);
    note.hidden = live;
    note.textContent = live ? '' : !cur.consent ? 'ผลงานนี้ยังไม่ได้รับความยินยอมจากผู้รับบริการ — เผยแพร่ไม่ได้ ติ๊ก “ได้รับความยินยอมแล้ว” ในหมวดความยินยอมเมื่อได้รับแล้ว'
      : 'ผลงานนี้ยังไม่เผยแพร่ — คนทั่วไปยังไม่เห็น (ลิงก์ตรงก็เปิดไม่ได้) สลับสวิตช์ “เผยแพร่” ที่แถบบนเมื่อพร้อม';
  }
}
function renderEditor(focus) {
  const el = box.querySelector('#cpf-ed');
  if (!el) return;
  if (!cur) { el.innerHTML = ''; return; }
  el.innerHTML = editorHtml();
  renderBar();
  if (focus) { const f = el.querySelector(`[data-p="${focus}"]`); f?.closest('details')?.setAttribute('open', ''); f?.focus(); }
}

// ---------- สลับรายการ ↔ หน้าแก้ไข (URL: /workspace/content/portfolio[/<id>]) ----------
function setView(v, sync = true) {
  view = v;
  const lv = box.querySelector('#cpf-lv'), ev = box.querySelector('#cpf-ev');
  if (lv) lv.hidden = v !== 'list';
  if (ev) ev.hidden = v !== 'edit';
  box.closest('.contentpage')?.classList.toggle('cpf-editing', v === 'edit');
  if (sync && ctx?.nav) {
    const want = v === 'edit' && cur ? urls.content(KEY, cur.id) : urls.content(KEY);
    if (location.pathname !== want) ctx.nav(want, { quiet: true, replace: v !== 'edit' });
  }
}
function openItem(id) {
  if (view === 'edit' && cur?.id === id) return true;
  const it = byId(id);
  if (!it) { ctx.notify({ type: 'error', message: 'ไม่พบผลงานนี้' }); return false; }
  cur = forEditor(it); sel = id; slugErr = '';
  listY = window.scrollY;
  setView('edit'); renderEditor();
  window.scrollTo({ top: 0, behavior: 'auto' });
  return true;
}
function backToList() {
  setView('list'); cur = null; renderList();
  window.scrollTo({ top: listY || 0, behavior: 'auto' });
  box.querySelector(`.cpf-row[data-id="${CSS.escape(sel || '')}"] .cpf-title`)?.focus({ preventScroll: true });
}

const readVal = (el) => {
  const tp = el.dataset.t, v = el.value;
  if (tp === 'bool') return el.checked;
  if (tp === 'num') return Math.round(+v) || 0;
  if (tp === 'lines') return v.split('\n').map(t).filter(Boolean);
  if (tp === 'paras') return v.split(/\n\s*\n/).map((x) => t(x.replace(/\n/g, ' ').replace(/ {2,}/g, ' '))).filter(Boolean);
  if (tp === 'tags') return v.split(/[,，]/).map(t).filter(Boolean);
  return v;
};
/** มีการแก้: อัปเดตเวลา + ลงทะเบียนบันทึก + วาดส่วนที่เกี่ยวข้องใหม่ */
function touch(path) {
  if (!cur) return;
  cur.updatedAt = nowIso();
  if (path === 'consent' && !cur.consent) cur.published = false; // ถอนความยินยอม = หยุดเผยแพร่ทันที
  setItemOp(cur.id, cur);
  if (['title', 'consent', 'published', 'featured', 'anonymized', 'slug'].includes(path)) renderBar();
  if (['consent', 'noGuarantee', 'anonymized', 'title', 'summary', 'outcome', 'body'].includes(path)) {
    renderChecklist();
    const s = box.querySelector('.cpf-d[data-k="check"] summary small');
    if (s) s.textContent = `${[cur.anonymized, cur.noGuarantee, cur.consent].filter(Boolean).length}/3 ข้อ`;
  }
  if (path === 'images') { // พิมพ์ลิงก์ในช่อง → อัปเดตเฉพาะรูปย่อ (ไม่แตะช่องที่กำลังพิมพ์)
    const g = box.querySelector('#cpf-imgs'); if (g) g.innerHTML = thumbsHtml(cur);
    const s = box.querySelector('.cpf-d[data-k="images"] > summary small'); if (s) s.textContent = `${cur.images.length} รูป`;
  }
  renderPreview();
  renderSeo(box, KIND, cur, 'cpf'); // ตัวอย่างผลค้นหา + รายการตรวจ SEO
}

function setPublished(id, on) {
  const it = cur?.id === id ? cur : clone(byId(id));
  if (!it) return;
  if (on && !canPublish(it)) { ctx.notify({ type: 'warn', message: 'เผยแพร่ไม่ได้ — ต้องได้รับความยินยอมจากผู้รับบริการก่อน (ติ๊กในหน้าแก้ไข)' }); return; }
  it.published = on; it.updatedAt = nowIso();
  setItemOp(id, it); flushNow();
}
function setFeatured(id, on) {
  const it = cur?.id === id ? cur : clone(byId(id));
  if (!it) return;
  it.featured = on; it.updatedAt = nowIso();
  setItemOp(id, it); flushNow();
}
function move(id, dir) {
  const order = rows().map((r) => r.id), k = order.indexOf(id), j = k + (dir === 'up' ? -1 : 1);
  if (k < 0 || j < 0 || j >= order.length) return;
  [order[k], order[j]] = [order[j], order[k]];
  apply('order', (s) => { s.order = order.slice(); });
  flushNow();
  if (view === 'list') { renderList(); box.querySelector(`.cpf-row[data-id="${CSS.escape(id)}"] [data-a="${dir}"]:not(:disabled)`)?.focus({ preventScroll: true }); }
  else renderEditor();
}

async function onAction(btn) {
  const a = btn.dataset.a;
  const id = btn.dataset.id || cur?.id;
  switch (a) {
    case 'open': return ctx.nav(urls.content(KEY, id));
    case 'back': return ctx.nav(urls.content(KEY));
    case 'filter': fil = btn.dataset.f; renderList(); return;
    case 'new': creating = { from: null, src: null, slug: '', title: '' }; renderCreate(); box.querySelector('#cpf-create')?.scrollIntoView({ block: 'nearest' }); box.querySelector('#cpf-ntitle')?.focus(); return;
    case 'dup': {
      const src = cur?.id === id ? cur : byId(id);
      if (!src) return;
      if (view === 'edit') backToList();
      creating = { from: id, src: clone(src), slug: `${src.slug}-copy`.slice(0, 61), title: `สำเนา ${src.title || ''}`.trim() };
      renderCreate(); box.querySelector('#cpf-create')?.scrollIntoView({ block: 'nearest' }); box.querySelector('#cpf-nslug')?.select(); return;
    }
    case 'createCancel': creating = null; renderCreate(); return;
    case 'createGo': {
      const ti = t(box.querySelector('#cpf-ntitle')?.value);
      let s = t(box.querySelector('#cpf-nslug')?.value).toLowerCase();
      const nid = newId([...state.items.map((x) => x.id), ...state.items.map((x) => x.slug)]);
      if (!s) s = nid;
      const bad = slugProblem(s);
      if (bad) { const m = box.querySelector('#cpf-nmsg'); if (m) { m.textContent = bad; m.classList.add('cpf-err'); } return; }
      // สำเนา: เริ่มเป็นร่าง ยังไม่ยินยอม/ยังไม่แนะนำ (ต้องยืนยันใหม่ทุกครั้ง)
      const model = creating?.src ? { ...creating.src, id: nid, slug: s, title: ti || creating.src.title, consent: false, noGuarantee: false, published: false, featured: false, createdAt: nowIso(), updatedAt: nowIso() } : blank(nid, s, ti);
      creating = null; renderCreate();
      cur = forEditor(clean(model)); sel = nid; slugErr = '';
      setItemOp(nid, cur); flushNow();
      listY = window.scrollY;
      setView('edit'); renderEditor('title'); window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    case 'togglePub': { const it = cur?.id === id ? cur : byId(id); setPublished(id, !it?.published); if (view === 'edit') { renderBar(); renderPreview(); renderSeo(box, KIND, cur, 'cpf'); } else renderList(); return; }
    case 'upload': box.querySelector('#cpf-file')?.click(); return;
    case 'rmImg': {
      const i = +btn.dataset.i;
      if (!cur || !(i >= 0 && i < cur.images.length)) return;
      cur.images.splice(i, 1); touch('images'); renderImages(); return;
    }
    case 'toggleFeat': { const it = cur?.id === id ? cur : byId(id); setFeatured(id, !it?.featured); if (view === 'edit') renderEditor(); else renderList(); return; }
    case 'del': {
      if (!await ctx.confirmBox(`ลบผลงาน “${cur.title || id}” ถาวร?\nคนที่มีลิงก์จะเปิดไม่ได้อีก`, { title: 'ลบผลงาน', okText: 'ลบ', danger: true })) return;
      apply('item:' + id, (s) => { s.items = s.items.filter((x) => x.id !== id); s.order = s.order.filter((x) => x !== id); });
      sel = null; flushNow(); backToList(); return;
    }
    case 'up': case 'down': move(id, a); return;
    default:
  }
}

export default {
  id: KEY,
  label: 'ผลงาน',
  hint: 'ลงผลงาน/คดีที่ผ่านมา (ปกปิดข้อมูลลูกความ + ต้องได้รับความยินยอมก่อนเผยแพร่) แสดงที่ /portfolio/ และหน้าแรก — แต่ละชิ้นอยู่ที่ /portfolio/<slug>/ พร้อม SEO และรูป',
  async mount(b, c) {
    box = b; stTxt = ''; stTone = '';
    ctx = {
      ...c,
      setState(txt, tone) {
        stTxt = txt; stTone = tone || '';
        c.setState(txt, tone);
        const e = box?.querySelector('#cpf-st');
        if (e) { e.textContent = txt; e.dataset.tone = stTone; }
      },
    };
    state = normPortfolio({}); pending = new Map(); timer = null; flushP = Promise.resolve();
    sel = null; cur = null; q = ''; creating = null; slugErr = ''; upBusy = false;
    view = 'list'; fil = 'all'; openK = new Map(); listY = 0;
    if (!document.getElementById('cpf-css')) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.id = 'cpf-css'; l.href = '/css/content-portfolio.css';
      document.head.appendChild(l);
    }
    state = normPortfolio(await c.load(KEY));
    box.innerHTML = `<div class="cpf-app">
      <section id="cpf-lv" class="cpf-lv" aria-label="รายการผลงาน">
        <div class="cpf-intro"><p class="hint">ผลงานที่ผ่านมาแสดงที่ <a href="/portfolio/" target="_blank" rel="noopener">/portfolio/</a> และหน้าแรก (เฉพาะ “ผลงานแนะนำ”) — ทุกรายการต้องปกปิดข้อมูลที่ระบุตัวลูกความ ไม่รับประกันผล และได้รับความยินยอมจากผู้รับบริการก่อนเผยแพร่ (ข้อบังคับว่าด้วยมรรยาททนายความ — ให้ทนายยืนยัน)</p></div>
        <div class="cpf-tools">
          <div class="cpf-tools-top">
            <input type="search" id="cpf-q" class="cpf-q" placeholder="ค้นหาชื่อ หมวด ศาล แท็ก หรือ slug" aria-label="ค้นหาผลงาน" autocomplete="off">
            <button type="button" class="btn primary cpf-newbtn" data-a="new">${icon('plus')}ผลงานใหม่</button>
          </div>
          <div class="cpf-fchips" id="cpf-fchips" role="group" aria-label="กรองตามสถานะ"></div>
          <p class="hint" id="cpf-count" role="status"></p>
        </div>
        <div id="cpf-create"></div>
        <div class="cpf-list" id="cpf-list"></div>
      </section>
      <section id="cpf-ev" class="cpf-ev" aria-label="แก้ไขผลงาน" hidden>
        <div class="cpf-bar" id="cpf-bar"></div>
        <div class="ct-editor cpf-col" id="cpf-ed"></div>
      </section>
    </div>`;
    ac = new AbortController();
    const sig = { signal: ac.signal };
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-a]');
      if (btn && box.contains(btn) && btn.tagName === 'BUTTON' && !btn.disabled) onAction(btn);
    }, sig);
    box.addEventListener('input', (e) => {
      const el = e.target;
      if (el.id === 'cpf-q') { q = el.value; renderListSoon(); return; }
      if (el.id === 'cpf-nslug' || el.id === 'cpf-ntitle') {
        if (creating) { if (el.id === 'cpf-nslug') creating.slug = el.value; else creating.title = el.value; }
        const m = box.querySelector('#cpf-nmsg');
        if (m && el.id === 'cpf-nslug') { const bad = el.value ? slugProblem(el.value.trim().toLowerCase()) : ''; m.textContent = bad; m.classList.toggle('cpf-err', !!bad); }
        return;
      }
      if (!el.dataset?.p || !cur) return;
      const p = el.dataset.p;
      if (p === 'slug') { // slug ต้องถูกรูปและไม่ซ้ำ จึงจะบันทึก
        const s = t(el.value).toLowerCase();
        slugErr = slugProblem(s, cur.id);
        const er = box.querySelector('#cpf-slugerr'); if (er) er.textContent = slugErr;
        if (slugErr) return;
        cur.slug = s; touch('slug'); return;
      }
      const v = readVal(el);
      if (p === 'year') cur.year = v; else setAt(cur, p, v); // รองรับพาธซ้อน เช่น seo.title
      touch(p);
    }, sig);
    box.addEventListener('change', (e) => { // select / ไฟล์รูป (checkbox ยิง input อยู่แล้ว)
      const el = e.target;
      if (el.id === 'cpf-file') { const fs = [...(el.files || [])]; el.value = ''; if (fs.length) uploadImages(fs); return; }
      if (!el.dataset?.p || !cur || el.tagName !== 'SELECT') return;
      cur[el.dataset.p] = el.value; touch(el.dataset.p);
    }, sig);
    box.addEventListener('toggle', (e) => { const d = e.target; if (d?.tagName === 'DETAILS' && d.dataset.k) openK.set(d.dataset.k, d.open); }, { capture: true, signal: ac.signal });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target.id === 'cpf-nslug' || e.target.id === 'cpf-ntitle')) { e.preventDefault(); box.querySelector('[data-a=createGo]')?.click(); }
    }, sig);
    setView('list', false);
    renderList();
  },
  /** router เรียกเมื่อ URL เปลี่ยนในแท็บนี้: id = เปิดหน้าแก้ · ว่าง = กลับรายการ */
  async show(id) {
    if (!id) { if (view === 'edit') backToList(); return; }
    if (!openItem(id)) ctx.nav(urls.content(KEY), { quiet: true, replace: true });
  },
  async unmount() {
    await flushNow();
    ac?.abort();
    cancelAnimationFrame(listRaf);
    box?.closest('.contentpage')?.classList.remove('cpf-editing');
    if (pending?.size) ctx.notify({ type: 'error', message: 'บันทึกผลงานไม่สำเร็จ — การแก้ล่าสุดอาจหาย กรุณาตรวจการเชื่อมต่อแล้วแก้ใหม่' });
  },
};
