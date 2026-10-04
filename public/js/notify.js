// ระบบแจ้งเตือน: toast ซ้อนได้หลายอัน (สำเร็จ/ผิดพลาด/เตือน/ข้อมูล) + แบนเนอร์ค้าง (บันทึกไม่สำเร็จ/ออฟไลน์)
// ใช้ aria-live ให้โปรแกรมอ่านหน้าจอประกาศ; หยุดนับเวลาเมื่อเอาเมาส์/โฟกัสวางบน toast; เคารพ prefers-reduced-motion
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
import { icon } from './icons.js';
const ICON = { success: icon('check', { stroke: 2.4 }), error: icon('x', { stroke: 2.4 }), warn: icon('alert', { stroke: 2.2 }), info: icon('info', { stroke: 2.2 }) };
const TITLE = { success: 'สำเร็จ', error: 'เกิดข้อผิดพลาด', warn: 'โปรดตรวจสอบ', info: 'แจ้งให้ทราบ' };
const MAX = 4;

let stack, bannerBox;
function ensure() {
  if (stack) return;
  stack = document.createElement('div');
  stack.className = 'nt-stack';
  stack.setAttribute('aria-live', 'polite');
  stack.setAttribute('aria-relevant', 'additions');
  document.body.appendChild(stack);
  bannerBox = document.createElement('div');
  bannerBox.className = 'nt-banners';
  bannerBox.setAttribute('role', 'region');
  bannerBox.setAttribute('aria-label', 'การแจ้งเตือนของระบบ');
}

/** วางกล่องแบนเนอร์ไว้ใต้ topbar (เรียกหลังวาด workspace/home) */
export function mountBanners(afterEl) {
  ensure();
  if (afterEl?.parentNode) afterEl.parentNode.insertBefore(bannerBox, afterEl.nextSibling);
  else document.body.prepend(bannerBox);
}

const live = new Map(); // id → element

/**
 * notify({ type, title, message, duration(ms; 0=ไม่หาย), action:{label,onClick}, id })
 * id เดียวกัน = แทนที่อันเดิม (กัน toast ซ้ำ)
 */
export function notify({ type = 'info', title, message = '', duration, action, id } = {}) {
  ensure();
  const ms = duration ?? (type === 'error' ? 9000 : type === 'warn' ? 8000 : action ? 8000 : 4500);
  if (id && live.has(id)) dismiss(live.get(id), true);
  const el = document.createElement('div');
  el.className = `nt nt-${type}`;
  el.setAttribute('role', type === 'error' || type === 'warn' ? 'alert' : 'status');
  el.innerHTML = `<span class="nt-ico" aria-hidden="true">${ICON[type] || ICON.info}</span>
    <div class="nt-body"><b>${esc(title || TITLE[type])}</b>${message ? `<p>${esc(message)}</p>` : ''}${action ? `<button type="button" class="nt-act">${esc(action.label)}</button>` : ''}</div>
    <button type="button" class="nt-x" aria-label="ปิดการแจ้งเตือน">${icon('x', { stroke: 2 })}</button>${ms ? `<i class="nt-bar" style="animation-duration:${ms}ms"></i>` : ''}`;
  stack.prepend(el);
  if (id) { live.set(id, el); el.dataset.nid = id; }
  while (stack.children.length > MAX) dismiss(stack.lastElementChild, true);
  el.querySelector('.nt-x').addEventListener('click', () => dismiss(el));
  if (action) el.querySelector('.nt-act').addEventListener('click', () => { dismiss(el); action.onClick?.(); });
  if (ms) {
    let timer, left = ms, t0;
    const start = () => { t0 = Date.now(); timer = setTimeout(() => dismiss(el), left); el.classList.remove('paused'); };
    const pause = () => { clearTimeout(timer); left -= Date.now() - t0; el.classList.add('paused'); };
    el.addEventListener('mouseenter', pause); el.addEventListener('mouseleave', start);
    el.addEventListener('focusin', pause); el.addEventListener('focusout', start);
    start();
  }
  requestAnimationFrame(() => el.classList.add('in'));
  return el;
}

function dismiss(el, instant = false) {
  if (!el || el.dataset.gone) return;
  el.dataset.gone = '1';
  if (el.dataset.nid) live.delete(el.dataset.nid);
  if (instant) { el.remove(); return; }
  el.classList.remove('in'); el.classList.add('out');
  setTimeout(() => el.remove(), 250);
}

export const success = (message, o = {}) => notify({ type: 'success', message, ...o });
export const failure = (message, o = {}) => notify({ type: 'error', message, ...o });
export const warning = (message, o = {}) => notify({ type: 'warn', message, ...o });
export const info = (message, o = {}) => notify({ type: 'info', message, ...o });

/** แปลงข้อความสั้น ๆ แบบเดิม (hooks.toast) เป็นชนิดที่เหมาะสม */
export function inferType(msg) {
  const m = String(msg);
  if (/ไม่สำเร็จ|ล้มเหลว|ผิดพลาด|ไม่ถูกต้อง|ไม่ได้/.test(m)) return 'error';
  if (/แล้ว|สำเร็จ|เรียบร้อย/.test(m)) return 'success';
  if (/กรอก|เลือก|ก่อน|ซ้ำ/.test(m)) return 'warn';
  return 'info';
}

/** แบนเนอร์ค้าง (ไม่หายเอง) ใต้แถบบน: banner('save', {type, message, action}) / clearBanner('save') */
export function banner(id, { type = 'warn', message, action } = {}) {
  ensure();
  clearBanner(id);
  const el = document.createElement('div');
  el.className = `nt-banner nt-b-${type}`;
  el.dataset.bid = id;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span class="nt-ico" aria-hidden="true">${ICON[type] || ICON.info}</span><span class="nt-bmsg">${esc(message)}</span>${action ? `<button type="button" class="nt-bact">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('.nt-bact').addEventListener('click', () => action.onClick?.());
  bannerBox.appendChild(el);
  return el;
}
export function clearBanner(id) { bannerBox?.querySelectorAll(`[data-bid="${id}"]`).forEach((n) => n.remove()); }
