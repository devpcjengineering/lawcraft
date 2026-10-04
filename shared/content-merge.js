// ผสาน "การแก้ไขข้อกฎหมายที่แอดมินทำ" (content key 'laws') เข้ากับข้อมูลกฎหมายต้นฉบับ (data/*.json → items / precedents)
// โมดูลล้วน (pure) ใช้ได้ทั้งเบราว์เซอร์และ Node ไม่แตะ DOM — ห้ามโยนข้อผิดพลาด: ข้อมูลเพี้ยนให้ข้ามรายการนั้นแล้วไปต่อ
//
// รูปแบบ edits (เก็บเฉพาะส่วนที่ต่างจากต้นฉบับ ไม่เขียนทับแถวใหญ่):
//   { items: { [id]: { ...ฟิลด์ที่แก้ } }, added: [ <ข้อกฎหมายเต็ม> ], removed: [id],
//     precedents: { edited: { [คีย์ฎีกา]: { ...ฟิลด์ที่แก้ } }, added: [ <ฎีกาเต็ม> ], removed: [คีย์ฎีกา] } }
//   คีย์ฎีกา = caseNo ถ้าเลขฎีกานั้นไม่ซ้ำในข้อมูลต้นฉบับ ถ้าซ้ำ (ฎีกาเดียวอ้างหลายมาตรา) ใช้ "caseNo|itemId"
//
// ผลลัพธ์ของ applyLawEdits เป็นอ็อบเจ็กต์ใหม่ และมีคุณสมบัติซ่อน (non-enumerable) __lawBase = { items, precedents } ของ "ต้นฉบับ"
// เพื่อให้หน้าแก้ไขเทียบ/ย้อนกลับเป็นค่าเดิมได้ แม้ข้อมูลที่ใช้งานอยู่จะถูกผสานแล้ว (เรียกซ้ำบนข้อมูลที่ผสานแล้วก็ได้ผลเท่าเดิม)

const MAXS = 20000;           // ความยาวข้อความสูงสุดต่อช่อง
const MAXLIST = 200;          // จำนวนรายการสูงสุดต่อรายการย่อย
const KINDS = ['criminal', 'civil'];

export const ITEM_STR = ['section', 'name', 'category', 'text', 'penalty', 'limitation', 'caution', 'source'];
export const ITEM_LIST = ['elements', 'factTemplate', 'prayerTemplate'];
export const ITEM_BOOL = ['privateOffence', 'compoundable', 'verified'];
export const ITEM_FIELDS = ['section', 'name', 'category', 'kind', 'lawId', 'text', 'elements', 'penalty', 'privateOffence', 'compoundable', 'limitation', 'relatedSections', 'factTemplate', 'prayerTemplate', 'civilClaim', 'caution', 'source', 'verified'];
export const PREC_FIELDS = ['caseNo', 'itemId', 'year', 'topic', 'holding', 'relevance', 'source', 'verified'];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);

/** ทำความสะอาดค่าของหนึ่งฟิลด์ข้อกฎหมาย → { ok, value } (ok=false = ค่าใช้ไม่ได้ ให้ข้าม) */
function cleanItemField(k, v, laws) {
  if (ITEM_STR.includes(k)) { const s = str(v); return s === null ? { ok: false } : { ok: true, value: s.slice(0, MAXS) }; }
  if (ITEM_BOOL.includes(k)) return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false };
  if (ITEM_LIST.includes(k)) {
    if (!Array.isArray(v)) return { ok: false };
    return { ok: true, value: v.map(str).filter((s) => s !== null && s.trim() !== '').map((s) => s.slice(0, MAXS)).slice(0, MAXLIST) };
  }
  if (k === 'relatedSections') {
    if (!Array.isArray(v)) return { ok: false };
    const out = [];
    for (const r of v.slice(0, MAXLIST)) {
      if (!isObj(r)) continue;
      const ref = str(r.ref), why = str(r.why);
      if (ref && ref.trim()) out.push({ ref: ref.slice(0, 500), why: (why || '').slice(0, 2000) });
    }
    return { ok: true, value: out };
  }
  if (k === 'civilClaim') {
    if (!isObj(v)) return { ok: false };
    return { ok: true, value: { available: v.available === true, note: (str(v.note) || '').slice(0, 2000) } };
  }
  if (k === 'kind') return KINDS.includes(v) ? { ok: true, value: v } : { ok: false };
  if (k === 'lawId') {
    const s = str(v);
    if (!s || !s.trim()) return { ok: false };
    if (laws && laws.size && !laws.has(s)) return { ok: false };   // ต้องเป็นกฎหมายที่มีอยู่จริงในข้อมูล
    return { ok: true, value: s };
  }
  return { ok: false };
}

