// ผสาน "การแก้ไขขั้นตอนฟ้องคดี/วิธีพิจารณาความที่แอดมินทำ" (content key 'procedure') เข้ากับ data/procedure.json
// โมดูลล้วน (pure) ใช้ได้ทั้งเบราว์เซอร์และ Node ไม่แตะ DOM — ห้ามโยนข้อผิดพลาด: ข้อมูลเพี้ยนให้ข้ามรายการนั้นแล้วไปต่อ
//
// รูปแบบ edits (เก็บเฉพาะส่วนที่ต่างจากต้นฉบับ):
//   { path:  { title?, note?, steps?: [ {title, detail, ref, verified} ] }      steps = ทั้งรายการแทนที่ของเดิม (เรียง/เพิ่ม/ลบได้)
//     fees:  { note?, edited:{[id]:{…}}, added:[…เต็ม], removed:[id] },
//     sections: { edited:{[id]:{…}}, added:[…เต็ม], removed:[id] } }
// ผลลัพธ์ของ applyProcedureEdits มีคุณสมบัติซ่อน __procBase = procedure ต้นฉบับ ให้หน้าแก้ไขเทียบ/ย้อนกลับได้ (เรียกซ้ำได้ผลเท่าเดิม)

const MAXS = 20000, MAXLIST = 500;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const STEP_FIELDS = ['title', 'detail', 'ref', 'verified'];
export const FEE_FIELDS = ['title', 'detail', 'ref', 'source', 'caution', 'verified'];
export const SECTION_FIELDS = ['law', 'section', 'title', 'summary', 'caution', 'source', 'verified'];
const BOOL = new Set(['verified']);

function cleanFields(patch, fields) {
  const out = {};
  if (!isObj(patch)) return out;
  for (const k of fields) {
    if (!(k in patch)) continue;
    if (BOOL.has(k)) { if (typeof patch[k] === 'boolean') out[k] = patch[k]; continue; }
    const s = str(patch[k]);
    if (s !== null) out[k] = s.slice(0, MAXS);
  }
  return out;
}
export const cleanStep = (p) => cleanFields(p, STEP_FIELDS);
export const cleanFee = (p) => cleanFields(p, FEE_FIELDS);
export const cleanSection = (p) => cleanFields(p, SECTION_FIELDS);

/** คืนเฉพาะฟิลด์ที่ต่างจากต้นฉบับ (ฟิลด์ที่ต้นฉบับไม่มีและค่ายังว่าง = ไม่ถือว่าเปลี่ยน) */
export function diffFields(base, edited, fields) {
  const e = cleanFields(edited, fields), b = cleanFields(base, fields), out = {};
  for (const k of fields) {
    if (!(k in e)) continue;
    if (!(k in b) && (e[k] === '' || e[k] === false)) continue;
    if (!same(e[k], b[k])) out[k] = e[k];
  }
  return out;
}

function applyCollection(list, edits, clean, fields, needs) {
  const e = isObj(edits) ? edits : {};
  const edited = isObj(e.edited) ? e.edited : {};
  const removed = new Set(arr(e.removed).filter((x) => typeof x === 'string'));
  const out = [], ids = new Set();
  for (const it of arr(list)) {
    if (!isObj(it) || typeof it.id !== 'string') { out.push(it); continue; }
    ids.add(it.id);
    if (removed.has(it.id)) continue;
    out.push(isObj(edited[it.id]) ? { ...it, ...clean(edited[it.id]), id: it.id } : it);
  }
  for (const raw of arr(e.added).slice(0, MAXLIST)) {
    if (!isObj(raw)) continue;
    const id = str(raw.id);
    if (!id || !id.trim() || ids.has(id) || removed.has(id)) continue;
    const c = clean(raw);
    if (!needs(c)) continue;             // ยังเป็นร่างเปล่า
    ids.add(id);
    out.push({ ...Object.fromEntries(fields.filter((f) => !BOOL.has(f)).map((f) => [f, ''])), ...c, id, verified: raw.verified === true });
  }
  return out;
}

/** ผสานการแก้ไขเข้ากับ procedure → คืนอ็อบเจ็กต์ใหม่ (ไม่แก้ของเดิม) ไม่โยนข้อผิดพลาด */
export function applyProcedureEdits(proc, edits) {
  try {
    if (!isObj(proc)) return proc;
    const base = proc.__procBase || proc;
    const e = isObj(edits) ? edits : {};
    const out = { ...base };
    // ขั้นตอนฟ้องคดี
    const p = isObj(e.path) ? e.path : {};
    const bp = isObj(base.criminalCasePath) ? base.criminalCasePath : {};
    if (str(p.title) !== null || str(p.note) !== null || Array.isArray(p.steps)) {
      const np = { ...bp };
      if (str(p.title) !== null) np.title = p.title.slice(0, 500);
      if (str(p.note) !== null) np.note = p.note.slice(0, MAXS);
      if (Array.isArray(p.steps)) {
        np.steps = p.steps.slice(0, MAXLIST).filter(isObj).map((s) => ({ title: '', detail: '', ref: '', ...cleanStep(s), verified: s.verified === true }))
          .filter((s) => s.title.trim() || s.detail.trim());
      }
      out.criminalCasePath = np;
    }
    // ค่าธรรมเนียม
    const f = isObj(e.fees) ? e.fees : {};
    const bf = isObj(base.fees) ? base.fees : {};
    const feeItems = applyCollection(bf.items, f, cleanFee, FEE_FIELDS, (c) => (c.title || '').trim() && (c.detail || '').trim());
    if (str(f.note) !== null || feeItems.length !== arr(bf.items).length || !same(feeItems, bf.items)) {
      out.fees = { ...bf, items: feeItems, ...(str(f.note) !== null ? { note: f.note.slice(0, MAXS) } : {}) };
    }
    // มาตราวิธีพิจารณา
    const s = isObj(e.sections) ? e.sections : {};
    const secs = applyCollection(base.sections, s, cleanSection, SECTION_FIELDS, (c) => (c.law || '').trim() && (c.section || '').trim() && (c.title || '').trim());
    if (!same(secs, base.sections)) out.sections = secs;
    Object.defineProperty(out, '__procBase', { value: base, enumerable: false, configurable: true, writable: true });
    return out;
  } catch {
    return proc;
  }
}

/** ผสานเข้ากับก้อนข้อมูลทั้งชุด (data.procedure) — loadFn(key) เช่น backend.loadContent; อ่านไม่ได้ = คืนข้อมูลเดิม */
export async function mergeProcedureEdits(data, loadFn) {
  try {
    if (typeof loadFn !== 'function' || !isObj(data) || !isObj(data.procedure)) return data;
    const edits = await loadFn('procedure');
    return setProcedure(data, applyProcedureEdits(data.procedure, edits));
  } catch {
    return data;
  }
}

export function setProcedure(data, procedure) {
  const out = { ...data, procedure };
  if (data.__lawBase) Object.defineProperty(out, '__lawBase', { value: data.__lawBase, enumerable: false, configurable: true, writable: true });
  return out;
}
