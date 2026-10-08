// ค่านำหมาย (ส่งหมายข้ามเขต): ค้นอัตราของศาลปลายทางจากตารางทางการ ตามจังหวัด/อำเภอ/ตำบล/หมู่ — ฟังก์ชันล้วน ไม่แตะ DOM
// ข้อมูล: /data/service-fees/index.json = { asOf, source, provinces:[{name,file,count}] } ; ไฟล์จังหวัด = { province, asOf, remarks:[], rows:[[ศาล, อำเภอ, ตำบล, หมู่, ค่าธรรมเนียม, remarkIndex(-1 ไม่มี), 'YYYY-MM-DD']] }
// หลักการ: ไม่เดาตัวเลข — ไม่พบแถวที่ตรง = null ให้ผู้ใช้กรอกเอง

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const toArabic = (s) => String(s ?? '').replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));

/** ตัดคำนำหน้า (ต./ตำบล/อ./อำเภอ/เขต/แขวง/จ./จังหวัด) ช่องว่าง และแปลงเลขไทย → อารบิก เพื่อเทียบชื่อสถานที่ */
export function normalizePlace(s) {
  let t = toArabic(s).replace(/[\s​]+/g, '');
  t = t.replace(/^(ตำบล|แขวง|อำเภอ|จังหวัด|เขต|ต\.|อ\.|จ\.)+/, '');
  t = t.replace(/^(ตำบล|แขวง|อำเภอ|จังหวัด|เขต)+/, '');
  if (/^กรุงเทพ/.test(t)) t = 'กรุงเทพมหานคร';
  return t;
}

/** แถวใน index.json ของจังหวัดที่ตรงชื่อ (null ถ้าไม่พบ) */
export function findProvinceFile(index, provinceName) {
  const n = normalizePlace(provinceName);
  if (!n) return null;
  return (index?.provinces || []).find((p) => normalizePlace(p.name) === n) || null;
}

// หมู่ของแถวข้อมูล: '' = ทั้งตำบล · '1' · '1-3' · '1,4,6-8'
function mooMatches(spec, moo) {
  const m = parseInt(toArabic(moo).replace(/\D/g, ''), 10);
  if (!Number.isFinite(m)) return false;
  return toArabic(spec).split(/[,\s]+/).filter(Boolean).some((part) => {
    const r = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (r) return m >= +r[1] && m <= +r[2];
    return /^\d+$/.test(part) && +part === m;
  });
}

const feeNum = (v) => (v === '' || v == null ? NaN : Number(v));
const latest = (list) => list.slice().sort((a, b) => String(b[6] || '').localeCompare(String(a[6] || '')))[0];

/**
 * ค้นอัตราค่านำหมายจากแถวของจังหวัดปลายทาง
 *  1) อำเภอ+ตำบล+หมู่ที่ตรงกับแถวที่ระบุหมู่ → exact 'moo'
 *  2) อำเภอ+ตำบล แถวที่ครอบทั้งตำบล (หมู่ว่าง) → 'tambon' (ถ้าทุกแถวของตำบลนั้นค่าเท่ากัน แม้ระบุหมู่ ก็ถือว่าแน่นอน)
 *  3) แถวระดับอำเภอ (ตำบลว่าง) → 'amphur-default' (เฉพาะที่ข้อมูลระบุไว้จริง)
 *  4) ไม่พบ → fee:null, exact:null  (ห้ามเดา)
 * opts.remarks = อาร์เรย์ remarks ของไฟล์จังหวัด (ใช้แปลง remarkIndex เป็นข้อความ)
 */
