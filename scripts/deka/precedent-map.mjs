// precedent-map.mjs — แปลงหนึ่งบรรทัดของ <ปี>.jsonl (ผลจาก crawl.mjs) เป็นแถวของตาราง precedents_full (schema-aiven.sql)
// ฟังก์ชันล้วน ไม่แตะเครือข่าย/ไฟล์ — ใช้ร่วมกับ load-aiven.mjs และทดสอบด้วย test/deka-map.mjs
//
// การค้นหาภาษาไทย: Postgres ไม่มีตัวตัดคำไทย จึงตัดคำตอนโหลดด้วย Intl.Segmenter('th') (ICU ของ Node) แล้วส่งคำคั่นช่องว่างให้ to_tsvector('simple', …)
// ฝั่งค้นหาต้องใช้ tokenize() ตัวเดียวกันกับคำค้น แล้วเรียก to_tsquery('simple', 'คำ1 & คำ2')
// ก่อนตัดคำแปลงเลขไทย ๐-๙ เป็นเลขอารบิก (ตัวตัดคำจะรวม "มาตรา๒๘๘" เป็นคำเดียวถ้าไม่แปลง) → ค้น "288" เจอทั้งสองแบบ

const TH_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
export const arabic = (s) => String(s ?? '').replace(/[๐-๙]/g, (d) => String(TH_DIGITS.indexOf(d)));

const seg = new Intl.Segmenter('th', { granularity: 'word' });
const MAX_TOKENS = 8000; // กันข้อความยาวผิดปกติ (ย่อยาวสูงสุดที่พบ ~68,000 ตัวอักษร)

/** คำที่ไม่ซ้ำกัน (ตัวพิมพ์เล็ก) ของข้อความ — ตัดเครื่องหมาย/ช่องว่าง เก็บคำ/ตัวเลข; คำเดี่ยวตัวอักษรเดียวที่ไม่ใช่ตัวเลขทิ้ง */
export function tokenize(text, skip = null) {
  const out = new Set();
  // แยกตัวเลขออกจากตัวอักษรไทยที่ติดกัน (มาตรา288 → มาตรา 288) ไม่งั้นตัวตัดคำรวมเป็นคำเดียว ค้นเลขมาตราไม่เจอ
  const t = arabic(text).replace(/([฀-๿])(\d)/g, '$1 $2').replace(/(\d)([฀-๿])/g, '$1 $2');
  if (!t) return [];
  for (const s of seg.segment(t)) {
    if (!s.isWordLike) continue;
    const w = s.segment.toLowerCase();
    if (w.length < 2 && !/\d/.test(w)) continue;
    if (skip && skip.has(w)) continue;
    out.add(w);
    if (out.size >= MAX_TOKENS) break;
  }
  return [...out];
}

const CRIM = new Set(['ป.อ.', 'ป.วิ.อ.']);
const CIVIL = new Set(['ป.พ.พ.', 'ป.วิ.พ.']);
/** ประเภทคดีที่อนุมานจากกฎหมายที่อ้าง (ศาลไม่ได้ให้ข้อมูลประเภทคดี) — ไม่แน่ใจ = null */
export function inferCaseType(laws) {
  let crim = false, civil = false;
  for (const l of laws) { if (CRIM.has(l.abbr)) crim = true; if (CIVIL.has(l.abbr)) civil = true; }
  return crim && civil ? 'แพ่งและอาญา' : crim ? 'อาญา' : civil ? 'แพ่ง' : null;
}

const strs = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x ?? '').trim()).filter(Boolean);
const clean = (s) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** @returns {object|null} แถวพร้อมเข้าตาราง หรือ null เมื่อข้อมูลไม่พอ (ไม่มี docId / เลขฎีกา / ปี) */
export function mapRow(o) {
  if (!o || !o.docId) return null;
  const caseNo = String(o.caseNo ?? '').trim();
  const year = Number(o.year);
  if (!caseNo || !Number.isInteger(year)) return null;
  const laws = (Array.isArray(o.laws) ? o.laws : []).filter((l) => l && typeof l === 'object').map((l) => ({
    code: l.code ?? null, name: l.name ?? null, abbr: l.abbr ?? null, sections: strs(l.sections),
  }));
  const sections = [...new Set(laws.flatMap((l) => l.sections.map((s) => `${l.abbr || l.name || l.code || ''} ${s}`.trim())))];
  const headnote = clean(o.shortText) || null;
  const fullText = clean(o.longText) || null;
  const a = tokenize(`${caseNo} ${year} ${sections.join(' ')} ${strs(o.lowerCourts).join(' ')}`);
  const aSet = new Set(a);
  const b = tokenize(headnote || '', aSet);
  const bSet = new Set([...aSet, ...b]);
  const c = tokenize(fullText || '', bSet);
  return {
    source_doc_id: String(o.docId),
    title_raw: clean(o.titleRaw) || null,
    case_no: caseNo,
    year,
    doc_type: clean(o.docType) || 'คำพิพากษาศาลฎีกา',
    case_type: inferCaseType(laws),
    headnote,
    full_text: fullText,
    sections,
    laws: laws.length ? laws : null, // อาร์เรย์จริง (ตัวโหลดส่งเป็น JSON ทั้งก้อน → jsonb) ห้าม stringify ซ้ำ ไม่งั้นกลายเป็นข้อความใน jsonb
    litigants: strs(o.litigants),
    judges: strs(o.judges),
    lower_courts: strs(o.lowerCourts),
    primary_court_nos: strs(o.primaryCourtNos),
    departments: strs(o.department),
    black_no: strs(o.blackNo),
    sources: strs(o.source),
    remark: clean(o.remark) || null,
    source_url: String(o.sourceUrl || ''),
    retrieved_at: o.retrievedAt || new Date().toISOString(),
    tok_a: a.join(' '),
    tok_b: b.join(' '),
    tok_c: c.join(' '),
  };
}