/** ตัดฟิลด์ที่ไม่รู้จัก/ค่าเพี้ยนทิ้ง เหลือเฉพาะฟิลด์ที่ใช้ได้ (ใช้กับ patch และข้อกฎหมายที่เพิ่มใหม่) */
export function cleanItemPatch(patch, laws) {
  const out = {};
  if (!isObj(patch)) return out;
  for (const k of ITEM_FIELDS) {
    if (!(k in patch)) continue;
    const c = cleanItemField(k, patch[k], laws);
    if (c.ok) out[k] = c.value;
  }
  return out;
}

const lawSet = (data) => new Set((Array.isArray(data?.laws) ? data.laws : []).map((l) => l?.id).filter((x) => typeof x === 'string'));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const normList = (v) => (Array.isArray(v) ? v : []);

/** ข้อกฎหมายเต็มที่เพิ่มใหม่ → ข้อกฎหมายที่ครบฟิลด์ (หรือ null ถ้าใช้ไม่ได้) verified เป็น true ได้เฉพาะเมื่อผู้แก้ติ๊กเองชัดเจน */
function cleanAdded(raw, laws, takenIds) {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id || !id.trim() || takenIds.has(id)) return null;
  const c = cleanItemPatch(raw, laws);
  if (!c.lawId) return null;                       // ไม่มีกฎหมายที่ถูกต้อง → ไม่เสี่ยงให้ระบบสะดุด
  if (!(c.section || c.name)) return null;         // ยังไม่มีทั้งมาตราและชื่อ = ยังเป็นร่างเปล่า
  return {
    id, section: '', name: '', category: '', text: '', penalty: '', limitation: '', caution: '', source: '',
    elements: [], relatedSections: [], factTemplate: [], prayerTemplate: [],
    privateOffence: false, compoundable: false,
    ...c,
    kind: KINDS.includes(c.kind) ? c.kind : 'criminal',
    verified: raw.verified === true,
  };
}

/** คีย์ฎีกาที่ใช้เก็บใน edits: caseNo (ถ้าไม่ซ้ำ) หรือ "caseNo|itemId" */
export function precedentKeys(list) {
  const cnt = new Map();
  for (const p of normList(list)) if (p && typeof p.caseNo === 'string') cnt.set(p.caseNo, (cnt.get(p.caseNo) || 0) + 1);
  return (p) => (p && cnt.get(p.caseNo) > 1 && p.itemId ? `${p.caseNo}|${p.itemId}` : p?.caseNo ?? '');
}

function cleanPrecField(k, v) {
  if (k === 'year') {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,4}$/.test(v.trim()) ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 && n < 10000 ? { ok: true, value: n } : { ok: false };
  }
  if (k === 'verified') return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false };
  const s = str(v);
  return s === null ? { ok: false } : { ok: true, value: s.slice(0, MAXS) };
}

export function cleanPrecPatch(patch) {
  const out = {};
  if (!isObj(patch)) return out;
  for (const k of PREC_FIELDS) {
    if (!(k in patch)) continue;
    const c = cleanPrecField(k, patch[k]);
    if (c.ok) out[k] = c.value;
  }
  return out;
}

