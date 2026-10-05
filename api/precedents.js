// API ค้นหา/อ่านฎีกา (Vercel serverless) — อ่านจาก Aiven for PostgreSQL ด้วยบทบาท lawcraft_reader (SELECT อย่างเดียว) ใครก็เรียกได้ ไม่ต้องสมัคร
//   GET /api/precedents?q=มรดก ที่ดิน&year=2560&type=แพ่ง&sec=ป.พ.พ. ม. 1336&page=1     ค้นหา (20 รายการ/หน้า)
//   GET /api/precedents?id=123                                                          อ่านฎีกา 1 รายการเต็ม
// ตั้งค่า (Vercel → Environment Variables): AIVEN_READER_URL (จำเป็น) · AIVEN_CA (PEM ของ Aiven; ไม่ตั้ง = ใช้ตัวที่ฝังใน api/_aiven-ca.js)
// คำค้นตัดคำไทยด้วย tokenize() ตัวเดียวกับตอนโหลดข้อมูล (scripts/deka/precedent-map.mjs) แล้ว plainto_tsquery('simple', …) (ปลอดภัยต่อเครื่องหมายพิเศษ; ทุกค่าส่งเป็นพารามิเตอร์)
// หมายเหตุ: ข้อมูลเป็น “ย่อสั้น/ย่อยาว” ที่ศาลเผยแพร่ ไม่ใช่คำพิพากษาฉบับเต็ม — ตอบกลับพร้อมข้อสงวนทุกครั้ง
import { getPool, NOTICE, precedentPath } from './_aiven.js';
import { tokenize } from '../scripts/deka/precedent-map.mjs';