export function lookupServiceFee(rows, { amphur, tambon, moo, remarks, court, type } = {}) {
  const none = { fee: null, court: '', remark: '', startDate: '', exact: null, candidates: [], ambiguous: false };
  const na = normalizePlace(amphur), nt = normalizePlace(tambon);
  if (!na || !Array.isArray(rows)) return none;
  // ตารางเป็น “ศาลที่ส่งหมาย × ตำบล” — ตำบลเดียวมีหลายศาล (ศาลจังหวัด/แขวง/เยาวชน/อาญา/แพ่ง …) อัตราต่างกัน ต้องเลือกศาลปลายทางให้ถูก
  const narrow = (list) => narrowByCourt(list, court, type);
  const ofAmphur = rows.filter((r) => normalizePlace(r[1]) === na && Number.isFinite(feeNum(r[4])));
  const tambonAll = nt ? ofAmphur.filter((r) => normalizePlace(r[2]) === nt) : [];
  const inTambon = narrow(tambonAll);
  const res = (row, exact, candidates) => ({
    fee: feeNum(row[4]), court: String(row[0] || ''), remark: row[5] >= 0 && remarks?.[row[5]] ? String(remarks[row[5]]) : '', startDate: String(row[6] || ''), exact, candidates, ambiguous: false,
  });
  // มีหลายศาลเลือกไม่ได้ (ไม่ระบุศาล → ambiguous) หรือศาลที่ระบุไม่มีแถวในตำบลนี้ (courtMismatch + courts = ศาลที่รับส่งหมายตำบลนี้จริง) → ไม่เดา
  if (tambonAll.length && !inTambon.length) return { ...none, candidates: tambonAll, ambiguous: !court, courtMismatch: !!court, courts: [...new Set(tambonAll.map((r) => String(r[0])))] };
  if (inTambon.length) {
    const withMoo = inTambon.filter((r) => String(r[3] ?? '').trim());
    const whole = inTambon.filter((r) => !String(r[3] ?? '').trim());
    if (withMoo.length && String(moo ?? '').trim()) {
      const hit = withMoo.filter((r) => mooMatches(r[3], moo));
      if (hit.length) return res(latest(hit), 'moo', inTambon);
    }
    if (whole.length) return res(latest(whole), 'tambon', inTambon);
    const fees = new Set(inTambon.map((r) => feeNum(r[4])));
    if (fees.size === 1) return res(latest(inTambon), 'tambon', inTambon);
    return { ...none, candidates: inTambon };   // ตำบลนี้อัตราต่างกันตามหมู่ แต่ไม่ทราบ/ไม่ตรงหมู่ → ไม่เดา
  }
  const def = narrow(ofAmphur.filter((r) => !normalizePlace(r[2])));
  if (def.length) return res(latest(def), 'amphur-default', def);
  return none;
}

/**
 * คีย์เทียบชื่อศาล: ตัดช่องว่าง/วงเล็บ (แต่เก็บข้อความในวงเล็บ — 'ศาลจังหวัดน่าน (สาขาปัว)' = 'ศาลจังหวัดน่าน สาขาปัว') แปลงเลขไทย เติมคำนำหน้า 'ศาล' ถ้าขาด
 * ไม่ตัดความต่างของประเภทศาล (ศาลแขวง/ศาลจังหวัด/ศาลเยาวชนฯ/สาขา = คนละศาล)
 */
export function courtKey(s) {
  let t = toArabic(s).replace(/[\s​()（）]+/g, '');
  if (t && !/^ศาล/.test(t)) t = 'ศาล' + t;
  return t;
}
/** ศาลจังหวัดตลิ่งชัน/พระโขนง/มีนบุรี ในข้อมูลค่านำหมายแยกเป็นศาลแพ่ง/ศาลอาญา — ใช้ตามประเภทคดี (ตรงกับ courtAlias ใน model.js) ; ศาลอื่นคืนค่าเดิม */
function courtAliasKey(k, type) {
  return k.replace(/^ศาลจังหวัด(ตลิ่งชัน|พระโขนง|มีนบุรี)$/, (_, x) => (type === 'civil' ? 'ศาลแพ่ง' : 'ศาลอาญา') + x);
}
/** คัดแถวตามศาลปลายทาง: ระบุศาล = เอาเฉพาะศาลที่ชื่อตรงกัน (หลังปรับรูปแบบ) เท่านั้น ไม่ตรง = [] ไม่เดาข้ามศาล · ไม่ระบุ = ศาลเดียว/ทุกศาลคิดเท่ากัน ใช้ได้ ; ไม่งั้นเลือกตามประเภทคดี (อาญา/แพ่ง) หรือศาลจังหวัดทั่วไป ถ้าเหลือศาลเดียว — ไม่ได้ = [] (กำกวม) */
function narrowByCourt(list, court, type) {
  if (!list.length) return list;
  if (court) {
    const k = courtKey(court), k2 = courtAliasKey(k, type);
    const ex = list.filter((r) => courtKey(r[0]) === k);
    return ex.length ? ex : list.filter((r) => courtKey(r[0]) === k2);
  }
  const names = new Set(list.map((r) => courtKey(r[0])));
  if (names.size <= 1 || new Set(list.map((r) => feeNum(r[4]))).size === 1) return list;
  const tries = [
    type === 'criminal' ? (n) => /^ศาลอาญา/.test(n) && !/ทุจริต|เยาวชน/.test(n) : type === 'civil' ? (n) => /^ศาลแพ่ง/.test(n) && !/เยาวชน/.test(n) : null,
    (n) => /^ศาลจังหวัด/.test(n) && !/เยาวชน/.test(n),
  ].filter(Boolean);
  for (const f of tries) {
    const hit = list.filter((r) => f(courtKey(r[0])));
    if (hit.length && new Set(hit.map((r) => courtKey(r[0]))).size === 1) return hit;
  }
  return [];
}

