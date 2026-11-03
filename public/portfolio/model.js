// โมเดล "ผลงาน" (portfolio) — ใช้ร่วมกันระหว่างหน้าเว็บสาธารณะ (/portfolio/, หน้าแรก) และแท็บแอดมิน (js/content-portfolio.js)
// ที่เก็บ: law_data key='content-portfolio' (Supabase) หรือ data/content/portfolio.json (โหมดไฟล์ในเครื่อง)
//   { items: [ ผลงาน ], order: [ id ตามลำดับที่แอดมินจัด ] }
//   ผลงาน = { id, slug, title, category, summary, body: [ย่อหน้า], outcome, court, year (พ.ศ.), role, tags[], images[] (URL),
//             consent (ผู้รับบริการยินยอมให้เผยแพร่ — ต้อง true จึงเผยแพร่ได้), anonymized (ปกปิดข้อมูลระบุตัว — ค่าเริ่มต้น true),
//             noGuarantee (ยืนยันว่าไม่มีข้อความรับประกันผล), published, featured, createdAt, updatedAt,
//             seo?: { title (≤120), description (≤320), noindex } — ไม่บังคับ มีเฉพาะเมื่อแอดมินตั้งค่า (หน้า /portfolio/<slug>/ ใช้ผ่าน shared/post-seo.js) }
// หน้าเว็บแสดงเฉพาะ published && consent — ลำดับ: ผลงานแนะนำ (featured) ก่อน แล้วตาม order ที่แอดมินจัด (ผลงานใหม่ถูกใส่บนสุด = ใหม่ก่อน)
// ไม่เคยโยนข้อผิดพลาด: ข้อมูลผิดรูปถูกตัดทิ้ง/เติมค่าเริ่มต้นให้

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,60}$/;
export const CATEGORIES = ['คดีออนไลน์', 'ฉ้อโกง', 'หมิ่นประมาท', 'คดีแพ่ง', 'คดีอาญา', 'คำร้อง/คำแถลง', 'ที่ปรึกษา/สัญญา'];
export const ROLES = ['ทนายโจทก์', 'ทนายจำเลย', 'ทนายผู้ร้อง', 'ที่ปรึกษากฎหมาย', 'อื่น ๆ'];
export const MAX_ITEMS = 500;
/** คำที่อาจเข้าข่าย "รับประกันผล" (ข้อบังคับว่าด้วยมรรยาททนายความ — ให้ทนายยืนยัน) ใช้เตือนในหน้าแอดมินเท่านั้น */
export const GUARANTEE_RE = /รับประกัน|การันตี|ชนะแน่|ชนะทุกคดี|100\s*%|ร้อยเปอร์เซ็นต์|แน่นอนว่าชนะ|รับรองผล/;

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const t = (s) => String(s ?? '').trim();
const arr = (x) => (Array.isArray(x) ? x : []);
const isHttp = (u) => /^https?:\/\/\S+$/i.test(u);
const nowIso = () => new Date().toISOString();

/** ทำให้ผลงาน 1 รายการมีรูปแบบแน่นอน (คืน null ถ้าไม่มี id) */
export function cleanItem(raw) {
  if (!isObj(raw)) return null;
  const id = t(raw.id);
  if (!SLUG_RE.test(id)) return null;
  const slug = SLUG_RE.test(t(raw.slug)) ? t(raw.slug) : id;
  const body = Array.isArray(raw.body) ? raw.body.map(t).filter(Boolean)
    : String(raw.body ?? '').split(/\n\s*\n/).map((x) => t(x.replace(/\s+/g, ' '))).filter(Boolean);
  const year = Math.round(+raw.year) || 0;
  const seo = isObj(raw.seo) ? { title: t(raw.seo.title).slice(0, 120), description: t(raw.seo.description).slice(0, 320), noindex: raw.seo.noindex === true } : null;
  return {
    ...(seo && (seo.title || seo.description || seo.noindex) ? { seo } : {}),
    id, slug, title: t(raw.title), category: t(raw.category), summary: t(raw.summary), body,
    outcome: t(raw.outcome), court: t(raw.court), year: year >= 2400 && year <= 2700 ? year : (year >= 1900 && year <= 2200 ? year + 543 : 0),
    role: t(raw.role), tags: [...new Set(arr(raw.tags).map(t).filter(Boolean))].slice(0, 20),
    images: arr(raw.images).map(t).filter(isHttp).slice(0, 12),
    consent: raw.consent === true, anonymized: raw.anonymized !== false, noGuarantee: raw.noGuarantee === true,
    published: raw.published === true, featured: raw.featured === true,
    createdAt: t(raw.createdAt) || nowIso(), updatedAt: t(raw.updatedAt) || t(raw.createdAt) || nowIso(),
  };
}

/** { items, order } ที่สะอาด: ลำดับ = order ที่แอดมินจัด (id ที่ไม่อยู่ใน order ต่อท้ายโดยใหม่สุดก่อน) */
export function normPortfolio(raw) {
  const o = isObj(raw) ? raw : {};
  const seen = new Set();
  const items = [];
  for (const it of arr(o.items)) { const c = cleanItem(it); if (c && !seen.has(c.id)) { seen.add(c.id); items.push(c); } }
  const ids = new Set(items.map((i) => i.id));
  const order = arr(o.order).filter((id) => typeof id === 'string' && ids.has(id)).filter((id, i, a) => a.indexOf(id) === i);
  const rest = items.filter((i) => !order.includes(i.id)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((i) => i.id);
  return { items: items.slice(0, MAX_ITEMS), order: [...order, ...rest] };
}

/** รายการเรียงตาม order (ทุกสถานะ — ใช้ในหน้าแอดมิน) */
export function orderedItems(n) {
  const by = new Map(n.items.map((i) => [i.id, i]));
  return n.order.map((id) => by.get(id)).filter(Boolean);
}

/** เผยแพร่ได้ไหม: ต้องได้รับความยินยอมจากผู้รับบริการก่อนเสมอ */
export const canPublish = (it) => !!it && it.consent === true;
export const isLive = (it) => !!it && it.published === true && it.consent === true;

/** รายการที่แสดงบนเว็บสาธารณะ: เฉพาะ published && consent · แนะนำก่อน แล้วตามลำดับที่จัด */
export function publicItems(raw) {
  const n = normPortfolio(raw);
  const all = orderedItems(n).filter(isLive);
  return [...all.filter((i) => i.featured), ...all.filter((i) => !i.featured)];
}

/** หน้าแรก: ผลงานแนะนำสูงสุด n รายการ (ไม่ครบเติมด้วยรายการถัดไป) */
export const homeItems = (raw, n = 3) => publicItems(raw).slice(0, n);

/** id ใหม่ที่ไม่ซ้ำ (a-z0-9 — ใช้ใน URL หลังบ้านได้) */
export function newId(existing = []) {
  const has = new Set(existing);
  for (let i = 0; i < 50; i++) {
    const id = 'pf-' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
    if (!has.has(id)) return id;
  }
  return 'pf-' + Date.now().toString(36);
}

export const yearLabel = (y) => (y ? `พ.ศ. ${y}` : '');
