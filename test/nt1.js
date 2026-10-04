const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
await sleep(600);
const chip = document.getElementById('ready-chip');
out.chip = chip ? { cls: chip.className, text: chip.textContent } : null;
// ป๊อปอัปรายการตรวจสอบ
chip.click(); await sleep(500);
const dlg = document.querySelector('dialog.modal');
out.modal = { open: !!dlg?.open, title: dlg?.querySelector('h3')?.textContent, items: dlg?.querySelectorAll('.modal-list li').length };
// กดปุ่ม “ไปแก้” ตัวแรก → ปิด popup และไปหน้านั้น
const go = dlg?.querySelector('.go'); const goTab = go?.dataset.tab; go?.click(); await sleep(500);
out.afterGo = { modalOpen: !!document.querySelector('dialog.modal[open]'), tab: document.querySelector('.nav-item.on')?.dataset.tab, expected: goTab };
// toast: ไปหน้าคู่ความ แล้วกด “บันทึกลงสมุดรายชื่อ” ทั้งที่ยังไม่มีชื่อ
document.querySelector('[data-act=goTab][data-tab=parties]').click(); await sleep(500);
document.querySelector('[data-act=savePerson]')?.click(); await sleep(700);
out.toasts = [...document.querySelectorAll('.nt')].map((n) => ({ cls: n.className, text: n.innerText.replace(/\s+/g, ' ').slice(0, 90) }));
// ขนาดโลโก้หลังบ้านปรับสดจากหน้า layout
document.querySelector('[data-act=goTab][data-tab=layout]').click(); await sleep(700);
const logo = document.querySelector('.topbar .brand-mark');
out.logoBefore = Math.round(logo.getBoundingClientRect().height);
const r = document.querySelector('input[type=range][data-k="brand.admin"]');
out.hasBrandSlider = !!r;
if (r) { r.value = 44; r.dispatchEvent(new Event('input', { bubbles: true })); await sleep(80); }
out.logoAfter = Math.round(logo.getBoundingClientRect().height);
return out;
