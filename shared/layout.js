// การจัดหน้ากระดาษและตำแหน่งตัวหนังสือ/ตราครุฑของแบบฟอร์มศาล — แก้ได้จากหลังบ้านหน้า "ตำแหน่งตัวหนังสือ & ตราครุฑ"
// ใช้ร่วมกันทั้งตัวอย่างบนหน้าเว็บ (CSS) และไฟล์ Word (docx)
// ค่าที่เก็บ: { all: {...เฉพาะคีย์ที่แก้}, forms: { complaint: {...}, prayer: {...} } }  คีย์ใช้ path แบบ "emblem.width"

export const LAYOUT_DEFAULTS = {
  'page.top': 18, 'page.bottom': 20, 'page.left': 25, 'page.right': 18,
  'font.size': 16, 'font.line': 1.32,
  'body.indent': 0,          // ซม. เพิ่ม/ลดย่อหน้าบรรทัดแรกของเนื้อหา
  'body.gap': 0,             // มม. ระยะห่างระหว่างย่อหน้าที่เพิ่ม
  'emblem.show': 1, 'emblem.width': 24, 'emblem.dx': 0, 'emblem.dy': 0,
  'title.dx': 0, 'title.dy': 0,
  'caseNo.dx': 0, 'caseNo.dy': 0,
  'court.dx': 0, 'court.before': 3, 'court.after': 6,
  'between.before': 4, 'between.after': 5,
  'brand.site': 22,          // px — ความสูงโลโก้ตราชั่งบนเว็บไซต์
  'brand.admin': 28,         // px — ความสูงโลโก้ตราชั่งบนหลังบ้าน
  'sig.left': 38,            // % ของความกว้างหน้ากระดาษ — ตำแหน่งบล็อกลายมือชื่อ
};

/** รายการช่องปรับค่าในหน้าแก้ไข (จัดกลุ่ม) */
export const LAYOUT_GROUPS = [
  { title: 'หน้ากระดาษ (A4)', fields: [
    { k: 'page.top', label: 'ขอบบน', unit: 'มม.', min: 5, max: 50, step: 1 },
    { k: 'page.bottom', label: 'ขอบล่าง', unit: 'มม.', min: 5, max: 50, step: 1 },
    { k: 'page.left', label: 'ขอบซ้าย', unit: 'มม.', min: 5, max: 50, step: 1 },
    { k: 'page.right', label: 'ขอบขวา', unit: 'มม.', min: 5, max: 50, step: 1 },
  ] },
  { title: 'ตัวหนังสือ & เนื้อหา', fields: [
    { k: 'font.size', label: 'ขนาดตัวอักษร', unit: 'pt', min: 12, max: 20, step: 0.5, hint: 'แบบพิมพ์ศาลใช้ 16 pt (TH Sarabun IT๙)' },
    { k: 'font.line', label: 'ระยะบรรทัด', unit: '×', min: 1, max: 2, step: 0.02 },
    { k: 'body.indent', label: 'ย่อหน้าบรรทัดแรก (ปรับเพิ่ม)', unit: 'ซม.', min: -1.5, max: 2, step: 0.1 },
    { k: 'body.gap', label: 'ระยะห่างระหว่างย่อหน้า (เพิ่ม)', unit: 'มม.', min: 0, max: 10, step: 0.5 },
  ] },
  { title: 'ตราครุฑ', fields: [
    { k: 'emblem.show', label: 'แสดงตราครุฑ', type: 'check' },
    { k: 'emblem.width', label: 'ขนาด (กว้าง)', unit: 'มม.', min: 10, max: 45, step: 0.5 },
    { k: 'emblem.dx', label: 'เลื่อนซ้าย-ขวา', unit: 'มม.', min: -40, max: 40, step: 0.5 },
    { k: 'emblem.dy', label: 'เลื่อนขึ้น-ลง', unit: 'มม.', min: -15, max: 40, step: 0.5, hint: 'ในไฟล์ Word เลื่อนลงได้เท่านั้น (ค่าติดลบใช้เฉพาะตัวอย่างและ PDF)' },
  ] },
  { title: 'โลโก้ Law Craft (เว็บไซต์ / หลังบ้าน)', scope: 'all', fields: [
    { k: 'brand.site', label: 'ขนาดโลโก้บนเว็บไซต์ (ความสูง)', unit: 'px', min: 14, max: 56, step: 1 },
    { k: 'brand.admin', label: 'ขนาดโลโก้บนหลังบ้าน (ความสูง)', unit: 'px', min: 16, max: 56, step: 1 },
  ] },
  { title: 'หัวเรื่อง & เลขคดี', fields: [
    { k: 'title.dx', label: 'ชื่อแบบ (“(๔) คำฟ้อง”) เลื่อนซ้าย-ขวา', unit: 'มม.', min: -20, max: 40, step: 0.5 },
    { k: 'title.dy', label: 'ชื่อแบบ เลื่อนบน-ล่าง', unit: 'มม.', min: -10, max: 30, step: 0.5 },
    { k: 'caseNo.dx', label: 'บล็อกเลขคดี เลื่อนซ้าย-ขวา', unit: 'มม.', min: -40, max: 30, step: 0.5 },
    { k: 'caseNo.dy', label: 'บล็อกเลขคดี เลื่อนบน-ล่าง', unit: 'มม.', min: -10, max: 30, step: 0.5 },
  ] },
  { title: 'ศาล / วันที่ / ความ & “ระหว่าง”', fields: [
    { k: 'court.dx', label: 'บล็อกศาล-วันที่-ความ เลื่อนซ้าย-ขวา', unit: 'มม.', min: -40, max: 40, step: 0.5 },
    { k: 'court.before', label: 'ระยะก่อนบล็อกศาล', unit: 'มม.', min: 0, max: 30, step: 0.5 },
    { k: 'court.after', label: 'ระยะหลังบล็อกศาล', unit: 'มม.', min: 0, max: 30, step: 0.5 },
    { k: 'between.before', label: 'ระยะก่อน “ระหว่าง”', unit: 'มม.', min: 0, max: 30, step: 0.5 },
    { k: 'between.after', label: 'ระยะหลัง “ระหว่าง”', unit: 'มม.', min: 0, max: 30, step: 0.5 },
  ] },
  { title: 'ลายมือชื่อ', fields: [
    { k: 'sig.left', label: 'ตำแหน่งบล็อกลายมือชื่อ (จากขอบซ้าย)', unit: '%', min: 0, max: 70, step: 1 },
  ] },
];

