// โมเดลข้อมูลคดี + ตัวช่วยที่ใช้ร่วมกันทั้งหน้าเว็บและเซิร์ฟเวอร์
import { todayParts, fullName, courtShort, sectionsJoin, validCitizenId, addressText, isBkk, toThaiDigits } from './thai.js';

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function newParty(role = 'plaintiff') {
  return {
    id: uid(), role, kind: 'person',
    prefix: 'นาย', first: '', last: '', name: '', repName: '', repPosition: '', regNo: '',
    idCard: '', birth: '', age: '', ethnicity: 'ไทย', nationality: 'ไทย', occupation: '',
    address: { no: '', moo: '', building: '', soi: '', road: '', sub: '', district: '', province: '', zip: '' },
    phone: '', fax: '', email: '',
  };
}

export function newCase(type = 'criminal') {
  return {
    id: uid(), title: '', type, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    court: '', caseNoBlack: '', caseNoRed: '', caseYear: '',
    date: todayParts(),
    amount: { baht: '', satang: '' },
    parties: [newParty('plaintiff'), newParty('defendant')],
    counsel: {
      enabled: false, prefix: 'นาย', first: '', last: '', license: '', idCard: '',
      address: { no: '', moo: '', building: '', soi: '', road: '', sub: '', district: '', province: '', zip: '' },
      phone: '', email: '', powers: '',
    },
    incidentDate: '', knownDate: '',              // วันเกิดเหตุ / วันที่รู้เรื่องและรู้ตัวผู้กระทำผิด (ISO)
    charges: [],                                  // [{itemId, related:[ref], customName, customSection}]
    chargeText: '',                               // ข้อความ “ข้อหาหรือฐานความผิด” ในคำฟ้อง (ว่าง = ใช้ชื่อข้อหาที่เลือก)
    summonKind: 'ออกหมายนัดไต่สวนมูลฟ้อง/หมายเรียก',  // ออกหมายนัดไต่สวนมูลฟ้อง/หมายเรียก | ออกหมายเรียก | ออกหมายจับ
    facts: [],                                    // [{id, text, src}]
    vars: {},                                     // ค่าตัวแปร {{ชื่อ}} ในเทมเพลต
    prayers: [{ id: uid(), text: 'ให้จำเลยชำระค่าฤชาธรรมเนียมศาลและค่าทนายความแทนโจทก์ด้วย', src: 'base-cost' }],   // [{id, text, src}]
    copies: '',                                   // จำนวนสำเนา
    civilCause: '',                               // คดีแพ่ง: เรื่อง/มูลคดี
    witnesses: [],                                // [newWitness()] — kind: person | object | document (ดู newWitness / witnessSummonsPlan)
    motions: [],                                  // [{id, title, ids:[snippetId], text}]
    service: { auto: true, mode: 'post', custom: false, text: '', fee: '1300', court: '' },   // mode: cross-post | post | cross | none
    powers: '',
    proxy: { holder: newParty('proxy'), purpose: '' },
    hearing: { date: '', time: '' },
    answer: { defendantId: '', templateId: '', text: '' },               // คำให้การจำเลย (แบบ ๑๑)
    settlement: { templateId: '', subject: '', clauses: [] },            // สัญญาประนีประนอมยอมความ (แบบ ๒๙)
    docs: { complaint: true, prayer: true, attachment: true, service: true, witness: true, witnessExtra: true, witnessSummons: true, summons: true, attorney: false, proxy: false, motions: true, answer: false, settlement: false },
    options: { thaiDigits: true, autoFill: true, selfWitness: true },
    closing: { mode: 'self' },                    // ข้อท้ายคำฟ้อง: self = ไม่ได้ร้องทุกข์ ประสงค์ดำเนินคดีเอง | police = ร้องทุกข์ต่อพนักงานสอบสวนแล้ว
  };
}

/** คำขอพื้นฐานท้ายคำฟ้อง: ให้จำเลยชำระค่าฤชาธรรมเนียมศาลและค่าทนายความแทนโจทก์ — อยู่เป็นข้อสุดท้ายเสมอ */
export const BASE_COST_PRAYER = 'ให้จำเลยชำระค่าฤชาธรรมเนียมศาลและค่าทนายความแทนโจทก์ด้วย';
export function ensureBasePrayer(c) {
  const rest = c.prayers.filter((x) => x.src !== 'base-cost');
  const base = c.prayers.find((x) => x.src === 'base-cost') || { id: uid(), text: BASE_COST_PRAYER, src: 'base-cost' };
  c.prayers = [...rest, base];
  return c;
}

