// รวม "บทความตั้งต้น" (ไฟล์ที่ build ไว้) กับ "ชั้นที่แอดมินแก้" (content-articles) — ใช้ร่วมกันระหว่างหน้าเว็บสาธารณะและหน้าแอดมิน
// รูปแบบชั้นที่แอดมินแก้: { items: { [slug]: บทความเต็ม (+ published:false ถ้าซ่อน) }, hidden: [slug], order: [slug] }
//   items  = บทความที่สร้างใหม่/ที่แก้ไขแล้ว (ตัวที่ slug ตรงกับของตั้งต้น = ใช้แทนของเดิม)
//   hidden = slug ของบทความตั้งต้นที่ซ่อน    order = ลำดับที่แอดมินจัด (ตัวที่ไม่อยู่ในนี้ต่อท้ายตามลำดับเดิม)

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,60}$/;

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

/** ทำให้ข้อมูลจากหลังบ้านมีรูปแบบแน่นอน (ไม่เคยโยน) */
export function normLive(live) {
  const o = isObj(live) ? live : {};
  return {
    items: isObj(o.items) ? o.items : {},
    hidden: Array.isArray(o.hidden) ? o.hidden.filter((s) => typeof s === 'string') : [],
    order: Array.isArray(o.order) ? o.order.filter((s) => typeof s === 'string') : [],
  };
}

/** ซ่อนอยู่ไหม: อยู่ใน hidden หรือบทความแก้ไขตั้ง published:false */
export const isHidden = (live, slug) => live.hidden.includes(slug) || live.items[slug]?.published === false;

/** แถวสำหรับหน้ารายการ (เหมือนรูปแบบ articles-data/index.json) */
export function toIndexEntry(a, staticEntry) {
  return {
    slug: a.slug, title: a.title || '', subtitle: a.subtitle || '', category: a.category || '', tags: Array.isArray(a.tags) ? a.tags : [],
    readMinutes: a.readMinutes || 1, updated: a.updated || '', summary: a.summary || '',
    refs: Array.isArray(a.refs) ? a.refs : (staticEntry?.refs || []),
  };
}

/**
 * รวมรายการ: ของตั้งต้น + ที่แอดมินสร้าง/แก้ → ตัดที่ซ่อน → จัดลำดับ
 * opts.all = true  → คืนทุกตัวพร้อมสถานะ (ใช้ในหน้าแอดมิน): แต่ละแถวเพิ่ม _isStatic/_edited/_hidden
 */
export function mergeIndex(staticIndex, liveRaw, opts = {}) {
  const live = normLive(liveRaw);
  const base = Array.isArray(staticIndex) ? staticIndex : [];
  const sMap = new Map(base.map((e) => [e.slug, e]));
  const rows = base.map((e) => (live.items[e.slug] ? toIndexEntry(live.items[e.slug], e) : e));
  for (const [slug, a] of Object.entries(live.items)) {
    if (!sMap.has(slug) && isObj(a)) rows.push(toIndexEntry({ ...a, slug }));
  }
  let out = rows.map((e) => (opts.all ? { ...e, _isStatic: sMap.has(e.slug), _edited: !!live.items[e.slug], _hidden: isHidden(live, e.slug) } : e));
  if (!opts.all) out = out.filter((e) => !isHidden(live, e.slug));
  if (live.order.length) {
    const pos = new Map(live.order.map((s, i) => [s, i]));
    const idx = new Map(out.map((e, i) => [e.slug, i]));
    out = [...out].sort((a, b) => {
      const pa = pos.has(a.slug) ? pos.get(a.slug) : 1e6 + idx.get(a.slug), pb = pos.has(b.slug) ? pos.get(b.slug) : 1e6 + idx.get(b.slug);
      return pa - pb;
    });
  }
  return out;
}

/** บทความที่แสดงจริง (null = ไม่มี/ซ่อน): ใช้ชั้นที่แก้แทนของตั้งต้น */
export function pickArticle(staticArticle, liveRaw, slug) {
  const live = normLive(liveRaw);
  if (isHidden(live, slug)) return null;
  const item = live.items[slug];
  if (isObj(item)) return normArticle({ ...item, slug });
  return staticArticle ? normArticle(staticArticle) : null;
}

/** เติมค่าที่ขาดให้ครบ เพื่อให้หน้าอ่านไม่พัง */
export function normArticle(a) {
  const arr = (x) => (Array.isArray(x) ? x : []);
  const sections = arr(a.sections).filter(isObj).map((s, i) => ({ ...s, id: s.id || `sec-${i + 1}`, heading: s.heading || '', paragraphs: arr(s.paragraphs) }));
  const cl = isObj(a.checklist) && arr(a.checklist.items).length ? { title: a.checklist.title || 'รายการที่ควรเตรียม', items: a.checklist.items } : null;
  return {
    ...a, title: a.title || '', subtitle: a.subtitle || '', category: a.category || '', summary: a.summary || '', readMinutes: a.readMinutes || 1,
    keyPoints: arr(a.keyPoints), sections, steps: arr(a.steps), checklist: cl, faq: arr(a.faq), sources: arr(a.sources),
    related: arr(a.related), precedents: arr(a.precedents),
  };
}

const sameList = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

/** ต้องไปหาข้อมูลมาตรา/ฎีกามาใส่ไหม (คืน false ถ้าไม่มีการอ้างถึง หรือใช้ของที่ build ไว้ได้) */
export function needsResolve(a, staticArticle) {
  if (!(a.relatedItems?.length || a.relatedPrecedents?.length)) return false;
  if (staticArticle && sameList(a.relatedItems, staticArticle.relatedItems) && sameList(a.relatedPrecedents, staticArticle.relatedPrecedents)) return false;
  return true;
}

/** ใช้ related/precedents ที่ build ไว้ (เมื่อรายการอ้างอิงไม่เปลี่ยน) */
export function reuseStaticRefs(a, staticArticle) {
  if (!staticArticle) return a;
  if (sameList(a.relatedItems, staticArticle.relatedItems) && sameList(a.relatedPrecedents, staticArticle.relatedPrecedents)) {
    return { ...a, related: staticArticle.related || [], precedents: staticArticle.precedents || [] };
  }
  return a;
}

/** แปลง relatedItems/relatedPrecedents (id) เป็นข้อมูลเต็ม — ตรรกะเดียวกับ server/articles-pack.js */
export function resolveRefs(a, data) {
  const items = new Map((data?.items || []).map((x) => [x.id, x]));
  const laws = new Map((data?.laws || []).map((x) => [x.id, x]));
  const prec = new Map((data?.precedents || []).map((x) => [x.caseNo, x]));
  const related = (a.relatedItems || []).map((id) => items.get(id)).filter(Boolean).map((it) => ({
    id: it.id, section: it.section, name: it.name, kind: it.kind,
    law: laws.get(it.lawId)?.short || laws.get(it.lawId)?.name || '',
    penalty: it.penalty || '', limitation: it.limitation || '', privateOffence: !!it.privateOffence, verified: it.verified !== false,
  }));
  const precedents = (a.relatedPrecedents || []).map((no) => prec.get(no)).filter(Boolean).map((p) => ({
    caseNo: p.caseNo, topic: p.topic, holding: p.holding, source: p.source || '', verified: p.verified !== false,
  }));
  return { related, precedents };
}

/** ข้อความอ้างมาตราสั้น ๆ (สูงสุด 4) สำหรับการ์ดในหน้ารายการ */
export function refsFor(a, data) {
  return resolveRefs({ relatedItems: a.relatedItems || [] }, data).related.slice(0, 4).map((r) => `${r.law} ม.${r.section}`);
}
