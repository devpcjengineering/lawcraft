// โครงข้อมูล "ข้อความหน้าเว็บ" ที่แอดมินแก้ได้ (ใช้ร่วมกันระหว่างหน้าสาธารณะ live-pages.js และหลังบ้าน content-pages.js)
// เก็บที่ content-pages (law_data key='content-pages' หรือ data/content/pages.json) — เก็บเฉพาะช่องที่แก้ ช่องว่าง = ใช้ข้อความตั้งต้นในไฟล์ HTML
//
//   { privacy: { title, lead, updated, hideDraft: true, draftNote, intro,
//                sections: [{ id, heading, paragraphs: [], bullets: [], after: [] }] },
//     home:    { heroEyebrow, heroTitle, heroAccent, heroLead, ctaPrimary, ctaSecondary, helpTitle, helpText, helpButton,
//                tile1Title, tile1Text … tile4Title, tile4Text },
//     contact: { eyebrow, title, accent, lead, formNote },
//     site:    { disclaimer } }                       // ข้อสงวนสิทธิ์ท้ายเว็บ (.sf-legal ของ footer.js)
//
// - ข้อความล้วน (plain text): ขึ้นบรรทัดใหม่ได้ (แสดงเป็น <br>) ห้ามมี HTML — ฝั่งแสดงผลใช้ textContent เสมอ
// - privacy.sections ถ้ามีอย่างน้อย 1 หัวข้อ จะ "แทนที่ทั้งเนื้อหา" หลังย่อหน้านำ (หัวข้อ/สารบัญสร้างใหม่ เลขข้อใส่ให้อัตโนมัติ)
//     paragraphs = ย่อหน้าก่อนรายการ · bullets = รายการหัวข้อย่อย · after = ย่อหน้าหลังรายการ
// - องค์ประกอบในหน้าอ้างด้วย data-live="<หน้า>.<ช่อง>" (ช่องที่มี sel ใช้ตัวเลือก CSS แทน)

export const CONTENT_KEY = 'pages';
export const MAX_TEXT = 4000;
export const MAX_SECTIONS = 60;

/** ข้อสงวนสิทธิ์ตั้งต้นของ footer.js (.sf-legal) — ใช้เป็น placeholder ในหลังบ้านเท่านั้น (ต้องตรงกับ footer.js) */
export const DEFAULT_DISCLAIMER = 'ข้อมูลในเว็บไซต์นี้เป็นข้อมูลทั่วไปเพื่อการศึกษา ไม่ใช่คำปรึกษาทางกฎหมาย และอาจไม่ทันต่อการแก้ไขกฎหมายล่าสุด ควรตรวจสอบตัวบทฉบับปัจจุบันและปรึกษาทนายความก่อนดำเนินคดี แบบพิมพ์อ้างอิงจากแบบพิมพ์ศาลยุติธรรม สำนักงานศาลยุติธรรม';

const tiles = (n) => Array.from({ length: n }, (_, i) => [
  { k: `tile${i + 1}Title`, label: `การ์ดที่ ${i + 1} — หัวข้อ`, rows: 2, group: 'การ์ดฟีเจอร์ระบบร่างคำฟ้อง (4 ใบ)' },
  { k: `tile${i + 1}Text`, label: `การ์ดที่ ${i + 1} — คำอธิบาย`, rows: 2 },
]).flat();

