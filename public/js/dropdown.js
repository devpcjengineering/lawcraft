// ดรอปดาวน์/คอมโบบ็อกซ์แบบกำหนดเอง แทนป๊อปอัปเนทีฟของ <select> และ <datalist> (ตัวแสดงผลเดียว ใช้ทั้งหลังบ้าน)
// หลักการ: ตัวจัดการเหตุการณ์ส่วนกลาง (delegated) — ไม่แก้ DOM ของ <select>/<input list> เดิมที่ app วาดซ้ำด้วย morphInto
//   • <select>: ดัก mousedown/touch/keydown แล้วเปิดรายการของเราแทน เลือกแล้วตั้ง select.value + ยิง input/change (bubbles) ให้ data-bind/data-onchange ทำงานเหมือนเดิม
//   • <input list>: ถอด attribute list ออกชั่วคราวตอนโฟกัส (เก็บไว้ใน WeakMap) เพื่อไม่ให้ Chromium เปิดป๊อปอัปเนทีฟซ้อน แล้วคืนค่าตอนออกจากช่อง
//   • ออกนอกกติกา: เพิ่ม data-native ที่ select/input ตัวนั้น
import { icon } from './icons.js';

const SEL = 'select:not([multiple]):not([data-native])';
const TEXTY = new Set(['text', 'search']);
const SEARCH_MIN = 12;       // รายการยาวกว่านี้มีช่องค้นหา
const MAX_H = 320;           // ความสูงรายการสูงสุด (เดสก์ท็อป)
const MAX_COMBO = 150;       // จำนวนข้อเสนอแนะสูงสุดของ combobox
const HAS_POPOVER = typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';
const CHECK = icon('check', { size: 18, stroke: 2.2, cls: 'dd-ck' });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isCoarse = () => matchMedia('(pointer: coarse)').matches;

let cur = null;            // รายการที่เปิดอยู่ { kind, el, root, panel, list, searchEl, items, vis, active, query, sheet, id }
let uid = 0;
let suppress = false;      // กำลังยิง input/change เอง — ห้ามเปิดซ้ำ
let lastMD = null;         // mousedown ล่าสุดบน select (กันเปิดซ้ำจาก click ที่ตามมา)
let tap = null;            // การแตะบน select (touch)
let typeBuf = '', typeT = 0;
const stash = new WeakMap(); // input -> id ของ datalist ที่ถอดไว้ชั่วคราว

// ---------------------------------------------------------------- ตัวช่วย
// จอสัมผัส (มือถือ/แท็บเล็ต) ใช้ตัวเลือกเนทีฟของระบบ — iOS/Android ทำได้ดีอยู่แล้ว และการซ้อนกับแผ่นของเราทำให้เด้งสองอัน; แผ่น/ป๊อปโอเวอร์ของเราใช้กับเมาส์ (เดสก์ท็อป) เท่านั้น
const useNative = () => matchMedia('(pointer: coarse)').matches;
function pickSelect(t) {
  if (useNative()) return null;
  const s = t instanceof Element ? t.closest('select') : null;
  return s && s.matches(SEL) && s.closest('#app') && !s.disabled ? s : null;
}
const isComboInput = (el) => el instanceof HTMLInputElement && TEXTY.has(el.type) && !el.hasAttribute('data-native') && !!el.closest?.('#app') && (stash.has(el) || el.hasAttribute('list'));