export function plaintiffs(c) { return c.parties.filter((p) => p.role === 'plaintiff'); }
export function defendants(c) { return c.parties.filter((p) => p.role === 'defendant'); }

export function partyLabel(c, p) {
  const list = c.parties.filter((x) => x.role === p.role);
  const base = p.role === 'plaintiff' ? 'โจทก์' : p.role === 'defendant' ? 'จำเลย' : p.role;
  return list.length > 1 ? `${base}ที่ ${list.indexOf(p) + 1}` : base;
}

/** ชื่อฝั่งที่มีหลายคน: ใช้คนแรกเป็นหลัก เช่น "นายกันต์กร ตระกูลศรี ที่ 1 กับพวกรวม 3 คน" */
export function groupName(c, role) {
  const list = c.parties.filter((x) => x.role === role);
  if (!list.length) return '';
  const first = partyName(list[0]);
  return list.length > 1 ? `${first} ที่ 1 กับพวกรวม ${list.length} คน` : first;
}

export function partyName(p) { return p.kind === 'juristic' ? (p.name || '').trim() : fullName(p); }

export function caseKindLabel(c) { return c.type === 'civil' ? 'แพ่ง' : 'อาญา'; }

// ---------- พยาน (บัญชีพยาน แบบ ๑๕ + หมายเรียกพยาน แบบ ๑๖ / ๑๗ / ๑๘) ----------
export const WITNESS_KINDS = { person: 'พยานบุคคล', document: 'พยานเอกสาร', object: 'พยานวัตถุ' };
export const emptyAddress = () => ({ no: '', moo: '', building: '', soi: '', road: '', sub: '', district: '', province: '', zip: '' });

/**
 * พยานหนึ่งรายการ
 *  - person: name = ชื่อ-สกุลพยาน · addr/address = ที่อยู่พยาน · phone · purpose = ประเด็นที่จะให้เบิกความ (พิมพ์ลงช่องว่างหลังหมาย)
 *  - object/document: name = รายการเอกสาร/วัตถุ · holder = ผู้ครอบครอง · addr/address = ที่อยู่ผู้ครอบครอง/ที่เก็บ
 *  - summons: false = ไม่ขอให้ศาลออกหมายเรียกรายนี้ (เช่น โจทก์นำมาเอง)
 *  - extra: true = พยานที่เพิ่มภายหลังยื่นฟ้อง → ลงเฉพาะ “บัญชีพยานเพิ่มเติม (แบบ ๑๕ ทวิ)” ไม่อยู่ในบัญชีพยานเดิม (แบบ ๑๕)
 *  address เป็นข้อความรวมช่องเดียว (ข้อมูลเดิม) ส่วน addr เป็นที่อยู่แยกช่องตามแบบพิมพ์ศาล — ถ้ามี addr จะใช้ addr ก่อน
 */
export function newWitness(kind = 'person', extra = false) {
  return { id: uid(), kind: kind === 'object' || kind === 'document' ? kind : 'person', name: '', holder: '', address: '', addr: emptyAddress(), phone: '', purpose: '', note: '', summons: true, extra: !!extra };
}
export const witnessKind = (w) => (w?.kind === 'object' || w?.kind === 'document' ? w.kind : 'person');
export const isItemWitness = (w) => witnessKind(w) !== 'person';
const wFilled = (s) => String(s ?? '').trim().length > 0;
/** ที่อยู่แยกช่องของพยาน (ครบทุกคีย์) */
export const witnessAddr = (w) => ({ ...emptyAddress(), ...(w?.addr || {}) });
export const witnessHasAddr = (w) => Object.values(witnessAddr(w)).some(wFilled);
/** ที่อยู่เป็นข้อความ: แยกช่อง (addr) ก่อน ไม่มีใช้ข้อความรวมเดิม (address) */
export function witnessAddrText(w) {
  const a = witnessAddr(w);
  return witnessHasAddr(w) ? addressText(a, isBkk(a.province)) : String(w?.address || '').trim();
}
/** ระบบจะออกหมายเรียกให้พยานรายนี้หรือไม่ (ปิดรายตัวได้ หรือหมายเหตุขึ้นต้น “นำ” = โจทก์นำมาเอง) */
export const witnessWantsSummons = (w) => !!w && !w.self && w.summons !== false && !/^\s*นำ/.test(String(w.note || ''));