const PER = 20;
const CANDIDATES = 2000;   // ค้นด้วยคำที่พบบ่อยมาก (เช่น “จำเลย”) จะจัดอันดับเฉพาะ 2,000 รายการล่าสุดที่ตรงเงื่อนไข — กันช้า/เกินเวลา
const COUNT_CAP = 1000;    // นับผลรวมสูงสุดเท่านี้ (แสดง “1,000+”)
const TYPES = new Set(['แพ่ง', 'อาญา', 'แพ่งและอาญา']);
const send = (res, status, body, cache = 'no-store') => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
};
const int = (v, lo, hi) => { const n = Number.parseInt(v, 10); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
const cut = (s, n) => String(s ?? '').slice(0, n);

/** แปลงพารามิเตอร์ค้นหาเป็นเงื่อนไข SQL + พารามิเตอร์ (ส่งออกเพื่อทดสอบ) */
export function buildFilter(query) {
  const where = [], params = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  let q = cut(query.q, 200).trim();
  const m = /(\d{1,6})\s*\/\s*(\d{4})/.exec(q.replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d))); // “10029/2560” = เลขฎีกา/ปี
  if (m) { where.push(`case_no = ${add(m[1])}`, `year = ${add(+m[2])}`); q = q.replace(/[๐-๙\d]{1,6}\s*\/\s*[๐-๙\d]{4}/, ' ').replace(/ฎีกาที่?/g, ' ').trim(); }
  const tokens = tokenize(q).slice(0, 8);
  let tsq = null;
  if (tokens.length) { tsq = add(tokens.join(' ')); where.push(`fts @@ plainto_tsquery('simple', ${tsq})`); }
  const year = int(query.year, 2400, 2700); if (year) where.push(`year = ${add(year)}`);
  const type = TYPES.has(query.type) ? query.type : null; if (type) where.push(`case_type = ${add(type)}`);
  const sec = cut(query.sec, 60).trim(); if (sec) where.push(`sections @> ARRAY[${add(sec)}]::text[]`);
  const law = cut(query.law, 40).trim(); if (law) where.push(`laws @> ${add(JSON.stringify([{ abbr: law }]))}::jsonb`); // กฎหมายที่อ้าง (ชื่อย่อ เช่น ป.อ.)
  return { where: where.length ? where.join(' and ') : 'true', params, tsq, tokens };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return send(res, 405, { error: 'method not allowed' }); }
  const p = getPool();
  if (!p) return send(res, 503, { error: 'ระบบค้นหาฎีกายังไม่พร้อมใช้งาน (ยังไม่ได้ตั้งค่าฐานข้อมูล)' });
  const query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  try {
    if (query.facets !== undefined) return send(res, 200, await facets(p), 'public, s-maxage=3600, stale-while-revalidate=86400');
    if (query.id !== undefined || query.doc !== undefined) {
      const byDoc = query.doc !== undefined;
      const key = byDoc ? (/^[0-9a-z]{1,20}$/i.test(String(query.doc)) ? String(query.doc) : null) : int(query.id, 1, 2 ** 31 - 1);
      if (!key) return send(res, 400, { error: 'รหัสฎีกาไม่ถูกต้อง' });
      const r = await p.query(`select id, source_doc_id, case_no, year, case_type, title_raw, headnote, full_text, sections, laws, litigants, judges, lower_courts, primary_court_nos, departments, source_url, retrieved_at from precedents_full where ${byDoc ? 'source_doc_id' : 'id'} = $1`, [key]);
      if (!r.rowCount) return send(res, 404, { error: 'ไม่พบฎีกานี้' });
      const x = r.rows[0];
      return send(res, 200, { notice: NOTICE, item: { id: x.id, docId: x.source_doc_id, path: precedentPath(x.case_no, x.year, x.source_doc_id), caseNo: x.case_no, year: x.year, caseType: x.case_type, title: x.title_raw, headnote: x.headnote, fullText: x.full_text, sections: x.sections, laws: x.laws, litigants: x.litigants, judges: x.judges, lowerCourts: x.lower_courts, primaryCourtNos: x.primary_court_nos, departments: x.departments, sourceUrl: x.source_url, retrievedAt: x.retrieved_at } }, 'public, s-maxage=86400, stale-while-revalidate=604800');
    }
    const f = buildFilter(query); // ไม่มีเงื่อนไขเลย = รายการล่าสุด (ไม่จัดอันดับ)
    const page = int(query.page, 1, 100) || 1;
    const off = (page - 1) * PER;
    const select = `id, source_doc_id, case_no, year, case_type, left(headnote, 360) as snippet, sections[1:6] as sections, (full_text is not null) as has_full`;
    const sql = f.tsq
      ? `with m as (select id, source_doc_id, case_no, year, case_type, headnote, sections, full_text, fts from precedents_full where ${f.where} order by year desc, id desc limit ${CANDIDATES})
         select ${select}, ts_rank_cd(fts, plainto_tsquery('simple', ${f.tsq})) as rk from m order by rk desc, year desc, id desc limit ${PER + 1} offset ${off}`
      : `select ${select} from precedents_full where ${f.where} order by year desc, id desc limit ${PER + 1} offset ${off}`;
    const [rows, cnt] = await Promise.all([
      p.query(sql, f.params),
      p.query(`select count(*)::int n from (select 1 from precedents_full where ${f.where} limit ${COUNT_CAP + 1}) t`, f.params),
    ]);
    const n = cnt.rows[0].n;
    const items = rows.rows.slice(0, PER).map((x) => ({ id: x.id, docId: x.source_doc_id, path: precedentPath(x.case_no, x.year, x.source_doc_id), caseNo: x.case_no, year: x.year, caseType: x.case_type, snippet: x.snippet, sections: x.sections, hasFull: x.has_full }));
    return send(res, 200, { notice: NOTICE, page, perPage: PER, total: Math.min(n, COUNT_CAP), totalCapped: n > COUNT_CAP, hasMore: rows.rows.length > PER && page < 100, tokens: f.tokens, items }, 'public, s-maxage=300, stale-while-revalidate=86400');
  } catch (e) {
    console.error('precedents api:', e.code || '', e.message);
    const timeout = e.code === '57014';
    return send(res, timeout ? 504 : 500, { error: timeout ? 'ค้นหาใช้เวลานานเกินไป ลองเพิ่มคำค้นให้เจาะจงขึ้น' : 'ค้นหาฎีกาไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
}

/** ตัวเลือกสำหรับเรียกดู: ปี · ประเภทคดี · กฎหมายที่อ้างบ่อย (พร้อมจำนวน) — อ่านจากตารางสรุป precedent_facets (คำนวณล่วงหน้า; load-aiven.mjs --refresh-facets)
 *  ถ้ายังไม่มีตาราง/แถว: คำนวณเฉพาะปีและประเภท (เร็ว) ส่วนกฎหมายว่าง — ไม่คำนวณกฎหมายสดเพราะต้องกวาดทั้งตาราง (4–7 วินาที) */
async function facets(p) {
  try {
    const r = await p.query("select data from precedent_facets where key = 'all'");
    if (r.rowCount) return r.rows[0].data;
  } catch (e) { if (e.code !== '42P01' && e.code !== '42501') throw e; }
  const [years, types] = await Promise.all([
    p.query('select year, count(*)::int n from precedents_full group by 1 order by 1 desc'),
    p.query('select case_type, count(*)::int n from precedents_full where case_type is not null group by 1 order by 2 desc'),
  ]);
  return { years: years.rows, types: types.rows.map((r) => ({ type: r.case_type, n: r.n })), laws: [], total: years.rows.reduce((a, r) => a + r.n, 0) };
}
