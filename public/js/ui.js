// ตัวช่วยสร้างฟอร์ม
import { S, esc, getPath } from './store.js';
import { THAI_MONTHS, PREFIXES, validCitizenId } from '/shared/thai.js';
import { icon } from './icons.js';

/** มือถือ: เลือกแป้นพิมพ์ให้ตรงชนิดข้อมูลจากชื่อเส้นทาง (โทรศัพท์/โทรสาร = แป้นตัวเลข, อีเมล = แป้นอีเมล) */
const kbHint = (p) => (/\.(phone|fax)$/.test(p) ? 'tel' : /\.email$/.test(p) ? 'email' : '');

/** ช่องกรอก: field('ชื่อ', 'parties.0.first', {cls:'s4'}) — ครอบด้วย <label> จึงผูกกับช่องกรอกโดยอัตโนมัติ */
export function field(label, path, o = {}) {
  const v = o.value !== undefined ? o.value : getPath(S.c, path);
  const attrs = [
    `data-bind="${esc(path)}"`,
    o.rerender ? 'data-rerender="1"' : '',
    o.geo ? `data-geo="${o.geo}" data-scope="${esc(o.scope)}"` : '',
    o.list ? `list="${esc(o.list)}"` : '',
    o.ph ? `placeholder="${esc(o.ph)}"` : '',
    o.max ? `maxlength="${o.max}"` : '',
    (o.inputmode || kbHint(path)) ? `inputmode="${o.inputmode || kbHint(path)}"` : '',
    o.required ? 'aria-required="true"' : '',
    o.attrs || '',
  ].join(' ');
  const type = o.type || 'text';
  const control = type === 'textarea'
    ? `<textarea rows="${o.rows || 3}" ${attrs}>${esc(v)}</textarea>`
    : `<input type="${type}" value="${esc(v)}" ${attrs} autocomplete="off">`;
  return `<label class="f ${o.cls || ''}"><span>${esc(label)}${o.required ? ' <em aria-hidden="true">*</em>' : ''}</span>${control}${o.hint ? `<small class="hint">${o.hint}</small>` : ''}</label>`;
}

/** ตัวบอกสถานะเลขประจำตัวประชาชน: ครบ/ถูก/ผิด */
export function idStateHtml(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (!d.length) return '';
  if (d.length < 13) return `<span class="idok warn">กรอกแล้ว ${d.length}/13 หลัก</span>`;
  return validCitizenId(v) ? `<span class="idok ok">${icon('check', { size: 14, stroke: 2.5 })}เลขถูกต้อง</span>` : `<span class="idok bad">${icon('alert', { size: 14 })}เลขไม่ถูกต้อง (ไม่ผ่านการตรวจหลักสุดท้าย) กรุณาตรวจอีกครั้ง</span>`;
}
/** ช่องเลขประจำตัวประชาชน 13 หลัก: จัดรูปแบบอัตโนมัติ + ตรวจเลขถูกต้องทันที */
export function idField(label, path, o = {}) {
  const v = getPath(S.c, path);
  return field(label, path, { cls: o.cls || 's6', max: 17, inputmode: 'numeric', ph: 'x-xxxx-xxxxx-xx-x', hint: `<span class="idchk">${idStateHtml(v)}</span>`, attrs: 'data-idcheck="1"', required: o.required });
}