/**
 * บัญชีพยานตามลำดับที่ปรากฏในแบบ ๑๕: โจทก์อ้างตนเอง (ถ้าเปิด) ก่อน แล้วตามด้วยพยานที่เพิ่มเอง (เฉพาะที่ระบุชื่อ/รายการแล้ว)
 * พยานที่เพิ่มภายหลังยื่นฟ้อง (extra) เรียงต่อท้ายเสมอ — ลำดับ (no) จึงนับต่อจากบัญชีเดิม (เดิม 4 อันดับ → เพิ่มเติมเริ่มที่ ๕)
 * which: 'all' (ค่าเริ่มต้น, ลำดับ no นับรวม) | 'base' = เฉพาะบัญชีเดิม | 'extra' = เฉพาะบัญชีเพิ่มเติม (ยังคงเลข no ต่อเนื่อง)
 */
export function witnessList(c, which = 'all') {
  const own = (c.witnesses || []).filter((w) => wFilled(w.name));
  const selfW = c.options?.selfWitness === false ? [] : plaintiffs(c)
    .filter((x) => partyName(x) && !own.some((w) => w.name === partyName(x)))
    .map((x) => ({ id: `self-${x.id}`, kind: 'person', name: partyName(x), addr: x.address, address: '', phone: x.phone || '', note: 'นำ', self: true }));
  const all = [...selfW, ...own.filter((w) => !w.extra), ...own.filter((w) => w.extra)].map((w, i) => ({ no: i + 1, w, self: !!w.self }));
  return which === 'base' ? all.filter((r) => !r.w.extra) : which === 'extra' ? all.filter((r) => r.w.extra) : all;
}

/**
 * หมายเรียกพยานที่ระบบสร้างให้อัตโนมัติจากบัญชีพยาน
 *  - พยานบุคคล 1 คน = 1 ฉบับ (แบบ ๑๖)
 *  - พยานเอกสาร/วัตถุ: รายการที่อยู่กับผู้ครอบครองรายเดียวกัน (ชื่อ+ที่อยู่เดียวกัน) รวมเป็น 1 ฉบับ (แบบ ๑๗ คดีอาญา · แบบ ๑๘ คดีแพ่ง)
 * คืน [{id, kind:'person'|'item', form:'16'|'17'|'18', rows:[{no,w}], nos:[ลำดับ], name, title}] เรียงตามลำดับในบัญชีพยาน
 */
