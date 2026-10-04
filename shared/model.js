// โมเดลข้อมูลคดี + ตัวช่วยที่ใช้ร่วมกันทั้งหน้าเว็บและเซิร์ฟเวอร์
import { todayParts, fullName, courtShort, sectionsJoin } from './thai.js';

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
    witnesses: [],                                // [{id, kind:'person'|'document'|'object', name, address, note}]
    motions: [],                                  // [{id, title, ids:[snippetId], text}]
    service: { auto: true, mode: 'post', custom: false, text: '', fee: '1300', court: '' },   // mode: cross-post | post | cross | none
    powers: '',
    proxy: { holder: newParty('proxy'), purpose: '' },
    hearing: { date: '', time: '' },
    answer: { defendantId: '', templateId: '', text: '' },               // คำให้การจำเลย (แบบ ๑๑)
    settlement: { templateId: '', subject: '', clauses: [] },            // สัญญาประนีประนอมยอมความ (แบบ ๒๙)
    docs: { complaint: true, prayer: true, attachment: true, service: true, witness: true, summons: true, attorney: false, proxy: false, motions: true, answer: false, settlement: false },
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
  if (c.docs.attorney && !c.counsel.enabled) add('warn', 'เลือกออกใบแต่งทนายความ แต่ยังไม่ได้กรอกข้อมูลทนายความ', 'counsel');
  return out;
}

export function caseTitle(c) {
  const p = plaintiffs(c)[0], d = defendants(c)[0];
  const pn = p ? partyName(p) : '', dn = d ? partyName(d) : '';
  return pn || dn ? `${pn || '…'} ฟ้อง ${dn || '…'}` : 'คดีใหม่';
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