/** ผสานการแก้ไขเข้ากับข้อมูลกฎหมาย → คืนอ็อบเจ็กต์ข้อมูลใหม่ (ไม่แก้ของเดิม) ไม่โยนข้อผิดพลาด */
export function applyLawEdits(data, edits) {
  try {
    if (!isObj(data)) return data;
    const base = data.__lawBase || data;       // ผสานซ้ำบนข้อมูลที่ผสานแล้ว → เริ่มจากต้นฉบับเสมอ
    const baseItems = normList(base.items), basePrec = normList(base.precedents);
    const e = isObj(edits) ? edits : {};
    const patches = isObj(e.items) ? e.items : {};
    const added = normList(e.added);
    const removed = new Set(normList(e.removed).filter((x) => typeof x === 'string'));
    const pe = isObj(e.precedents) ? e.precedents : {};
    const hasPrecEdits = Object.keys(isObj(pe.edited) ? pe.edited : {}).length || normList(pe.added).length || normList(pe.removed).length;
    if (!Object.keys(patches).length && !added.length && !removed.size && !hasPrecEdits) {
      return finish(data, base, baseItems, basePrec, baseItems, basePrec);
    }

    const laws = lawSet(data);
    const items = [];
    const ids = new Set();
    for (const it of baseItems) {
      if (!isObj(it) || typeof it.id !== 'string') { items.push(it); continue; }   // แถวต้นฉบับแปลก ๆ ไม่แตะ
      ids.add(it.id);
      if (removed.has(it.id)) continue;
      const p = patches[it.id];
      items.push(isObj(p) ? { ...it, ...cleanItemPatch(p, laws), id: it.id } : it);
    }
    for (const raw of added) {
      if (isObj(raw) && removed.has(raw.id)) continue;
      const a = cleanAdded(raw, laws, ids);
      if (a) { ids.add(a.id); items.push(a); }
    }

    // ฎีกา
    const keyOf = precedentKeys(basePrec);
    const pEdited = isObj(pe.edited) ? pe.edited : {};
    const pRemoved = new Set(normList(pe.removed).filter((x) => typeof x === 'string'));
    const prec = [];
    for (const p of basePrec) {
      if (!isObj(p)) { prec.push(p); continue; }
      const k = keyOf(p);
      if (pRemoved.has(k)) continue;
      const patch = pEdited[k];
      if (isObj(patch)) { const c = cleanPrecPatch(patch); delete c.caseNo; prec.push({ ...p, ...c }); } else prec.push(p);
    }
    for (const raw of normList(pe.added)) {
      if (!isObj(raw)) continue;
      const c = cleanPrecPatch(raw);
      if (!c.caseNo || !c.caseNo.trim() || !(c.topic || c.holding)) continue;
      prec.push({ itemId: '', year: undefined, topic: '', holding: '', relevance: '', source: '', ...c, verified: raw.verified === true });
    }
    return finish(data, base, baseItems, basePrec, items, prec);
  } catch {
    return data;
  }
}

function finish(data, base, baseItems, basePrec, items, prec) {
  const out = { ...data, items, precedents: prec };
  Object.defineProperty(out, '__lawBase', { value: { items: baseItems, precedents: basePrec }, enumerable: false, configurable: true, writable: true });
  return out;
}

/** เทียบข้อกฎหมายต้นฉบับกับฉบับที่แก้ → คืนเฉพาะฟิลด์ที่ต่าง (ใช้เก็บใน edits.items[id]) ถ้าไม่มีต้นฉบับ คืนฟิลด์ทั้งหมดที่ใช้ได้ */
export function diffItem(base, edited) {
  const e = cleanItemPatch(edited, null);
  if (!isObj(base)) return e;
  const b = cleanItemPatch(base, null);
  const out = {};
  for (const k of ITEM_FIELDS) {
    if (!(k in e)) continue;
    if (!(k in b) && (e[k] === '' || (Array.isArray(e[k]) && !e[k].length) || e[k] === false)) continue;   // ต้นฉบับไม่มีฟิลด์นี้ และค่าที่แก้ยังว่าง = ไม่ถือว่าเปลี่ยน
    if (!same(e[k], b[k])) out[k] = e[k];
  }
  return out;
}

/** เหมือน diffItem แต่สำหรับฎีกา (ไม่รวม caseNo) */
export function diffPrecedent(base, edited) {
  const e = cleanPrecPatch(edited); delete e.caseNo;
  const b = cleanPrecPatch(base);
  const out = {};
  for (const k of PREC_FIELDS) {
    if (!(k in e) || k === 'caseNo') continue;
    if (!(k in b) && (e[k] === '' || e[k] === false)) continue;
    if (!same(e[k], b[k])) out[k] = e[k];
  }
  return out;
}

/** โหลดการแก้ไขแล้วผสานเข้ากับข้อมูล — loadFn(key) คืน Promise ของเนื้อหา content ('laws') เช่น backend.loadContent / loadContent
 *  อ่านไม่ได้/ไม่มีข้อมูล = คืนข้อมูลเดิม */
export async function mergeLawEdits(data, loadFn) {
  try {
    if (typeof loadFn !== 'function' || !data) return data;
    const edits = await loadFn('laws');
    return applyLawEdits(data, edits);
  } catch {
    return data;
  }
}
