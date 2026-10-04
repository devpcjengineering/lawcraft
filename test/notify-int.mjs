import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const edit = (file, fn) => { const f = new URL(file, root); fs.writeFileSync(f, fn(fs.readFileSync(f, 'utf8'))); };
const rep = (s, a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`พบ ${n}: ${a.slice(0, 80)}`); return s.split(a).join(b); };

// ---------- shared/layout.js: ขนาดโลโก้ ----------
edit('shared/layout.js', (s) => {
  s = rep(s, "  'sig.left': 38,", "  'brand.site': 22,          // px — ความสูงโลโก้ครุฑบนเว็บไซต์\n  'brand.admin': 28,         // px — ความสูงโลโก้ครุฑบนหลังบ้าน\n  'sig.left': 38,");
  s = rep(s, "  { title: 'หัวเรื่อง & เลขคดี', fields: [", `  { title: 'โลโก้ครุฑ (เว็บไซต์ / หลังบ้าน)', scope: 'all', fields: [
    { k: 'brand.site', label: 'ขนาดโลโก้บนเว็บไซต์ (ความสูง)', unit: 'px', min: 14, max: 56, step: 1 },
    { k: 'brand.admin', label: 'ขนาดโลโก้บนหลังบ้าน (ความสูง)', unit: 'px', min: 16, max: 56, step: 1 },
  ] },
  { title: 'หัวเรื่อง & เลขคดี', fields: [`);
  return s;
});

// ---------- เว็บไซต์: ใช้ขนาดโลโก้ที่ตั้งไว้ ----------
edit('public/js/public-data.js', (s) => rep(s, "jurisdiction: m.jurisdiction || null, formText: m.formText || {},\n  };", "jurisdiction: m.jurisdiction || null, formText: m.formText || {}, layout: m.layout || { all: {}, forms: {} },\n  };"));
edit('public/site/site.js', (s) => rep(s, "data = await loadLawData();", "data = await loadLawData();\n  { const h = Number(data.layout?.all?.['brand.site']); if (h >= 12 && h <= 64) document.documentElement.style.setProperty('--logo-h', h + 'px'); }"));
edit('public/site/site.css', (s) => {
  s = rep(s, ".logo-mark { height: 22px; width: auto; display: block; }", ".logo-mark { height: var(--logo-h, 22px); width: auto; display: block; }");
  return s + "\n.nav-in { height: auto; min-height: 48px; padding-top: 4px; padding-bottom: 4px; }\n";
});

// ---------- หลังบ้าน ----------
edit('public/workspace/index.html', (s) => rep(s, '<link rel="stylesheet" href="/css/app.css">', '<link rel="stylesheet" href="/css/app.css">\n<link rel="stylesheet" href="/css/notify.css">'));

