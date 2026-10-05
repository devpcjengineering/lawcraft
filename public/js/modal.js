// กล่องป๊อปอัปแทน alert/confirm ของเบราว์เซอร์ — ใช้ <dialog> รองรับคีย์บอร์ด (Esc = ยกเลิก, โฟกัสปุ่มหลัก)
import { icon as svg } from './icons.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let dlg;
function ensure() {
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.className = 'modal';
  dlg.setAttribute('aria-labelledby', 'modal-title');
  document.body.appendChild(dlg);
  return dlg;
}

/**
 * แสดงกล่องข้อความ คืนค่า Promise ของปุ่มที่กด (ค่า value ของปุ่ม) หรือ null เมื่อปิด/กด Esc
 * opts: { title, message (HTML ปลอดภัยที่ผู้เรียก escape เอง), tone: 'info'|'warn'|'danger'|'ok', buttons: [{label, value, primary, danger}] }
 */
export function modal({ title = '', message = '', tone = 'info', buttons = [{ label: 'ตกลง', value: true, primary: true }] }) {
  const d = ensure();
  const icon = svg({ info: 'info', warn: 'alert', danger: 'alert', ok: 'checkCircle' }[tone] || 'info', { stroke: 1.9 });
  d.innerHTML = `<form method="dialog" class="modal-card ${tone}">
    <div class="modal-ico" aria-hidden="true">${icon}</div>
    <h3 id="modal-title">${esc(title)}</h3>
    <div class="modal-body">${message}</div>
    <div class="modal-actions">${buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger-fill' : ''}" value="${i}" ${b.primary ? 'autofocus' : ''}>${esc(b.label)}</button>`).join('')}</div>
  </form>`;
  return new Promise((resolve) => {
    const onClose = () => {
      d.removeEventListener('close', onClose);
      const v = d.returnValue;
      resolve(v === '' || v === undefined ? null : buttons[+v]?.value ?? null);
    };
    d.returnValue = '';
    d.addEventListener('close', onClose);
    if (d.open) d.close();
    d.showModal();
  });
}

/** ยืนยัน: คืน true/false */
export async function confirmBox(message, { title = 'ยืนยันการทำรายการ', okText = 'ตกลง', cancelText = 'ยกเลิก', danger = false } = {}) {
  const r = await modal({
    title, tone: danger ? 'danger' : 'warn', message: `<p>${esc(message).replace(/\n/g, '<br>')}</p>`,
    buttons: [{ label: cancelText, value: false }, { label: okText, value: true, primary: !danger, danger }],
  });
  return r === true;
}

export function alertBox(message, { title = 'แจ้งให้ทราบ', tone = 'info' } = {}) {
  return modal({ title, tone, message: `<p>${esc(message).replace(/\n/g, '<br>')}</p>` });
}

/** รายการปัญหาก่อนออกเอกสาร: คืน 'fix' (ไปแก้) | 'go' (ออกต่อ) */
export async function issuesBox(issues, { allowContinue = true } = {}) {
  const errs = issues.filter((i) => i.level === 'error'), warns = issues.filter((i) => i.level === 'warn');
  const row = (i) => `<li class="${i.level}"><span class="il-ico">${svg({ error: 'xCircle', warn: 'alert', info: 'info' }[i.level] || 'info')}</span><span>${esc(i.msg)}</span></li>`;
  const html = `<p>${errs.length ? `พบ <b>${errs.length}</b> จุดที่ควรแก้ก่อนยื่น` : ''}${errs.length && warns.length ? ' และ ' : ''}${warns.length ? `<b>${warns.length}</b> ข้อควรตรวจสอบ` : ''}</p>
    <ul class="issue-list">${[...errs, ...warns].slice(0, 8).map(row).join('')}</ul>${errs.length + warns.length > 8 ? `<p class="hint">…และอีก ${errs.length + warns.length - 8} รายการ ดูทั้งหมดในหน้า “ออกเอกสาร”</p>` : ''}`;
  const r = await modal({
    title: 'ตรวจพบรายการที่ควรแก้ไข', tone: errs.length ? 'warn' : 'info', message: html,
    buttons: [{ label: 'กลับไปแก้ไข', value: 'fix', primary: true }, ...(allowContinue ? [{ label: 'ออกเอกสารต่อไป', value: 'go' }] : [])],
  });
  return r || 'fix';
}