function titleOf(el) {
  const clean = (sp) => { if (!sp) return ''; const c = sp.cloneNode(true); c.querySelectorAll('em,small').forEach((x) => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
  let t = clean(el.closest('label')?.querySelector(':scope > span')) || clean(el.closest('.f')?.querySelector(':scope > span'));
  const own = el.getAttribute('aria-label') || '';
  if (!t) t = own; else if (own && own !== t) t += ' · ' + own;
  return t;
}

function readSelect(sel) {
  return [...sel.options].map((o) => {
    const g = o.parentElement?.tagName === 'OPTGROUP' ? o.parentElement : null;
    return { value: o.value, text: (o.text || '').replace(/\s+/g, ' ').trim(), sec: '', disabled: o.disabled || !!g?.disabled, group: g ? g.label : null, selected: o.index === sel.selectedIndex, blank: o.value === '' };
  });
}

function readDatalist(inp) {
  const dl = document.getElementById(stash.get(inp) || inp.getAttribute('list') || '');
  if (!dl) return [];
  return [...dl.options].map((o) => {
    const lab = (o.getAttribute('label') || o.textContent || '').replace(/\s+/g, ' ').trim();
    return { value: o.value, text: o.value, sec: lab && lab !== o.value ? lab : '', disabled: o.disabled, group: null, selected: o.value === inp.value, blank: false };
  }).filter((x) => x.value !== '');
}

/** ไฮไลต์ส่วนที่ตรงกับคำค้น (ไม่สนตัวพิมพ์เล็กใหญ่) */
function hl(text, q) {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q);
  if (i < 0 || text.toLowerCase().length !== text.length) return esc(text);
  return `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
}

// ---------------------------------------------------------------- สร้างและวาด
function build(o) {
  const id = 'dd' + (++uid);
  const root = document.createElement('div');
  root.className = 'dd' + (o.sheet ? ' sheet' : '');
  if (HAS_POPOVER) root.setAttribute('popover', 'manual');
  const label = o.title || 'รายการตัวเลือก';
  root.innerHTML = `<div class="dd-panel">${o.sheet ? `<div class="dd-grab" aria-hidden="true"></div>${o.title ? `<div class="dd-title">${esc(o.title)}</div>` : ''}` : ''}${o.hasSearch ? `<div class="dd-searchbox"><input class="dd-search" type="text" inputmode="search" enterkeyhint="done" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ค้นหา…" aria-label="ค้นหา" role="combobox" aria-expanded="true" aria-controls="${id}-l" aria-autocomplete="list"></div>` : ''}<div class="dd-list" id="${id}-l" role="listbox" aria-label="${esc(label)}" tabindex="-1"></div></div>`;
  // อยู่ในกล่อง <dialog> modal: ต้องวางข้างใน ไม่งั้นถูกบล็อก (inert)
  (o.el.closest('dialog[open]') || document.body).appendChild(root);
  if (HAS_POPOVER) { try { root.showPopover(); } catch { /* ใช้ fixed ธรรมดา */ } }
  const panel = root.firstElementChild;
  const c = { ...o, id, root, panel, list: panel.querySelector('.dd-list'), searchEl: panel.querySelector('.dd-search'), vis: [], active: -1, query: '', openedAt: performance.now() };
  panel.style.setProperty('--dd-minw', Math.round(o.el.getBoundingClientRect().width) + 'px');
  cur = c;
  return c;
}

function render() {
  const c = cur;
  const q = c.query.trim().toLowerCase();
  let vis;
  if (c.kind === 'combo') {
    if (q) {
      const m = c.items.filter((it) => it.text.toLowerCase().includes(q) || it.sec.toLowerCase().includes(q));
      vis = [...m.filter((it) => it.text.toLowerCase().startsWith(q)), ...m.filter((it) => !it.text.toLowerCase().startsWith(q))];
    } else vis = c.items;
    c.truncated = vis.length > MAX_COMBO;
    vis = vis.slice(0, MAX_COMBO);
  } else {
    vis = q ? c.items.filter((it) => !it.blank && (it.text.toLowerCase().includes(q))) : c.items;
  }
  c.vis = vis;
  let html = '', grp;
  vis.forEach((it, k) => {
    if (c.kind === 'select' && it.group !== grp) {
      grp = it.group;
      if (grp) html += `<div class="dd-grp" role="presentation">${esc(grp)}</div>`;
    }
    html += `<div class="dd-opt${it.blank ? ' blank' : ''}" role="option" id="${c.id}-${k}" data-k="${k}" aria-selected="${it.selected ? 'true' : 'false'}"${it.disabled ? ' aria-disabled="true"' : ''}><span class="dd-txt"><span class="dd-t">${hl(it.text, q)}</span>${it.sec ? `<span class="dd-s">${hl(it.sec, q)}</span>` : ''}</span>${CHECK}</div>`;
  });
  if (!vis.length) html = `<div class="dd-empty" role="presentation">${c.kind === 'combo' ? 'ไม่มีรายการให้เลือก' : 'ไม่พบรายการที่ค้นหา'}</div>`;
  else if (c.truncated) html += '<div class="dd-empty more" role="presentation">พิมพ์เพิ่มเพื่อกรองรายการ…</div>';
  c.list.innerHTML = html;
  c.active = -1;
  place(); // ก่อนเลื่อนไปหาข้อที่เลือก เพื่อให้รู้ความสูงจริงของรายการ
  if (cur !== c) return;
  if (c.kind === 'select') {
    const sel = vis.findIndex((it) => it.selected && !it.disabled);
    let first = vis.findIndex((it) => !it.disabled && !it.blank);
    if (first < 0) first = vis.findIndex((it) => !it.disabled);
    setActive(!q && sel >= 0 ? sel : first);
  } else if (!c.touched) {
    setActive(vis.findIndex((it) => it.selected));
  }
  syncAria();
}

function syncAria() {
  const c = cur; if (!c) return;
  const owner = c.searchEl || c.el;
  c.el.setAttribute('aria-expanded', 'true');
  c.el.setAttribute('aria-controls', c.id + '-l');
  if (c.kind === 'select') c.el.setAttribute('aria-haspopup', 'listbox');
  if (c.active >= 0) owner.setAttribute('aria-activedescendant', `${c.id}-${c.active}`); else owner.removeAttribute('aria-activedescendant');
}

function setActive(k, scroll = true) {
  const c = cur; if (!c) return;
  c.list.querySelector('.dd-opt.on')?.classList.remove('on');
  c.active = k;
  if (k >= 0) {
    const row = c.list.querySelector(`[data-k="${k}"]`);
    if (row) {
      row.classList.add('on');
      if (scroll) {
        const prev = row.previousElementSibling;
        const top = (prev && prev.classList.contains('dd-grp') ? prev.offsetTop : row.offsetTop) - (k === 0 ? 6 : 0);
        const bot = row.offsetTop + row.offsetHeight + 4;
        if (top < c.list.scrollTop) c.list.scrollTop = Math.max(0, top);
        else if (bot > c.list.scrollTop + c.list.clientHeight) c.list.scrollTop = bot - c.list.clientHeight;
      }
    }
  }
  const owner = c.searchEl || c.el;
  if (k >= 0) owner.setAttribute('aria-activedescendant', `${c.id}-${k}`); else owner.removeAttribute('aria-activedescendant');
}

function move(d) {
  const c = cur; if (!c) return;
  let k = c.active;
  for (let n = 0; n < c.vis.length; n++) {
    k += d;
    if (k < 0 || k >= c.vis.length) { if (d < 0 && c.kind === 'combo') setActive(-1); return; }
    if (!c.vis[k].disabled) { setActive(k); return; }
  }
}
function edge(end) {
  const c = cur; if (!c) return;
  const idx = c.vis.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
  if (idx.length) setActive(end ? idx[idx.length - 1] : idx[0]);
}

function typeahead(ch) {
  const c = cur; if (!c) return;
  const now = Date.now();
  if (now - typeT > 800) typeBuf = '';
  typeT = now; typeBuf += ch.toLowerCase();
  const find = (fn) => c.vis.findIndex((it) => !it.disabled && !it.blank && fn(it.text.toLowerCase()));
  let k = find((t) => t.startsWith(typeBuf));
  if (k < 0) k = find((t) => t.includes(typeBuf));
  if (k >= 0) setActive(k);
}

// ---------------------------------------------------------------- ตำแหน่ง
function place() {
  const c = cur; if (!c) return;
  const vv = window.visualViewport;
  const vTop = vv ? vv.offsetTop : 0, vH = vv ? vv.height : innerHeight;
  const vLeft = vv ? vv.offsetLeft : 0, vW = vv ? vv.width : innerWidth;
  const LH = document.documentElement.clientHeight;
  const p = c.panel;
  if (c.sheet) {
    p.style.bottom = Math.max(0, LH - (vTop + vH)) + 'px';
    p.style.maxHeight = Math.min(560, vH * 0.82) + 'px';
    return;
  }
  const r = c.el.getBoundingClientRect();
  const gap = 6, margin = 8;
  p.style.maxHeight = MAX_H + 'px';
  if (c.kind === 'combo') p.style.width = Math.min(Math.max(r.width, 260), vW - margin * 2) + 'px';
  const want = p.offsetHeight;
  const below = vTop + vH - r.bottom - gap - margin, above = r.top - vTop - gap - margin;
  let side = c.side || (below >= Math.min(want, 200) || below >= above ? 'below' : 'above');
  if (c.side) {
    if (side === 'below' && below < Math.min(want, 160) && above > below) side = 'above';
    else if (side === 'above' && above < Math.min(want, 160) && below > above) side = 'below';
  }
  c.side = side;
  const avail = Math.max(120, side === 'below' ? below : above);
  p.style.maxHeight = Math.min(MAX_H, avail) + 'px';
  const w = p.offsetWidth;
  const left = Math.min(Math.max(r.left, vLeft + margin), Math.max(vLeft + margin, vLeft + vW - w - margin));
  p.style.left = left + 'px';
  if (side === 'below') { p.style.top = r.bottom + gap + 'px'; p.style.bottom = 'auto'; }
  else { p.style.top = 'auto'; p.style.bottom = LH - r.top + gap + 'px'; }
  p.style.transformOrigin = `${Math.max(12, Math.min(w - 12, r.left + 20 - left))}px ${side === 'below' ? '0' : '100%'}`;
  p.classList.toggle('up', side === 'above');
  // ช่องเลื่อนออกนอกจอ → ปิด
  if (r.bottom < vTop || r.top > vTop + vH) close(false);
}

// ---------------------------------------------------------------- เปิด/ปิด
function openSelect(sel, typed = '') {
  if (cur) closeNow();
  const items = readSelect(sel);
  const sheet = matchMedia('(max-width: 640px)').matches;
  const hasSearch = items.filter((i) => !i.blank).length > SEARCH_MIN;
  const c = build({ kind: 'select', el: sel, items, sheet, hasSearch, title: titleOf(sel) });
  if (hasSearch && typed) { c.searchEl.value = typed; c.query = typed; }
  render();
  if (hasSearch && !isCoarse()) c.searchEl.focus({ preventScroll: true });
  if (!hasSearch && typed) typeahead(typed);
  if (c.sheet) { wireSheetDrag(c); }
}

function openCombo(inp, { filter = false } = {}) {
  if (!isComboInput(inp)) return;
  const items = readDatalist(inp);
  if (!items.length) { if (cur && cur.el === inp) close(false); if (!filter) { /* เปิดด้วยปุ่ม แต่ไม่มีรายการ */ } return; }
  const q = filter ? inp.value.trim() : '';
  if (filter && q) {
    const ql = q.toLowerCase();
    const m = items.filter((it) => it.text.toLowerCase().includes(ql) || it.sec.toLowerCase().includes(ql));
    if (!m.length || (m.length === 1 && m[0].value === inp.value)) { if (cur && cur.el === inp) close(false); return; }
  }
  if (!cur || cur.el !== inp) {
    if (cur) closeNow();
    build({ kind: 'combo', el: inp, items, sheet: false, hasSearch: false, title: titleOf(inp) });
  } else cur.items = items;
  cur.touched = filter;
  cur.query = q;
  render();
}

function closeNow() {
  const c = cur; if (!c) return;
  cur = null;
  cleanup(c);
  c.root.remove();
}
function cleanup(c) {
  for (const a of ['aria-expanded', 'aria-controls', 'aria-activedescendant']) c.el.removeAttribute(a);
}

function close(refocus = false) {
  const c = cur; if (!c) return;
  cur = null;
  cleanup(c);
  if (refocus && c.el.isConnected) c.el.focus({ preventScroll: true });
  if (reduceMotion()) c.root.remove();
  else { c.root.classList.add('out'); setTimeout(() => c.root.remove(), 130); }
}

function choose(k) {
  const c = cur; if (!c) return;
  const it = c.vis[k];
  if (!it || it.disabled) return;
  const el = c.el, kind = c.kind;
  close(kind === 'select');
  if (kind === 'select') {
    if (el.value === it.value) return;
    el.value = it.value;
  } else {
    if (el.value === it.value) return; // พิมพ์ตรงกับรายการอยู่แล้ว ไม่ต้องยิงซ้ำ
    el.value = it.value;
    try { el.setSelectionRange(it.value.length, it.value.length); } catch { /* ไม่รองรับ */ }
  }
  suppress = true;
  try {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } finally { suppress = false; }
}

/** ลากแถบจับ/หัวข้อลงเพื่อปิดแผ่นล่าง */
function wireSheetDrag(c) {
  let y0 = null;
  const handle = c.panel.querySelectorAll('.dd-grab, .dd-title');
  const start = (e) => { y0 = e.clientY; c.panel.style.transition = 'none'; e.target.setPointerCapture?.(e.pointerId); };
  const mv = (e) => { if (y0 == null) return; c.panel.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; };
  const end = (e) => {
    if (y0 == null) return;
    const dy = e.clientY - y0; y0 = null;
    c.panel.style.transition = '';
    if (dy > 80) close(true); else c.panel.style.transform = '';
  };
  handle.forEach((h) => { h.addEventListener('pointerdown', start); h.addEventListener('pointermove', mv); h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end); });
}

// ---------------------------------------------------------------- ปิดบัง datalist เนทีฟ
function engage(inp) {
  if (!(inp instanceof HTMLInputElement) || !TEXTY.has(inp.type) || inp.hasAttribute('data-native') || !inp.closest('#app')) return;
  const id = inp.getAttribute('list');
  if (!id && !stash.has(inp)) return;
  if (id) { stash.set(inp, id); inp.removeAttribute('list'); }
  if (!inp.hasAttribute('data-combo')) inp.setAttribute('data-combo', '');
  if (!inp.hasAttribute('aria-autocomplete')) inp.setAttribute('aria-autocomplete', 'list');
}
function release(inp) {
  const id = stash.get(inp);
  stash.delete(inp);
  if (id && !inp.hasAttribute('list')) inp.setAttribute('list', id);
  inp.removeAttribute('data-combo');
}

// ---------------------------------------------------------------- ตัวฟังส่วนกลาง
document.addEventListener('mousedown', (e) => {
  if (cur && cur.root.contains(e.target)) { if (e.target !== cur.searchEl) e.preventDefault(); return; } // คงโฟกัสไว้ที่ช่อง
  if (e.button !== 0) return;
  const sel = pickSelect(e.target);
  if (!sel) return;
  e.preventDefault(); // กันป๊อปอัปเนทีฟ
  sel.focus({ preventScroll: true });
  lastMD = { el: sel, t: performance.now() };
  if (cur && cur.el === sel) close(true); else openSelect(sel);
}, true);

document.addEventListener('click', (e) => {
  if (cur && cur.root.contains(e.target)) {
    const row = e.target.closest?.('.dd-opt');
    if (row && cur.list.contains(row)) choose(+row.dataset.k);
    else if (cur.sheet && !cur.panel.contains(e.target)) { e.preventDefault(); close(true); } // แตะฉากหลังของแผ่นล่าง = ปิด (ปิดตอน click เพื่อไม่ให้คลิกทะลุไปปุ่มด้านหลัง)
    return;
  }
  const sel = pickSelect(e.target);
  if (sel) {
    e.preventDefault();
    if (lastMD && lastMD.el === sel && performance.now() - lastMD.t < 700) { lastMD = null; return; }
    if (tap && performance.now() - tap.done < 700) return;
    if (cur && cur.el === sel) close(true); else openSelect(sel);
    return;
  }
  if (isComboInput(e.target)) {
    const inp = e.target, r = inp.getBoundingClientRect();
    const zone = r.right - e.clientX < 40;
    if (cur && cur.el === inp) { if (zone) close(false); }
    else if (zone || !inp.value || readDatalist(inp).length <= SEARCH_MIN) openCombo(inp); // รายการสั้น (คำนำหน้า ฯลฯ) เปิดทันทีที่แตะ
  }
}, true);

// แตะบนจอสัมผัส: เปิดตอน touchend (ไม่ลาก) แล้วกันเมาส์จำลอง/ป๊อปอัปเนทีฟของ iOS/Android
document.addEventListener('touchstart', (e) => {
  const sel = e.touches.length === 1 ? pickSelect(e.target) : null;
  tap = sel ? { el: sel, x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false, done: 0 } : null;
}, { capture: true, passive: true });
document.addEventListener('touchmove', (e) => {
  if (!tap || tap.moved) return;
  const t = e.touches[0];
  if (Math.abs(t.clientX - tap.x) > 10 || Math.abs(t.clientY - tap.y) > 10) tap.moved = true;
}, { capture: true, passive: true });
document.addEventListener('touchend', (e) => {
  if (!tap) return;
  const t = tap; if (t.moved || !e.cancelable) { tap = null; return; }
  e.preventDefault();
  tap.done = performance.now();
  t.el.focus({ preventScroll: true });
  if (cur && cur.el === t.el) close(true); else openSelect(t.el);
}, { capture: true, passive: false });
document.addEventListener('touchcancel', () => { tap = null; }, true);

// กดนอกรายการ = ปิด (ไม่ขโมยโฟกัส)
document.addEventListener('pointerdown', (e) => {
  if (!cur || cur.sheet) return; // แผ่นล่างปิดตอน click บนฉากหลัง
  const t = e.target;
  if (cur.panel.contains(t) || t === cur.el) return;
  if (t instanceof Element && cur.el.closest('label')?.contains(t) && !cur.sheet) return; // กดที่ป้ายของช่องเดียวกัน = toggle ผ่าน click
  close(false);
}, true);

document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (!cur) {
    if (e.defaultPrevented || e.isComposing) return;
    const sel = pickSelect(t);
    if (sel) {
      if (e.ctrlKey || e.metaKey) return;
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'F4'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); openSelect(sel); }
      else if (e.key.length === 1 && !e.altKey) { e.preventDefault(); e.stopPropagation(); openSelect(sel, e.key); }
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && isComboInput(t) && !e.altKey) {
      e.preventDefault(); openCombo(t);
    }
    return;
  }
  if (e.isComposing) return;
  const inSearch = t === cur.searchEl;
  const eat = () => { e.preventDefault(); e.stopPropagation(); };
  switch (e.key) {
    case 'ArrowDown': eat(); if (cur.active < 0 && cur.kind === 'combo') setActive(cur.vis.findIndex((it) => !it.disabled)); else move(1); break;
    case 'ArrowUp': eat(); move(-1); break;
    case 'PageDown': eat(); for (let i = 0; i < 6; i++) move(1); break;
    case 'PageUp': eat(); for (let i = 0; i < 6; i++) move(-1); break;
    case 'Home': if (cur.kind === 'select') { eat(); edge(false); } break;
    case 'End': if (cur.kind === 'select') { eat(); edge(true); } break;
    case 'Enter':
      if (cur.active >= 0) { eat(); choose(cur.active); }
      else if (cur.kind === 'select') { eat(); close(true); }
      else close(false);
      break;
    case ' ':
      if (cur.kind === 'select' && !inSearch) { eat(); if (cur.active >= 0) choose(cur.active); }
      break;
    case 'Escape': eat(); close(true); break;
    case 'Tab': close(false); break;
    default:
      if (cur.kind === 'select' && !inSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { eat(); typeahead(e.key); }
  }
}, true);

// ช่องค้นหาในรายการ select
document.addEventListener('input', (e) => {
  const t = e.target;
  if (cur && t === cur.searchEl) { cur.query = t.value; render(); return; }
  if (suppress || !e.isTrusted) return;
  if (isComboInput(t)) { engage(t); openCombo(t, { filter: true }); }
}, true);

document.addEventListener('focusin', (e) => {
  const t = e.target;
  if (t instanceof HTMLInputElement && t.hasAttribute('list')) engage(t);
}, true);
document.addEventListener('focusout', (e) => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || !stash.has(t)) return;
  if (cur && cur.el === t) close(false);
  release(t);
}, true);

// ตำแหน่งตามการเลื่อน/ย่อขยายหน้าจอ/แป้นพิมพ์มือถือ
let raf = 0;
const replace = () => { if (!cur || raf) return; raf = requestAnimationFrame(() => { raf = 0; place(); }); };
window.addEventListener('resize', replace);
window.visualViewport?.addEventListener('resize', replace);
window.visualViewport?.addEventListener('scroll', replace);
window.addEventListener('scroll', (e) => { if (cur && !cur.panel.contains(e.target)) replace(); }, { capture: true, passive: true });
window.addEventListener('blur', () => { if (cur) close(false); });

// app วาดซ้ำ: ถ้า morph ใส่ list กลับมาที่ช่องที่กำลังใช้ ให้ถอดอีก; ถ้าช่องหายไป ปิดรายการ
const mo = new MutationObserver((recs) => {
  for (const r of recs) {
    if (r.type !== 'attributes') continue;
    const el = r.target;
    if (!stash.has(el)) continue;
    if (el.hasAttribute('list')) { stash.set(el, el.getAttribute('list')); el.removeAttribute('list'); }
    if (!el.hasAttribute('data-combo')) el.setAttribute('data-combo', '');
  }
  if (cur && !cur.el.isConnected) closeNow();
});
const appEl = document.getElementById('app');
if (appEl) mo.observe(appEl, { subtree: true, childList: true, attributes: true, attributeFilter: ['list', 'data-combo'] });
if (document.activeElement) engage(document.activeElement);
