// ชิ้นส่วนแถบบนของหลังบ้านที่ใช้ร่วมกันทุกหน้า (โลโก้ + ชื่อหน้า) และปุ่มแถบบนแบบไอคอน+ข้อความ
import { icon } from './icons.js';

const MARK = '<svg class="brand-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="7" r="2"/><path d="M24 9v29M16 41h16M13 38h22M7 14h34"/><path d="M10 14 3 28M10 14l7 14M38 14l-7 14M38 14l7 14"/><path d="M3 28h14c-.5 5-3.5 7.5-7 7.5S3.5 33 3 28zM31 28h14c-.5 5-3.5 7.5-7 7.5S31.5 33 31 28z"/></svg>';

export const APP_VERSION = '__APP_VERSION__';
export const APP_DATE = '__APP_DATE__';

/** โลโก้มุมซ้ายบน: คลิกกลับหน้าแรก, sub = ชื่อหน้าปัจจุบัน (ซ่อนบนมือถือ) */
export function brandHtml(sub = '') {
  return `<a class="brand" href="/workspace/" data-act="goHome" aria-label="กลับหน้าแรกหลังบ้าน">${MARK}<span class="brand-text"><span class="lt-th">สำนักงานกฎหมาย ลอว์คราฟต์</span><span class="lt-en">Law Craft Legal Consultants</span></span>${sub ? `<span class="brand-sub">${sub}</span>` : ''}</a>`;
}

/** ปุ่มแถบบน: ไอคอนเสมอ ข้อความซ่อนเมื่อจอแคบ (≤1100px, class tb-i / tb-t) — มี title/aria-label เสมอ */
export function tbBtn({ ico, text, act = '', label = '', href = '', cls = '', external = false }) {
  const inner = `<span class="tb-i" aria-hidden="true">${icon(ico)}</span><span class="tb-t">${text}</span>`;
  const aria = ` aria-label="${label || text}" title="${label || text}"`;
  if (href) return `<a class="btn${cls ? ' ' + cls : ''}" href="${href}"${act ? ` data-act="${act}"` : ''}${external ? ' target="_blank" rel="noopener"' : ''}${aria}>${inner}</a>`;
  return `<button type="button" class="btn${cls ? ' ' + cls : ''}" data-act="${act}"${aria}>${inner}</button>`;
}

// ให้โลโก้กด/เปิดด้วยคีย์บอร์ดได้ (Enter / Space)
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target?.classList?.contains('brand')) { e.preventDefault(); e.target.click(); }
});
