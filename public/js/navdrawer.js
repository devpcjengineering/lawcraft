// มือถือ (≤ 760px): เมนูขั้นตอนของคดี (nav#steps) เป็นลิ้นชักแนวตั้งเลื่อนเข้าจากซ้าย เปิดด้วยปุ่ม “4 ขีด” ที่แถบบน
// จอใหญ่: nav#steps ยังเป็นแถบเมนูซ้ายเหมือนเดิม — โมดูลนี้ไม่ทำอะไรเมื่อจอกว้างกว่า 760px
// สถานะเปิด = คลาส .navopen บน .work (CSS ล็อกเลื่อนหน้า/ย้ายชั้นแถบบนตามคลาสนี้ จึงไม่มีสถานะค้างเมื่อวาดหน้าใหม่)
import { actions } from './store.js';

const MQ = matchMedia('(max-width: 760px)');
const $ = (s) => document.querySelector(s);
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const isNavOpen = () => !!$('.work.navopen');

/** ซิงก์ aria / inert กับสถานะปัจจุบัน (เรียกหลังเปิด-ปิด · เปลี่ยนขนาดจอ · วาดเมนูใหม่) */
export function syncNav() {
  const nav = $('#steps'), btn = $('#nav-toggle'), work = $('.work');
  if (!nav || !work) return;
  const phone = MQ.matches, open = phone && work.classList.contains('navopen');
  if (!phone && work.classList.contains('navopen')) work.classList.remove('navopen');
  btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (phone) {
    // ปิดอยู่ = ซ่อนจากแป้นพิมพ์และโปรแกรมอ่านหน้าจอ ; เปิดอยู่ = เป็นกล่องโต้ตอบแบบโมดัล
    nav.toggleAttribute('inert', !open);
    if (open) { nav.setAttribute('role', 'dialog'); nav.setAttribute('aria-modal', 'true'); nav.setAttribute('aria-label', 'เมนูคดี'); }
    else { nav.removeAttribute('role'); nav.removeAttribute('aria-modal'); nav.setAttribute('aria-label', 'เมนูเอกสารและขั้นตอน'); }
  } else {
    nav.removeAttribute('inert'); nav.removeAttribute('role'); nav.removeAttribute('aria-modal'); nav.setAttribute('aria-label', 'เมนูเอกสารและขั้นตอน');
  }
}

let opener = null;
export function openNav() {
  const work = $('.work');
  if (!work || !MQ.matches || work.classList.contains('navopen')) return;
  if (work.classList.contains('showpv')) work.classList.remove('showpv'); // ตัวอย่างเอกสารเต็มจอปิดก่อน ไม่ให้ซ้อนกัน
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : $('#nav-toggle');
  work.classList.add('navopen');
  syncNav();
  const nav = $('#steps');
  const cur = nav.querySelector('.nav-item.on') || nav.querySelector('.steps-x');
  cur?.focus({ preventScroll: true });
  cur?.scrollIntoView?.({ block: 'nearest' });
}
export function closeNav({ restore = true } = {}) {
  const work = $('.work');
  if (!work || !work.classList.contains('navopen')) return;
  work.classList.remove('navopen');
  syncNav();
  if (restore) { const back = opener && opener.isConnected ? opener : $('#nav-toggle'); back?.focus({ preventScroll: true }); }
  opener = null;
}

actions.toggleNav = () => (isNavOpen() ? closeNav() : openNav());
actions.closeNav = () => closeNav();

// Esc ปิด · Tab วนอยู่ในลิ้นชัก (focus trap แบบเบา)
document.addEventListener('keydown', (e) => {
  if (!isNavOpen()) return;
  if (e.key === 'Escape') { e.preventDefault(); closeNav(); return; }
  if (e.key !== 'Tab') return;
  const items = [...$('#steps').querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1], a = document.activeElement;
  if (!$('#steps').contains(a)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
});
// แตะรายการเมนู → ปิดลิ้นชัก (การไปหน้านั้น/แจ้ง “ต้องกรอก…ก่อน” ทำโดย goTab ตามเดิม) ; โฟกัสไม่ต้องคืนปุ่ม เพราะหน้าใหม่เริ่มใหม่
document.addEventListener('click', (e) => {
  if (isNavOpen() && e.target.closest?.('#steps .nav-item')) closeNav({ restore: false });
});
// หมุนจอ/ขยายหน้าต่างจนพ้นขนาดมือถือ → ปิด + คืน aria
MQ.addEventListener?.('change', () => { if (!MQ.matches) closeNav({ restore: false }); syncNav(); });
// ย้อนกลับ/ไปข้างหน้าของเบราว์เซอร์ = เปลี่ยนหน้า → ปิดลิ้นชัก
window.addEventListener('popstate', () => closeNav({ restore: false }));