/** หน้าที่แก้ได้ + ช่องข้อความ (ส่วนรายหัวข้อของ privacy.sections จัดการแยกในหลังบ้าน) */
export const PAGES = [
  { id: 'privacy', label: 'นโยบายความเป็นส่วนตัว', url: '/privacy/', fields: [
    { k: 'title', label: 'ชื่อหน้า (หัวข้อใหญ่)', rows: 1 },
    { k: 'updated', label: 'วันที่ปรับปรุงล่าสุด (ต่อท้าย “ปรับปรุงล่าสุด …”)', rows: 1, today: true },
    { k: 'lead', label: 'คำโปรยใต้หัวข้อ', rows: 3 },
    { k: 'draftNote', label: 'แถบ “ฉบับร่าง” ใต้หัวข้อ', rows: 3, hideKey: 'hideDraft', hideLabel: 'ซ่อนแถบฉบับร่างนี้ (เมื่อตรวจนโยบายแล้ว)' },
    { k: 'intro', label: 'ย่อหน้านำก่อนหัวข้อที่ 1', rows: 4 },
  ] },
  { id: 'home', label: 'หน้าแรก', url: '/', fields: [
    { k: 'heroEyebrow', label: 'ป้ายเล็กเหนือหัวข้อ', rows: 1, group: 'ส่วนหัวหน้าแรก' },
    { k: 'heroTitle', label: 'หัวข้อใหญ่ — บรรทัดแรก', rows: 1 },
    { k: 'heroAccent', label: 'หัวข้อใหญ่ — บรรทัดที่สอง (ตัวอักษรไล่สี)', rows: 1 },
    { k: 'heroLead', label: 'คำโปรย', rows: 3 },
    { k: 'ctaPrimary', label: 'ปุ่มหลัก (ลิงก์ไปส่วนประมวลกฎหมาย)', rows: 1 },
    { k: 'ctaSecondary', label: 'ลิงก์รอง (ไปส่วนร่างคำฟ้อง)', rows: 1 },
    { k: 'helpTitle', label: 'หัวข้อกล่องชวนปรึกษา', rows: 2, group: 'กล่องชวนปรึกษา (ท้ายส่วนคดีออนไลน์)' },
    { k: 'helpText', label: 'ข้อความกล่องชวนปรึกษา (รวมข้อความ “ไม่ใช่การว่าจ้างทนายความ”)', rows: 4 },
    { k: 'helpButton', label: 'ปุ่มกล่องชวนปรึกษา', rows: 1 },
    ...tiles(4),
  ] },
  { id: 'contact', label: 'หน้าติดต่อปรึกษา', url: '/contact/', fields: [
    { k: 'eyebrow', label: 'ป้ายเล็กเหนือหัวข้อ', rows: 1 },
    { k: 'title', label: 'หัวข้อใหญ่ — บรรทัดแรก', rows: 1 },
    { k: 'accent', label: 'หัวข้อใหญ่ — บรรทัดที่สอง (ตัวอักษรไล่สี)', rows: 1 },
    { k: 'lead', label: 'คำโปรย', rows: 3 },
    { k: 'formNote', label: 'หมายเหตุใต้ปุ่มส่งข้อความ', rows: 3 },
  ] },
  { id: 'site', label: 'ข้อสงวนสิทธิ์ท้ายเว็บ', url: '/', fields: [
    { k: 'disclaimer', label: 'คำเตือนทางกฎหมาย / ข้อสงวนสิทธิ์ (แสดงท้ายทุกหน้าที่มีท้ายเว็บมาตรฐาน)', rows: 5, sel: '.sf-legal', def: DEFAULT_DISCLAIMER },
  ] },
];

const clip = (s) => String(s ?? '').replace(/\r\n?/g, '\n').slice(0, MAX_TEXT);
const list = (a) => (Array.isArray(a) ? a : []).map((x) => clip(x).trim()).filter(Boolean).slice(0, 100);

/** ตรวจ/ทำความสะอาดรายการหัวข้อนโยบาย — คืน [] ถ้าไม่มีหัวข้อที่ใช้ได้ (= ใช้ข้อความเดิมในไฟล์ HTML) */
export function cleanSections(arr) {
  if (!Array.isArray(arr)) return [];
  const used = new Set(); const out = [];
  for (const s of arr.slice(0, MAX_SECTIONS)) {
    if (!s || typeof s !== 'object') continue;
    const heading = clip(s.heading).replace(/\s*\n\s*/g, ' ').trim();
    const paragraphs = list(s.paragraphs), bullets = list(s.bullets), after = list(s.after);
    if (!heading && !paragraphs.length && !bullets.length && !after.length) continue;
    let id = /^[a-z][a-z0-9-]{0,40}$/.test(String(s.id || '')) ? s.id : `s${out.length + 1}`;
    while (used.has(id)) id += 'x';
    used.add(id);
    out.push({ id, heading, paragraphs, bullets, after });
  }
  return out;
}

/** อ่านข้อความล้วนจากองค์ประกอบ (<br> = ขึ้นบรรทัดใหม่, แท็กอื่นเอาเฉพาะตัวอักษร) */
const rawText = (node) => {
  let s = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) s += n.nodeValue.replace(/\s+/g, ' ');
    else if (n.nodeName === 'BR') s += '\n';
    else if (n.nodeType === 1) s += rawText(n);
  });
  return s;
};
export const readText = (node) => rawText(node).replace(/ *\n */g, '\n').trim();

/** เอาเลขข้อนำหน้า (“3. ”) ออกจากหัวข้อ — เลขข้อใส่ให้อัตโนมัติตอนแสดงผล */
export const stripNo = (t) => String(t || '').replace(/^\s*\d+\s*[.)]\s*/, '').trim();
