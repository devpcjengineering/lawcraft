// ตัวดูเอกสารในหน้า (ไม่ดาวน์โหลดลงเครื่อง): แสดงเอกสารเป็นหน้า A4 ให้ตรวจก่อน แล้วค่อยกด “พิมพ์ / บันทึกเป็น PDF”
// ใช้ได้ 2 แบบ: เอกสารที่ระบบสร้าง (html) และไฟล์ PDF แบบพิมพ์ศาล (src)
import { esc } from './store.js';
import { icon } from './icons.js';
import { inlineLoading } from './loading.js';

let overlay = null, lastFocus = null;

function close() {
  if (!overlay) return;
  overlay.classList.remove('in');
  const o = overlay; overlay = null;
  document.removeEventListener('keydown', onKey, true);
  document.body.classList.remove('viewer-open');
  setTimeout(() => o.remove(), 200);
  lastFocus?.focus?.();
}
function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

/**
 * @param {{title:string, html?:string, src?:string, hint?:string}} o
 *  html = เนื้อหาเอกสารที่พร้อมวางใน <body> (ใช้ css/doc.css) ; src = URL ไฟล์ PDF
 */
export function openViewer(o) {
  if (overlay) close();
  lastFocus = document.activeElement;
  overlay = document.createElement('div');
  overlay.className = 'viewer';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', o.title);
  overlay.innerHTML = `<div class="viewer-bar">
      <button type="button" class="btn vw-back" data-v="close">${icon('arrowLeft')}<span>กลับไปแก้ไข</span></button>
      <div class="viewer-title"><span class="vw-ico" aria-hidden="true">${icon('file')}</span><span class="vw-t">${esc(o.title)}</span></div>
      ${o.html ? `<button type="button" class="btn primary vw-print" data-v="print">${icon('print')}<span class="vw-l">พิมพ์ / บันทึกเป็น PDF</span><span class="vw-s">พิมพ์ / PDF</span></button>` : ''}
    </div>
    ${o.html && o.hint !== '' ? `<div class="viewer-hint">${icon('info')}<span>${esc(o.hint || 'กด “พิมพ์ / บันทึกเป็น PDF” แล้วเลือก “บันทึกเป็น PDF” ตั้งกระดาษ A4 ขนาด 100% และปิด “ส่วนหัวและท้ายกระดาษ”')}</span></div>` : ''}
    <div class="viewer-body"><div class="viewer-load">${inlineLoading('เอกสาร')}</div><iframe class="viewer-frame" title="${esc(o.title)}"></iframe></div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('viewer-open');
  const frame = overlay.querySelector('iframe');
  frame.addEventListener('load', async () => {
    overlay?.querySelector('.viewer-load')?.remove();
    frame.classList.add('ready');
    if (!o.html) return;
    try {
      await frame.contentDocument.fonts.ready;
      fit();
    } catch { /* ignore */ }
  });
  const fit = () => {
    try {
      const d = frame.contentDocument;
      if (!d?.body) return;
      d.body.style.zoom = Math.min(1, (frame.clientWidth - 24) / 794);
    } catch { /* ignore */ }
  };
  const ro = new ResizeObserver(fit); ro.observe(frame);
  if (o.html) {
    frame.srcdoc = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(o.title)}</title><base href="${location.origin}/"><link rel="stylesheet" href="css/doc.css">
      <style>html{background:#e3e4e9}body{margin:0;padding:14px 0 28px}@media print{html{background:#fff}body{padding:0;zoom:1!important}}</style></head><body>${o.html}</body></html>`;
  } else {
    frame.src = o.src;
  }
  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    if (b.dataset.v === 'close') close();
    if (b.dataset.v === 'print') { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* ignore */ } }
  });
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => { overlay?.classList.add('in'); overlay?.querySelector('[data-v=close]')?.focus(); });
}
