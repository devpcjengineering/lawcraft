// หน้าโหลดของหลังบ้าน: โลโก้ + แถบสีวิ่งขวา + "กำลังโหลด…ชื่อหน้า" (สไตล์ใน css/loading.css)
//   showLoading('รายการคดี')            → ขึ้นทันที
//   showLoading('สมุดรายชื่อ', 150)     → ขึ้นเมื่อรอเกิน 150 ms (โหลดเร็วไม่กะพริบ)
//   hideLoading()                       → จางหาย (ยกเลิกตัวที่ยังไม่ทันขึ้นด้วย)
//   withLoading('ชื่อหน้า', promise)    → ครอบงานที่ await
//   inlineLoading('ชื่อ')               → มาร์กอัปแบบฝังในกล่อง (ไม่คลุมจอ)
const MARK = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="7" r="2"/><path d="M24 9v29M16 41h16M13 38h22M7 14h34"/><path d="M10 14 3 28M10 14l7 14M38 14l-7 14M38 14l7 14"/><path d="M3 28h14c-.5 5-3.5 7.5-7 7.5S3.5 33 3 28zM31 28h14c-.5 5-3.5 7.5-7 7.5S31.5 33 31 28z"/></svg>';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** มาร์กอัปหน้าโหลด (ใช้ซ้ำใน HTML ตั้งต้นของหน้าได้) */
export function loadingMarkup(label = '') {
  return `<div class="lcl-box"><div class="lcl-brand">${MARK}<span><span class="th">สำนักงานกฎหมาย ลอว์คราฟต์</span><span class="en">Law Craft Legal Consultants</span></span></div>
    <div class="lcl-track" role="progressbar" aria-label="กำลังโหลด"></div>
    <p class="lcl-text" role="status" aria-live="polite">กำลังโหลด…${label ? `<b>${esc(label)}</b>` : ''}</p></div>`;
}

/** แบบฝังในหน้า (ไม่คลุมทั้งจอ) — ใช้กับกล่องที่โหลดเนื้อหาของตัวเอง เช่น ตัวดูเอกสาร */
export const inlineLoading = (label = '') => `<div class="lcl lcl-inline">${loadingMarkup(label)}</div>`;

let timer = 0;
function node() {
  let el = document.getElementById('lcl');
  if (!el) {
    el = document.createElement('div'); el.id = 'lcl'; el.className = 'lcl out'; el.hidden = false;
    document.body.appendChild(el);
  }
  return el;
}

function paint(label) {
  const el = node();
  el.innerHTML = loadingMarkup(label);
  el.classList.remove('out');
}

export function showLoading(label = '', delay = 0) {
  clearTimeout(timer);
  const boot = document.getElementById('lcl-boot'); // หน้าโหลดตั้งต้นที่อยู่ใน HTML (ถ้ามี): อัปเดตข้อความอย่างเดียว ไม่สร้างซ้ำ
  if (boot && !boot.classList.contains('out')) { const b = boot.querySelector('.lcl-text'); if (b) b.innerHTML = `กำลังโหลด…${label ? `<b>${esc(label)}</b>` : ''}`; return; }
  if (delay > 0) timer = setTimeout(() => paint(label), delay); else paint(label);
}

export function hideLoading() {
  clearTimeout(timer);
  const boot = document.getElementById('lcl-boot');
  if (boot) { boot.classList.add('out'); setTimeout(() => boot.remove(), 400); }
  const el = document.getElementById('lcl');
  if (el) el.classList.add('out');
}

export async function withLoading(label, promise, delay = 150) {
  showLoading(label, delay);
  try { return await promise; } finally { hideLoading(); }
}