/** ประเภทศาลจากชื่อ (ใช้จัดกลุ่ม/กรองในหน้าค้นหาและคอลัมน์ kind บน Supabase) */
export function courtKind(n) {
  n = String(n || '');
  if (/สาขา/.test(n)) return 'สาขา';
  if (/เยาวชน/.test(n)) return 'เยาวชนและครอบครัว';
  if (/ภาษีอากร|ล้มละลาย|ทรัพย์สินทางปัญญา|แรงงาน|ทุจริต/.test(n)) return 'ชำนัญพิเศษ';
  if (/^ศาลแขวง/.test(n)) return 'แขวง';
  if (/^ศาลแพ่ง/.test(n)) return 'แพ่ง';
  if (/^ศาลอาญา/.test(n)) return 'อาญา';
  if (/^ศาลจังหวัด/.test(n)) return 'จังหวัด';
  return 'อื่น ๆ';
}

// ---------- แหล่งข้อมูล ----------
// 1) Supabase (RPC service_fee_* ผ่าน PostgREST ด้วยคีย์ anon) เมื่อเรียก setServiceFeeBackend({url, anonKey}) และไม่ได้ฉีด fetch เอง
// 2) ไฟล์ static /data/service-fees/* (โหมด local ที่ server/index.js เสิร์ฟให้ และเทสต์ที่ฉีด fetch) — รูปแบบแถวเหมือนกันทุกแหล่ง
let backend = null;
export function setServiceFeeBackend(cfg) { backend = cfg?.url && cfg?.anonKey ? { url: String(cfg.url).replace(/\/+$/, ''), key: cfg.anonKey } : null; cache.clear(); }
export const hasServiceFeeBackend = () => !!backend;
const defFetch = () => (typeof fetch === 'function' ? fetch : null);
const cache = new Map();
const memo = (key, make) => {
  if (!cache.has(key)) cache.set(key, Promise.resolve().then(make).catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
};
const rpc = (fn, body, fetchFn = defFetch()) => {
  if (!fetchFn) throw new Error('no fetch');
  return fetchFn(`${backend.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: backend.key, Authorization: `Bearer ${backend.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
};
const staticJson = (fetchFn, url) => memo(url, async () => { const r = await fetchFn(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });

/**
 * โหลดข้อมูลทั้งจังหวัด (ใช้กับหน้าเว็บที่ต้องรายการอำเภอ/ตำบล) พร้อมแคชในหน่วยความจำ
 * คืน { province, asOf, remarks, rows } · ไม่พบจังหวัด = null · เครือข่ายล้ม = throw
 */
export async function loadProvinceRows(provinceName, fetchFn, base = '/data/service-fees/') {
  if (backend && !fetchFn) {
    const n = normalizePlace(provinceName); if (!n) return null;
    const d = await memo('area:' + n, () => rpc('service_fee_area', { p_province: provinceName }));
    return d ? { province: d.province || provinceName, asOf: d.asOf || '', remarks: d.remarks || [], rows: d.rows || [] } : null;
  }
  fetchFn = fetchFn || defFetch();
  if (!fetchFn) throw new Error('no fetch');
  const index = await staticJson(fetchFn, base + 'index.json');
  const ent = findProvinceFile(index, provinceName);
  if (!ent) return null;
  const data = await staticJson(fetchFn, base + ent.file);
  return { province: data.province || ent.name, asOf: data.asOf || index.asOf || '', remarks: data.remarks || [], rows: data.rows || [] };
}

/**
 * โหลดเฉพาะแถวของอำเภอ/ตำบลที่ต้องใช้ (เบา — back-office ค้นค่านำหมายของผู้รับหมายรายเดียว) ; รูปแบบเดียวกับ loadProvinceRows
 * Supabase: RPC service_fee_lookup (ตำบลนั้น + แถวระดับอำเภอ) · static: โหลดทั้งจังหวัด (lookupServiceFee กรองเอง)
 */
export async function loadPlaceRows({ province, amphur, tambon } = {}, fetchFn, base) {
  if (!(backend && !fetchFn)) return loadProvinceRows(province, fetchFn, base);
  const n = [province, amphur, tambon].map(normalizePlace);
  if (!n[0] || !n[1]) return null;
  const list = await memo('place:' + n.join('|'), () => rpc('service_fee_lookup', { p_province: province, p_amphur: amphur, p_tambon: tambon || null }));
  if (!list.length) return { province: String(province), asOf: '', remarks: [], rows: [] };
  const remarks = [], rows = list.map((x) => {
    let ri = -1; if (x.remark) { ri = remarks.indexOf(x.remark); if (ri < 0) ri = remarks.push(x.remark) - 1; }
    return [x.court, x.amphur, x.tambon, x.moo || '', x.fee, ri, x.start_date || ''];
  });
  return { province: list[0].province, asOf: '', remarks, rows };
}

/** รายชื่อจังหวัดที่มีข้อมูล [{name, n}] */
export async function listServiceFeeProvinces(fetchFn, base = '/data/service-fees/') {
  if (backend && !fetchFn) return memo('provinces', () => rpc('service_fee_provinces', {}));
  fetchFn = fetchFn || defFetch(); if (!fetchFn) throw new Error('no fetch');
  return (await staticJson(fetchFn, base + 'index.json')).provinces.map((p) => ({ name: p.name, n: p.count }));
}

/** { asOf, source } ของชุดข้อมูล */
export async function loadServiceFeeMeta(fetchFn, base = '/data/service-fees/') {
  if (backend && !fetchFn) {
    return memo('meta', async () => {
      const r = await (defFetch())(`${backend.url}/rest/v1/service_fee_meta?select=k,v&k=in.(as_of,source)`, { headers: { apikey: backend.key, Authorization: `Bearer ${backend.key}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const m = Object.fromEntries((await r.json()).map((x) => [x.k, x.v]));
      return { asOf: m.as_of || '', source: m.source || '' };
    });
  }
  fetchFn = fetchFn || defFetch(); if (!fetchFn) throw new Error('no fetch');
  const ix = await staticJson(fetchFn, base + 'index.json');
  return { asOf: ix.asOf || '', source: ix.source || '' };
}

const courtSearchKey = (q) => courtKey(q).replace(/^ศาล/, '');
/**
 * ค้นหาศาลจากชื่อ (ไม่สนช่องว่าง/วงเล็บ/คำนำหน้า 'ศาล') → [{ court, kind, provinces:[], n_places }] สูงสุด 30
 * Supabase: RPC service_fee_courts_search · static: courts.json (สร้างโดย build-service-fees.mjs)
 */
export async function searchServiceFeeCourts(q, fetchFn, base = '/data/service-fees/') {
  const s = courtSearchKey(q || '');
  if (!s) return [];
  if (backend && !fetchFn) return rpc('service_fee_courts_search', { q });
  fetchFn = fetchFn || defFetch(); if (!fetchFn) throw new Error('no fetch');
  const all = await staticJson(fetchFn, base + 'courts.json');
  const score = (c) => { const k = courtKey(c.court); return (k.startsWith('ศาล' + s) ? 0 : 2) + (k.includes('จังหวัด' + s) ? 0 : 1); };
  return all.filter((c) => courtKey(c.court).includes(s)).sort((a, b) => score(a) - score(b) || a.court.length - b.court.length || a.court.localeCompare(b.court, 'th')).slice(0, 30);
}
export const _clearServiceFeeCache = () => cache.clear();