edit('public/js/app.js', (s) => {
  s = rep(s, "import { confirmBox, alertBox, issuesBox } from './modal.js';", "import { confirmBox, alertBox, issuesBox, modal } from './modal.js';\nimport { notify, banner, clearBanner, mountBanners, inferType } from './notify.js';");

  // toast → ระบบแจ้งเตือนใหม่
  s = rep(s, `let toastTimer;
hooks.toast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
};`, `// ข้อความสั้น ๆ จากทุกหน้า → toast (ชนิดเดาจากถ้อยคำ: ไม่สำเร็จ=แดง, แล้ว=เขียว, กรอก/เลือก=เหลือง)
hooks.toast = (msg, o = {}) => notify({ type: o.type || inferType(msg), message: msg, ...o });
const MODE_NAME = { 'cross-post': 'ส่งนอกเขต + ปิดหมาย', post: 'ปิดหมายอย่างเดียว', cross: 'ส่งนอกเขตอย่างเดียว', none: 'ไม่ต้องขอ' };`);

  // บันทึกอัตโนมัติ + แจ้งเตือน
  const a = s.indexOf("let saveTimer, saveState = '';");
  const b = s.indexOf("hooks.preview = () => schedulePreview();");
  if (a < 0 || b < a) throw new Error('ไม่พบช่วงบันทึกอัตโนมัติ');
  s = s.slice(0, a) + `let saveTimer, saveState = '', savePending = false, saveFailed = false;
function setSaveState(st, tone = '') {
  saveState = st;
  const el = $('#save-state');
  if (el) { el.textContent = st; el.dataset.tone = tone; }
}
async function doSave() {
  if (!S.c) return;
  setSaveState('กำลังบันทึก…', 'busy');
  try {
    await backend.saveCase(S.c);
    savePending = false;
    if (saveFailed) { saveFailed = false; clearBanner('save'); notify({ type: 'success', title: 'บันทึกสำเร็จแล้ว', message: 'ข้อมูลล่าสุดถูกเก็บเรียบร้อย', id: 'save-ok' }); }
    setSaveState('บันทึกแล้ว ✓', 'ok');
  } catch (e) {
    saveFailed = true;
    setSaveState('บันทึกไม่สำเร็จ', 'err');
    if (e.status === 401) return showLogin();
    banner('save', { type: 'error', message: 'บันทึกอัตโนมัติไม่สำเร็จ — ข้อมูลล่าสุดยังไม่ถูกเก็บ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง', action: { label: 'ลองบันทึกใหม่', onClick: doSave } });
  }
}
function serviceAutoNote() {
  const sv = S.c.service;
  notify({
    type: 'info', id: 'svc-auto', title: 'ปรับวิธีส่งหมายให้อัตโนมัติ',
    message: \`\${MODE_NAME[sv.mode] || sv.mode}\${sv.court ? \` — ส่งผ่าน \${sv.court}\` : ' (ฟ้องและส่งหมายที่ศาลเดียวกัน)'}\`,
    action: { label: 'ดูคำร้อง', onClick: () => actions.goTab({ dataset: { tab: 'service' } }) },
  });
}
// เตือนเชิงรุก: กำหนด 3 เดือนความผิดต่อส่วนตัว (ป.อ. มาตรา 96) เหลือน้อย/เกินแล้ว — เตือนครั้งเดียวต่อข้อความ
const alerted = new Set(); let proTimer;
function proactive() {
  if (!S.c) return;
  for (const i of validateCase(S.c, S.idx)) {
    if (i.level === 'info' || !/เหลือเวลา|เกินกำหนด/.test(i.msg) || alerted.has(i.msg)) continue;
    alerted.add(i.msg);
    notify({
      type: i.level === 'error' ? 'error' : 'warn', id: 'deadline', duration: 0,
      title: i.level === 'error' ? 'เกินกำหนดร้องทุกข์/ฟ้อง' : 'ใกล้ครบกำหนดความผิดต่อส่วนตัว',
      message: i.msg, action: { label: 'ไปที่ข้อมูลคดี', onClick: () => actions.goTab({ dataset: { tab: 'case' } }) },
    });
  }
}
hooks.changed = () => {
  if (!S.c) return;
  S.c.title = caseTitle(S.c);
  if (applyServiceAuto(S.c, S.data)) serviceAutoNote(); // ปิดหมาย / ส่งข้ามเขต ตามภูมิลำเนาจำเลยเทียบกับศาลที่ฟ้อง
  savePending = true;
  setSaveState('กำลังบันทึก…', 'busy');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 600);
  clearTimeout(proTimer); proTimer = setTimeout(proactive, 900);
  schedulePreview();
  renderStepsSoon();
  const nm = $('.case-name'); if (nm) nm.textContent = S.c.title;
};
window.addEventListener('beforeunload', (e) => { if (savePending || saveFailed) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('offline', () => banner('net', { type: 'warn', message: 'ออฟไลน์ — ยังแก้ไขได้ ระบบจะบันทึกเมื่อกลับมาออนไลน์' }));
window.addEventListener('online', () => { clearBanner('net'); if (saveFailed || savePending) doSave(); });
` + s.slice(b);

  // โลโก้ปรับขนาดได้ ทันที
  s = rep(s, "  inner.classList.toggle('pv-guides', !!S.ui.guides);\n  inner.querySelectorAll", "  inner.classList.toggle('pv-guides', !!S.ui.guides);\n  applyBrand();\n  inner.querySelectorAll");
  s = rep(s, "// ---------------- เข้าสู่ระบบ (ใช้เมื่อเชื่อม Supabase) ----------------", `/** ขนาดโลโก้ครุฑบนหลังบ้านตามที่ตั้งไว้ในหน้า “ตำแหน่งตัวหนังสือ & ตราครุฑ” */
function applyBrand() {
  const h = Number(S.data.layout?.all?.['brand.admin']);
  document.documentElement.style.setProperty('--brand-h', (h >= 12 && h <= 64 ? h : 28) + 'px');
}

// ---------------- เข้าสู่ระบบ (ใช้เมื่อเชื่อม Supabase) ----------------`);
  s = rep(s, "    S.data = data; S.idx = indexLaw(data); S.geo = geo; S.people = people;", "    S.data = data; S.idx = indexLaw(data); S.geo = geo; S.people = people;\n    applyBrand();");

  // ป้ายสถานะความพร้อม + banner
  s = rep(s, `    <span class="save-state" id="save-state" data-tone="">\${esc(saveState)}</span>
    <button class="btn ghost" data-act="togglePreview">`, `    <button class="ready-chip" id="ready-chip" data-act="showReadiness" type="button"></button>
    <span class="save-state" id="save-state" data-tone="">\${esc(saveState)}</span>
    <button class="btn ghost" data-act="togglePreview">`);
  s = rep(s, "  renderShell();\n  schedulePreview(true);\n}", "  renderShell();\n  schedulePreview(true);\n  mountBanners($('.topbar'));\n  updateReady();\n}");
  s = rep(s, "  $('#importFile')?.addEventListener('change'", "  mountBanners($('.topbar'));\n  $('#importFile')?.addEventListener('change'");
  s = rep(s, "    }).join('')}</div>`;\n  }).join('');\n}\nlet stepsTimer;", `    }).join('')}</div>\`;
  }).join('');
  updateReady();
}
function updateReady() {
  const chip = $('#ready-chip');
  if (!chip || !S.c) return;
  const iss = validateCase(S.c, S.idx);
  const e = iss.filter((i) => i.level === 'error').length, w = iss.filter((i) => i.level === 'warn').length;
  chip.className = 'ready-chip ' + (e ? 'err' : w ? 'warn' : 'ok');
  chip.innerHTML = '<i></i>' + (e ? \`ต้องแก้ \${e} จุด\` : w ? \`ควรตรวจ \${w} ข้อ\` : 'พร้อมยื่น');
  chip.title = 'คลิกเพื่อดูรายการตรวจสอบก่อนยื่น';
}
actions.showReadiness = async () => {
  const iss = validateCase(S.c, S.idx);
  const names = { case: 'ข้อมูลคดี', parties: 'คู่ความ', counsel: 'ทนายความ', charges: 'คำฟ้อง', facts: 'คำฟ้อง', complaint: 'คำฟ้อง', prayer: 'คำขอท้ายฟ้อง' };
  const mark = { error: ['err', '⛔'], warn: ['todo', '▲'], info: ['ok', 'ℹ'] };
  const body = iss.length
    ? \`<ul class="modal-list">\${iss.map((i) => \`<li class="\${mark[i.level][0]}"><span class="st">\${mark[i.level][1]}</span><span>\${esc(i.msg)}</span><button type="button" class="go" data-act="goTabClose" data-tab="\${esc(i.tab)}">ไปแก้\${names[i.tab] ? ' ' + esc(names[i.tab]) : ''}</button></li>\`).join('')}</ul>\`
    : '<p>ตรวจแล้วไม่พบจุดที่ต้องแก้ ✓ พร้อมออกเอกสาร</p>';
  const hasErr = iss.some((i) => i.level === 'error');
  const r = await modal({ title: iss.length ? 'รายการตรวจสอบก่อนยื่น' : 'พร้อมออกเอกสาร', tone: hasErr ? 'warn' : iss.length ? 'info' : 'ok', message: body, buttons: [{ label: 'ปิด', value: null }, { label: 'ไปหน้าออกเอกสาร', value: 'export', primary: true }] });
  if (r === 'export') actions.goTab({ dataset: { tab: 'export' } });
};
actions.goTabClose = (el) => { document.querySelector('dialog.modal')?.close(); actions.goTab(el); };
let stepsTimer;`);

  // คดีใหม่ / ดาวน์โหลด / พิมพ์
  s = rep(s, "  S.c = c; S.tab = 'case'; S.ui.pvDoc = ''; hooks.changed(); showWorkspace();\n};", "  S.c = c; S.tab = 'case'; S.ui.pvDoc = ''; alerted.clear(); hooks.changed(); showWorkspace();\n  notify({ type: 'success', title: 'สร้างคดีใหม่แล้ว', message: 'ระบบบันทึกอัตโนมัติทุกครั้งที่แก้ไข เริ่มจากกรอกศาลและคู่ความ' });\n};");
  s = rep(s, "  S.c = normalizeCase(c);\n  applyServiceAuto(S.c, S.data);", "  S.c = normalizeCase(c);\n  alerted.clear();\n  applyServiceAuto(S.c, S.data);");
  s = rep(s, "    hooks.toast('ดาวน์โหลดไฟล์ Word แล้ว');", "    notify({ type: 'success', title: 'ดาวน์โหลดไฟล์ Word แล้ว', message: filename });");
  s = rep(s, "actions.printAll = async () => { if (await guardExport()) printHtml(currentDocs()); };\nactions.printDoc = async (el) => { if (await guardExport()) printHtml(currentDocs().filter((d) => d.id === el.dataset.id)); };",
    `const printNote = () => notify({ type: 'info', title: 'เปิดหน้าต่างพิมพ์แล้ว', message: 'เลือก “บันทึกเป็น PDF” ตั้งกระดาษ A4 ขนาด 100% และปิด “ส่วนหัวและท้ายกระดาษ”', duration: 9000 });
actions.printAll = async () => { if (await guardExport()) { printHtml(currentDocs()); printNote(); } };
actions.printDoc = async (el) => { if (await guardExport()) { printHtml(currentDocs().filter((d) => d.id === el.dataset.id)); printNote(); } };`);
  return s;
});

edit('public/css/notify.css', (s) => s + "\n/* ขนาดโลโก้ปรับได้ (ตั้งค่าที่หน้า ตำแหน่งตัวหนังสือ & ตราครุฑ) */\n.brand-mark { height: var(--brand-h, 28px) !important; }\n.topbar { min-height: 52px; }\n");
console.log('ok');