/** ชื่อหน้า → คีย์สำหรับค่าเฉพาะแบบ (motion-xxxx รวมเป็น motion) */
export const layoutKeyOf = (docId) => String(docId || '').replace(/^(motion|summons|witnessSummons|witnessExtra)-.*$/, '$1');

/** ค่าที่ใช้จริง: ค่าเริ่มต้น ← ค่าทุกแบบ ← ค่าเฉพาะแบบ */
export function resolveLayout(layout, docId) {
  const out = { ...LAYOUT_DEFAULTS };
  const apply = (o) => { for (const [k, v] of Object.entries(o || {})) if (k in LAYOUT_DEFAULTS && v !== '' && v !== null && !Number.isNaN(+v)) out[k] = +v; };
  apply(layout?.all);
  // บัญชีพยาน (เพิ่มเติม) ใช้แบบ ๑๕ เดียวกับบัญชีพยาน — ยังไม่เคยตั้งค่าเฉพาะแบบ ให้ใช้ค่าของบัญชีพยานไปก่อน
  const key = layoutKeyOf(docId), forms = layout?.forms;
  apply(forms?.[key] ?? (key === 'witnessExtra' ? forms?.witness : key === 'witnessRequest' ? forms?.motion : undefined));
  return out;
}

const mm = (v) => `${v}mm`;

/** ตัวแปร CSS (สตริงสำหรับ style="") ของ .page */
export function layoutCssVars(L) {
  return [
    `--pt:${mm(L['page.top'])}`, `--pb:${mm(L['page.bottom'])}`, `--pl:${mm(L['page.left'])}`, `--pr:${mm(L['page.right'])}`,
    `--fs:${L['font.size']}pt`, `--lh:${L['font.line']}`,
    `--ind-add:${L['body.indent']}cm`, `--p-gap:${mm(L['body.gap'])}`,
    `--em-w:${mm(L['emblem.width'])}`, `--em-x:${mm(L['emblem.dx'])}`, `--em-y:${mm(L['emblem.dy'])}`, `--em-show:${L['emblem.show'] ? 'block' : 'none'}`,
    `--ti-x:${mm(L['title.dx'])}`, `--ti-y:${mm(L['title.dy'])}`,
    `--cn-x:${mm(L['caseNo.dx'])}`, `--cn-y:${mm(L['caseNo.dy'])}`,
    `--ct-x:${mm(L['court.dx'])}`, `--ct-b:${mm(L['court.before'])}`, `--ct-a:${mm(L['court.after'])}`,
    `--bt-b:${mm(L['between.before'])}`, `--bt-a:${mm(L['between.after'])}`,
    `--sig-l:${L['sig.left']}%`,
  ].join(';');
}

/** หน่วยสำหรับ docx */
export const mmToTwip = (v) => Math.round(v * 56.693);
export const mmToPx = (v) => Math.round(v * 3.7795);