export function witnessSummonsPlan(c, force = false) {
  if (!force && c.docs?.witnessSummons === false) return [];
  const civil = c.type === 'civil';
  const rows = witnessList(c).filter((r) => !r.self && witnessWantsSummons(r.w));
  const plan = [];
  for (const r of rows.filter((x) => !isItemWitness(x.w))) {
    const name = r.w.name.trim();
    plan.push({ id: `witnessSummons-p-${r.w.id || r.no}`, kind: 'person', form: '16', rows: [r], nos: [r.no], name, title: `หมายเรียกพยานบุคคล – ${name} (ลำดับที่ ${r.no})` });
  }
  const groups = new Map();
  for (const r of rows.filter((x) => isItemWitness(x.w))) {
    const holder = String(r.w.holder || '').trim(), addr = witnessAddrText(r.w);
    const key = holder || addr ? `${holder}|${addr}|${String(r.w.phone || '').trim()}` : `solo:${r.w.id || r.no}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const list of groups.values()) {
    const kinds = new Set(list.map((r) => witnessKind(r.w)));
    const noun = kinds.size > 1 ? 'พยานเอกสาร/วัตถุ' : kinds.has('document') ? 'พยานเอกสาร' : 'พยานวัตถุ';
    const holder = String(list[0].w.holder || '').trim();
    const name = holder || list[0].w.name.trim();
    const nos = list.map((r) => r.no);
    plan.push({
      id: `witnessSummons-i-${list[0].w.id || list[0].no}`, kind: 'item', form: civil ? '18' : '17', rows: list, nos, name, holder,
      title: `${civil ? 'คำสั่งเรียก' : 'หมายเรียก'}${noun} – ${name} (ลำดับที่ ${nos.join(', ')})`,
    });
  }
  return plan.sort((a, b) => a.nos[0] - b.nos[0]);
}

/** สร้างดัชนีค้นหาข้อหาจากข้อมูลกฎหมายทั้งหมด */
export function indexLaw(data) {
  const items = new Map();
  for (const it of data.items || []) items.set(it.id, it);
  const laws = new Map();
  for (const l of data.laws || []) laws.set(l.id, l);
  return { items, laws };
}

export function chargeItem(idx, ch) { return ch.itemId ? idx.items.get(ch.itemId) : null; }

/** ข้อความ "บทมาตรา" เช่น "ประมวลกฎหมายอาญา มาตรา 137, 172 และ 173 ประกอบ ... " */
export function chargeSectionsText(c, idx) {
  const byLaw = new Map();
  const extra = [];
  for (const ch of c.charges) {
    const it = chargeItem(idx, ch);
    if (it) {
      const law = idx.laws.get(it.lawId);
      const key = law?.name || it.lawId;
      if (!byLaw.has(key)) byLaw.set(key, []);
      byLaw.get(key).push(it.section);
    } else if (ch.customName || ch.customSection) {
      extra.push(ch.customSection || ch.customName);
    }
    for (const r of ch.related || []) extra.push(r);
  }
  const parts = [];
  for (const [law, secs] of byLaw) parts.push(`${law} มาตรา ${[...new Set(secs)].join(', ')}`);
  for (const e of [...new Set(extra)]) parts.push(e);
  return parts.join(' ประกอบ ');
}

/** ข้อหา/ฐานความผิดอย่างย่อ เช่น "แจ้งความเท็จ, ฟ้องเท็จ" */
export function chargeNamesText(c, idx) {
  const names = c.charges.map((ch) => chargeItem(idx, ch)?.name || ch.customName).filter(Boolean);
  return [...new Set(names)].join(' และ ');
}

const RESERVED = new Set(['โจทก์', 'จำเลย', 'ศาล', 'มาตรา']);

/** ค่าของตัวแปรสงวน */
export function reservedValue(name, c, idx) {
  switch (name) {
    case 'โจทก์': return plaintiffs(c).length > 1 ? 'โจทก์ทั้งหมด' : 'โจทก์';
    case 'จำเลย': {
      const n = defendants(c).length;
      return n <= 1 ? 'จำเลย' : n === 2 ? 'จำเลยทั้งสอง' : `จำเลยทั้ง ${n}`;
    }
    case 'ศาล': return courtShort(c.court) ? `ศาล${courtShort(c.court)}` : '';
    case 'มาตรา': return chargeSectionsText(c, idx);
    default: return null;
  }
}

export function isReserved(name) { return RESERVED.has(name); }

/** แยก template ที่มี {{ตัวแปร}} ออกเป็นส่วน ๆ */
export function tokenize(text) {
  const out = [];
  const re = /\{\{\s*([^}|]+?)\s*\}\}/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ v: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** แทนตัวแปร → runs [{text, kind:'val'|'ph'|undefined}] */
export function resolveRuns(text, c, idx) {
  const runs = [];
  for (const t of tokenize(text || '')) {
    if (t.v === undefined) { runs.push({ text: t.text }); continue; }
    const rv = reservedValue(t.v, c, idx);
    if (rv !== null) { runs.push({ text: rv || `[${t.v}]`, kind: rv ? undefined : 'ph' }); continue; }
    const val = (c.vars?.[t.v] ?? '').trim();
    runs.push(val ? { text: val, kind: 'val' } : { text: `[${t.v}]`, kind: 'ph' });
  }
  return runs;
}

export function runsToText(runs) { return runs.map((r) => r.text).join(''); }

/** ตัวแปรที่ผู้ใช้ต้องกรอก (ไม่รวมตัวแปรสงวน) ตามลำดับที่ปรากฏ */
/** ข้อท้ายคำฟ้อง (ระบบต่อท้ายข้อเท็จจริงให้อัตโนมัติ ปิดได้ที่ closing.auto = false) */
export function tailFacts(c) {
  if (c.closing?.auto === false) return [];
  const pl = plaintiffs(c)[0] || {};
  const out = [];
  if (c.type !== 'civil') {
    out.push('เหตุคดีนี้เกิดที่ {{สถานที่เกิดเหตุ}} ซึ่งอยู่ในเขตอำนาจของศาลนี้');
    out.push(pl.kind === 'juristic'
      ? `โจทก์เป็นนิติบุคคล โดย ${pl.repName || 'ผู้แทนโจทก์'}${pl.repPosition ? ' ตำแหน่ง' + pl.repPosition : ''} ผู้มีอำนาจกระทำการแทน เป็นผู้เสียหายโดยตรงจากการกระทำของจำเลยดังกล่าว จึงมีอำนาจฟ้องคดีนี้ตามประมวลกฎหมายวิธีพิจารณาความอาญา มาตรา 28 (2)`
      : 'โจทก์เป็นผู้เสียหายโดยตรงจากการกระทำของจำเลยดังกล่าว จึงมีอำนาจฟ้องคดีนี้ตามประมวลกฎหมายวิธีพิจารณาความอาญา มาตรา 28 (2)');
    out.push((c.closing?.mode || 'self') === 'police'
      ? 'โจทก์ได้ร้องทุกข์ต่อพนักงานสอบสวน {{สถานีตำรวจที่ร้องทุกข์}} ไว้แล้ว แต่โจทก์ประสงค์ดำเนินคดีนี้ด้วยตนเอง จึงนำคดีมาฟ้องต่อศาลโดยตรง'
      : 'โจทก์มิได้ร้องทุกข์ต่อพนักงานสอบสวนในความผิดคดีนี้ แต่ประสงค์ดำเนินคดีด้วยตนเอง จึงนำคดีมาฟ้องต่อศาลโดยตรง');
  } else {
    out.push('มูลคดีนี้เกิดที่ {{สถานที่เกิดเหตุ}} และจำเลยมีภูมิลำเนาอยู่ในเขตอำนาจของศาลนี้ ศาลนี้จึงมีอำนาจพิจารณาพิพากษาคดี');
  }
  return out;
}

export function collectVars(c) {
  const seen = [];
  const add = (s) => {
    for (const t of tokenize(s || '')) if (t.v !== undefined && !isReserved(t.v) && !seen.includes(t.v)) seen.push(t.v);
  };
  c.facts.forEach((f) => add(f.text));
  tailFacts(c).forEach(add);
  c.prayers.forEach((f) => add(f.text));
  c.motions.forEach((m) => add(m.text));
  add(c.powers);
  add(c.answer?.text);
  (c.settlement?.clauses || []).forEach((f) => add(f.text));
  return seen;
}

/** รายการตรวจความครบถ้วนก่อนออกเอกสาร: [{level:'error'|'warn'|'info', msg, tab}] */
export function validateCase(c, idx) {
  const out = [];
  const add = (level, msg, tab) => out.push({ level, msg, tab });
  const pl = plaintiffs(c), df = defendants(c);
  if (!c.court) add('error', 'ยังไม่ได้เลือกศาล', 'case');
  if (!pl.length) add('error', 'ยังไม่มีโจทก์', 'parties');
  if (!df.length) add('error', 'ยังไม่มีจำเลย', 'parties');
  for (const p of c.parties) {
    const lbl = partyLabel(c, p);
    if (!partyName(p)) add('error', `${lbl}: ยังไม่ได้กรอกชื่อ`, 'parties');
    if (p.role === 'plaintiff' && p.kind === 'person' && !p.idCard) add('warn', `${lbl}: ไม่ได้ระบุเลขประจำตัวประชาชน`, 'parties');
    if (!p.address.province && !p.address.no) add('warn', `${lbl}: ยังไม่ได้ระบุที่อยู่/ภูมิลำเนา`, 'parties');
  }
  if (c.type === 'criminal' && !c.charges.length) add('error', 'ยังไม่ได้เลือกข้อหา/ฐานความผิด', 'charges');
  if (c.type === 'civil' && !c.civilCause && !c.charges.length) add('warn', 'ยังไม่ได้ระบุมูลคดีแพ่ง', 'charges');
  if (!c.facts.some((f) => (f.text || '').trim())) add('error', 'ยังไม่มีข้อเท็จจริงในคำฟ้อง', 'facts');
  if (!c.prayers.some((f) => (f.text || '').trim())) add('warn', 'ยังไม่มีคำขอท้ายฟ้อง', 'prayer');
  if (c.type === 'civil' && !(+c.amount.baht > 0)) add('warn', 'คดีแพ่ง: ยังไม่ได้ระบุทุนทรัพย์ (ใช้คำนวณค่าขึ้นศาล)', 'case');
  const missing = collectVars(c).filter((v) => !(c.vars?.[v] ?? '').trim());
  if (missing.length) add('warn', `ยังมีช่องข้อมูลที่ยังไม่ได้กรอก ${missing.length} ช่อง: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' ...' : ''}`, 'facts');
  // ความผิดต่อส่วนตัว: ร้องทุกข์/ฟ้องภายใน 3 เดือน (ป.อ. ม.96)
  if (c.type === 'criminal') {
    const priv = c.charges.map((ch) => chargeItem(idx, ch)).filter((it) => it?.privateOffence);
    if (priv.length) {
      if (!c.knownDate) add('warn', `มีความผิดต่อส่วนตัว (${priv.map((i) => i.name).join(', ')}) — ควรระบุ "วันที่รู้เรื่องความผิดและรู้ตัวผู้กระทำ" เพื่อตรวจกำหนด 3 เดือนตาม ป.อ. มาตรา 96`, 'case');
      else {
        const known = new Date(c.knownDate + 'T00:00:00');
        const due = new Date(known); due.setMonth(due.getMonth() + 3);
        const days = Math.ceil((due - new Date()) / 86400000);
        if (days < 0) add('error', `ความผิดต่อส่วนตัว: เกินกำหนด 3 เดือนตาม ป.อ. มาตรา 96 มาแล้ว ${-days} วัน (ครบ ${due.toLocaleDateString('th-TH')}) — คดีขาดอายุความร้องทุกข์`, 'case');
        else if (days <= 14) add('warn', `ความผิดต่อส่วนตัว: เหลือเวลาอีก ${days} วัน (ครบ ${due.toLocaleDateString('th-TH')}) ตาม ป.อ. มาตรา 96`, 'case');
        else add('info', `ความผิดต่อส่วนตัว: ต้องฟ้องภายใน 3 เดือน (ครบ ${due.toLocaleDateString('th-TH')}, เหลือ ${days} วัน)`, 'case');
      }
    }
    const unverified = c.charges.map((ch) => chargeItem(idx, ch)).filter((it) => it && it.verified === false);
    if (unverified.length) add('info', `ข้อมูลมาตราที่ยังไม่ผ่านการตรวจกับแหล่งทางการ: ${unverified.map((i) => i.name).join(', ')} — ตรวจสอบก่อนยื่น`, 'charges');
  }
  for (const p of c.parties) {
    if (p.kind !== 'juristic' && String(p.idCard || '').trim() && !validCitizenId(p.idCard)) add('error', `เลขประจำตัวประชาชนของ${partyLabel(c, p)} (${partyName(p) || 'ยังไม่ระบุชื่อ'}) ไม่ถูกต้อง`, 'parties');
  }
  if (c.counsel?.enabled && String(c.counsel.idCard || '').trim() && !validCitizenId(c.counsel.idCard)) add('error', 'เลขประจำตัวประชาชนของทนายความไม่ถูกต้อง', 'counsel');
  if (c.docs.attorney && !c.counsel.enabled) add('warn', 'เลือกออกใบแต่งทนายความ แต่ยังไม่ได้กรอกข้อมูลทนายความ', 'counsel');
  // พยาน: หมายเรียกที่ระบบสร้างให้ต้องมีชื่อ/ที่อยู่ — เป็นข้อควรตรวจ ไม่ขวางการออกเอกสาร
  const unnamedW = (c.witnesses || []).filter((w) => !wFilled(w.name));
  if (unnamedW.length) add('warn', `มีพยาน ${unnamedW.length} รายการที่ยังไม่ระบุชื่อ/รายการ — ยังไม่อยู่ในบัญชีพยานและไม่มีหมายเรียก`, 'witness');
  for (const g of witnessSummonsPlan(c)) {
    for (const r of g.rows) {
      const lbl = `${WITNESS_KINDS[witnessKind(r.w)]}ลำดับที่ ${r.no} (${r.w.name.trim()})`;
      if (g.kind === 'person' && !witnessAddrText(r.w)) add('warn', `${lbl}: ยังไม่ระบุที่อยู่ — หมายเรียกจะเว้นที่อยู่ไว้ให้เขียนเติมเอง`, 'witness');
      if (g.kind === 'item' && !wFilled(r.w.holder) && !witnessAddrText(r.w)) add('warn', `${lbl}: ยังไม่ระบุผู้ครอบครอง/ที่อยู่ — หมายเรียกจะเว้นไว้ให้เขียนเติมเอง`, 'witness');
    }
  }
  const nExtra = witnessList(c, 'extra').length;
  if (nExtra && !isFiled(c)) add('warn', `มีพยานเพิ่มเติมภายหลังยื่นฟ้อง ${nExtra} ราย แต่ยังไม่ได้ใส่เลขคดีที่ศาลให้ — บัญชีพยานเพิ่มเติมและหมายเรียกจะเว้นเลขคดีไว้ให้เขียนเติม`, 'case');
  const nW = witnessSummonsPlan(c).length;
  if (nW && !c.hearing?.date) add('info', `หมายเรียกพยาน ${nW} ฉบับจะเว้นวัน-เวลานัดไว้ให้เขียนเติม (ยังไม่ระบุวันนัด)`, 'case');
  return out;
}

/** ชื่อคดีที่แสดงในรายการ/หัวหน้า: ใช้ "หมายเลขคำฟ้อง" แทนชื่อคู่ความ (ไม่เปิดเผยชื่อบุคคลบนหน้ารวม)
 *  = เลขคดีดำ/แดงที่ศาลให้ (ถ้ามี) ไม่เช่นนั้นเลขอ้างอิงของระบบ (อักษร 8 ตัวแรกของรหัสคดี) */
export function caseLabel(c) {
  const black = String(c?.caseNoBlack || '').trim(), red = String(c?.caseNoRed || '').trim(), yr = String(c?.caseYear || '').trim();
  const withYr = (n) => (yr && !n.includes('/') ? `${n}/${yr}` : n);
  if (black) return `คดีหมายเลขดำที่ ${withYr(black)}`;
  if (red) return `คดีหมายเลขแดงที่ ${withYr(red)}`;
  return `คำฟ้อง ${String(c?.id || '').slice(0, 8).toUpperCase() || '—'}`;
}

const filledStr = (v) => String(v ?? '').trim();

/** คดีที่ยื่นฟ้องแล้ว = ศาลให้เลขคดีดำหรือแดงแล้ว (ใส่เลขในหน้า “ข้อมูลคดี”) — ไม่มีสวิตช์แยก */
export function isFiled(c) { return !!(filledStr(c?.caseNoBlack) || filledStr(c?.caseNoRed)); }

/**
 * เลขคดีสำหรับพิมพ์บนหัวเอกสาร: { black, red, year }
 * รับทั้งแบบแยกช่อง (เลข + ปี) และแบบพิมพ์รวมในช่องเลข เช่น “อ.123/2569” → black “อ.123”, year “2569” (ถ้าช่องปีว่าง)
 */
export function caseNoParts(c) {
  const split = (v) => {
    const s = filledStr(v), m = /^(.*?)\s*\/\s*([0-9๐-๙]{2,4})$/.exec(s);
    return m ? [m[1].trim(), m[2]] : [s, ''];
  };
  const [black, by] = split(c?.caseNoBlack), [red, ry] = split(c?.caseNoRed);
  return { black, red, year: filledStr(c?.caseYear) || by || ry };
}

/** ป้ายสั้น “ดำ ๑๒๓/๖๙” สำหรับป้ายสถานะ (ดำก่อน ถ้าไม่มีใช้แดง) — ว่าง = ยังไม่ได้ฟ้อง */
export function filedNoText(c) {
  const { black, red, year } = caseNoParts(c);
  const n = black || red;
  return n ? `${black ? 'ดำ' : 'แดง'} ${n}${year ? '/' + year : ''}` : '';
}

/** ป้ายสถานะ “ฟ้องแล้ว · ดำ ๑๒๓/๖๙” (เลขไทยตามตัวเลือกของคดี) — ว่าง = ยังเป็นร่าง */
export function filedBadge(c) {
  const n = filedNoText(c);
  if (!n) return '';
  const s = `ฟ้องแล้ว · ${n}`;
  return c?.options?.thaiDigits === false ? s : toThaiDigits(s);
}

/**
 * ข้อมูลย่อของคดีสำหรับการ์ดในหน้ารายการ (ทั้งโหมดไฟล์ในเครื่องและ Supabase ใช้ฟังก์ชันเดียวกัน)
 * ชื่อโจทก์/จำเลย = คนแรกที่ระบุชื่อ + จำนวนคนที่เหลือ
 */
export function caseListInfo(c) {
  const side = (role) => {
    const list = (c?.parties || []).filter((p) => p.role === role);
    return { name: list.map(partyName).find(Boolean) || '', more: Math.max(0, list.length - 1) };
  };
  const pl = side('plaintiff'), df = side('defendant');
  return {
    caseNoBlack: filledStr(c?.caseNoBlack), caseNoRed: filledStr(c?.caseNoRed), caseYear: filledStr(c?.caseYear), filed: isFiled(c),
    plName: pl.name, plMore: pl.more, dfName: df.name, dfMore: df.more,
  };
}

/** ค่านำหมาย/ปิดหมาย: จำเลยหลายคน = บวกค่านำหมายของจำเลยแต่ละคน (ไม่ให้แก้ยอดรวมเอง) — unit = อัตราต่อจำเลย 1 คน */
export function serviceFeeInfo(c) {
  const n = Math.max(1, defendants(c).length);
  const unit = Number(String(c?.service?.fee ?? '').replace(/[^\d.]/g, '')) || 0;
  return { n, unit, total: unit * n, multi: n > 1 };
}

export function caseTitle(c) {
  return caseLabel(c);
}

/**
 * วิเคราะห์การส่งหมายจากภูมิลำเนาจำเลยเทียบกับศาลที่ฟ้อง (ใช้ข้อมูลเขตอำนาจทางการรายอำเภอ/เขต)
 *  - จำเลยอยู่ในเขตศาลที่ฟ้อง → status 'same'  → ปิดหมายอย่างเดียว (mode 'post')
 *  - จำเลยอยู่เขตศาลอื่น       → status 'outside' → ฟ้องศาลหนึ่ง ส่งหมายผ่านอีกศาล (mode 'cross-post') court = ศาลปลายทาง
 *  - ไม่มีข้อมูลพอ             → status 'unknown'
 */
/** ชื่อศาลตามเว็บ coj ที่ในระบบแยกเป็นศาลแพ่ง/ศาลอาญาประจำเขต (กรุงเทพ: ตลิ่งชัน พระโขนง มีนบุรี) */
export const courtAlias = (name, crim) => String(name || '').replace(/^ศาลจังหวัด(ตลิ่งชัน|พระโขนง|มีนบุรี)$/, (_, x) => (crim ? 'ศาลอาญา' : 'ศาลแพ่ง') + x);

export function serviceAdvice(c, data) {
  const J = data?.jurisdiction?.provinces;
  const df = defendants(c);
  if (!J || !c.court || !df.length) return { status: 'unknown', rows: [] };
  const crim = c.type !== 'civil';
  const rows = df.map((d) => {
    const a = d.address || {};
    const list = J[a.province]?.districts?.[a.district];
    if (!list) return { party: d, known: false };
    const firsts = list.filter((x) => x.type === 'first');
    const inside = firsts.some((x) => courtAlias(x.name, crim) === c.court);
    const prefer = firsts.find((x) => !x.magistrate && (x.scope === 'both' || x.scope === (crim ? 'criminal' : 'civil'))) || firsts[0];
    return { party: d, known: true, inside, dest: inside ? c.court : courtAlias(prefer?.name, crim) || '', courts: firsts.map((x) => courtAlias(x.name, crim)) };
  });
  const known = rows.filter((r) => r.known);
  if (!known.length) return { status: 'unknown', rows };
  const out = known.filter((r) => !r.inside);
  if (!out.length) return { status: 'same', rows, mode: 'post', court: '' };
  const dests = [...new Set(out.map((r) => r.dest).filter(Boolean))];
  return { status: 'outside', rows, mode: 'cross-post', court: dests.length === 1 ? dests[0] : dests.join(' และ ') };
}

/** ตั้ง service.mode/court อัตโนมัติ (เมื่อเปิด auto) — คืน true ถ้ามีการเปลี่ยนค่า */
export function applyServiceAuto(c, data) {
  const sv = c.service;
  if (!sv || sv.auto === false) return false;
  const a = serviceAdvice(c, data);
  if (a.status === 'unknown') return false;
  let changed = false;
  if (sv.mode !== a.mode) { sv.mode = a.mode; changed = true; }
  const court = a.status === 'outside' ? a.court : '';
  if ((sv.court || '') !== court) { sv.court = court; changed = true; }
  return changed;
}