export function select(label, path, options, o = {}) {
  const v = o.value !== undefined ? o.value : getPath(S.c, path);
  const opts = options.map((x) => {
    const [val, text] = Array.isArray(x) ? x : [x, x];
    return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(text)}</option>`;
  }).join('');
  const aria = !label && o.aria ? `aria-label="${esc(o.aria)}"` : '';
  return `<label class="f ${o.cls || ''}">${label ? `<span>${esc(label)}</span>` : ''}<select data-bind="${esc(path)}" ${aria} ${o.rerender ? 'data-rerender="1"' : ''}>${o.blank ? '<option value="">— เลือก —</option>' : ''}${opts}</select></label>`;
}

export function check(label, path, o = {}) {
  const v = getPath(S.c, path);
  return `<label class="chk${o.sw ? ' sw' : ''}"><input type="checkbox"${o.sw ? ' role="switch"' : ''} data-bind="${esc(path)}" data-type="bool" ${o.rerender ? 'data-rerender="1"' : ''} ${v ? 'checked' : ''}><span>${label}</span></label>`;
}

export function seg(path, options, o = {}) {
  const v = getPath(S.c, path);
  const name = 'seg-' + path.replace(/\W/g, '');
  return `<div class="seg" role="radiogroup" ${o.label ? `aria-label="${esc(o.label)}"` : ''}>${options.map(([val, text]) =>
    `<label><input type="radio" name="${name}" value="${esc(val)}" data-bind="${esc(path)}" ${o.rerender ? 'data-rerender="1"' : ''} ${String(v) === String(val) ? 'checked' : ''}><span>${esc(text)}</span></label>`).join('')}</div>`;
}

export const monthOptions = THAI_MONTHS.map((m, i) => [String(i + 1), m]);

export function dateFields(path, label, o = {}) {
  return `<div class="f ${o.cls || 's12'}" role="group" aria-label="${esc(label)}"><span>${esc(label)}</span><div class="dt-row">
    <input type="number" class="dt-d" min="1" max="31" data-bind="${path}.d" value="${esc(getPath(S.c, path + '.d'))}" aria-label="วัน" placeholder="วัน">
    <select class="dt-m" data-bind="${path}.m" aria-label="เดือน">${monthOptions.map(([v, t]) => `<option value="${v}" ${String(getPath(S.c, path + '.m')) === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <input type="number" class="dt-y" min="2400" max="2700" data-bind="${path}.y" value="${esc(getPath(S.c, path + '.y'))}" aria-label="พ.ศ." placeholder="พ.ศ."></div></div>`;
}

export function provinceList() {
  return `<datalist id="dl-prov">${S.geo.provinces.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>
  <datalist id="dl-prefix">${PREFIXES.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`;
}

export function geoOptions(scope, which) {
  const addr = getPath(S.c, scope) || {};
  const prov = S.geo.provinces.find((p) => p.name === addr.province);
  if (which === 'district') return (prov?.districts || []).map((d) => `<option value="${esc(d.name)}">`).join('');
  const dist = prov?.districts.find((d) => d.name === addr.district);
  return (dist?.subs || []).map((s) => `<option value="${esc(s.name)}">`).join('');
}

const dlId = (scope, w) => `dl-${w}-${scope.replace(/\W/g, '_')}`;

/**
 * กลุ่มช่องที่อยู่ตามแบบฟอร์มศาล พร้อม dropdown จังหวัด→อำเภอ→ตำบล→รหัสไปรษณีย์
 * o.title = หัวข้อย่อย (ใส่ '' เพื่อไม่แสดง), o.building = false เพื่อซ่อนช่อง “อาคาร/หมู่บ้าน” (ผู้เรียกนำไปไว้ใน “ข้อมูลเพิ่มเติม”)
 */
export function addressFields(scope, o = {}) {
  const a = getPath(S.c, scope) || {};
  const bkk = /^กรุงเทพ/.test(a.province || '');
  const title = o.title === undefined ? 'ที่อยู่ / ภูมิลำเนา' : o.title;
  const building = o.building !== false;
  return `<div class="agrp">
    ${title ? `<div class="grp-t">${esc(title)}</div>` : ''}
    ${field('บ้านเลขที่', scope + '.no', { cls: 's4' })}
    ${field('หมู่ที่', scope + '.moo', { cls: 's4' })}
    ${field('ตรอก/ซอย', scope + '.soi', { cls: 's4' })}
    ${field('ถนน', scope + '.road', { cls: building ? 's8' : 's12' })}
    ${building ? field('อาคาร/หมู่บ้าน', scope + '.building', { cls: 's4' }) : ''}
    ${field('จังหวัด', scope + '.province', { cls: 's4', list: 'dl-prov', geo: 'province', scope })}
    ${field(bkk ? 'เขต' : 'อำเภอ', scope + '.district', { cls: 's4', list: dlId(scope, 'dist'), geo: 'district', scope })}
    ${field(bkk ? 'แขวง' : 'ตำบล', scope + '.sub', { cls: 's4', list: dlId(scope, 'sub'), geo: 'sub', scope })}
    ${field('รหัสไปรษณีย์', scope + '.zip', { cls: 's4', max: 5, inputmode: 'numeric' })}
    <datalist id="${dlId(scope, 'dist')}">${geoOptions(scope, 'district')}</datalist>
    <datalist id="${dlId(scope, 'sub')}">${geoOptions(scope, 'sub')}</datalist></div>`;
}

export function refreshGeo(scope) {
  const d = document.getElementById(dlId(scope, 'dist'));
  const s = document.getElementById(dlId(scope, 'sub'));
  if (d) d.innerHTML = geoOptions(scope, 'district');
  if (s) s.innerHTML = geoOptions(scope, 'sub');
}

export function dlIdOf(scope, w) { return dlId(scope, w); }

export function badge(text, kind = '') { return `<span class="pill ${kind}">${esc(text)}</span>`; }

// ===================== โครงหน้าและการพับ/ขยาย =====================

/** หัวหน้า + คำอธิบายสั้น 1 บรรทัด */
export function pageHead(title, sub = '') {
  return `<h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}`;
}

/** กลุ่มช่องย่อยในการ์ด: หัวข้อเล็ก + grid 12 คอลัมน์ */
export function group(title, inner, o = {}) {
  return `<section class="grp ${o.cls || ''}">${title ? `<div class="grp-t">${esc(title)}</div>` : ''}<div class="grid">${inner}</div></section>`;
}

/** สถานะเปิด/ปิดของ <details> ที่จำไว้ข้ามการวาดหน้าใหม่ (เก็บใน S.ui.open) — ค่าเริ่มต้นใช้เฉพาะครั้งแรกที่เห็น */
export function openState(key, dflt = false) {
  const o = (S.ui.open ||= {});
  if (!(key in o)) o[key] = !!dflt;
  return o[key];
}

/**
 * <details> ที่จำสถานะ: disclose('p:123', 'สรุป…', 'เนื้อหา…', { cls:'item', open:true, attrs:'data-sum="party"' })
 * o.open = ค่าเริ่มต้นครั้งแรก, summary ใส่ aria-expanded ให้ตรงกับสถานะเสมอ
 */
export function disclose(key, summaryHtml, bodyHtml, o = {}) {
  const stored = openState(key, o.open);
  const open = o.force !== undefined ? o.force : stored; // force = บังคับเปิดชั่วคราว (เช่น ขณะค้นหา) โดยไม่ทับสถานะที่จำไว้
  return `<details class="${o.cls || 'more'}" data-dk="${esc(key)}" ${o.attrs || ''} ${open ? 'open' : ''}><summary aria-expanded="${open}">${summaryHtml}</summary><div class="d-body">${bodyHtml}</div></details>`;
}

/** “ข้อมูลเพิ่มเติม” แบบลิงก์พับได้ (ใช้กับช่องที่ใช้น้อย) */
export function more(key, label, bodyHtml, o = {}) {
  return disclose(key, `<span class="more-t">${esc(label)}</span>${o.hint ? `<span class="hint">${esc(o.hint)}</span>` : ''}`, `<div class="grid">${bodyHtml}</div>`, { cls: 'more', open: o.open });
}

// จำสถานะ + aria-expanded เมื่อผู้ใช้เปิด/ปิด (event toggle ไม่ bubble จึงฟังแบบ capture)
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement)) return;
  d.querySelector(':scope > summary')?.setAttribute('aria-expanded', String(d.open));
  if (d.dataset.dk) (S.ui.open ||= {})[d.dataset.dk] = d.open;
}, true);

// <details> ที่โผล่เข้ามาใหม่ (เช่น กล่องในไฟล์อื่น) ให้มี aria-expanded ถูกต้องตั้งแต่เริ่ม
const syncAria = (root) => {
  if (root.matches?.('details')) root.querySelector(':scope > summary')?.setAttribute('aria-expanded', String(root.open));
  root.querySelectorAll?.('details').forEach((d) => d.querySelector(':scope > summary')?.setAttribute('aria-expanded', String(d.open)));
};
new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) syncAria(n); })
  .observe(document.documentElement, { childList: true, subtree: true });
