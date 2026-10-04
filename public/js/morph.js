// อัปเดต DOM ให้ตรงกับ HTML ใหม่ โดยแก้เฉพาะส่วนที่เปลี่ยนจริง (ไม่ล้างทั้งก้อนด้วย innerHTML)
// ผลที่ได้: ข้อความ/ปุ่มที่ไม่เปลี่ยนไม่กะพริบหรือ “เด้ง”, ช่องที่กำลังพิมพ์ยังโฟกัสอยู่, ตำแหน่งเลื่อนไม่หลุด
// ส่วนที่เพิ่มเข้ามาใหม่จะค่อย ๆ ปรากฏ (fade + เลื่อนขึ้นเล็กน้อย ดู [data-mi] ใน smooth.css)

const FIELD = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function fadeIn(el) {
  if (el.nodeType !== 1) return el;
  el.setAttribute('data-mi', '');
  el.addEventListener('animationend', () => el.removeAttribute('data-mi'), { once: true });
  return el;
}

function syncAttrs(a, b) {
  for (const { name } of [...a.attributes]) {
    if (name === 'data-mi') continue;
    if (!b.hasAttribute(name) && !(name === 'value' && FIELD.has(a.tagName))) a.removeAttribute(name);
  }
  for (const { name, value } of [...b.attributes]) {
    if (name === 'data-mi') continue;
    if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  }
}

function syncField(a, b) {
  if (a.tagName === 'INPUT') {
    if (a.type === 'checkbox' || a.type === 'radio') { if (a.checked !== b.checked) a.checked = b.checked; return; }
    if (a.type === 'file') return;
    if (a.value !== b.value) a.value = b.value;
  } else if (a.tagName === 'TEXTAREA') {
    if (a.value !== b.value) a.value = b.value;
  }
}

function morphElement(a, b, opt) {
  syncAttrs(a, b);
  morphChildren(a, b, opt);
  if (a.tagName === 'SELECT') {
    const want = [...b.options].findIndex((o) => o.hasAttribute('selected'));
    const idx = want >= 0 ? want : 0;
    if (a.selectedIndex !== idx) a.selectedIndex = idx;
  } else if (FIELD.has(a.tagName)) syncField(a, b);
}

/** ลายเซ็นของโหนด ใช้ตัดสินว่า “เป็นอันเดียวกัน” ไหม: แท็ก + id + คลาสแรก (สถานะอย่าง on/open ไม่ทำให้ต่างกัน) */
const sig = (n) => (n.nodeType === 1 ? `${n.tagName}#${n.id}.${n.classList[0] || ''}` : `#${n.nodeType}`);
const WINDOW = 8;

function place(a, y, ref, opt) {
  const c = y.cloneNode(true);
  a.insertBefore(opt.mark ? fadeIn(c) : c, ref);
}

function morphPair(x, y, opt) {
  if (x.nodeType === 3 || x.nodeType === 8) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; return; }
  if (x.nodeType === 1 && !x.hasAttribute('data-morph-skip')) morphElement(x, y, opt);
}

/** จับคู่ลูกทีละตัวพร้อมมองล่วงหน้า: มีของใหม่แทรกมา หรือของเก่าหายไป ก็ไม่ทำให้ตัวที่เหลือเลื่อนผิดคู่ (โหนดเดิมจึงถูกใช้ต่อ) */
function morphChildren(a, b, opt) {
  const an = [...a.childNodes], bn = [...b.childNodes];
  let i = 0, j = 0;
  while (j < bn.length) {
    const y = bn[j], x = an[i];
    if (!x) { place(a, y, null, opt); j++; continue; }
    if (sig(x) === sig(y)) { morphPair(x, y, opt); i++; j++; continue; }
    let k = -1, m = -1;
    for (let t = i + 1; t < Math.min(an.length, i + 1 + WINDOW); t++) if (sig(an[t]) === sig(y)) { k = t; break; }
    for (let t = j + 1; t < Math.min(bn.length, j + 1 + WINDOW); t++) if (sig(bn[t]) === sig(x)) { m = t; break; }
    if (m !== -1 && (k === -1 || m - j <= k - i)) { for (; j < m; j++) place(a, bn[j], x, opt); continue; } // มีโหนดใหม่แทรกก่อน x
    if (k !== -1) { for (; i < k; i++) an[i].remove(); continue; } // โหนดเก่าบางตัวหายไป
    // ไม่เจอคู่ใกล้เคียง → แทนที่ตำแหน่งนี้ด้วยของใหม่
    const c = y.cloneNode(true);
    a.replaceChild(opt.mark ? fadeIn(c) : c, x);
    i++; j++;
  }
  for (; i < an.length; i++) an[i].remove();
}

/** แทน el.innerHTML = html แบบแก้เฉพาะส่วนต่าง; opts.mark=false ปิด fade ของส่วนที่เพิ่มใหม่ */
export function morphInto(target, html, opts = {}) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  morphChildren(target, tpl.content, { mark: opts.mark !== false });
}
